// Application-level encryption at rest for sensitive rehearsal content
// (transcripts, debriefs, setup data) using AES-256-GCM via the Workers
// runtime's native Web Crypto API. This protects against the realistic
// threat of a database export or backup leak exposing plaintext personal
// disclosures — it does not protect against someone who already has
// server-side env access, since the same key that encrypts also decrypts
// (no different in that respect from how the Groq API key itself is
// trusted). Existing rows written before this shipped stay in plaintext —
// see decryptField's fallback below — rather than a risky retroactive
// migration this close to a deadline.

async function getKey(env) {
  const raw = Uint8Array.from(atob(env.ENCRYPTION_KEY), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptField(plaintext, env) {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  let binary = '';
  combined.forEach(b => { binary += String.fromCharCode(b); });
  return 'enc:' + btoa(binary);
}

// Old rows are plaintext JSON and will never start with "enc:", so this can
// tell the two apart cheaply without a try/catch on every single row.
export async function decryptField(stored, env) {
  if (typeof stored !== 'string' || !stored.startsWith('enc:')) {
    return stored;
  }
  try {
    const binary = atob(stored.slice(4));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const key = await getKey(env);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // Surface the raw value rather than fail the whole request — a single
    // unreadable row shouldn't take down someone's entire history list.
    return stored;
  }
}
