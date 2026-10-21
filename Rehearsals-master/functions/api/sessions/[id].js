import { requireUser, json } from '../../_lib/auth.js';

export async function onRequestDelete({ request, env, params }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  await env.DB.prepare(
    'DELETE FROM rehearsals WHERE id = ? AND user_id = ?'
  ).bind(params.id, user.id).run();

  return json({ ok: true });
}
