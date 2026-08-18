function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createPasswordProof(password: string, salt: string, nonce: string, iterations: number): Promise<string> {
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 500_000 || salt.length < 16 || salt.length > 128 || nonce.length < 16 || nonce.length > 128) {
    throw new Error('Parâmetros de autenticação inválidos.');
  }
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const verifier = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: fromBase64Url(salt) as BufferSource,
    iterations
  }, material, 256);
  const hmacKey = await crypto.subtle.importKey('raw', verifier, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const proof = await crypto.subtle.sign('HMAC', hmacKey, fromBase64Url(nonce) as BufferSource);
  return toBase64Url(proof);
}
