import { createSession, buildSessionCookie, json } from '../../_lib/auth.js';
import { checkRateLimit, clientIp } from '../../_lib/rateLimit.js';

// Must match the client_id used to render the Sign in with Google button —
// it's meant to be public (it's embedded in the page itself), so it's fine
// to hardcode here too. The client SECRET is never used or stored anywhere —
// this whole flow only needs the ID token Google hands back to the browser.
const GOOGLE_CLIENT_ID = '436374234938-c0vtkcrhbf7dte1d40ahepp6qsr55u1t.apps.googleusercontent.com';

export async function onRequestPost({ request, env }) {
  const rl = await checkRateLimit(env, `google-auth:${clientIp(request)}`, 20, 10 * 60 * 1000);
  if (!rl.allowed) {
    return json({ error: 'Too many attempts too fast — try again shortly.' }, 429, { 'Retry-After': String(rl.retryAfterSeconds) });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const idToken = body.credential;
  if (!idToken || typeof idToken !== 'string') return json({ error: 'Missing Google credential' }, 400);

  // Google validates the token's signature and expiry for us here — no need
  // to implement JWT/RS256 verification ourselves, which is easy to get
  // subtly wrong. This endpoint is officially documented by Google for
  // exactly this purpose.
  let claims;
  try {
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!verifyRes.ok) return json({ error: 'Invalid or expired Google credential' }, 401);
    claims = await verifyRes.json();
  } catch (e) {
    return json({ error: 'Could not verify Google credential' }, 502);
  }

  // Confirm this token was actually issued for OUR app specifically — without
  // this check, a valid Google ID token minted for a completely different
  // app would also pass signature verification and let someone log in here.
  if (claims.aud !== GOOGLE_CLIENT_ID) return json({ error: 'Credential was not issued for this app' }, 401);
  if (!claims.email || claims.email_verified !== 'true') return json({ error: 'Google account email is not verified' }, 401);

  const email = claims.email.toLowerCase();
  const googleSub = claims.sub;

  let user = await env.DB.prepare('SELECT id, email FROM users WHERE google_sub = ?').bind(googleSub).first();

  if (!user) {
    // Google already verified this email is really theirs, so linking it to
    // a matching existing password account is safe rather than creating a
    // confusing duplicate.
    user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first();
    if (user) {
      await env.DB.prepare('UPDATE users SET google_sub = ? WHERE id = ?').bind(googleSub, user.id).run();
    } else {
      const userId = crypto.randomUUID();
      // users.password_hash/salt are NOT NULL — a Google-only account still
      // needs *something* there. This is a random value no real password
      // could ever produce, so password login stays impossible for it.
      const placeholder = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      await env.DB.prepare(
        'INSERT INTO users (id, email, password_hash, password_salt, google_sub, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(userId, email, placeholder, placeholder, googleSub, Date.now()).run();
      user = { id: userId, email };
    }
  }

  const token = await createSession(env, user.id);
  return json({ id: user.id, email: user.email }, 200, { 'Set-Cookie': buildSessionCookie(token, request) });
}
