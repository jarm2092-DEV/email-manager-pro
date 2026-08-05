import { requireUser, missingEnv, methodNotAllowed } from './_supabase.js';

// The flow returns every SharePoint column (~50 of them) for ~470 projects.
// Only these are useful to the taskpane, so the trimming happens here rather
// than in the flow — no Power Automate change needed to adjust the shape.
function trim(item) {
  const title = String(item.Title || '').trim();
  const m = title.match(/^([A-Za-z0-9]{2,5}-[A-Za-z0-9]{3,5})[-\s]*(.*)$/);
  return {
    id: (m ? m[1] : title).toUpperCase(),
    title: title.toUpperCase(),
    address: String(item.ADProyecto || (m ? m[2] : '') || '').trim().toUpperCase(),
    street: String(item.Street || '').trim().toUpperCase(),
    city: String(item.ADCity || '').trim().toUpperCase(),
    zip: String(item.Zip || '').trim(),
    responsable: String(item.Responsable || '').trim(),
    permiso: String(item['No_x002e_dePermiso'] || '').trim().toUpperCase(),
    proceso: String(item['No_x002e_deProceso'] || '').trim().toUpperCase(),
    folio: String(item.Folio || '').trim(),
    ownerEmail: String(item.OWNEREMAIL || '').trim().toLowerCase(),
  };
}

// Module-level cache. Survives across invocations while the Lambda instance is
// warm, so a burst of taskpane opens hits SharePoint once, not once each.
const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, projects: null };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

  const missing = missingEnv(['FLOW_READ_URL']);
  if (missing.length) return res.status(500).json({ error: 'server_misconfigured', missing });

  const user = await requireUser(req, res);
  if (!user) return;

  const fresh = Date.now() - cache.at < TTL_MS;
  if (fresh && cache.projects) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ projects: cache.projects, cached: true });
  }

  try {
    const r = await fetch(process.env.FLOW_READ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    if (!r.ok) {
      console.error('flow read failed', r.status);
      if (cache.projects) return res.status(200).json({ projects: cache.projects, cached: true, stale: true });
      return res.status(502).json({ error: 'flow_failed', status: r.status });
    }

    const data = await r.json();
    if (!Array.isArray(data)) return res.status(502).json({ error: 'unexpected_flow_response' });

    const projects = data.map(trim).filter((p) => p.title);
    cache = { at: Date.now(), projects };

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ projects, cached: false });
  } catch (e) {
    console.error('flow read error', e);
    // A stale list beats no list: the taskpane can still match against it.
    if (cache.projects) return res.status(200).json({ projects: cache.projects, cached: true, stale: true });
    res.status(502).json({ error: 'flow_unreachable' });
  }
}
