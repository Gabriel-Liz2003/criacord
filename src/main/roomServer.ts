import crypto from 'node:crypto';
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { DISCOVERY_MAGIC, DISCOVERY_PORT, SIGNALING_PORT } from '../shared/constants.js';
import { encodeInvite } from '../shared/invite.js';
import type { DiscoveredRoom, HostedRoom, WireMessage } from '../shared/types.js';
import { getNetworkInfo, subnetBroadcast } from './network.js';

interface PresenceState {
  speaking: boolean;
  sharing: boolean;
  muted: boolean;
  deafened: boolean;
}

interface PeerMeta { id: string; displayName: string; socket: WebSocket; presence: PresenceState }
interface DiscoveryPacket {
  magic: string;
  roomCode: string;
  roomName: string;
  port: number;
  hasPassword: boolean;
}

function randomRoomCode(): string {
  return crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, '').slice(0, 8).toUpperCase();
}

const PASSWORD_ITERATIONS = 180_000;

function derivePasswordVerifier(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, 'sha256');
}

function passwordProof(verifier: Buffer, nonce: Buffer): Buffer {
  return crypto.createHmac('sha256', verifier).update(nonce).digest();
}

function safeSend(socket: WebSocket, payload: WireMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

export class RoomServer extends EventEmitter {
  private wss?: WebSocketServer;
  private peers = new Map<string, PeerMeta>();
  private roomCode = '';
  private roomName = '';
  private passwordSalt?: Buffer;
  private passwordHash?: Buffer;
  private port = SIGNALING_PORT;
  private discoverySocket?: dgram.Socket;
  private announceTimer?: NodeJS.Timeout;

  async start(roomName: string, password?: string): Promise<HostedRoom> {
    await this.stop();
    this.roomCode = randomRoomCode();
    this.roomName = roomName.trim() || 'Sala';
    if (password) {
      this.passwordSalt = crypto.randomBytes(16);
      this.passwordHash = derivePasswordVerifier(password, this.passwordSalt);
    }

    this.wss = await this.listenAvailablePort(SIGNALING_PORT, 20);
    this.wss.on('connection', (socket) => this.handleSocket(socket));

    const network = getNetworkInfo();
    const hostAddress = network.preferred?.address ?? '127.0.0.1';
    this.startAnnouncements();
    return {
      roomCode: this.roomCode,
      roomName: this.roomName,
      inviteCode: encodeInvite({ v: 1, host: hostAddress, port: this.port, room: this.roomCode }),
      hostAddress,
      port: this.port,
      hasPassword: Boolean(this.passwordHash)
    };
  }

  private listenAvailablePort(base: number, attempts: number): Promise<WebSocketServer> {
    return new Promise((resolve, reject) => {
      const tryPort = (port: number, left: number) => {
        const wss = new WebSocketServer({ host: '0.0.0.0', port, maxPayload: 256 * 1024 });
        wss.once('listening', () => {
          this.port = port;
          resolve(wss);
        });
        wss.once('error', (err: NodeJS.ErrnoException) => {
          wss.close();
          if (err.code === 'EADDRINUSE' && left > 0) tryPort(port + 1, left - 1);
          else reject(err);
        });
      };
      tryPort(base, attempts);
    });
  }

  private handleSocket(socket: WebSocket): void {
    let peerId: string | undefined;
    const authNonce = crypto.randomBytes(32);
    safeSend(socket, {
      type: 'auth-challenge',
      required: Boolean(this.passwordHash),
      salt: this.passwordSalt?.toString('base64url'),
      nonce: authNonce.toString('base64url'),
      iterations: PASSWORD_ITERATIONS
    });
    const joinTimer = setTimeout(() => socket.close(4001, 'join timeout'), 10_000);

    socket.on('message', (data) => {
      let msg: WireMessage;
      try { msg = JSON.parse(data.toString()) as WireMessage; } catch { return; }

      if (!peerId) {
        if (msg.type !== 'join') return;
        if (msg.roomCode !== this.roomCode) {
          safeSend(socket, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Sala não encontrada.' });
          socket.close();
          return;
        }
        if (this.passwordHash) {
          let incoming: Buffer;
          try { incoming = Buffer.from(msg.passwordProof ?? '', 'base64url'); }
          catch { incoming = Buffer.alloc(0); }
          const expected = passwordProof(this.passwordHash, authNonce);
          if (incoming.length !== expected.length || !crypto.timingSafeEqual(incoming, expected)) {
            safeSend(socket, { type: 'error', code: 'BAD_PASSWORD', message: 'Senha incorreta.' });
            socket.close();
            return;
          }
        }
        if (!/^[A-Za-z0-9_-]{8,80}$/.test(msg.clientId)) {
          safeSend(socket, { type: 'error', code: 'BAD_CLIENT', message: 'Identificação de cliente inválida.' });
          socket.close();
          return;
        }
        const uniqueId = this.peers.has(msg.clientId) ? `${msg.clientId}-${crypto.randomBytes(2).toString('hex')}` : msg.clientId;
        peerId = uniqueId;
        clearTimeout(joinTimer);
        const displayName = msg.displayName.trim().slice(0, 40) || 'Usuário';
        const existing = [...this.peers.values()].map((p) => ({ id: p.id, displayName: p.displayName }));
        this.peers.set(peerId, {
          id: peerId,
          displayName,
          socket,
          presence: { speaking: false, sharing: false, muted: false, deafened: false }
        });
        safeSend(socket, { type: 'welcome', selfId: peerId, roomName: this.roomName, peers: existing });
        for (const p of this.peers.values()) {
          if (p.id !== peerId) safeSend(p.socket, { type: 'peer-joined', peer: { id: peerId, displayName } });
        }
        return;
      }

      if (msg.type === 'signal') {
        const dest = this.peers.get(msg.to);
        if (dest) safeSend(dest.socket, { ...msg, from: peerId });
      } else if (msg.type === 'presence') {
        const sender = this.peers.get(peerId);
        if (!sender) return;
        if (typeof msg.speaking === 'boolean') sender.presence.speaking = msg.speaking;
        if (typeof msg.sharing === 'boolean') sender.presence.sharing = msg.sharing;
        if (typeof msg.muted === 'boolean') sender.presence.muted = msg.muted;
        if (typeof msg.deafened === 'boolean') sender.presence.deafened = msg.deafened;
        const presence: WireMessage = {
          type: 'presence',
          from: peerId,
          to: msg.to,
          ...sender.presence
        };
        for (const p of this.peers.values()) {
          if (p.id !== peerId && (!msg.to || p.id === msg.to)) safeSend(p.socket, presence);
        }
      } else if (msg.type === 'ping') {
        safeSend(socket, { type: 'pong', t: msg.t });
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimer);
      if (!peerId || !this.peers.delete(peerId)) return;
      for (const p of this.peers.values()) safeSend(p.socket, { type: 'peer-left', peerId });
    });
  }

  private startAnnouncements(): void {
    const send = () => {
      if (!this.roomCode) return;
      const packet: DiscoveryPacket = {
        magic: DISCOVERY_MAGIC,
        roomCode: this.roomCode,
        roomName: this.roomName,
        port: this.port,
        hasPassword: Boolean(this.passwordHash)
      };
      const bytes = Buffer.from(JSON.stringify(packet));
      const info = getNetworkInfo();
      for (const iface of info.interfaces) {
        const socket = dgram.createSocket('udp4');
        socket.bind(0, iface.address, () => {
          try {
            socket.setBroadcast(true);
            socket.send(bytes, DISCOVERY_PORT, subnetBroadcast(iface.address, iface.netmask), () => socket.close());
          } catch { socket.close(); }
        });
        socket.on('error', () => socket.close());
      }
      const globalSocket = dgram.createSocket('udp4');
      globalSocket.bind(0, () => {
        try {
          globalSocket.setBroadcast(true);
          globalSocket.send(bytes, DISCOVERY_PORT, '255.255.255.255', () => globalSocket.close());
        } catch { globalSocket.close(); }
      });
      globalSocket.on('error', () => globalSocket.close());
    };
    send();
    this.announceTimer = setInterval(send, 2_000);
  }

  async stop(): Promise<void> {
    if (this.announceTimer) clearInterval(this.announceTimer);
    this.announceTimer = undefined;
    for (const p of this.peers.values()) p.socket.close(1001, 'host stopped');
    this.peers.clear();
    if (this.wss) await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
    this.wss = undefined;
    this.roomCode = '';
    this.passwordHash = undefined;
    this.passwordSalt = undefined;
  }
}

export class DiscoveryService extends EventEmitter {
  private socket?: dgram.Socket;
  private rooms = new Map<string, DiscoveredRoom>();
  private pruneTimer?: NodeJS.Timeout;

  start(): DiscoveredRoom[] {
    if (this.socket) return this.snapshot();
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;
    socket.on('message', (buf, rinfo) => {
      try {
        const p = JSON.parse(buf.toString()) as DiscoveryPacket;
        if (p.magic !== DISCOVERY_MAGIC || !p.roomCode || !p.roomName || !p.port) return;
        const key = `${rinfo.address}:${p.port}:${p.roomCode}`;
        this.rooms.set(key, {
          roomCode: p.roomCode,
          roomName: p.roomName,
          hostAddress: rinfo.address,
          port: p.port,
          hasPassword: Boolean(p.hasPassword),
          lastSeen: Date.now()
        });
        this.emit('rooms', this.snapshot());
      } catch { /* ignore foreign UDP */ }
    });
    socket.on('error', (err) => this.emit('error', err));
    socket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
      try { socket.setBroadcast(true); } catch { /* noop */ }
    });
    this.pruneTimer = setInterval(() => {
      const cutoff = Date.now() - 7_000;
      let changed = false;
      for (const [key, room] of this.rooms) {
        if (room.lastSeen < cutoff) { this.rooms.delete(key); changed = true; }
      }
      if (changed) this.emit('rooms', this.snapshot());
    }, 2_000);
    return this.snapshot();
  }

  snapshot(): DiscoveredRoom[] {
    return [...this.rooms.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  stop(): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = undefined;
    if (this.socket) {
      try { this.socket.close(); } catch { /* noop */ }
    }
    this.socket = undefined;
    this.rooms.clear();
  }
}
