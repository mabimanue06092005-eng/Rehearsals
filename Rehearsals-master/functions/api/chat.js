import { requireUser, json } from '../_lib/auth.js';
import { checkRateLimit, clientIp } from '../_lib/rateLimit.js';

// Streaming passthrough for persona replies — the client's SSE parser already
// understands Groq's raw chunk shape, so we forward the response body as-is
// rather than re-parsing and re-emitting it.
export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  // Per-IP, not per-user: a shared Groq key can be exhausted by one visitor
  // scripting requests regardless of how many accounts they create.
  const rl = await checkRateLimit(env, `chat:${clientIp(request)}`, 30, 10 * 60 * 1000);
  if (!rl.allowed) {
    return json({ error: 'Too many messages too fast — take a short break and try again.' }, 429, { 'Retry-After': String(rl.retryAfterSeconds) });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { system, messages, maxTokens, temperature } = body;
  if (!system || !Array.isArray(messages)) {
    return json({ error: 'system and messages are required' }, 400);
  }

  // Clamp client-supplied temperature to a sane range — this is a user-facing
  // "creativity" dial, not an open passthrough to the Groq API.
  const safeTemperature = typeof temperature === 'number' && !Number.isNaN(temperature)
    ? Math.min(1.3, Math.max(0.3, temperature))
    : 0.9;

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
      temperature: safeTemperature,
      reasoning_effort: 'low',
      stream: true
    })
  });

  if (!groqRes.ok) {
    const errBody = await groqRes.text().catch(() => '');
    return json({ error: `Groq error ${groqRes.status}: ${errBody.slice(0, 300)}` }, 502);
  }

  return new Response(groqRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  });
}
