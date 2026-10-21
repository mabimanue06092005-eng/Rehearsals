import { requireUser, buildClearCookie, json } from '../_lib/auth.js';

// Permanently deletes the account and everything tied to it — rehearsals,
// saved personas, goals, reminders, pilot responses, sessions — all via the
// ON DELETE CASCADE foreign keys in schema.sql, so one DELETE here is enough.
export async function onRequestDelete({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();

  return json({ ok: true }, 200, { 'Set-Cookie': buildClearCookie(request) });
}
