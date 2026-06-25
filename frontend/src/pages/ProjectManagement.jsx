import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ProjectDetailModal from '../components/ProjectDetailModal';
import { 
  Plus, Edit2, Trash2, Eye, Download, Upload, Search, Filter, 
  ChevronLeft, ChevronRight, ChevronsUpDown, X, Info, FileText, 
  Paperclip, Image, Calendar, Trash, AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';

const ProjectManagement = () => {
  const { token, hasRole, authFetch } = useAuth();
  const { showToast } = useToast();
  
  const canEdit = hasRole(['admin', 'manager']);
  const canDelete = hasRole('admin');

  // Main Data States
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filterOptions, setFilterOptions] = useState({ companies: [], managers: [], spocs: [], projectNames: [] });

  // Query/Grid States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('projectNumber');
  const [sortOrder, setSortOrder] = useState('asc');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [spocFilter, setSpocFilter] = useState('');
  const [projectNameFilter, setProjectNameFilter] = useState('');

  // Modals & Action States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);   // new rich detail modal
  const [currentProject, setCurrentProject] = useState(null);
  const [formType, setFormType] = useState('add'); // 'add' or 'edit'

  const [formData, setFormData] = useState({
    projectName: '',
    spocs: [],
    scopeDoc: '',
    projectNumber: '',
    projectAmount: '',
    projectStatus: 'Planning',
    projectManager: '',
    description: '',
    startDate: '',
    endDate: ''
  });
  
  const [spocInput, setSpocInput] = useState('');

  // Import State
  const fileInputRef = useRef(null);
  const [importSummary, setImportSummary] = useState(null);

  // Fetch Projects List
  const fetchProjects = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        ...(statusFilter && { status: statusFilter }),
        ...(companyFilter && { company: companyFilter }),
        ...(managerFilter && { manager: managerFilter }),
        ...(spocFilter && { spoc: spocFilter }),
        ...(projectNameFilter && { projectName: projectNameFilter })
      });

      const res = await authFetch(`/projects?${params.toString()}`);

      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();

      setProjects(data.projects);
      setTotal(data.pagination.totalProjects);
      setTotalPages(data.pagination.totalPages);
      setFilterOptions(data.filters || { companies: [], managers: [], spocs: [], projectNames: [] });
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Error loading project database', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [token, page, limit, sortBy, sortOrder, statusFilter, companyFilter, managerFilter, spocFilter, projectNameFilter]);

  // Debounced search watcher
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setPage(1);
      fetchProjects();
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [search]);

  // Sorting Handler
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // ── Form Management ──────────────────────────────────────────────────────

  const openAddForm = () => {
    setFormType('add');
    setFormData({
      projectName: '',
      spocs: [],
      scopeDoc: '',
      projectNumber: '',
      projectAmount: '',
      projectStatus: 'Planning',
      projectManager: '',
      description: '',
      startDate: '',
      endDate: ''
    });
    setSpocInput('');
    setIsFormOpen(true);
  };

  // FIX: guard .split('T')[0] with safe ISO conversion
  const safeDateStr = (d) => {
    if (!d) return '';
    try { return new Date(d).toISOString().split('T')[0]; }
    catch { return ''; }
  };

  const openEditForm = (project) => {
    setFormType('edit');
    setCurrentProject(project);
    setFormData({
      projectName: project.projectName,
      spocs: project.spocs || [],
      scopeDoc: project.scopeDoc,
      projectNumber: project.projectNumber,
      projectAmount: project.projectAmount,
      projectStatus: project.projectStatus,
      projectManager: project.projectManager,
      description: project.description || '',
      startDate: safeDateStr(project.startDate),
      endDate: safeDateStr(project.endDate)
    });
    setSpocInput('');
    setIsFormOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const submitForm = async (e) => {
    e.preventDefault();
    
    if (!formData.projectName || !formData.spocs || formData.spocs.length === 0 || !formData.scopeDoc || !formData.projectNumber || !formData.projectAmount || !formData.projectManager || !formData.startDate || !formData.endDate) {
      showToast('Please fill in all required fields, including at least one SPOC', 'warning');
      return;
    }

    try {
      const path = formType === 'add' ? '/projects' : `/projects/${currentProject._id}`;
      const method = formType === 'add' ? 'POST' : 'PUT';

      const res = await authFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (res.ok) {
        showToast(formType === 'add' ? 'Project created successfully' : 'Project updated successfully', 'success');
        setIsFormOpen(false);
        fetchProjects();
      } else {
        showToast(data.message || 'Operation failed', 'error');
      }
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Server connection failed', 'error');
    }
  };

  // ── Detail Modal ─────────────────────────────────────────────────────────

  const openDetailModal = (project) => {
    setCurrentProject(project);
    setIsDetailOpen(true);
  };

  // ── Delete Project ───────────────────────────────────────────────────────

  const handleDelete = async (project) => {
    const confirmed = window.confirm(`Are you absolutely sure you want to delete Project: "${project.projectName}"?\nAll attached documents will also be permanently deleted.`);
    if (!confirmed) return;

    try {
      const res = await authFetch(`/projects/${project._id}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (res.ok) {
        showToast('Project and documents deleted successfully', 'success');
        fetchProjects();
      } else {
        showToast(data.message || 'Failed to delete Project', 'error');
      }
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Server connection failed', 'error');
    }
  };

  // ── EXPORT TO EXCEL ──────────────────────────────────────────────────────

  const handleExportExcel = async () => {
    try {
      const res = await authFetch(`/projects/export`);
      if (!res.ok) throw new Error('Export query failed');
      const allProjects = await res.json();

      const formatted = allProjects.map((p, index) => ({
        'Row No': index + 1,
        'Project Name': p.projectName,
        'SPOC(s)': (p.spocs || []).join(', '),
        'Scope Document': p.scopeDoc,
        'Project Number': p.projectNumber,
        'Project Amount (₹)': p.projectAmount,
        'Project Status': p.projectStatus,
        'Project Manager': p.projectManager,
        'Start Date': new Date(p.startDate).toLocaleDateString(),
        'End Date': new Date(p.endDate).toLocaleDateString(),
        'Created Date': new Date(p.createdAt).toLocaleDateString(),
        'Description': p.description || ''
      }));

      const ws = XLSX.utils.json_to_sheet(formatted);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Genessence Projects');
      
      XLSX.writeFile(wb, `Genessence_Projects_Export_${Date.now()}.xlsx`);
      showToast('Database exported successfully', 'success');
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Export failed', 'error');
    }
  };

  // ── IMPORT FROM EXCEL ────────────────────────────────────────────────────

  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  const handleExcelImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const mapped = rows.map(row => ({
          projectName: row['Project Name'] || row['projectName'] || '',
          spocs: row['SPOC(s)'] ? String(row['SPOC(s)']).split(',').map(s => s.trim()).filter(Boolean) : [],
          scopeDoc: row['Scope Document'] || row['scopeDoc'] || '',
          projectNumber: String(row['Project Number'] || row['projectNumber'] || ''),
          projectAmount: Number(row['Project Amount (₹)'] || row['projectAmount'] || 0),
          projectStatus: row['Project Status'] || row['projectStatus'] || 'Planning',
          projectManager: row['Project Manager'] || row['projectManager'] || '',
          description: row['Description'] || row['description'] || '',
          startDate: row['Start Date'] || row['startDate'] || new Date().toISOString().split('T')[0],
          endDate: row['End Date'] || row['endDate'] || new Date().toISOString().split('T')[0]
        }));

        setImportSummary(mapped);
        showToast(`Parsed ${mapped.length} rows from Excel. Please verify before importing.`, 'info');
      } catch (err) {
        console.error(err);
        showToast('Failed to parse Excel file', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const confirmBulkImport = async () => {
    if (!importSummary) return;
    
    try {
      setLoading(true);
      const res = await authFetch(`/projects/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: importSummary })
      });

      const data = await res.json();

      if (res.ok) {
        if (data.errors && data.errors.length > 0) {
          showToast(`Import completed. Success: ${data.successCount}, Failed: ${data.failedCount}.`, 'warning');
          console.warn('Import warnings:', data.errors);
        } else {
          showToast(`Successfully imported all ${data.successCount} projects`, 'success');
        }
        setImportSummary(null);
        fetchProjects();
      } else {
        showToast(data.message || 'Bulk import failed', 'error');
      }
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Bulk import request failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Formatters ───────────────────────────────────────────────────────────

  const formatINR = (val) => {
    if (val === undefined || val === null) return '₹ 0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white my-0">
            Project Database
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Excel-style spreadsheet for tracking Project Names, SPOCs, Scope Documents, and budgets (INR format).
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-1.5 px-4 py-2 border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
          >
            <Download size={14} />
            <span>Export Excel</span>
          </button>
          
          {canEdit && (
            <>
              <button
                onClick={handleImportClick}
                className="flex items-center space-x-1.5 px-4 py-2 border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
              >
                <Upload size={14} />
                <span>Import Excel</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleExcelImport}
                accept=".xlsx,.xls"
                className="hidden"
              />

              <button
                onClick={openAddForm}
                className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-semibold text-white transition-colors shadow-md shadow-blue-500/20"
              >
                <Plus size={14} />
                <span>Add Project</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bulk Import Preview Block */}
      {importSummary && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex space-x-3">
              <Info className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300">
                  Excel Import Verification Pending
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Confirm imported records. Row numbers already present in the database will trigger warnings.
                </p>
              </div>
            </div>
            <button 
              onClick={() => setImportSummary(null)}
              className="text-amber-500 hover:text-amber-700"
            >
              <X size={18} />
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto border border-amber-100 dark:border-amber-900/50 rounded-xl bg-white dark:bg-slate-900 p-3">
            <table className="w-full text-2xs text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800 text-gray-400">
                  <th className="pb-2">Code</th>
                  <th className="pb-2">Project Name</th>
                  <th className="pb-2">SPOC(s)</th>
                  <th className="pb-2">Scope Doc</th>
                  <th className="pb-2">Manager</th>
                  <th className="pb-2">Value (₹)</th>
                  <th className="pb-2">Timeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                {importSummary.map((row, index) => (
                  <tr key={index}>
                    <td className="py-1.5 font-mono font-semibold">{row.projectNumber || 'N/A'}</td>
                    <td className="py-1.5 font-medium">{row.projectName || 'N/A'}</td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {(row.spocs || []).map((s, idx) => (
                          <span key={idx} className="bg-blue-50 text-blue-750 dark:bg-blue-950/45 dark:text-blue-300 px-1 py-0.5 rounded text-3xs font-medium">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-1.5">{row.scopeDoc || 'N/A'}</td>
                    <td className="py-1.5">{row.projectManager || 'N/A'}</td>
                    <td className="py-1.5">{formatINR(row.projectAmount)}</td>
                    <td className="py-1.5">{row.startDate} to {row.endDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end space-x-3.5">
            <button
              onClick={() => setImportSummary(null)}
              className="px-4 py-2 border border-amber-200 dark:border-amber-900 text-xs font-semibold text-amber-800 dark:text-amber-300 rounded-xl hover:bg-amber-100/40"
            >
              Cancel
            </button>
            <button
              onClick={confirmBulkImport}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-xs font-semibold text-white rounded-xl"
            >
              Apply Import ({importSummary.length} Rows)
            </button>
          </div>
        </div>
      )}

      {/* Grid Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Text Search */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-xs text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Filter size={14} />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-gray-700 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Filter by Status</option>
              <option value="Planning">Planning</option>
              <option value="In Progress">In Progress</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {/* Project Name Filter */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Filter size={14} />
            </div>
            <select
              value={projectNameFilter}
              onChange={(e) => { setPage(1); setProjectNameFilter(e.target.value); }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-gray-700 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Filter by Project Name</option>
              {(filterOptions.projectNames || []).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* SPOC Filter */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Filter size={14} />
            </div>
            <select
              value={spocFilter}
              onChange={(e) => { setPage(1); setSpocFilter(e.target.value); }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-gray-700 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Filter by SPOC</option>
              {(filterOptions.spocs || []).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Scope Doc Filter */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Filter size={14} />
            </div>
            <select
              value={companyFilter}
              onChange={(e) => { setPage(1); setCompanyFilter(e.target.value); }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-gray-700 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Filter by Scope Doc</option>
              {(filterOptions.companies || []).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Manager Filter */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Filter size={14} />
            </div>
            <select
              value={managerFilter}
              onChange={(e) => { setPage(1); setManagerFilter(e.target.value); }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-gray-700 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Filter by Manager</option>
              {(filterOptions.managers || []).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* SpreadSheet Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-2xs overflow-hidden">
        {loading && projects.length === 0 ? (
          <Loader text="Retrieving project data grid..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse excel-table text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 dark:bg-slate-900/50 dark:border-slate-800 text-2xs text-gray-500 font-semibold uppercase tracking-wider">
                  <th 
                    onClick={() => handleSort('projectNumber')}
                    className="py-3 px-4 border-r border-gray-200 dark:border-slate-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>Code</span>
                      <ChevronsUpDown size={12} />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('projectName')}
                    className="py-3 px-4 border-r border-gray-200 dark:border-slate-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>Project Name / SPOC(s)</span>
                      <ChevronsUpDown size={12} />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('scopeDoc')}
                    className="py-3 px-4 border-r border-gray-200 dark:border-slate-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>Scope Document</span>
                      <ChevronsUpDown size={12} />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('projectAmount')}
                    className="py-3 px-4 border-r border-gray-200 dark:border-slate-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>Project Amount</span>
                      <ChevronsUpDown size={12} />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('projectStatus')}
                    className="py-3 px-4 border-r border-gray-200 dark:border-slate-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>Status</span>
                      <ChevronsUpDown size={12} />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('projectManager')}
                    className="py-3 px-4 border-r border-gray-200 dark:border-slate-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>Manager</span>
                      <ChevronsUpDown size={12} />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('startDate')}
                    className="py-3 px-4 border-r border-gray-200 dark:border-slate-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>Start Date</span>
                      <ChevronsUpDown size={12} />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('endDate')}
                    className="py-3 px-4 border-r border-gray-200 dark:border-slate-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>End Date</span>
                      <ChevronsUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4 border-r border-gray-200 dark:border-slate-800">
                    <span>Description</span>
                  </th>
                  <th className="py-3 px-4 border-r border-gray-200 dark:border-slate-800 text-center">
                    <span>Attached Docs</span>
                  </th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150 dark:divide-slate-800 text-xs">
                {projects.map((proj) => (
                  <tr key={proj._id} className="hover:bg-blue-50/20 dark:hover:bg-blue-950/10 transition-colors">
                    {/* Code */}
                    <td className="py-2.5 px-4 font-mono font-semibold border-r border-gray-100 dark:border-slate-800 text-gray-800 dark:text-slate-200">
                      {proj.projectNumber}
                    </td>
                    {/* Project Name and SPOCs — clickable name opens detail modal */}
                    <td className="py-2.5 px-4 border-r border-gray-100 dark:border-slate-800 max-w-xs">
                      <button
                        onClick={() => openDetailModal(proj)}
                        className="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm leading-tight hover:underline underline-offset-2 transition-colors text-left"
                        title={`View details: ${proj.projectName}`}
                      >
                        {proj.projectName}
                      </button>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(proj.spocs || []).map((spoc, idx) => (
                          <span key={idx} className="inline-block text-3xs px-2 py-0.5 bg-blue-50/80 text-blue-750 border border-blue-150 rounded-full font-medium dark:bg-blue-955/20 dark:text-blue-400 dark:border-blue-900/60">
                            {spoc}
                          </span>
                        ))}
                      </div>
                    </td>
                    {/* Scope Doc */}
                    <td className="py-2.5 px-4 border-r border-gray-100 dark:border-slate-800 text-gray-600 dark:text-slate-400 max-w-xs truncate" title={proj.scopeDoc}>
                      {proj.scopeDoc}
                    </td>
                    {/* Budget amount (INR) */}
                    <td className="py-2.5 px-4 border-r border-gray-100 dark:border-slate-800 text-gray-800 dark:text-slate-200 text-right pr-6 font-semibold">
                      {formatINR(proj.projectAmount)}
                    </td>
                    {/* Status badge */}
                    <td className="py-2.5 px-4 border-r border-gray-100 dark:border-slate-800 text-center">
                      <span className={`inline-block text-3xs px-2 py-0.5 border rounded-full font-medium ${
                        proj.projectStatus === 'Completed' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400' :
                        proj.projectStatus === 'In Progress' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400' :
                        proj.projectStatus === 'On Hold' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400' :
                        proj.projectStatus === 'Cancelled' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400' :
                        'bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                      }`}>
                        {proj.projectStatus}
                      </span>
                    </td>
                    {/* Manager */}
                    <td className="py-2.5 px-4 border-r border-gray-100 dark:border-slate-800 text-gray-600 dark:text-slate-400 font-medium">
                      {proj.projectManager}
                    </td>
                    {/* Dates */}
                    <td className="py-2.5 px-4 border-r border-gray-100 dark:border-slate-800 text-gray-500 dark:text-slate-400 font-mono">
                      {proj.startDate ? new Date(proj.startDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2.5 px-4 border-r border-gray-100 dark:border-slate-800 text-gray-500 dark:text-slate-400 font-mono">
                      {proj.endDate ? new Date(proj.endDate).toLocaleDateString() : '—'}
                    </td>
                    {/* Description */}
                    <td className="py-2.5 px-4 border-r border-gray-100 dark:border-slate-800 text-gray-500 dark:text-slate-450 max-w-xs truncate" title={proj.description}>
                      {proj.description || 'N/A'}
                    </td>
                    {/* Files count */}
                    <td className="py-2.5 px-4 border-r border-gray-100 dark:border-slate-800 text-center font-semibold text-gray-500 dark:text-slate-400 font-mono">
                      {proj.fileCount || 0}
                    </td>
                    
                    {/* Row operations */}
                    <td className="py-2 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        {/* Eye: opens detail modal */}
                        <button
                          onClick={() => openDetailModal(proj)}
                          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                          title="View details"
                        >
                          <Eye size={14} />
                        </button>
                        
                        {canEdit && (
                          <button
                            onClick={() => openEditForm(proj)}
                            className="p-1 rounded-md text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                            title="Edit record"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(proj)}
                            className="p-1 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Delete record"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty placeholder */}
        {!loading && projects.length === 0 && (
          <div className="p-12 text-center text-gray-400 dark:text-slate-500">
            No projects matched search criteria.
          </div>
        )}

        {/* Pagination footer */}
        <div className="bg-gray-50 dark:bg-slate-900/50 border-t border-gray-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between text-xs">
          <div className="text-gray-500 dark:text-slate-400">
            Showing <span className="font-semibold">{projects.length}</span> of <span className="font-semibold">{total}</span> records
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-gray-600 dark:text-slate-300">
              Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{totalPages}</span>
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── FORM MODAL (Add / Edit) ── */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-2xl w-full border border-gray-100 dark:border-slate-800 overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white capitalize">
                {formType} Project Record
              </h3>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitForm} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Project Name */}
                <div className="md:col-span-2">
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    name="projectName"
                    required
                    value={formData.projectName}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                    placeholder="Enter Project Name"
                  />
                </div>

                {/* SPOC */}
                <div className="md:col-span-2">
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                    SPOC (Single Point of Contact) *
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 p-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl focus-within:border-blue-500 transition-colors">
                    {(formData.spocs || []).map((spoc, idx) => (
                      <span key={idx} className="inline-flex items-center space-x-1 text-xs px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-150 rounded-lg dark:bg-blue-955/20 dark:text-blue-400 dark:border-blue-900/60 font-medium">
                        <span>{spoc}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              spocs: prev.spocs.filter((_, i) => i !== idx)
                            }));
                          }}
                          className="hover:text-blue-900 dark:hover:text-white focus:outline-none"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={spocInput}
                      onChange={(e) => setSpocInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          const val = spocInput.trim();
                          if (val && !formData.spocs.includes(val)) {
                            setFormData(prev => ({
                              ...prev,
                              spocs: [...prev.spocs, val]
                            }));
                            setSpocInput('');
                          }
                        }
                      }}
                      placeholder={formData.spocs.length === 0 ? "Type SPOC and press Enter" : "Add more..."}
                      className="flex-1 bg-transparent border-none outline-none text-sm p-0.5 focus:ring-0 min-w-[120px] dark:text-white"
                    />
                    {spocInput.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          const val = spocInput.trim();
                          if (val && !formData.spocs.includes(val)) {
                            setFormData(prev => ({
                              ...prev,
                              spocs: [...prev.spocs, val]
                            }));
                            setSpocInput('');
                          }
                        }}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 px-2 py-1"
                      >
                        Add
                      </button>
                    )}
                  </div>
                  <p className="text-3xs text-gray-400 dark:text-slate-500 mt-1">
                    Press Enter or Comma to add multiple SPOC values.
                  </p>
                </div>

                {/* Scope Doc */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                    Scope Doc (Company Name) *
                  </label>
                  <input
                    type="text"
                    name="scopeDoc"
                    required
                    value={formData.scopeDoc}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                    placeholder="E.g. Scope Doc Proposal v2"
                  />
                </div>

                {/* Project Number */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                    Project Code / Number *
                  </label>
                  <input
                    type="text"
                    name="projectNumber"
                    required
                    disabled={formType === 'edit'}
                    value={formData.projectNumber}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    placeholder="E.g. GPMP-101"
                  />
                </div>

                {/* Budget Amount (INR) */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                    Project Amount (₹ INR) *
                  </label>
                  <input
                    type="number"
                    name="projectAmount"
                    required
                    min="0"
                    value={formData.projectAmount}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                    placeholder="Budget value (INR)"
                  />
                </div>

                {/* Project Status */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                    Project Status *
                  </label>
                  <select
                    name="projectStatus"
                    value={formData.projectStatus}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="Planning">Planning</option>
                    <option value="In Progress">In Progress</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Project Manager */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                    Project Manager *
                  </label>
                  <input
                    type="text"
                    name="projectManager"
                    required
                    value={formData.projectManager}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                    placeholder="Manager name"
                  />
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    required
                    value={formData.startDate}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    required
                    value={formData.endDate}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows="3"
                    value={formData.description}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                    placeholder="Enter project summary description details..."
                  />
                </div>

              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-slate-800 text-xs font-semibold text-gray-700 dark:text-slate-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white rounded-xl shadow-md"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── PROJECT DETAIL MODAL ── */}
      {isDetailOpen && currentProject && (
        <ProjectDetailModal
          project={currentProject}
          onClose={() => setIsDetailOpen(false)}
          onEdit={(proj) => { openEditForm(proj); }}
          onDelete={(proj) => { handleDelete(proj); }}
          onProjectUpdated={fetchProjects}
        />
      )}
    </div>
  );
};

export default ProjectManagement;
