import { requireUser, missingEnv, methodNotAllowed } from './_supabase.js';

// Nombre de carpeta: letras, dígitos, espacios y poco más. Sin barras, para que
// nadie pueda apuntar el movimiento a otra rama del buzón desde el cliente.
const FOLDER_RE = /^[\p{L}\p{N} .,'&_-]{1,64}$/u;

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const missing = missingEnv(['FLOW_MOVE_URL']);
  if (missing.length) return res.status(500).json({ error: 'server_misconfigured', missing });

  const user = await requireUser(req, res);
  if (!user) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const messageId = String(body.messageId || '').trim();
  const folder = String(body.folder || '').trim();

  if (!messageId || messageId.length > 512) return res.status(400).json({ error: 'bad_message_id' });
  // Cadena vacía = devolver a la Bandeja de entrada.
  if (folder && !FOLDER_RE.test(folder)) return res.status(400).json({ error: 'bad_folder' });

  try {
    const r = await fetch(process.env.FLOW_MOVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId,
        folder,
        solicitado_por: String(user.email || '').slice(0, 200),
      }),
    });

    if (!r.ok) {
      console.error('flow move failed', r.status);
      return res.status(502).json({ error: 'flow_failed', status: r.status });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, folder });
  } catch (e) {
    console.error('flow move error', e);
    res.status(502).json({ error: 'flow_unreachable' });
  }
}
