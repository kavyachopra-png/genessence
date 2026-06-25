import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { 
  Briefcase, Building2, CircleDollarSign, FileText, Calendar, 
  ChevronRight, Search, TrendingUp, CheckCircle, AlertCircle, Users 
} from 'lucide-react';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const { token, authFetch } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [recentDocs, setRecentDocs] = useState([]);
  
  // Dashboard Search/Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const statsRes = await authFetch(`/projects/stats`);
      if (!statsRes.ok) throw new Error('Failed to fetch project statistics');
      const statsData = await statsRes.json();
      setStats(statsData);

      const docsRes = await authFetch(`/documents/recent`);
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        setRecentDocs(docsData);
      }
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Error loading dashboard metrics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [token]);

  if (loading) {
    return <Loader text="Assembling analytics dashboard..." />;
  }

  if (!stats) {
    return (
      <div className="p-8 text-center text-gray-500">
        No stats data found. Make sure backend is running.
      </div>
    );
  }

  // INDIAN CURRENCY FORMATTING (INR) - e.g. ₹ 12,50,000
  const formatINR = (val) => {
    if (val === undefined || val === null) return '₹ 0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const statusColors = {
    'Planning': '#3b82f6',     // Blue
    'In Progress': '#10b981',  // Green
    'On Hold': '#f59e0b',      // Amber
    'Completed': '#8b5cf6',    // Purple
    'Cancelled': '#ef4444'     // Red
  };

  const pieData = Object.keys(stats.statusCounts || {}).map(status => ({
    name: status,
    value: stats.statusCounts[status]
  }));

  // Filter recently added projects based on dashboard search
  const filteredRecentProjects = stats.recentProjects?.filter(p => {
    const matchesSearch = 
      (p.projectName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.spocs || []).some(s => s.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.scopeDoc || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.projectManager || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter ? p.projectStatus === statusFilter : true;
    
    return matchesSearch && matchesStatus;
  }) || [];

  return (
    <div className="p-6 space-y-8 animate-fade-in transition-colors duration-200">
      
      {/* Page Title & Search/Filter Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white my-0">
            Analytics Overview
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1.5">
            Real-time project financials, workloads, and document registers (INR Format).
          </p>
        </div>

        {/* Dashboard search/filter */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              placeholder="Search recent projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          >
            <option value="">All Statuses</option>
            <option value="Planning">Planning</option>
            <option value="In Progress">In Progress</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Analytics Summary Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        
        {/* KPI 1: Total Projects */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                Total Projects
              </p>
              <h3 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {stats.totalProjects}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400">
              <Briefcase size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-gray-505 dark:text-slate-400">
            Total project records
          </div>
        </div>

        {/* KPI 2: Total SPOCs */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                Total SPOCs
              </p>
              <h3 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {stats.totalSpocs}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/20 dark:text-teal-400">
              <Users size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-gray-505 dark:text-slate-400">
            Unique Single Points of Contact
          </div>
        </div>

        {/* KPI 3: Total Project Value */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                Total Project Value
              </p>
              <h3 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                {formatINR(stats.totalValue)}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400">
              <CircleDollarSign size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-gray-505 dark:text-slate-400">
            Aggregate budgets
          </div>
        </div>

        {/* KPI 4: Active Projects */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                Active Projects
              </p>
              <h3 className="mt-2 text-3xl font-bold text-gray-950 dark:text-white">
                {stats.activeCount}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
              <TrendingUp size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-gray-550 dark:text-slate-450 font-medium">
            Value: {formatINR(stats.activeValue)} (In Progress)
          </div>
        </div>

        {/* KPI 5: Completed Projects */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                Completed Projects
              </p>
              <h3 className="mt-2 text-3xl font-bold text-gray-955 dark:text-white">
                {stats.completedCount}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
              <CheckCircle size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-gray-550 dark:text-slate-455 font-medium">
            Value: {formatINR(stats.completedValue)} (Fully delivered)
          </div>
        </div>

        {/* KPI 6: Pending Projects */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                Pending Projects
              </p>
              <h3 className="mt-2 text-3xl font-bold text-gray-955 dark:text-white">
                {stats.pendingCount}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400">
              <AlertCircle size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-gray-550 dark:text-slate-455 font-medium">
            Value: {formatINR(stats.pendingValue)} (Planning / On Hold)
          </div>
        </div>
      </div>

      {/* Charts Block */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        
        {/* Trend Area Chart */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Project Initiation Timeline & Capital Investment (INR)
            </h3>
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Cumulated budgets mapped to start date timelines (last 6 months)
            </p>
          </div>
          <div className="h-80 w-full">
            {stats.monthlyTrends && stats.monthlyTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.monthlyTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100 dark:stroke-slate-800" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                  <YAxis tickFormatter={(val) => `₹${val/100000}L`} stroke="#94a3b8" fontSize={11} />
                  <Tooltip 
                    formatter={(val) => [formatINR(val), 'Capital Value']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="value" name="Amount Invoiced" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Insufficient timeline data to generate chart.
              </div>
            )}
          </div>
        </div>

        {/* Project Status Pie Chart */}
        <div className="rounded-2xl bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Workload Status Mix
            </h3>
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Distribution of active and backlog projects
            </p>
          </div>
          <div className="h-64 w-full flex items-center justify-center relative">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={statusColors[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => [`${val} Projects`, 'Count']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-gray-400">No project status data</div>
            )}
          </div>
          {/* Legend Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center space-x-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColors[item.name] || '#94a3b8' }} />
                <span className="text-gray-600 dark:text-slate-400 truncate">{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Bottom Data Grid Lists */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        
        {/* Recently Added Projects List */}
        <div className="rounded-2xl bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Recently Added Projects
              </h3>
              <p className="text-xs text-gray-400 dark:text-slate-500">
                Latest records initialized in system
              </p>
            </div>
            <Link to="/projects" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center">
              View All <ChevronRight size={14} />
            </Link>
          </div>

          <div className="space-y-3.5">
            {filteredRecentProjects.length > 0 ? (
              filteredRecentProjects.map(proj => (
                <div key={proj._id} className="flex items-center justify-between p-3.5 border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/40 rounded-xl hover:border-blue-200 dark:hover:border-blue-900 transition-all">
                  <div className="flex items-start space-x-3.5 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 shrink-0">
                      <Briefcase size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">
                        {proj.projectName}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {(proj.spocs || []).map((spoc, idx) => (
                          <span key={idx} className="inline-block text-3xs px-1.5 py-0.5 bg-blue-50/80 text-blue-700 border border-blue-100 rounded-full font-medium dark:bg-blue-955/20 dark:text-blue-400 dark:border-blue-900/60">
                            {spoc}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-2xs text-gray-400 mt-1.5">
                        <span className="font-medium text-gray-500 dark:text-slate-400 truncate max-w-[120px]">{proj.scopeDoc}</span>
                        <span>•</span>
                        <span>Manager: {proj.projectManager}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-gray-800 dark:text-slate-200">
                      {formatINR(proj.projectAmount)}
                    </p>
                    <span className={`inline-block text-3xs px-2 py-0.5 mt-1 border rounded-full font-medium ${
                      proj.projectStatus === 'Completed' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400' :
                      proj.projectStatus === 'In Progress' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400' :
                      proj.projectStatus === 'On Hold' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400' :
                      'bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                    }`}>
                      {proj.projectStatus}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-gray-400 dark:text-slate-500 border border-dashed border-gray-200 dark:border-slate-800 rounded-xl">
                No matching projects found.
              </div>
            )}
          </div>
        </div>

        {/* Recently Uploaded Documents List */}
        <div className="rounded-2xl bg-white border border-gray-100 dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Recent Uploaded Documents
              </h3>
              <p className="text-xs text-gray-400 dark:text-slate-500">
                Latest files attached to system entities
              </p>
            </div>
            <Link to="/documents" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center">
              View All <ChevronRight size={14} />
            </Link>
          </div>

          <div className="space-y-3.5">
            {recentDocs.length > 0 ? (
              recentDocs.map(doc => (
                <div key={doc._id} className="flex items-center justify-between p-3.5 border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/40 rounded-xl hover:border-blue-200 dark:hover:border-blue-900 transition-all">
                  <div className="flex items-start space-x-3.5 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400 shrink-0">
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">
                        {doc.originalName}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 text-2xs text-gray-450 mt-1">
                        <span className="font-medium text-gray-500 dark:text-slate-400 truncate max-w-[120px]">{doc.projectId?.projectName || 'N/A'}</span>
                        <span>•</span>
                        <div className="flex flex-wrap items-center gap-1">
                          {(doc.projectId?.spocs || []).map((s, idx) => (
                            <span key={idx} className="bg-blue-50/50 text-blue-750 dark:bg-blue-955/10 dark:text-blue-400 px-1 py-0.2 rounded text-3xs">
                              {s}
                            </span>
                          ))}
                        </div>
                        <span>•</span>
                        <span>Uploaded by: {doc.uploadedBy}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 text-2xs text-gray-400">
                    <p className="font-bold text-gray-600 dark:text-slate-300">
                      {formatBytes(doc.fileSize)}
                    </p>
                    <p className="mt-1 flex items-center justify-end">
                      <Calendar size={10} className="mr-1" />
                      {new Date(doc.uploadedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-gray-400 dark:text-slate-500 border border-dashed border-gray-200 dark:border-slate-800 rounded-xl">
                No documents uploaded yet.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default Dashboard;
