/**
 * Centralized API base URL.
 *
 * In production (Bolt hosting), the frontend is served statically and the
 * Express backend runs separately on Railway. VITE_API_BASE_URL must be set
 * to the Railway URL so all /api/* calls resolve to the live backend.
 *
 * In local development and Bolt Preview, the Express server runs on the same
 * origin, so an empty string (relative URLs) is the correct fallback.
 */
const env: Record<string, string | undefined> =
  (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
export const API_BASE_URL: string =
  (env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const sep = path.startsWith('/') ? '' : '/';
  return `${API_BASE_URL}${sep}${path}`;
}
