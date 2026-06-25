import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const API_URL = import.meta.env.VITE_API_URL
  || (window.location.origin.includes('localhost') && window.location.port !== '5050'
    ? 'http://localhost:5050/api'
    : 'https://genessence-2.onrender.com/api');

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [serverDown, setServerDown] = useState(false);

  // ── Load user from stored token ────────────────────────────────────────────
  const loadUser = useCallback(async (tkn) => {
    if (!tkn) {
      setUser(null);
      setLoading(false);
      return;
    }

    console.group('[AuthContext] Loading user profile');
    console.log('API URL:', API_URL);
    console.log('Token (first 20 chars):', tkn.substring(0, 20) + '…');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout (accommodates Render spin up)

      const res = await fetch(`${API_URL}/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${tkn}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);
      setServerDown(false);

      if (res.ok) {
        const userData = await res.json();
        console.log('✅ User profile loaded:', { id: userData._id, name: userData.name, role: userData.role });
        setUser(userData);
        setError(null);
      } else {
        const errData = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        console.warn('⚠️ Profile fetch failed:', res.status, errData.message);
        // Only log out on explicit auth failures (401), not server errors (5xx)
        if (res.status === 401 || res.status === 403) {
          console.log('Token invalid/expired — clearing session');
          logout();
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('❌ Profile fetch timed out after 30s');
        setServerDown(true);
      } else {
        console.error('❌ Network error fetching profile:', err.message);
        // Server may be down — keep user logged in with cached data, show banner
        setServerDown(true);
      }
    } finally {
      setLoading(false);
      console.groupEnd();
    }
  }, []);

  useEffect(() => {
    loadUser(token);
  }, [token]);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    setServerDown(false);

    console.group('[AuthContext] Login attempt');
    console.log('API URL:', API_URL);
    console.log('Email:', email);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout to allow Render spin-up

      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      const data = await res.json();

      if (res.ok) {
        console.log('✅ Login successful:', { id: data._id, name: data.name, role: data.role });
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser({
          _id: data._id,
          name: data.name,
          email: data.email,
          role: data.role
        });
        console.groupEnd();
        return { success: true };
      } else {
        console.warn('⚠️ Login rejected:', data.message);
        setError(data.message || 'Login failed. Please check your credentials.');
        console.groupEnd();
        return { success: false, message: data.message || 'Login failed' };
      }
    } catch (err) {
      let msg;
      if (err.name === 'AbortError') {
        msg = 'Connection timed out. Make sure the server is running on port 5050.';
        console.error('❌ Login timed out');
      } else {
        msg = `Cannot connect to server at ${API_URL}. Make sure the backend is running.`;
        console.error('❌ Login network error:', err.message);
      }
      setError(msg);
      setServerDown(true);
      console.groupEnd();
      return { success: false, message: msg };
    } finally {
      setLoading(false);
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = () => {
    console.log('[AuthContext] Logging out');
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setError(null);
    setServerDown(false);
  };

  // ── Authenticated fetch wrapper ──────────────────────────────────────────────
  // Attaches the Bearer token (when present), is FormData-safe (never forces a
  // Content-Type so the browser keeps the multipart boundary), and auto-evicts
  // the session on any 401/403 so a stale/invalid token returns the user to Login.
  // NOTE: `logout` is declared below but is always in scope by the time this runs
  // (effects/handlers fire after render), so there is no TDZ issue at call time.
  const authFetch = async (path, options = {}) => {
    // No token means we can't make an authed call — evict immediately rather than
    // waiting for a server 401 round-trip. Token hydrates synchronously from
    // localStorage (useState initializer) and PrivateRoute gates authed pages on
    // `user`, so this won't fire spuriously during a normal authenticated load.
    if (!token) {
      logout();
      throw new Error('SESSION_EXPIRED');
    }

    const url = path.startsWith('http') ? path : `${API_URL}${path}`;

    // Shallow-clone options and derive headers from the caller's headers.
    // Critically, we do NOT set Content-Type — JSON callers already set it and
    // FormData uploads must keep the browser-generated multipart boundary.
    const headers = { ...(options.headers || {}) };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 || res.status === 403) {
      // Stale/invalid token (e.g. user no longer exists after the DB migration):
      // evict the session and stop the caller. PrivateRoute then redirects to Login.
      logout();
      throw new Error('SESSION_EXPIRED');
    }

    return res;
  };

  // ── Role check ─────────────────────────────────────────────────────────────
  const hasRole = (roles) => {
    if (!user) return false;
    if (typeof roles === 'string') return user.role === roles;
    return roles.includes(user.role);
  };

  const value = {
    user,
    token,
    loading,
    error,
    serverDown,
    login,
    logout,
    authFetch,
    hasRole,
    isAdmin: () => user?.role === 'admin',
    isManager: () => user?.role === 'manager',
    isViewer: () => user?.role === 'viewer',
    API_URL,
    // Expose reload so components can trigger a re-fetch
    reloadUser: () => loadUser(token)
  };

  return (
    <AuthContext.Provider value={value}>
      {/* Server-down banner displayed inside the app layout */}
      {serverDown && (user || token) && (
        <div className="fixed top-0 left-0 right-0 z-[999] bg-red-600 text-white text-xs font-semibold px-4 py-2 flex items-center justify-between">
          <span>⚠️ Cannot reach server at {API_URL}. Some features may not work. Check if the backend is running.</span>
          <button
            onClick={() => loadUser(token)}
            className="ml-4 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold"
          >
            Retry
          </button>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};
