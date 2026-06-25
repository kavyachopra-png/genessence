import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import { UserCheck, Trash2, Plus, Shield, User, X } from 'lucide-react';

const UserManagement = () => {
  const { token, authFetch } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'viewer'
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await authFetch(`/auth/users`);
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Error loading users registry', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password || !formData.role) {
      showToast('Please fill in all fields', 'warning');
      return;
    }

    try {
      const res = await authFetch(`/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (res.ok) {
        showToast('User created successfully', 'success');
        setIsModalOpen(false);
        setFormData({ name: '', email: '', password: '', role: 'viewer' });
        fetchUsers();
      } else {
        showToast(data.message || 'Failed to create user', 'error');
      }
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Network error during user creation', 'error');
    }
  };

  const handleDeleteUser = async (userToDelete) => {
    const confirmed = window.confirm(`Are you sure you want to remove user "${userToDelete.name}" (${userToDelete.email})?`);
    if (!confirmed) return;

    try {
      const res = await authFetch(`/auth/users/${userToDelete._id}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (res.ok) {
        showToast('User removed successfully', 'success');
        fetchUsers();
      } else {
        showToast(data.message || 'Deletion failed', 'error');
      }
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') return;
      console.error(err);
      showToast('Connection failed', 'error');
    }
  };

  if (loading && users.length === 0) {
    return <Loader text="Accessing users register..." />;
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white my-0">
            User Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            System administration tool for configuring corporate member roles.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-semibold text-white transition-colors shadow-md shadow-blue-500/20"
        >
          <Plus size={14} />
          <span>Create User</span>
        </button>
      </div>

      {/* Users grid */}
      <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 dark:bg-slate-900/50 dark:border-slate-800 text-2xs text-gray-500 font-semibold uppercase tracking-wider">
                <th className="py-3 px-6">Name</th>
                <th className="py-3 px-6">Email Address</th>
                <th className="py-3 px-6">Role Designation</th>
                <th className="py-3 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-150 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-blue-50/20 dark:hover:bg-blue-950/10">
                  <td className="py-3.5 px-6 font-semibold text-gray-800 dark:text-slate-200">{u.name}</td>
                  <td className="py-3.5 px-6 text-gray-500 dark:text-slate-400 font-mono">{u.email}</td>
                  <td className="py-3.5 px-6">
                    <span className={`inline-flex items-center space-x-1 text-2xs px-2 py-0.5 border rounded-full font-medium capitalize ${
                      u.role === 'admin' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400' :
                      u.role === 'manager' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400' :
                      'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400'
                    }`}>
                      {u.role === 'admin' ? <Shield size={10} className="mr-1" /> : <User size={10} className="mr-1" />}
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-center">
                    <button
                      onClick={() => handleDeleteUser(u)}
                      className="p-1 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Delete User"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full border border-gray-100 dark:border-slate-800 overflow-hidden animate-zoom-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Create User Profile
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-350"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4 text-left">
              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  placeholder="name@genessence.com"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1">
                  Role Designation
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                >
                  <option value="viewer">Viewer (Read-only access)</option>
                  <option value="manager">Manager (Projects write / Uploads)</option>
                  <option value="admin">Admin (Full administrative privileges)</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-slate-800 text-xs font-semibold text-gray-700 dark:text-slate-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white rounded-xl shadow-md"
                >
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default UserManagement;
