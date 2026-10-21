import { requireUser, json } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  return json({ id: user.id, email: user.email, growthNotes: user.growth_notes || '' });
}
