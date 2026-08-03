import { requireUser, getProfile, missingEnv, methodNotAllowed } from './_supabase.js';

const MAX_FIELD = 4000;
const MAX_NOTES = 50000;

function clean(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

// Writes a tracking row to SharePoint through the Power Automate flow.
// The flow URL (including its SAS signature) lives only in FLOW_WRITE_URL.
export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const missing = missingEnv(['FLOW_WRITE_URL']);
  if (missing.length) return res.status(500).json({ error: 'server_misconfigured', missing });

  const user = await requireUser(req, res);
  if (!user) return;

  const profile = await getProfile(req, user);
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Whitelist and cap every field — the flow writes straight into a SharePoint list.
  const payload = {
    titulo: clean(body.titulo, MAX_FIELD),
    proyecto: clean(body.proyecto, MAX_FIELD),
    asunto: clean(body.asunto, MAX_FIELD),
    de: clean(body.de, MAX_FIELD),
    fecha: clean(body.fecha, 64) || new Date().toISOString(),
    estado: clean(body.estado, MAX_FIELD),
    notas: clean(body.notas, MAX_NOTES),
    // Outlook runs on one shared tenant account, so the Supabase user is the
    // only real identity. Names come from CCP's user_roles table.
    enviado_por: clean(profile.displayName || user.email, MAX_FIELD),
    enviado_por_email: clean(user.email, MAX_FIELD),
    rol: clean(profile.role, 64),
  };

  if (!payload.notas && !payload.estado) {
    return res.status(400).json({ error: 'empty_payload' });
  }

  try {
    const r = await fetch(process.env.FLOW_WRITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      console.error('flow write failed', r.status);
      return res.status(502).json({ error: 'flow_failed', status: r.status });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('flow write error', e);
    res.status(502).json({ error: 'flow_unreachable' });
  }
}
