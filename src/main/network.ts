import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { NetworkInfo, NetworkInterfaceInfo } from '../shared/types.js';

const execFileAsync = promisify(execFile);

export function getNetworkInfo(): NetworkInfo {
  const result: NetworkInterfaceInfo[] = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      const lower = name.toLowerCase();
      const isRadmin = lower.includes('radmin') || entry.address.startsWith('26.');
      const isVpn = /(radmin|vpn|hamachi|zerotier|tailscale)/i.test(name);
      let score = 10;
      if (isVpn) score += 40;
      if (isRadmin) score += 100;
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) score += 20;
      result.push({
        name,
        address: entry.address,
        netmask: entry.netmask,
        cidr: entry.cidr ?? undefined,
        isRadmin,
        score
      });
    }
  }
  result.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return {
    interfaces: result,
    preferred: result[0],
    radminDetected: result.some((x) => x.isRadmin)
  };
}

export function subnetBroadcast(address: string, netmask: string): string {
  const ip = address.split('.').map(Number);
  const mask = netmask.split('.').map(Number);
  if (ip.length !== 4 || mask.length !== 4 || [...ip, ...mask].some(Number.isNaN)) return '255.255.255.255';
  return ip.map((oct, i) => (oct & mask[i]) | (~mask[i] & 255)).join('.');
}

export function buildElevatedPowerShellCommand(encodedCommand: string): string {
  const escapedEncoded = encodedCommand.replace(/'/g, "''");
  return `$proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${escapedEncoded}'); exit $proc.ExitCode`;
}

export async function ensureFirewallRule(exePath: string): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, message: 'A regra automática de firewall só é necessária/suportada no Windows.' };
  }

  const ruleName = 'CriaCord Private P2P';
  const escapedExe = exePath.replace(/'/g, "''");
  const firewallScript = [
    `$existing = Get-NetFirewallRule -DisplayName '${ruleName}' -ErrorAction SilentlyContinue`,
    `if (-not $existing) { New-NetFirewallRule -DisplayName '${ruleName}' -Direction Inbound -Action Allow -Program '${escapedExe}' -Profile Private -Protocol Any | Out-Null }`
  ].join('; ');

  const encoded = Buffer.from(firewallScript, 'utf16le').toString('base64');
  const elevatedScript = buildElevatedPowerShellCommand(encoded);

  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', elevatedScript],
      { windowsHide: true, timeout: 60_000 }
    );
    return { ok: true, message: 'Regra de firewall criada/confirmada para redes privadas.' };
  } catch (error) {
    return {
      ok: false,
      message: `Não foi possível criar a regra automaticamente. Autorize o UAC ou permita o CriaCord em redes privadas no Firewall do Windows. (${String(error)})`
    };
  }
}
