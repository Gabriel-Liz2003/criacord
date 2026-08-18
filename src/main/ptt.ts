import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { keyboardCodeToVirtualKey } from './pttKey.js';

export interface PttStatus { ok: boolean; global: boolean; message: string }
export class PttService extends EventEmitter {
  private child?: ChildProcess;
  private pending = '';

  configure(enabled: boolean, code: string): PttStatus {
    this.stop();
    if (!enabled) return { ok: true, global: false, message: 'PTT global desativado.' };
    if (process.platform !== 'win32') return { ok: false, global: false, message: 'PTT global é disponibilizado no build Windows.' };
    const vk = keyboardCodeToVirtualKey(code);
    if (!vk) return { ok: false, global: false, message: `A tecla ${code} não é suportada pelo PTT global.` };
    const helper = app.isPackaged
      ? path.join(process.resourcesPath, 'native', 'CriaCordPttHelper.exe')
      : path.join(app.getAppPath(), 'native', 'CriaCordPttHelper.exe');
    if (!fs.existsSync(helper)) return { ok: false, global: false, message: 'Helper PTT não encontrado; usando PTT com a janela focada.' };

    try {
      const child = spawn(helper, [String(vk)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      this.child = child;
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => this.consume(chunk));
      child.once('exit', () => {
        if (this.child === child) this.child = undefined;
        this.emit('state', false);
      });
      child.once('error', () => {
        if (this.child === child) this.child = undefined;
        this.emit('state', false);
      });
      return { ok: true, global: true, message: 'PTT global ativo.' };
    } catch (error) {
      return { ok: false, global: false, message: `Não foi possível iniciar o PTT global: ${String(error)}` };
    }
  }

  private consume(chunk: string): void {
    this.pending += chunk;
    let newline = this.pending.indexOf('\n');
    while (newline >= 0) {
      const line = this.pending.slice(0, newline).trim();
      this.pending = this.pending.slice(newline + 1);
      if (line === 'D') this.emit('state', true);
      else if (line === 'U') this.emit('state', false);
      newline = this.pending.indexOf('\n');
    }
  }

  stop(): void {
    const child = this.child;
    this.child = undefined;
    this.pending = '';
    if (child && !child.killed) child.kill();
    this.emit('state', false);
  }
}
