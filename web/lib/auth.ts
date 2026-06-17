/**
 * auth.ts — Autenticación simple sin base de datos.
 *
 * Usuarios definidos en la variable de entorno AUTH_USERS con el formato
 * "email:clave,email:clave,...". La sesión se guarda en una cookie httpOnly
 * con un JWT propio (HS256) firmado con AUTH_SECRET.
 *
 * Todo usa Web Crypto (crypto.subtle) para que funcione tanto en el runtime
 * Node (route handlers) como en el Edge runtime del middleware.
 */

export const SESSION_COOKIE = "cxc_session";
const SESSION_DAYS = 7;
export const SESSION_MAX_AGE = SESSION_DAYS * 86_400; // segundos

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface SessionPayload {
  sub: string; // email del usuario
  exp: number; // expiración en segundos epoch
}

/** Firma un JWT HS256 con el email del usuario. */
export async function signSession(email: string, secret: string): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = b64url(enc.encode(JSON.stringify({ sub: email, exp })));
  const data = `${header}.${payload}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

/** Verifica la firma y expiración. Devuelve el payload o null si es inválido. */
export async function verifySession(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sig),
      enc.encode(data),
    );
    if (!ok) return null;
    const obj = JSON.parse(dec.decode(b64urlToBytes(payload))) as SessionPayload;
    if (typeof obj.exp !== "number" || obj.exp * 1000 < Date.now()) return null;
    return obj;
  } catch {
    return null;
  }
}

/**
 * Valida email + contraseña contra AUTH_USERS ("email:clave,email:clave").
 * El email es case-insensitive; la contraseña respeta mayúsculas/minúsculas.
 */
export function validateCredentials(
  email: string,
  password: string,
  authUsers: string,
): boolean {
  const e = email.trim().toLowerCase();
  for (const pair of authUsers.split(",")) {
    const idx = pair.indexOf(":");
    if (idx === -1) continue;
    const u = pair.slice(0, idx).trim().toLowerCase();
    const p = pair.slice(idx + 1).trim();
    if (u === e && p === password) return true;
  }
  return false;
}
