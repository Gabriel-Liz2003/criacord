import { describe, expect, it } from 'vitest';
import { keyboardCodeToVirtualKey } from '../src/main/pttKey';

describe('PTT key mapping', () => {
  it('maps common game PTT keys to Windows virtual keys', () => {
    expect(keyboardCodeToVirtualKey('KeyV')).toBe(0x56);
    expect(keyboardCodeToVirtualKey('Space')).toBe(0x20);
    expect(keyboardCodeToVirtualKey('F8')).toBe(0x77);
    expect(keyboardCodeToVirtualKey('Numpad5')).toBe(0x65);
  });
  it('rejects unknown codes', () => expect(keyboardCodeToVirtualKey('Mouse4')).toBeUndefined());
});
