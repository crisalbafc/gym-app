// GymLog · send-push
// Recibe de la base de datos una lista de avisos y los envía como
// notificaciones push (Web Push, RFC 8291 + VAPID RFC 8292).
// Solo usa WebCrypto y fetch: no necesita librerías.
//
// Secretos necesarios (Supabase > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

export type Sub = { endpoint: string; p256dh: string; auth: string }
export type Message = Sub & { title: string; body: string; tag?: string; ttl?: number }

const enc = new TextEncoder()

export function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}
export function bytesToB64url(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8))
}

/** Cifra el mensaje para una suscripción (aes128gcm). */
export async function encryptPayload(sub: Sub, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.p256dh)
  const authSecret = b64urlToBytes(sub.auth)
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher)
}

/** Cabecera Authorization con VAPID (JWT firmado con ES256). */
export async function vapidAuth(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const pub = b64urlToBytes(publicKey)
  const jwk = {
    kty: 'EC', crv: 'P-256', d: privateKey,
    x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), ext: true,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject,
  })))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${bytesToB64url(sig)}, k=${publicKey}`
}

export async function sendOne(m: Message, publicKey: string, privateKey: string, subject: string): Promise<number> {
  const body = await encryptPayload(m, enc.encode(JSON.stringify({ title: m.title, body: m.body, tag: m.tag })))
  const res = await fetch(m.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(m.endpoint, publicKey, privateKey, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(m.ttl ?? 300),
      Urgency: 'high',
    },
    body,
  })
  return res.status
}

if (typeof Deno !== 'undefined') {
  Deno.serve(async (req) => {
    if (req.method !== 'POST' || req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
      return new Response('No autorizado', { status: 401 })
    }
    const pub = Deno.env.get('VAPID_PUBLIC_KEY')!
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')!
    const subject = 'https://crisalbafc.github.io/gym-app/'
    const { messages = [] } = await req.json().catch(() => ({ messages: [] })) as { messages: Message[] }
    const results = await Promise.all(messages.map(async (m) => {
      try { return { endpoint: m.endpoint, status: await sendOne(m, pub, priv, subject) } }
      catch (e) { return { endpoint: m.endpoint, status: 0, error: String(e) } }
    }))
    // 404/410 = el móvil ya no acepta avisos (suscripción caducada)
    const gone = results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.endpoint)
    return Response.json({ sent: results.length, gone, results })
  })
}
