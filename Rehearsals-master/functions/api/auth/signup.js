import { createPasswordHash, createSession, buildSessionCookie, json, isValidEmail } from '../../_lib/auth.js';
import { checkRateLimit, clientIp } from '../../_lib/rateLimit.js';
import { verifyTurnstile } from '../../_lib/turnstile.js';

export async function onRequestPost({ request, env }) {
  const rl = await checkRateLimit(env, `signup:${clientIp(request)}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return json({ error: 'Too many accounts created from this network recently. Try again later.' }, 429, { 'Retry-After': String(rl.retryAfterSeconds) });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const humanVerified = await verifyTurnstile(body.turnstileToken, clientIp(request), env);
  if (!humanVerified) return json({ error: "Couldn't verify you're human — please try again." }, 400);

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!isValidEmail(email)) return json({ error: 'Enter a valid email address' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return json({ error: 'An account with that email already exists' }, 409);

  const { hash, salt } = await createPasswordHash(password);
  const userId = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, email, hash, salt, Date.now()).run();

  const token = await createSession(env, userId);
  return json({ id: userId, email }, 200, { 'Set-Cookie': buildSessionCookie(token, request) });
}
