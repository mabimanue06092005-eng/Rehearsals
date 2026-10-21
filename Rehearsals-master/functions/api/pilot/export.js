import { requireUser, json } from '../../_lib/auth.js';
import { decryptField } from '../../_lib/crypto.js';

// Every participant's raw survey responses come back from this endpoint, so
// it stays locked to the study administrator's own account rather than any
// logged-in user - update this to whichever email is actually running the
// pilot before recruiting real participants.
const RESEARCHER_EMAIL = 'adityapartha1@gmail.com';

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if ((user.email || '').toLowerCase() !== RESEARCHER_EMAIL.toLowerCase()) {
    return json({ error: 'Not authorized' }, 403);
  }

  const { results } = await env.DB.prepare(
    'SELECT user_id, phase, answers, consent_given, submitted_at FROM pilot_responses ORDER BY user_id, phase'
  ).all();

  const byUser = {};
  for (const row of results || []) {
    byUser[row.user_id] = byUser[row.user_id] || { userId: row.user_id };
    byUser[row.user_id][row.phase] = {
      answers: JSON.parse(await decryptField(row.answers, env)),
      consentGiven: !!row.consent_given,
      submittedAt: row.submitted_at
    };
  }

  return json({ participants: Object.values(byUser) });
}
