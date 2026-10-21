import { requireUser, json } from '../_lib/auth.js';
import { checkRateLimit, clientIp } from '../_lib/rateLimit.js';

// Same pattern as pilot/export.js — locked to the site owner's own account
// rather than any logged-in user. Update before handing this off to anyone else.
const RESEARCHER_EMAIL = 'adityapartha1@gmail.com';

// Errors can happen before login (landing/setup screens), so this endpoint
// intentionally doesn't require auth — it just records the user if there
// happens to be a valid session, and logs anonymously otherwise.
export async function onRequestPost({ request, env }) {
  const rl = await checkRateLimit(env, `errlog:${clientIp(request)}`, 20, 10 * 60 * 1000);
  if (!rl.allowed) return json({ ok: false }, 429);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.slice(0, 500) : '';
  if (!message) return json({ error: 'message is required' }, 400);

  const user = await requireUser(request, env).catch(() => null);

  await env.DB.prepare(
    'INSERT INTO error_logs (id, user_id, message, stack, url, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    crypto.randomUUID(),
    user?.id || null,
    message,
    typeof body.stack === 'string' ? body.stack.slice(0, 2000) : null,
    typeof body.url === 'string' ? body.url.slice(0, 300) : null,
    request.headers.get('User-Agent')?.slice(0, 300) || null,
    Date.now()
  ).run();

  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if ((user.email || '').toLowerCase() !== RESEARCHER_EMAIL.toLowerCase()) {
    return json({ error: 'Not authorized' }, 403);
  }

  const { results } = await env.DB.prepare(
    'SELECT id, user_id, message, stack, url, user_agent, created_at FROM error_logs ORDER BY created_at DESC LIMIT 200'
  ).all();

  return json({ errors: results || [] });
}
