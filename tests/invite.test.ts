import { describe, expect, it } from 'vitest';
import { decodeInvite, encodeInvite } from '../src/shared/invite';

describe('invite codes', () => {
  it('round-trips an invite', () => {
    const encoded = encodeInvite({ v: 1, host: '26.1.2.3', port: 43187, room: 'ABCDEF12' });
    expect(encoded.startsWith('CC1-')).toBe(true);
    expect(decodeInvite(encoded)).toEqual({ v: 1, host: '26.1.2.3', port: 43187, room: 'ABCDEF12' });
  });

  it('rejects malformed input', () => {
    expect(() => decodeInvite('nope')).toThrow();
    expect(() => decodeInvite('CC1-e30')).toThrow();
  });
});
