import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const port = 18787;
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const open = (ws) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('websocket open timeout')), 5000);
  ws.once('open', () => { clearTimeout(timer); resolve(); });
  ws.once('error', reject);
});

try {
  await wait(300);
  const url = `ws://127.0.0.1:${port}/criacord-test-room`;
  const a = new WebSocket(url);
  const b = new WebSocket(url);
  await Promise.all([open(a), open(b)]);
  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay timeout')), 5000);
    b.once('message', (data) => { clearTimeout(timer); resolve(String(data)); });
  });
  a.send('hello-peer');
  const value = await received;
  if (value !== 'hello-peer') throw new Error(`unexpected relay payload: ${value}`);
  a.close(); b.close();
  console.log('CriaCord signaling relay test OK');
} finally {
  server.kill();
}
