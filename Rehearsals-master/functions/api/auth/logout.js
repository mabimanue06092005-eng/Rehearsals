import { getSessionTokenFromRequest, deleteSession, buildClearCookie, json } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const token = getSessionTokenFromRequest(request);
  await deleteSession(env, token);
  return json({ ok: true }, 200, { 'Set-Cookie': buildClearCookie(request) });
}
