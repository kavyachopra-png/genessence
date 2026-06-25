import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import { 
  Upload, FileText, Download, Trash2, Eye, Search, Filter, 
  X, AlertCircle, FileArchive, FileSpreadsheet, FileImage, 
  Calendar, User, Edit2, RefreshCw, Tag, CheckCircle2
} from 'lucide-react';

const DocumentUploads = () => {
  const { token, hasRole, API_URL, authFetch } = useAuth();
  const { showToast } = useToast();

  const canUpload = hasRole(['admin', 'manager']);
  const canEdit = hasRole(['admin', 'manager']);
  const canDelete = hasRole('admin');

  // Core Data States
  const [documents, setDocuments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search States
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  // Upload States (Multiple files support)
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Preview States
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Edit Metadata States
  const [editingDoc, setEditingDoc] = useState(null); // doc being edited
  const [editForm, setEditForm] = useState({ originalName: '', description: '', tags: '', versionNote: '', projectId: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Replace File States
  const replaceRefs = useRef({});

  const fetchDocuments = async () => {
    try {
      const params = new URLSearchParams({
        ...(projectFilter && { projectId: projectFilter }),
        search
      });
      const res = await authFetch(`/documents?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch documents list');
      const data = await res.json();
      setDocuments(data);
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Error loading documents list', 'error');
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await authFetch(`/projects?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects);
      }
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error('Error fetching projects dropdown:', err);
    }
  };

  const initPage = async () => {
    setLoading(true);
    await Promise.all([fetchDocuments(), fetchProjects()]);
    setLoading(false);
  };

  useEffect(() => {
    initPage();
  }, [token]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchDocuments();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [search, projectFilter]);

  // ── Drag and drop ─────────────────────────────────────────────────────────

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(Array.from(e.target.files));
    }
  };

  const validateAndAddFiles = (files) => {
    const allowedExtensions = ['.pdf', '.docx', '.xlsx', '.xls', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const validFiles = [];
    files.forEach(file => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        showToast(`Skipped invalid file format: ${file.name}`, 'warning');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        showToast(`Skipped file exceeding 50MB: ${file.name}`, 'warning');
        return;
      }
      validFiles.push(file);
    });
    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  // ── Upload request ────────────────────────────────────────────────────────

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) { showToast('Please select at least one file', 'warning'); return; }
    if (!selectedProjectId) { showToast('Please select a target project', 'warning'); return; }

    setUploading(true);
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('files', file));
    formData.append('projectId', selectedProjectId);

    try {
      const res = await authFetch(`/documents/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Successfully uploaded ${selectedFiles.length} documents`, 'success');
        setSelectedFiles([]);
        setSelectedProjectId('');
        fetchDocuments();
      } else {
        showToast(data.message || 'File upload failed', 'error');
      }
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Network error during upload', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = (doc) => {
    window.open(`${API_URL}/documents/download/${doc._id}?token=${token}`, '_blank');
  };

  // ── Preview ───────────────────────────────────────────────────────────────

  const handlePreview = (doc) => {
    const previewable = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
    if (!previewable.includes((doc.fileType || '').toLowerCase())) {
      handleDownload(doc);
      showToast('File type does not support inline preview. Starting download...', 'info');
      return;
    }
    setPreviewDoc(doc);
    setPreviewLoading(true);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (doc) => {
    const confirmed = window.confirm(`Permanently delete "${doc.originalName}"?\nThis removes the file from disk and all version history.`);
    if (!confirmed) return;
    try {
      const res = await authFetch(`/documents/${doc._id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Document deleted successfully', 'success');
        fetchDocuments();
      } else {
        const data = await res.json();
        showToast(data.message || 'Failed to delete file', 'error');
      }
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Connection failed', 'error');
    }
  };

  // ── Edit Metadata ─────────────────────────────────────────────────────────

  const openEdit = (doc) => {
    setEditingDoc(doc._id);
    setEditForm({
      originalName: doc.originalName,
      description: doc.description || '',
      tags: (doc.tags || []).join(', '),
      versionNote: doc.versionNote || '',
      projectId: doc.projectId?._id || doc.projectId || ''
    });
  };

  const cancelEdit = () => {
    setEditingDoc(null);
    setEditForm({ originalName: '', description: '', tags: '', versionNote: '', projectId: '' });
  };

  const saveEdit = async (docId) => {
    setSavingEdit(true);
    try {
      const tagsArr = editForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await authFetch(`/documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, tags: tagsArr })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Document metadata updated', 'success');
        setDocuments(prev => prev.map(d => d._id === docId ? data : d));
        cancelEdit();
      } else {
        showToast(data.message || 'Update failed', 'error');
      }
    } catch (err) { if (err.message !== 'SESSION_EXPIRED') showToast('Connection failed', 'error'); }
    finally { setSavingEdit(false); }
  };

  // ── Replace File ──────────────────────────────────────────────────────────

  const handleReplaceFile = async (docId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('versionNote', `Replaced on ${new Date().toLocaleDateString()}`);
    try {
      const res = await authFetch(`/documents/replace/${docId}`, {
        method: 'POST',
        body: fd
      });
      const data = await res.json();
      if (res.ok) {
        showToast('File replaced. Previous version archived.', 'success');
        setDocuments(prev => prev.map(d => d._id === docId ? data : d));
      } else {
        showToast(data.message || 'Replace failed', 'error');
      }
    } catch (err) { if (err.message !== 'SESSION_EXPIRED') showToast('Connection failed', 'error'); }
    finally { if (e.target) e.target.value = ''; }
  };

  // ── Icon & format helpers ─────────────────────────────────────────────────

  const getFileIcon = (type) => {
    switch ((type || '').toLowerCase()) {
      case '.pdf':   return <div className="bg-red-50 text-red-600 p-2 rounded-lg dark:bg-red-950/20 dark:text-red-400"><FileText size={20} /></div>;
      case '.xlsx':
      case '.xls':   return <div className="bg-green-50 text-green-600 p-2 rounded-lg dark:bg-green-950/20 dark:text-green-400"><FileSpreadsheet size={20} /></div>;
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.webp':
      case '.gif':   return <div className="bg-blue-50 text-blue-600 p-2 rounded-lg dark:bg-blue-950/20 dark:text-blue-400"><FileImage size={20} /></div>;
      case '.zip':   return <div className="bg-amber-50 text-amber-600 p-2 rounded-lg dark:bg-amber-950/20 dark:text-amber-400"><FileArchive size={20} /></div>;
      default:       return <div className="bg-gray-50 text-gray-600 p-2 rounded-lg dark:bg-slate-800 dark:text-slate-400"><FileText size={20} /></div>;
    }
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white my-0">
          Document Management
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          Store project PDFs, blueprints, spreadsheets, contracts, and archives safely.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Document Upload panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-6 shadow-2xs">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">
              Multiple Files Uploader
            </h3>

            {canUpload ? (
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                {/* File Dropzone */}
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current.click()}
                  className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                    dragActive
                      ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/10'
                      : 'border-gray-200 dark:border-slate-800 hover:border-blue-500 bg-gray-50/30 dark:bg-slate-900/50'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileInput}
                    multiple
                    accept=".pdf,.docx,.xlsx,.xls,.zip,.png,.jpg,.jpeg,.webp,.gif"
                    className="hidden"
                  />
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 mb-3">
                    <Upload size={22} className="animate-bounce" />
                  </div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-slate-300 text-center">
                    Drag and drop files here, or <span className="text-blue-600 dark:text-blue-400">browse</span>
                  </p>
                  <p className="text-3xs text-gray-400 dark:text-slate-500 text-center mt-1">
                    Allowed: PDF, DOCX, XLSX, Images, ZIP (Max 50MB)
                  </p>
                </div>

                {/* Selected Files List */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-100 dark:border-slate-800/80 rounded-xl p-2 bg-gray-50/40 dark:bg-slate-900/40">
                    <div className="flex justify-between items-center text-3xs font-semibold text-gray-400 uppercase px-1 pb-1">
                      <span>Selected Queue</span>
                      <button type="button" onClick={() => setSelectedFiles([])} className="hover:text-red-500 lowercase">Clear all</button>
                    </div>
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center space-x-3 p-2 bg-white dark:bg-slate-900 border border-gray-150/60 dark:border-slate-850 rounded-xl shadow-3xs">
                        {getFileIcon('.' + file.name.split('.').pop())}
                        <div className="flex-1 min-w-0 text-2xs">
                          <p className="font-semibold text-gray-800 dark:text-slate-300 truncate">{file.name}</p>
                          <p className="text-gray-450 mt-0.5">{formatBytes(file.size)}</p>
                        </div>
                        <button type="button" onClick={() => removeSelectedFile(idx)} className="text-gray-450 hover:text-red-500">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Project selector */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1.5">
                    Associate with Project Record *
                  </label>
                  <select
                    required
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="">Select Target Project</option>
                    {projects.map((proj) => (
                      <option key={proj._id} value={proj._id}>
                        [{proj.projectNumber}] {proj.projectName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={uploading || selectedFiles.length === 0 || !selectedProjectId}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white rounded-xl shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {uploading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Uploading {selectedFiles.length} files...</span>
                    </div>
                  ) : (
                    `Upload ${selectedFiles.length} Documents`
                  )}
                </button>
              </form>
            ) : (
              <div className="bg-gray-50 border border-gray-150 rounded-xl p-4 text-xs text-gray-500 text-center dark:bg-slate-900/50 dark:border-slate-850">
                <AlertCircle className="mx-auto text-gray-400 mb-2" size={24} />
                <p>Read-Only Session: Your manager or admin account is required to upload files to server storage.</p>
              </div>
            )}
          </div>
        </div>

        {/* Documents Registry List */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Documents Search/Filter Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 shadow-2xs flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Search size={16} />
              </div>
              <input
                type="text"
                placeholder="Search file name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-xs text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white min-w-[160px]"
            >
              <option value="">All Projects</option>
              {projects.map((proj) => (
                <option key={proj._id} value={proj._id}>{proj.projectName}</option>
              ))}
            </select>
          </div>

          {/* Document list */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-2xs overflow-hidden">
            {loading ? (
              <Loader text="Accessing document registers..." />
            ) : documents.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-slate-800/60">
                {documents.map((doc) => (
                  <div key={doc._id} className="transition-colors">
                    {/* Main row */}
                    <div className="p-4 hover:bg-gray-50/50 dark:hover:bg-slate-900/60 flex items-center justify-between gap-3">
                      
                      {/* File metadata */}
                      <div className="flex items-center space-x-3.5 min-w-0">
                        {getFileIcon(doc.fileType)}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-950 dark:text-white truncate" title={doc.originalName}>
                            {doc.originalName}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 text-2xs text-gray-400 mt-1">
                            <span className="font-medium text-blue-600 dark:text-blue-400 truncate max-w-[200px]" title={doc.projectId?.projectName}>
                              Project: {doc.projectId?.projectName || 'N/A'}
                            </span>
                            <span>•</span>
                            <div className="flex flex-wrap items-center gap-1">
                              {(doc.projectId?.spocs || []).map((s, idx) => (
                                <span key={idx} className="bg-blue-50/50 text-blue-750 dark:bg-blue-955/10 dark:text-blue-400 px-1 py-0.2 rounded text-3xs font-medium">{s}</span>
                              ))}
                            </div>
                            <span>•</span>
                            <span className="inline-flex items-center"><Calendar size={10} className="mr-1" />{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                            <span>•</span>
                            <span className="inline-flex items-center"><User size={10} className="mr-1" />{doc.uploadedBy}</span>
                            <span>•</span>
                            <span>{formatBytes(doc.fileSize)}</span>
                            {doc.versions?.length > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-blue-500">v{doc.versions.length + 1}</span>
                              </>
                            )}
                          </div>
                          {/* Tags */}
                          {doc.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {doc.tags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400">
                                  <Tag size={8} />{tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {doc.description && (
                            <p className="text-2xs text-gray-500 dark:text-slate-500 mt-0.5 truncate max-w-xs">{doc.description}</p>
                          )}
                        </div>
                      </div>

                      {/* Operations */}
                      <div className="flex items-center space-x-1 pl-3 shrink-0">
                        <button
                          onClick={() => handlePreview(doc)}
                          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                          title="Preview File"
                        >
                          <Eye size={15} />
                        </button>
                        
                        <button
                          onClick={() => handleDownload(doc)}
                          className="p-2 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                          title="Download File"
                        >
                          <Download size={15} />
                        </button>

                        {canEdit && (
                          <>
                            {/* Edit metadata toggle */}
                            <button
                              onClick={() => editingDoc === doc._id ? cancelEdit() : openEdit(doc)}
                              className={`p-2 rounded-lg transition-colors ${
                                editingDoc === doc._id
                                  ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/30'
                                  : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20'
                              }`}
                              title="Edit metadata"
                            >
                              <Edit2 size={15} />
                            </button>

                            {/* Replace file */}
                            <button
                              onClick={() => replaceRefs.current[doc._id]?.click()}
                              className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
                              title="Replace file"
                            >
                              <RefreshCw size={15} />
                            </button>
                            <input
                              type="file"
                              className="hidden"
                              ref={el => replaceRefs.current[doc._id] = el}
                              onChange={e => handleReplaceFile(doc._id, e)}
                              accept=".pdf,.docx,.xlsx,.xls,.zip,.png,.jpg,.jpeg,.webp,.gif"
                            />
                          </>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => handleDelete(doc)}
                            className="p-2 rounded-lg text-red-500 hover:text-red-650 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                            title="Delete Document"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Edit Metadata panel */}
                    {editingDoc === doc._id && (
                      <div className="border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/70 px-4 py-4 animate-fade-up">
                        <p className="text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-3">Edit Document Metadata</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Display Name</label>
                            <input
                              type="text"
                              value={editForm.originalName}
                              onChange={e => setEditForm(p => ({ ...p, originalName: e.target.value }))}
                              className="w-full text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:border-blue-500 focus:outline-none dark:text-white"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Description</label>
                            <input
                              type="text"
                              value={editForm.description}
                              onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                              placeholder="Short description..."
                              className="w-full text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:border-blue-500 focus:outline-none dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Tags (comma-separated)</label>
                            <input
                              type="text"
                              value={editForm.tags}
                              onChange={e => setEditForm(p => ({ ...p, tags: e.target.value }))}
                              placeholder="contract, legal, final..."
                              className="w-full text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:border-blue-500 focus:outline-none dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Version Note</label>
                            <input
                              type="text"
                              value={editForm.versionNote}
                              onChange={e => setEditForm(p => ({ ...p, versionNote: e.target.value }))}
                              placeholder="e.g. Final approved copy"
                              className="w-full text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:border-blue-500 focus:outline-none dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Associated Project</label>
                            <select
                              value={editForm.projectId}
                              onChange={e => setEditForm(p => ({ ...p, projectId: e.target.value }))}
                              className="w-full text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:border-blue-500 focus:outline-none dark:text-white"
                            >
                              <option value="">Same Project</option>
                              {projects.map(p => (
                                <option key={p._id} value={p._id}>[{p.projectNumber}] {p.projectName}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-3">
                          <button onClick={cancelEdit} className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800">
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdit(doc._id)}
                            disabled={savingEdit}
                            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {savingEdit ? <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" /> : <CheckCircle2 size={13} />}
                            Save Changes
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-gray-400 dark:text-slate-500">
                No matching documents found in folder registry.
              </div>
            )}
          </div>

        </div>

      </div>

      {/* PREVIEW PORTAL MODAL */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-5xl w-full h-[85vh] border border-gray-100 dark:border-slate-800 flex flex-col overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-md">
                  Preview: {previewDoc.originalName}
                </h3>
                <p className="text-3xs text-gray-400 mt-0.5">Size: {formatBytes(previewDoc.fileSize)} | Project: {previewDoc.projectId?.projectName || 'N/A'}</p>
              </div>
              <button 
                onClick={() => setPreviewDoc(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Frame viewer */}
            <div className="flex-1 bg-gray-100 dark:bg-slate-950 relative">
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70 z-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
                </div>
              )}

              {['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes((previewDoc.fileType || '').toLowerCase()) ? (
                <div className="h-full w-full flex items-center justify-center p-4">
                  <img
                    src={`${API_URL}/documents/preview/${previewDoc._id}?token=${token}`}
                    alt={previewDoc.originalName}
                    onLoad={() => setPreviewLoading(false)}
                    className="max-h-full max-w-full object-contain rounded-lg shadow-sm"
                  />
                </div>
              ) : (previewDoc.fileType || '').toLowerCase() === '.pdf' ? (
                <iframe
                  src={`${API_URL}/documents/preview/${previewDoc._id}?token=${token}`}
                  title={previewDoc.originalName}
                  onLoad={() => setPreviewLoading(false)}
                  className="w-full h-full border-none"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                  <AlertCircle size={40} className="text-gray-400" />
                  <p className="text-xs">Preview unavailable for this format.</p>
                  <button
                    onClick={() => handleDownload(previewDoc)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-xs"
                  >
                    Download to View
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900/50 border-t border-gray-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-800 text-xs font-semibold text-gray-800 dark:text-slate-200 rounded-xl hover:bg-gray-300 dark:hover:bg-slate-700"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DocumentUploads;
