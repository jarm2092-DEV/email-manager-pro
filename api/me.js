import { requireUser, getProfile, methodNotAllowed } from './_supabase.js';

// Who the caller is, according to CCP's user_roles table.
// The taskpane uses displayName as the default note author.
export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const user = await requireUser(req, res);
  if (!user) return;

  const profile = await getProfile(req, user);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(profile);
}
