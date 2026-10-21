// Shared auth helpers for Pages Functions routes.
// Password hashing via PBKDF2-SHA256 (crypto.subtle) — bcrypt/argon2 aren't
// available in the Workers runtime. Sessions are opaque tokens stored in D1,
// not signed cookies, so logout can just delete the row.

const COOKIE_NAME = 'rehearsals_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PBKDF2_ITERATIONS = 100000;

function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function derivePasswordHash(password, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bufferToBase64(derived);
}

export async function createPasswordHash(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, saltBytes);
  return { hash, salt: bufferToBase64(saltBytes.buffer) };
}

export async function verifyPassword(password, storedHash, storedSaltB64) {
  const saltBytes = base64ToBytes(storedSaltB64);
  const hash = await derivePasswordHash(password, saltBytes);
  return constantTimeEqual(hash, storedHash);
}

function isLocalRequest(request) {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function getSessionTokenFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export function buildSessionCookie(token, request) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (!isLocalRequest(request)) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearCookie(request) {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (!isLocalRequest(request)) parts.push('Secure');
  return parts.join('; ');
}

export async function createSession(env, userId) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await env.DB.prepare('INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, expiresAt).run();
  return token;
}

export async function deleteSession(env, token) {
  if (!token) return;
  await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(token).run();
}

export async function requireUser(request, env) {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT u.id, u.email, u.growth_notes FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?'
  ).bind(token, Date.now()).first();
  return row || null;
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
