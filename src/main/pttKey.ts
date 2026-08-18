export function keyboardCodeToVirtualKey(code: string): number | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  const f = /^F([1-9]|1\d|2[0-4])$/.exec(code);
  if (f) return 0x6f + Number(f[1]);
  const map: Record<string, number> = {
    Backspace: 0x08, Tab: 0x09, Enter: 0x0d, ShiftLeft: 0x10, ShiftRight: 0x10,
    ControlLeft: 0x11, ControlRight: 0x11, AltLeft: 0x12, AltRight: 0x12, Pause: 0x13,
    CapsLock: 0x14, Escape: 0x1b, Space: 0x20, PageUp: 0x21, PageDown: 0x22,
    End: 0x23, Home: 0x24, ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27,
    ArrowDown: 0x28, Insert: 0x2d, Delete: 0x2e, Numpad0: 0x60, Numpad1: 0x61,
    Numpad2: 0x62, Numpad3: 0x63, Numpad4: 0x64, Numpad5: 0x65, Numpad6: 0x66,
    Numpad7: 0x67, Numpad8: 0x68, Numpad9: 0x69, NumpadMultiply: 0x6a,
    NumpadAdd: 0x6b, NumpadSubtract: 0x6d, NumpadDecimal: 0x6e, NumpadDivide: 0x6f,
    NumLock: 0x90, ScrollLock: 0x91, Semicolon: 0xba, Equal: 0xbb, Comma: 0xbc,
    Minus: 0xbd, Period: 0xbe, Slash: 0xbf, Backquote: 0xc0, BracketLeft: 0xdb,
    Backslash: 0xdc, BracketRight: 0xdd, Quote: 0xde
  };
  return map[code];
}
