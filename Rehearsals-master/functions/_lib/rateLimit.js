// Best-effort per-IP rate limiting backed by D1. This is not atomic under
// heavy concurrent load from the same IP (read-then-write, not a single
// compare-and-swap) - acceptable for deterring casual abuse of a shared
// Groq API key at hackathon/pilot scale, not hardened DDoS protection.
// Cloudflare's native rate limiting rules would be the "real" version of
// this, but that product requires a paid plan.
export async function checkRateLimit(env, key, limit, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT window_start, count FROM rate_limits WHERE bucket_key = ?'
  ).bind(key).first();

  if (!row || now - row.window_start >= windowMs) {
    await env.DB.prepare(
      'INSERT INTO rate_limits (bucket_key, window_start, count) VALUES (?, ?, 1) ' +
      'ON CONFLICT(bucket_key) DO UPDATE SET window_start = excluded.window_start, count = 1'
    ).bind(key, now).run();
    return { allowed: true };
  }

  if (row.count >= limit) {
    const retryAfterSeconds = Math.ceil((windowMs - (now - row.window_start)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE bucket_key = ?').bind(key).run();
  return { allowed: true };
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}
