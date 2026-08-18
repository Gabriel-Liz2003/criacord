import { describe, expect, it } from 'vitest';
import { buildElevatedPowerShellCommand, subnetBroadcast } from '../dist-electron/main/network.js';

describe('subnetBroadcast', () => {
  it('calculates /24 broadcast', () => expect(subnetBroadcast('192.168.1.30', '255.255.255.0')).toBe('192.168.1.255'));
  it('calculates /8 Radmin-style broadcast', () => expect(subnetBroadcast('26.10.20.30', '255.0.0.0')).toBe('26.255.255.255'));
});

describe('buildElevatedPowerShellCommand', () => {
  it('separates Start-Process from exit with a PowerShell statement terminator', () => {
    const command = buildElevatedPowerShellCommand('QQA=');
    expect(command).toContain("); exit $proc.ExitCode");
    expect(command).not.toContain("') exit $proc.ExitCode");
  });
});
