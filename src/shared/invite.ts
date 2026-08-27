import type { InvitePayload } from './types.js';

const PREFIX = 'CC2-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

export function createRoomCode(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => ALPHABET[value % ALPHABET.length]).join('');
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
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
  if (p.v !== 2 || typeof p.room !== 'string') throw new Error('Convite incompatível.');
  const room = normalizeRoomCode(p.room);
  if (room.length < 8 || room.length > 32) throw new Error('Convite inválido.');
  return { v: 2, room, roomName: typeof p.roomName === 'string' ? p.roomName.slice(0, 80) : undefined, hasPassword: Boolean(p.hasPassword) };
}
