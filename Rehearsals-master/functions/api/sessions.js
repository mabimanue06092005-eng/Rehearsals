import { requireUser, json } from '../_lib/auth.js';
import { encryptField, decryptField } from '../_lib/crypto.js';

// Reshapes a D1 row's nested `transcript` JSON column back into the flat
// shape the client's history entries already use (mode-specific keys spread
// onto the top level), so renderHistoryScreen()/openHistoryEntry() need no
// changes beyond the fetch becoming async. setup_data/transcript/debrief are
// encrypted at rest (see _lib/crypto.js) — decryptField transparently passes
// through any row written before encryption shipped, so older history still
// loads correctly.
async function toEntry(row, env) {
  const setupData = JSON.parse(await decryptField(row.setup_data, env));
  const transcript = JSON.parse(await decryptField(row.transcript, env));
  const debrief = JSON.parse(await decryptField(row.debrief, env));
  const entry = {
    id: row.id,
    timestamp: row.created_at,
    mode: row.mode,
    personaName: row.persona_name,
    personaRole: row.persona_role,
    setupData,
    debrief
  };
  if (row.mode === 'group') {
    entry.groupPersonas = transcript.groupPersonas;
    entry.groupTranscript = transcript.groupTranscript;
  } else {
    entry.personaSystemPrompt = transcript.personaSystemPrompt;
    entry.messages = transcript.messages;
  }
  return entry;
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const { results } = await env.DB.prepare(
    'SELECT id, mode, persona_name, persona_role, setup_data, transcript, debrief, created_at FROM rehearsals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(user.id).all();

  const sessions = await Promise.all((results || []).map(row => toEntry(row, env)));
  return json({ sessions });
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

  const { mode, personaName, personaRole, setupData, debrief } = body;
  if (!mode || !setupData || !debrief) {
    return json({ error: 'mode, setupData, and debrief are required' }, 400);
  }

  const transcript = mode === 'group'
    ? { groupPersonas: body.groupPersonas || [], groupTranscript: body.groupTranscript || [] }
    : { personaSystemPrompt: body.personaSystemPrompt || '', messages: body.messages || [] };

  const id = crypto.randomUUID();
  const createdAt = Date.now();

  const setupDataJson = JSON.stringify(setupData);
  const transcriptJson = JSON.stringify(transcript);
  const debriefJson = JSON.stringify(debrief);

  const [encSetupData, encTranscript, encDebrief] = await Promise.all([
    encryptField(setupDataJson, env),
    encryptField(transcriptJson, env),
    encryptField(debriefJson, env)
  ]);

  await env.DB.prepare(
    'INSERT INTO rehearsals (id, user_id, mode, persona_name, persona_role, setup_data, transcript, debrief, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, user.id, mode, personaName || '', personaRole || '',
    encSetupData, encTranscript, encDebrief, createdAt
  ).run();

  // Build the immediate response from the plaintext values already in hand
  // rather than re-decrypting what was just encrypted — toEntry's decrypt
  // step passes plain JSON straight through unchanged, so this is safe and
  // saves a round trip through the crypto calls for no benefit.
  const entry = await toEntry({
    id, mode, persona_name: personaName || '', persona_role: personaRole || '',
    setup_data: setupDataJson, transcript: transcriptJson,
    debrief: debriefJson, created_at: createdAt
  }, env);
  return json(entry, 201);
}
