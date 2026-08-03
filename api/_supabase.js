// Shared helpers for the API functions.
// Files prefixed with _ are not exposed as routes by Vercel.

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

export function supabaseConfig() {
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

export function missingEnv(names) {
  return names.filter((n) => !process.env[n]);
}

/**
 * Validates the Authorization header against Supabase.
 * Returns the user object, or null if the token is missing/invalid/expired.
 */
export async function getUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

/**
 * Guard for the protected endpoints. Writes the 401 itself and returns null
 * when the caller is not authenticated, so handlers can just bail out.
 */
export async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized', message: 'Inicia sesión en la pestaña Config.' });
    return null;
  }
  return user;
}

/**
 * Looks up the caller in CCP's `user_roles` table for display name and role.
 * Best-effort: the query runs as the caller, so RLS decides. A miss is not an
 * auth failure — the token was already verified — it just means we fall back
 * to the raw email for attribution.
 */
export async function getProfile(req, user) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const fallback = { email: user.email || '', displayName: (user.email || '').split('@')[0], role: null };
  if (!token) return fallback;

  try {
    const url = `${SUPABASE_URL}/rest/v1/user_roles?select=display_name,role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, Accept: 'application/json' },
    });
    if (!r.ok) return fallback;
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return fallback;
    return { email: user.email || '', displayName: row.display_name || fallback.displayName, role: row.role || null };
  } catch {
    return fallback;
  }
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ error: 'method_not_allowed' });
}
