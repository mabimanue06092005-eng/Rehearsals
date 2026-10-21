// Cloudflare Turnstile verification — free, no card required, same account
// this project's Pages/D1 already run on.
export async function verifyTurnstile(token, ip, env) {
  if (!env.TURNSTILE_SECRET_KEY) return true; // not configured yet (e.g. local dev without it set) — don't block signups
  if (!token) return false;

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    return false;
  }
}
