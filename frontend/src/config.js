// Single source of truth for the backend API base URL.
//
// VITE_API_URL (read by Vite at BUILD time) may be set to either:
//   - the backend ORIGIN:        https://genessenceos.onrender.com
//   - or include the /api suffix: https://genessenceos.onrender.com/api
// Either way we normalize so API_URL ALWAYS ends in exactly one "/api". This
// guarantees the required /api prefix can never be dropped by a misconfigured
// env value (the production bug where requests hit /auth/login instead of
// /api/auth/login). All call sites use relative paths like `/auth/login`,
// `/projects`, `/documents/...` — the /api comes from here.
//
// The localhost value is only a development fallback for when VITE_API_URL is
// unset. There are no hardcoded production URLs anywhere in the app.
const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:5050/api';

export const API_URL = rawBase
  .trim()
  .replace(/\/+$/, '')     // strip any trailing slashes
  .replace(/\/api$/i, '')  // strip an existing /api suffix (avoids /api/api)
  + '/api';                // ensure exactly one /api segment
