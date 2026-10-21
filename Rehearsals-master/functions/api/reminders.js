import { requireUser, json } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const { results } = await env.DB.prepare(
    'SELECT id, label, remind_at, persona_id FROM reminders WHERE user_id = ? ORDER BY remind_at ASC'
  ).bind(user.id).all();

  return json({
    reminders: (results || []).map(r => ({
      id: r.id,
      label: r.label,
      remindAt: r.remind_at,
      personaId: r.persona_id
    }))
  });
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

  const label = (body.label || '').trim().slice(0, 200);
  const remindAt = parseInt(body.remindAt, 10);
  const personaId = body.personaId || null;

  if (!label || !remindAt || Number.isNaN(remindAt)) {
    return json({ error: 'label and remindAt are required' }, 400);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO reminders (id, user_id, label, remind_at, persona_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, user.id, label, remindAt, personaId, Date.now()).run();

  return json({ id, label, remindAt, personaId }, 201);
}
