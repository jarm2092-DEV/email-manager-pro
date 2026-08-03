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

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ error: 'method_not_allowed' });
}
