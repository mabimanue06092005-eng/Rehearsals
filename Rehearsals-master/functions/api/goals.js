import { requireUser, json } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const row = await env.DB.prepare('SELECT weekly_target FROM user_goals WHERE user_id = ?')
    .bind(user.id).first();

  return json({ weeklyTarget: row ? row.weekly_target : 3 });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const weeklyTarget = Math.min(21, Math.max(1, parseInt(body.weeklyTarget, 10) || 3));

  await env.DB.prepare(
    'INSERT INTO user_goals (user_id, weekly_target, updated_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET weekly_target = excluded.weekly_target, updated_at = excluded.updated_at'
  ).bind(user.id, weeklyTarget, Date.now()).run();

  return json({ weeklyTarget });
}
