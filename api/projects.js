import { requireUser, missingEnv, methodNotAllowed } from './_supabase.js';

// Reads the project list from SharePoint through the Power Automate flow.
// The flow URL (including its SAS signature) lives only in FLOW_READ_URL.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

  const missing = missingEnv(['FLOW_READ_URL']);
  if (missing.length) return res.status(500).json({ error: 'server_misconfigured', missing });

  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const r = await fetch(process.env.FLOW_READ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    if (!r.ok) {
      console.error('flow read failed', r.status);
      return res.status(502).json({ error: 'flow_failed', status: r.status });
    }

    const data = await r.json();
    if (!Array.isArray(data)) return res.status(502).json({ error: 'unexpected_flow_response' });

    // Normalise here so the client stays dumb: uppercase titles, no blanks.
    const projects = data
      .map((item) => String((item && item.Title) || '').trim().toUpperCase())
      .filter(Boolean);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ projects });
  } catch (e) {
    console.error('flow read error', e);
    res.status(502).json({ error: 'flow_unreachable' });
  }
}
