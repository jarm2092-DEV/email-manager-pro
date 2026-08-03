import { supabaseConfig, missingEnv, methodNotAllowed } from './_supabase.js';

// Public bootstrap config for the taskpane.
// The Supabase anon key is designed to be public — it only allows what RLS and
// the auth rules allow. The Power Automate URLs are NOT here and never reach
// the browser; they stay server-side in projects.js / sync.js.
export default function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const missing = missingEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  if (missing.length) {
    return res.status(500).json({ error: 'server_misconfigured', missing });
  }

  const { url, anonKey } = supabaseConfig();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ url, anonKey });
}
