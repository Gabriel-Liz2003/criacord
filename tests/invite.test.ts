import { describe, expect, it } from 'vitest';
import { createRoomCode, decodeInvite, encodeInvite, normalizeRoomCode } from '../src/shared/invite';

describe('internet room invites', () => {
  it('round-trips a CC2 invite without IP or port', () => {
    const encoded = encodeInvite({ v: 2, room: 'ABCD2345EFGH', roomName: 'Sala da Cria', hasPassword: true });
    expect(encoded.startsWith('CC2-')).toBe(true);
    expect(decodeInvite(encoded)).toEqual({ v: 2, room: 'ABCD2345EFGH', roomName: 'Sala da Cria', hasPassword: true });
  });

  it('generates normalized hard-to-guess room codes', () => {
    const code = createRoomCode();
    expect(code).toMatch(/^[A-Z2-9]{12}$/);
    expect(normalizeRoomCode(` ${code.slice(0, 4)}-${code.slice(4)} `)).toBe(code);
  });

  it('rejects legacy and malformed invites', () => {
    expect(() => decodeInvite('nope')).toThrow();
    expect(() => decodeInvite('CC1-e30')).toThrow();
    expect(() => decodeInvite('CC2-e30')).toThrow();
  });
});
