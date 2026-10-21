import { requireUser, json } from '../_lib/auth.js';
import { checkRateLimit, clientIp } from '../_lib/rateLimit.js';

// Called from the Live Call Coach browser extension, a different origin
// (chrome-extension://…) — needs real CORS, unlike every other endpoint in
// this app, which is only ever called from rehearsals.pages.dev itself.
// The extension ID is fixed via a `key` in its manifest specifically so this
// can be a single hardcoded origin instead of a wildcard (which doesn't work
// alongside credentials: 'include' anyway).
const EXTENSION_ORIGIN = 'chrome-extension://kpbogkmeeapfnfgdicjlhdfmmipbebgb';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': EXTENSION_ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Short, cheap, frequent — this is meant to be called every ~25s during a
// live call, so it's a small rolling-window prompt, not a full debrief.
function buildLiveCoachPrompt() {
  return `You are coaching someone in real time during an actual live conversation or call, based on a short rolling window of their own recent words (only their side — the other participant's audio isn't available). Give exactly ONE short, specific, actionable cue based on what's actually in the transcript and metrics — never generic advice like "be confident."

Rules:
- One sentence, under 20 words
- Ground it in something specific from the transcript or metrics, not a generic tip
- If everything looks fine, say so briefly rather than inventing a problem
- Never mention you are an AI
- Respond with ONLY the cue itself, no quotes, no preamble, no markdown`;
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401, CORS_HEADERS);

  const rl = await checkRateLimit(env, `live-coach:${clientIp(request)}`, 40, 10 * 60 * 1000);
  if (!rl.allowed) {
    return json({ error: 'Too many requests too fast' }, 429, { ...CORS_HEADERS, 'Retry-After': String(rl.retryAfterSeconds) });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400, CORS_HEADERS);
  }

  const recentTranscript = typeof body.recentTranscript === 'string' ? body.recentTranscript.slice(0, 2000) : '';
  if (!recentTranscript.trim()) return json({ error: 'recentTranscript is required' }, 400, CORS_HEADERS);
  const wpm = typeof body.wpm === 'number' ? body.wpm : null;
  const fillerCounts = body.fillerCounts && typeof body.fillerCounts === 'object' ? body.fillerCounts : {};

  const metricsSummary = `${wpm ? `Current pace: ${wpm} WPM. ` : ''}Filler words so far: ${JSON.stringify(fillerCounts)}.`;

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: buildLiveCoachPrompt() },
        { role: 'user', content: `Recent transcript:\n${recentTranscript}\n\nMetrics:\n${metricsSummary}` }
      ],
      max_tokens: 100,
      temperature: 0.8,
      reasoning_effort: 'low'
    })
  });

  if (!groqRes.ok) {
    const errBody = await groqRes.json().catch(() => ({}));
    return json({ error: errBody?.error?.message || `Groq error ${groqRes.status}` }, 502, CORS_HEADERS);
  }

  const data = await groqRes.json();
  const cue = data.choices?.[0]?.message?.content?.trim() || null;
  return json({ cue }, 200, CORS_HEADERS);
}
