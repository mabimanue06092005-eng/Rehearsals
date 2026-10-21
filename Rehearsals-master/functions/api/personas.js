import { requireUser, json } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const { results } = await env.DB.prepare(
    'SELECT id, label, mode, who, participants, hard, goal, voice_uri, voice_pitch, voice_rate, pinned, created_at FROM saved_personas WHERE user_id = ? ORDER BY pinned DESC, created_at DESC'
  ).bind(user.id).all();

  return json({ personas: (results || []).map(row => ({
    id: row.id,
    label: row.label,
    mode: row.mode,
    who: row.who,
    participants: row.participants,
    hard: row.hard,
    goal: row.goal,
    voiceURI: row.voice_uri,
    pitch: row.voice_pitch,
    rate: row.voice_rate,
    pinned: !!row.pinned
  })) });
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

  const label = (body.label || '').trim();
  const mode = body.mode === 'group' ? 'group' : 'solo';
  const hard = (body.hard || '').trim();
  const goal = (body.goal || '').trim();
  const who = mode === 'solo' ? (body.who || '').trim() : null;
  const participants = mode === 'group' ? (body.participants || '').trim() : null;
  const voiceURI = typeof body.voiceURI === 'string' && body.voiceURI ? body.voiceURI : null;
  const pitch = voiceURI && typeof body.pitch === 'number' ? body.pitch : null;
  const rate = voiceURI && typeof body.rate === 'number' ? body.rate : null;
  const pinned = body.pinned ? 1 : 0;

  if (!label || !hard || !goal) {
    return json({ error: 'label, hard, and goal are required' }, 400);
  }
  if (mode === 'solo' && !who) {
    return json({ error: 'who is required for a 1:1 persona' }, 400);
  }
  if (mode === 'group' && !participants) {
    return json({ error: 'participants is required for a group persona' }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = Date.now();

  await env.DB.prepare(
    'INSERT INTO saved_personas (id, user_id, label, mode, who, participants, hard, goal, voice_uri, voice_pitch, voice_rate, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, user.id, label, mode, who, participants, hard, goal, voiceURI, pitch, rate, pinned, createdAt).run();

  return json({ id, label, mode, who, participants, hard, goal, voiceURI, pitch, rate, pinned: !!pinned }, 201);
}
