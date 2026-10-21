import { verifyPassword, createSession, buildSessionCookie, json } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, password_salt FROM users WHERE email = ?'
  ).bind(email).first();

  if (!user) return json({ error: 'Incorrect email or password' }, 401);

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) return json({ error: 'Incorrect email or password' }, 401);

  const token = await createSession(env, user.id);
  return json({ id: user.id, email: user.email }, 200, { 'Set-Cookie': buildSessionCookie(token, request) });
}
