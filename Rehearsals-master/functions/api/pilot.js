import { requireUser, json } from '../_lib/auth.js';
import { encryptField, decryptField } from '../_lib/crypto.js';

const QUESTION_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const { results } = await env.DB.prepare(
    'SELECT phase, answers, consent_given, submitted_at FROM pilot_responses WHERE user_id = ?'
  ).bind(user.id).all();

  const byPhase = { pre: null, post: null };
  for (const row of results || []) {
    byPhase[row.phase] = {
      answers: JSON.parse(await decryptField(row.answers, env)),
      consentGiven: !!row.consent_given,
      submittedAt: row.submitted_at
    };
  }
  return json(byPhase);
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

  const { phase, consentGiven, answers } = body;
  if (phase !== 'pre' && phase !== 'post') {
    return json({ error: 'phase must be "pre" or "post"' }, 400);
  }
  if (phase === 'pre' && !consentGiven) {
    return json({ error: 'Consent is required to begin the study' }, 400);
  }
  if (!answers || typeof answers !== 'object') {
    return json({ error: 'answers is required' }, 400);
  }
  for (const key of QUESTION_KEYS) {
    const v = answers[key];
    if (typeof v !== 'number' || v < 1 || v > 5) {
      return json({ error: `answers.${key} must be a number from 1 to 5` }, 400);
    }
  }

  const cleanAnswers = {};
  for (const key of QUESTION_KEYS) cleanAnswers[key] = answers[key];
  cleanAnswers.openText = typeof answers.openText === 'string' ? answers.openText.slice(0, 1000) : '';

  const id = crypto.randomUUID();
  const encAnswers = await encryptField(JSON.stringify(cleanAnswers), env);
  await env.DB.prepare(
    'INSERT INTO pilot_responses (id, user_id, phase, answers, consent_given, submitted_at) VALUES (?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(user_id, phase) DO UPDATE SET answers = excluded.answers, consent_given = excluded.consent_given, submitted_at = excluded.submitted_at'
  ).bind(id, user.id, phase, encAnswers, consentGiven ? 1 : 0, Date.now()).run();

  return json({ ok: true });
}
