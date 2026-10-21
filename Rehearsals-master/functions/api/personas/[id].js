import { requireUser, json } from '../../_lib/auth.js';

export async function onRequestDelete({ request, env, params }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  await env.DB.prepare(
    'DELETE FROM saved_personas WHERE id = ? AND user_id = ?'
  ).bind(params.id, user.id).run();

  return json({ ok: true });
}

export async function onRequestPatch({ request, env, params }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400);
  }

  if (typeof body.pinned !== 'boolean') {
    return json({ error: 'pinned (boolean) is required' }, 400);
  }

  await env.DB.prepare(
    'UPDATE saved_personas SET pinned = ? WHERE id = ? AND user_id = ?'
  ).bind(body.pinned ? 1 : 0, params.id, user.id).run();

  return json({ ok: true, pinned: body.pinned });
}
