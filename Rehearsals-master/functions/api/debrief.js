import { requireUser, json } from '../_lib/auth.js';
import { checkRateLimit, clientIp } from '../_lib/rateLimit.js';

// Non-streaming Groq call — shared by the debrief JSON call and the group
// turn-taking picker (both already go through one `callClaude` function
// client-side). The per-turn emotional classifier moved to a local model
// and no longer calls this endpoint at all.
export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const rl = await checkRateLimit(env, `debrief:${clientIp(request)}`, 30, 10 * 60 * 1000);
  if (!rl.allowed) {
    return json({ error: 'Too many requests too fast — take a short break and try again.' }, 429, { 'Retry-After': String(rl.retryAfterSeconds) });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { system, messages, maxTokens } = body;
  if (!system || !Array.isArray(messages)) {
    return json({ error: 'system and messages are required' }, 400);
  }

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: maxTokens || 1024,
      temperature: 0.9,
      reasoning_effort: 'low',
      reasoning_format: 'hidden',
      response_format: { type: 'json_object' }
    })
  });

  if (!groqRes.ok) {
    const errBody = await groqRes.json().catch(() => ({}));
    return json({ error: errBody?.error?.message || `Groq error ${groqRes.status}` }, 502);
  }

  const data = await groqRes.json();
  return json({ content: data.choices[0].message.content });
}
