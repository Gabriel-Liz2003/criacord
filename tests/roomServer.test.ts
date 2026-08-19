import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { RoomServer } from '../dist-electron/main/roomServer.js';

const servers: RoomServer[] = [];
afterEach(async () => { while (servers.length) await servers.pop()!.stop(); });

function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 3000);
    ws.once('message', (data) => { clearTimeout(timer); resolve(JSON.parse(data.toString())); });
  });
}

function proof(password: string, challenge: any): string {
  const verifier = crypto.pbkdf2Sync(password, Buffer.from(challenge.salt, 'base64url'), challenge.iterations, 32, 'sha256');
  return crypto.createHmac('sha256', verifier).update(Buffer.from(challenge.nonce, 'base64url')).digest('base64url');
}

async function join(ws: WebSocket, challengePromise: Promise<any>, roomCode: string, name: string, clientId: string, password: string) {
  const challenge = await challengePromise;
  expect(challenge.type).toBe('auth-challenge');
  ws.send(JSON.stringify({
    type: 'join', roomCode, displayName: name, clientId,
    passwordProof: challenge.required ? proof(password, challenge) : undefined
  }));
  return nextMessage(ws);
}

describe('RoomServer', () => {
  it('authenticates by challenge and relays signaling between two peers', async () => {
    const server = new RoomServer(); servers.push(server);
    const room = await server.start('Teste', 'senha');
    const a = new WebSocket(`ws://127.0.0.1:${room.port}`);
    const challengeA = nextMessage(a);
    await new Promise<void>((resolve) => a.once('open', () => resolve()));
    const welcomeA = await join(a, challengeA, room.roomCode, 'A', 'clientA123', 'senha');
    expect(welcomeA.type).toBe('welcome');

    const b = new WebSocket(`ws://127.0.0.1:${room.port}`);
    const challengeB = nextMessage(b);
    await new Promise<void>((resolve) => b.once('open', () => resolve()));
    const welcomeB = await join(b, challengeB, room.roomCode, 'B', 'clientB123', 'senha');
    expect(welcomeB.peers).toHaveLength(1);
    const joinedForA = await nextMessage(a);
    expect(joinedForA.type).toBe('peer-joined');

    b.send(JSON.stringify({ type: 'signal', to: welcomeA.selfId, signalType: 'offer', payload: { type: 'offer', sdp: 'x' } }));
    const relayed = await nextMessage(a);
    expect(relayed.type).toBe('signal');
    expect(relayed.from).toBe(welcomeB.selfId);
    a.close(); b.close();
  });

  it('preserves sharing when later presence updates only speaking state', async () => {
    const server = new RoomServer(); servers.push(server);
    const room = await server.start('Presença');

    const a = new WebSocket(`ws://127.0.0.1:${room.port}`);
    const challengeA = nextMessage(a);
    await new Promise<void>((resolve) => a.once('open', () => resolve()));
    await join(a, challengeA, room.roomCode, 'A', 'clientPresenceA', '');

    const b = new WebSocket(`ws://127.0.0.1:${room.port}`);
    const challengeB = nextMessage(b);
    await new Promise<void>((resolve) => b.once('open', () => resolve()));
    const welcomeB = await join(b, challengeB, room.roomCode, 'B', 'clientPresenceB', '');
    await nextMessage(a); // peer-joined

    b.send(JSON.stringify({ type: 'presence', sharing: true }));
    const sharing = await nextMessage(a);
    expect(sharing).toMatchObject({
      type: 'presence',
      from: welcomeB.selfId,
      sharing: true,
      speaking: false,
      muted: false,
      deafened: false
    });

    b.send(JSON.stringify({ type: 'presence', speaking: true }));
    const speaking = await nextMessage(a);
    expect(speaking).toMatchObject({
      type: 'presence',
      from: welcomeB.selfId,
      sharing: true,
      speaking: true,
      muted: false,
      deafened: false
    });

    a.close(); b.close();
  });

  it('relays text chat to the room and gives history to a later participant', async () => {
    const server = new RoomServer(); servers.push(server);
    const room = await server.start('Chat');

    const a = new WebSocket(`ws://127.0.0.1:${room.port}`);
    const challengeA = nextMessage(a);
    await new Promise<void>((resolve) => a.once('open', () => resolve()));
    const welcomeA = await join(a, challengeA, room.roomCode, 'Alice', 'clientChatAlice', '');

    const b = new WebSocket(`ws://127.0.0.1:${room.port}`);
    const challengeB = nextMessage(b);
    await new Promise<void>((resolve) => b.once('open', () => resolve()));
    await join(b, challengeB, room.roomCode, 'Bob', 'clientChatBob', '');
    await nextMessage(a); // peer-joined

    a.send(JSON.stringify({ type: 'chat', text: 'oi da sala' }));
    const chatForA = await nextMessage(a);
    const chatForB = await nextMessage(b);
    expect(chatForA).toMatchObject({ type: 'chat', from: welcomeA.selfId, displayName: 'Alice', text: 'oi da sala' });
    expect(chatForB).toMatchObject({ id: chatForA.id, type: 'chat', from: welcomeA.selfId, text: 'oi da sala' });
    expect(typeof chatForA.timestamp).toBe('number');

    const c = new WebSocket(`ws://127.0.0.1:${room.port}`);
    const challengeC = nextMessage(c);
    await new Promise<void>((resolve) => c.once('open', () => resolve()));
    const welcomeC = await join(c, challengeC, room.roomCode, 'Carol', 'clientChatCarol', '');
    expect(welcomeC.chatHistory).toHaveLength(1);
    expect(welcomeC.chatHistory[0]).toMatchObject({ id: chatForA.id, displayName: 'Alice', text: 'oi da sala' });

    a.close(); b.close(); c.close();
  });

  it('rejects an invalid password proof', async () => {
    const server = new RoomServer(); servers.push(server);
    const room = await server.start('Teste', 'certa');
    const ws = new WebSocket(`ws://127.0.0.1:${room.port}`);
    const challenge = nextMessage(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    const result = await join(ws, challenge, room.roomCode, 'X', 'clientX123', 'errada');
    expect(result.type).toBe('error');
    expect(result.code).toBe('BAD_PASSWORD');
    ws.close();
  });
});
