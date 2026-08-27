import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const port = Number(process.env.PORT || 8787);
const maxPayload = 256 * 1024;
const channels = new Map();

function validChannel(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(value);
}

function join(channel, socket) {
  let peers = channels.get(channel);
  if (!peers) channels.set(channel, peers = new Set());
  peers.add(socket);
}

function leave(channel, socket) {
  const peers = channels.get(channel);
  peers?.delete(socket);
  if (peers?.size === 0) channels.delete(channel);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, channels: channels.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload });

server.on('upgrade', (req, socket, head) => {
  let channel;
  try { channel = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname.slice(1)); }
  catch { socket.destroy(); return; }
  if (!validChannel(channel)) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, channel));
});

wss.on('connection', (ws, channel) => {
  join(channel, ws);
  ws.on('message', (data, isBinary) => {
    if (data.length > maxPayload) { ws.close(1009, 'message too large'); return; }
    const peers = channels.get(channel);
    if (!peers) return;
    for (const peer of peers) {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(data, { binary: isBinary });
    }
  });
  ws.on('close', () => leave(channel, ws));
  ws.on('error', () => leave(channel, ws));
});

server.listen(port, '0.0.0.0', () => console.log(`CriaCord signaling listening on :${port}`));
