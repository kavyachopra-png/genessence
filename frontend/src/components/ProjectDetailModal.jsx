import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  X, Edit2, Trash2, Eye, Download, Upload, FileText, Image,
  Calendar, User, Tag, Clock, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, RefreshCw, Paperclip, Plus,
  TrendingUp, DollarSign, Activity, Users, Hash
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatINR = (val) => {
  if (val === undefined || val === null) return '₹ 0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(val);
};

const formatBytes = (bytes, decimals = 1) => {
  if (!+bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const statusColors = {
  'Completed':   'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  'On Hold':     'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  'Cancelled':   'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
  'Planning':    'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

const getFileIcon = (type) => {
  const t = (type || '').toLowerCase();
  if (t === '.pdf') return <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 shrink-0"><FileText size={16} /></div>;
  if (['.xlsx', '.xls'].includes(t)) return <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 shrink-0"><FileText size={16} /></div>;
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(t)) return <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 shrink-0"><Image size={16} /></div>;
  if (t === '.zip') return <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 shrink-0"><FileText size={16} /></div>;
  return <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400 shrink-0"><FileText size={16} /></div>;
};

// ─── Document row inside modal ────────────────────────────────────────────────

function DocRow({ doc, canEdit, canDelete, onDeleted, onUpdated, onPreview, API_URL, token, authFetch }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [editForm, setEditForm] = useState({ originalName: doc.originalName, description: doc.description || '', tags: (doc.tags || []).join(', '), versionNote: doc.versionNote || '' });
  const [saving, setSaving] = useState(false);
  const replaceRef = useRef(null);

  const handleEditSave = async () => {
    setSaving(true);
    try {
      const tagsArr = editForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await authFetch(`/documents/${doc._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, tags: tagsArr })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Document metadata updated', 'success');
        setEditing(false);
        onUpdated(data);
      } else {
        showToast(data.message || 'Update failed', 'error');
      }
    } catch (err) { if (err.message !== 'SESSION_EXPIRED') showToast('Connection failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleReplace = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReplacing(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('versionNote', `Replaced on ${new Date().toLocaleDateString()}`);
    try {
      const res = await authFetch(`/documents/replace/${doc._id}`, {
        method: 'POST',
        body: fd
      });
      const data = await res.json();
      if (res.ok) {
        showToast('File replaced. Previous version archived.', 'success');
        onUpdated(data);
      } else {
        showToast(data.message || 'Replace failed', 'error');
      }
    } catch (err) { if (err.message !== 'SESSION_EXPIRED') showToast('Connection failed', 'error'); }
    finally { setReplacing(false); e.target.value = ''; }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Permanently delete "${doc.originalName}"?\nThis also removes all version history from disk.`);
    if (!confirmed) return;
    try {
      const res = await authFetch(`/documents/${doc._id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Document deleted', 'success');
        onDeleted(doc._id);
      } else {
        const data = await res.json();
        showToast(data.message || 'Delete failed', 'error');
      }
    } catch (err) { if (err.message !== 'SESSION_EXPIRED') showToast('Connection failed', 'error'); }
  };

  const handleDownload = () => {
    window.open(`${API_URL}/documents/download/${doc._id}?token=${token}`, '_blank');
  };

  const isPreviewable = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'].includes((doc.fileType || '').toLowerCase());

  return (
    <div className="border border-gray-100 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        {getFileIcon(doc.fileType)}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate" title={doc.originalName}>{doc.originalName}</p>
          <p className="text-2xs text-gray-400 dark:text-slate-500 mt-0.5">
            {formatBytes(doc.fileSize)} · {fmtDate(doc.uploadedAt)} · {doc.uploadedBy}
            {doc.versions?.length > 0 && <span className="ml-2 text-blue-500">v{doc.versions.length + 1}</span>}
          </p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {isPreviewable && (
            <button onClick={() => onPreview(doc)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors" title="Preview">
              <Eye size={13} />
            </button>
          )}
          <button onClick={handleDownload} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors" title="Download">
            <Download size={13} />
          </button>
          {canEdit && (
            <>
              <button onClick={() => setEditing(v => !v)} className={`p-1.5 rounded-lg transition-colors ${editing ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30'}`} title="Edit metadata">
                <Edit2 size={13} />
              </button>
              <button onClick={() => replaceRef.current?.click()} disabled={replacing} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors disabled:opacity-50" title="Replace file">
                {replacing ? <div className="h-3 w-3 animate-spin rounded-full border border-amber-500 border-t-transparent" /> : <RefreshCw size={13} />}
              </button>
              <input ref={replaceRef} type="file" className="hidden" onChange={handleReplace}
                accept=".pdf,.docx,.xlsx,.xls,.zip,.png,.jpg,.jpeg,.webp,.gif" />
            </>
          )}
          {canDelete && (
            <button onClick={handleDelete} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/70 p-3 space-y-2 animate-fade-up">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Display Name</label>
              <input
                type="text"
                value={editForm.originalName}
                onChange={e => setEditForm(p => ({ ...p, originalName: e.target.value }))}
                className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 focus:border-blue-500 focus:outline-none dark:text-white"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Description</label>
              <input
                type="text"
                value={editForm.description}
                onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Short description..."
                className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 focus:border-blue-500 focus:outline-none dark:text-white"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Tags (comma separated)</label>
              <input
                type="text"
                value={editForm.tags}
                onChange={e => setEditForm(p => ({ ...p, tags: e.target.value }))}
                placeholder="contract, legal, v2..."
                className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 focus:border-blue-500 focus:outline-none dark:text-white"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Version Note</label>
              <input
                type="text"
                value={editForm.versionNote}
                onChange={e => setEditForm(p => ({ ...p, versionNote: e.target.value }))}
                placeholder="e.g. Final approved copy"
                className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 focus:border-blue-500 focus:outline-none dark:text-white"
              />
            </div>
          </div>
          {doc.tags?.length > 0 || editForm.tags ? (
            <div className="flex flex-wrap gap-1">
              {editForm.tags.split(',').map(t => t.trim()).filter(Boolean).map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400">
                  <Tag size={9} />{tag}
                </span>
              ))}
            </div>
          ) : null}
          {doc.versions?.length > 0 && (
            <p className="text-2xs text-gray-400 dark:text-slate-500">{doc.versions.length} previous version(s) archived.</p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setEditing(false)} className="px-3 py-1 text-2xs font-semibold rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800">Cancel</button>
            <button onClick={handleEditSave} disabled={saving} className="px-3 py-1 text-2xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center gap-1">
              {saving && <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />}
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────

function Timeline({ project, docs }) {
  const events = [];

  // Created event
  if (project.createdAt) {
    events.push({ date: new Date(project.createdAt), label: 'Project Created', icon: <Plus size={12} />, color: 'bg-slate-500', textColor: 'text-slate-600 dark:text-slate-400' });
  }
  // Started event
  if (project.startDate) {
    events.push({ date: new Date(project.startDate), label: 'Project Started', icon: <Activity size={12} />, color: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400' });
  }
  // Updated event (if different from created)
  if (project.updatedAt && project.updatedAt !== project.createdAt) {
    events.push({ date: new Date(project.updatedAt), label: 'Last Record Update', icon: <RefreshCw size={12} />, color: 'bg-indigo-500', textColor: 'text-indigo-600 dark:text-indigo-400' });
  }
  // Document uploads
  docs.forEach(doc => {
    events.push({ date: new Date(doc.uploadedAt), label: `Document: ${doc.originalName}`, icon: <Paperclip size={12} />, color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400' });
  });
  // Completed event
  if (project.projectStatus === 'Completed' && project.endDate) {
    events.push({ date: new Date(project.endDate), label: 'Project Completed', icon: <CheckCircle2 size={12} />, color: 'bg-emerald-500', textColor: 'text-emerald-600 dark:text-emerald-400' });
  } else if (project.endDate) {
    events.push({ date: new Date(project.endDate), label: 'Target End Date', icon: <Calendar size={12} />, color: 'bg-gray-400', textColor: 'text-gray-500 dark:text-slate-500' });
  }

  // Sort by date
  events.sort((a, b) => a.date - b.date);

  return (
    <div className="relative pl-6 space-y-4">
      <div className="absolute left-2.5 top-2 bottom-2 w-px bg-gray-200 dark:bg-slate-700" />
      {events.map((ev, idx) => (
        <div key={idx} className="relative flex items-start gap-3 animate-fade-up" style={{ animationDelay: `${idx * 0.05}s` }}>
          <div className={`absolute -left-3.5 flex items-center justify-center w-6 h-6 rounded-full ${ev.color} text-white`}>
            {ev.icon}
          </div>
          <div className="pt-0.5">
            <p className={`text-xs font-semibold ${ev.textColor} truncate max-w-[220px]`} title={ev.label}>{ev.label}</p>
            <p className="text-2xs text-gray-400 dark:text-slate-500 mt-0.5">{fmtDateTime(ev.date)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function ProjectDetailModal({ project: initialProject, onClose, onEdit, onDelete, onProjectUpdated }) {
  const { token, hasRole, API_URL, authFetch } = useAuth();
  const { showToast } = useToast();

  const canEdit = hasRole(['admin', 'manager']);
  const canDelete = hasRole('admin');

  const [project, setProject] = useState(initialProject);
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // overview | timeline | documents
  const [modalFiles, setModalFiles] = useState([]);
  const [modalDragActive, setModalDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const modalFileRef = useRef(null);

  // Compute KPIs
  const now = new Date();
  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.endDate ? new Date(project.endDate) : null;
  const daysRemaining = end ? Math.ceil((end - now) / (1000 * 60 * 60 * 24)) : null;
  let progressPct = 0;
  if (start && end) {
    const total = end - start;
    const elapsed = now - start;
    progressPct = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  }
  if (project.projectStatus === 'Completed') progressPct = 100;
  if (project.projectStatus === 'Planning') progressPct = 0;

  const fetchDocs = async () => {
    setLoadingDocs(true);
    console.group(`[ProjectDetailModal] Fetching docs for project: ${project.projectName}`);
    try {
      const res = await authFetch(`/projects/${project._id}`);
      if (res.ok) {
        const data = await res.json();
        const docs = data.documents || [];
        console.log(`✅ Loaded ${docs.length} document(s)`);
        setDocs(docs);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('❌ Failed to fetch project docs:', res.status, errData.message);
      }
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error('❌ Network error fetching docs:', err.message);
    } finally {
      setLoadingDocs(false);
      console.groupEnd();
    }
  };

  useEffect(() => { fetchDocs(); }, [project._id]);

  // ── Upload helpers ────────────────────────────────────────────────────────

  const handleModalDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setModalDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };
  const handleModalDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setModalDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
  };
  const addFiles = (files) => {
    const allowed = ['.pdf', '.docx', '.xlsx', '.xls', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
    files.forEach(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (!allowed.includes(ext)) { showToast(`Skipped: ${f.name}`, 'warning'); return; }
      if (f.size > 50 * 1024 * 1024) { showToast(`Too large: ${f.name}`, 'warning'); return; }
      setModalFiles(p => [...p, f]);
    });
  };

  const uploadFiles = async () => {
    if (!modalFiles.length) return;
    setUploading(true);
    const fd = new FormData();
    modalFiles.forEach(f => fd.append('files', f));
    fd.append('projectId', project._id);
    try {
      const res = await authFetch(`/documents/upload`, {
        method: 'POST',
        body: fd
      });
      if (res.ok) {
        showToast(`${modalFiles.length} file(s) uploaded`, 'success');
        setModalFiles([]);
        fetchDocs();
      } else {
        const d = await res.json();
        showToast(d.message || 'Upload failed', 'error');
      }
    } catch (err) { if (err.message !== 'SESSION_EXPIRED') showToast('Network error', 'error'); }
    finally { setUploading(false); }
  };

  // ── Doc CRUD callbacks ────────────────────────────────────────────────────

  const handleDocDeleted = (docId) => {
    setDocs(p => p.filter(d => d._id !== docId));
    if (onProjectUpdated) onProjectUpdated();
  };
  const handleDocUpdated = (updated) => {
    setDocs(p => p.map(d => d._id === updated._id ? updated : d));
  };

  return (
    <>
      {/* Backdrop — z-[51] is below the modal panel z-[52] so clicks don't bleed through */}
      <div
        className="fixed inset-0 z-[51] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel — higher z-index, stopPropagation prevents backdrop from firing */}
      <div
        className="fixed inset-0 z-[52] flex items-center justify-center p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-5xl max-h-[93vh] flex flex-col overflow-hidden animate-zoom-in">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-mono font-bold px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg shrink-0">
                {project.projectNumber}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate">{project.projectName}</h2>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(project.spocs || []).map((s, i) => (
                    <span key={i} className="text-2xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800 font-medium">{s}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {canEdit && (
                <button
                  onClick={() => { onClose(); onEdit(project); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-md shadow-blue-500/20"
                >
                  <Edit2 size={13} /> Edit Project
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => { onClose(); onDelete(project); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/30 dark:hover:bg-red-950/50 dark:text-red-400 text-xs font-semibold rounded-xl transition-colors border border-red-200 dark:border-red-800"
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ── KPI Strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-800 shrink-0">
            {[
              {
                icon: <TrendingUp size={16} />,
                label: 'Progress',
                value: `${progressPct}%`,
                sub: (
                  <div className="mt-1 h-1 w-full bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full progress-bar-gradient rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                ),
                color: 'text-blue-600 dark:text-blue-400',
                bg: 'bg-blue-50 dark:bg-blue-950/20'
              },
              {
                icon: <Clock size={16} />,
                label: 'Days Remaining',
                value: daysRemaining === null ? '—' : daysRemaining < 0 ? `${Math.abs(daysRemaining)} overdue` : `${daysRemaining} days`,
                color: daysRemaining !== null && daysRemaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
                bg: 'bg-amber-50 dark:bg-amber-950/20'
              },
              {
                icon: <DollarSign size={16} />,
                label: 'Budget',
                value: formatINR(project.projectAmount),
                color: 'text-emerald-600 dark:text-emerald-400',
                bg: 'bg-emerald-50 dark:bg-emerald-950/20'
              },
              {
                icon: <Activity size={16} />,
                label: 'Status',
                value: project.projectStatus,
                color: 'text-indigo-600 dark:text-indigo-400',
                bg: 'bg-indigo-50 dark:bg-indigo-950/20'
              }
            ].map((kpi, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5 bg-white dark:bg-slate-900">
                <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${kpi.bg} ${kpi.color} shrink-0`}>{kpi.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-2xs text-gray-400 dark:text-slate-500 font-medium uppercase tracking-wider">{kpi.label}</p>
                  <p className={`text-sm font-bold ${kpi.color} truncate`}>{kpi.value}</p>
                  {kpi.sub}
                </div>
              </div>
            ))}
          </div>

          {/* ── Tab bar ── */}
          <div className="flex items-center gap-1 px-6 pt-3 pb-0 border-b border-gray-200 dark:border-slate-800 shrink-0">
            {[
              { id: 'overview', label: 'Overview', icon: <Hash size={13} /> },
              { id: 'documents', label: `Documents (${docs.length})`, icon: <Paperclip size={13} /> },
              { id: 'timeline', label: 'Timeline', icon: <Clock size={13} /> }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500'
                    : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab Content ── */}
          <div className="flex-1 overflow-y-auto">

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="p-6 space-y-6 animate-fade-up">

                {/* Status badge + scope */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-block text-xs px-3 py-1 border rounded-full font-semibold ${statusColors[project.projectStatus] || statusColors['Planning']}`}>
                    {project.projectStatus}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-slate-400">Scope: <span className="font-medium text-gray-700 dark:text-slate-300">{project.scopeDoc}</span></span>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { icon: <Hash size={14} />, label: 'Project Number', value: project.projectNumber },
                    { icon: <DollarSign size={14} />, label: 'Project Amount', value: formatINR(project.projectAmount) },
                    { icon: <User size={14} />, label: 'Project Manager', value: project.projectManager },
                    { icon: <Users size={14} />, label: 'SPOC(s)', value: (project.spocs || []).join(', ') || '—' },
                    { icon: <Calendar size={14} />, label: 'Start Date', value: fmtDate(project.startDate) },
                    { icon: <Calendar size={14} />, label: 'End Date', value: fmtDate(project.endDate) },
                    { icon: <Clock size={14} />, label: 'Created Date', value: fmtDateTime(project.createdAt) },
                    { icon: <RefreshCw size={14} />, label: 'Last Updated', value: fmtDateTime(project.updatedAt) },
                    { icon: <Paperclip size={14} />, label: 'Attached Documents', value: `${docs.length} file(s)` },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800">
                      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 shrink-0 shadow-sm">
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-2xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{item.label}</p>
                        <p className="text-xs font-semibold text-gray-800 dark:text-slate-200 mt-0.5 break-words">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Description */}
                {project.description && (
                  <div>
                    <h4 className="text-2xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2">Project Description</h4>
                    <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 rounded-xl p-4">
                      {project.description}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* DOCUMENTS TAB */}
            {activeTab === 'documents' && (
              <div className="p-6 space-y-4 animate-fade-up">

                {/* Upload zone */}
                {canEdit && (
                  <div>
                    <div
                      onDragEnter={handleModalDrag}
                      onDragOver={handleModalDrag}
                      onDragLeave={handleModalDrag}
                      onDrop={handleModalDrop}
                      onClick={() => modalFileRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl px-6 py-5 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                        modalDragActive
                          ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/10'
                          : 'border-gray-200 dark:border-slate-700 hover:border-blue-400 bg-gray-50/50 dark:bg-slate-800/30'
                      }`}
                    >
                      <input ref={modalFileRef} type="file" className="hidden" multiple onChange={e => addFiles(Array.from(e.target.files))} accept=".pdf,.docx,.xlsx,.xls,.zip,.png,.jpg,.jpeg,.webp,.gif" />
                      <Paperclip size={20} className="text-blue-500 dark:text-blue-400 mb-1.5" />
                      <p className="text-xs font-semibold text-gray-600 dark:text-slate-300">Drop files here or <span className="text-blue-600 dark:text-blue-400">browse</span></p>
                      <p className="text-2xs text-gray-400 dark:text-slate-500 mt-0.5">PDF, DOCX, XLSX, Images, ZIP — Max 50 MB</p>
                    </div>

                    {modalFiles.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {modalFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2">
                            {getFileIcon('.' + f.name.split('.').pop())}
                            <span className="flex-1 truncate font-medium text-gray-700 dark:text-slate-300">{f.name}</span>
                            <span className="text-gray-400 text-2xs">{formatBytes(f.size)}</span>
                            <button onClick={() => setModalFiles(p => p.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500"><X size={13} /></button>
                          </div>
                        ))}
                        <button
                          onClick={uploadFiles}
                          disabled={uploading}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {uploading ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Upload size={13} />}
                          Upload {modalFiles.length} file(s)
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Document list */}
                {loadingDocs ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  </div>
                ) : docs.length > 0 ? (
                  <div className="space-y-2">
                    {docs.map(doc => (
                      <DocRow
                        key={doc._id}
                        doc={doc}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        onDeleted={handleDocDeleted}
                        onUpdated={handleDocUpdated}
                        onPreview={d => { setPreviewDoc(d); setPreviewLoading(true); }}
                        API_URL={API_URL}
                        token={token}
                        authFetch={authFetch}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-16 text-center">
                    <Paperclip size={32} className="mx-auto text-gray-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm text-gray-400 dark:text-slate-500">No documents attached to this project yet.</p>
                    {canEdit && <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Drag and drop files above to upload.</p>}
                  </div>
                )}
              </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === 'timeline' && (
              <div className="p-6 animate-fade-up">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-5">Project Milestones & Activity</h4>
                {(docs.length > 0 || project.createdAt) ? (
                  <Timeline project={project} docs={docs} />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-12">No timeline events yet.</p>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50 dark:bg-slate-900/50 shrink-0">
            <p className="text-2xs text-gray-400 dark:text-slate-500">
              Record: <span className="font-mono">{project._id}</span>
            </p>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gray-200 dark:bg-slate-800 text-xs font-semibold text-gray-700 dark:text-slate-300 rounded-xl hover:bg-gray-300 dark:hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* ── File Preview Modal (on top of the detail modal) ── */}
      {previewDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-md">{previewDoc.originalName}</h3>
                <p className="text-2xs text-gray-400 mt-0.5">{formatBytes(previewDoc.fileSize)} · {fmtDate(previewDoc.uploadedAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.open(`${API_URL}/documents/download/${previewDoc._id}?token=${token}`, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-xl transition-colors"
                >
                  <Download size={13} /> Download
                </button>
                <button onClick={() => setPreviewDoc(null)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 dark:bg-slate-950 relative">
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70 z-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
                </div>
              )}
              {['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes((previewDoc.fileType || '').toLowerCase()) ? (
                <div className="h-full w-full flex items-center justify-center p-4">
                  <img src={`${API_URL}/documents/preview/${previewDoc._id}?token=${token}`} alt={previewDoc.originalName} onLoad={() => setPreviewLoading(false)} className="max-h-full max-w-full object-contain rounded-lg shadow-md" />
                </div>
              ) : (previewDoc.fileType || '').toLowerCase() === '.pdf' ? (
                <iframe src={`${API_URL}/documents/preview/${previewDoc._id}?token=${token}`} title={previewDoc.originalName} onLoad={() => setPreviewLoading(false)} className="w-full h-full border-none" />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4">
                  <AlertCircle size={40} className="text-gray-300 dark:text-slate-600" />
                  <p className="text-xs">Preview not available for this file type.</p>
                  <button onClick={() => window.open(`${API_URL}/documents/download/${previewDoc._id}?token=${token}`, '_blank')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md">
                    Download to View
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
