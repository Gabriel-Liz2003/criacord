import type { InvitePayload } from './types.js';

const PREFIX = 'CC1-';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeInvite(payload: InvitePayload): string {
  return PREFIX + toBase64Url(JSON.stringify(payload));
}

export function decodeInvite(code: string): InvitePayload {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error('Código de convite inválido.');
  let parsed: unknown;
  try { parsed = JSON.parse(fromBase64Url(trimmed.slice(PREFIX.length))); }
  catch { throw new Error('Código de convite corrompido.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Convite inválido.');
  const p = parsed as Partial<InvitePayload>;
  if (p.v !== 1 || typeof p.host !== 'string' || typeof p.port !== 'number' || typeof p.room !== 'string') {
    throw new Error('Convite incompatível.');
  }
  if (p.port < 1 || p.port > 65535 || p.host.length > 255 || p.room.length < 4 || p.room.length > 32) {
    throw new Error('Convite inválido.');
  }
  return p as InvitePayload;
}
