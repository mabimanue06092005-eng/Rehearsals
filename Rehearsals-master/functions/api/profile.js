import { requireUser, json } from '../_lib/auth.js';

// Personal growth profile — self-identified patterns the user wants every
// debrief calibrated against (e.g. "I over-apologize", "I fold under pushback").
export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const growthNotes = typeof body.growthNotes === 'string' ? body.growthNotes.slice(0, 2000) : '';

  await env.DB.prepare('UPDATE users SET growth_notes = ? WHERE id = ?')
    .bind(growthNotes, user.id).run();

  return json({ growthNotes });
}
