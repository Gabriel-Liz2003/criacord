import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, session } from 'electron';
import type { DesktopCapturerSource } from 'electron';
import { DiscoveryService, RoomServer } from './roomServer.js';
import { ensureFirewallRule, getNetworkInfo } from './network.js';
import { loadSettings, saveSettings } from './settings.js';
import { PttService } from './ptt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let selectedCaptureSourceId: string | null = null;
const roomServer = new RoomServer();
const discovery = new DiscoveryService();
const ptt = new PttService();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'CriaCord',
    backgroundColor: '#0d1016',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  registerPermissionHandlers();

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));

  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerPermissionHandlers(): void {
  const ownWindow = (webContents: Electron.WebContents | null): boolean => Boolean(mainWindow && webContents?.id === mainWindow.webContents.id);
  const allowed = (permission: string): boolean => permission === 'media' || permission === 'display-capture';
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => ownWindow(webContents) && allowed(permission));
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(ownWindow(webContents) && allowed(permission)));
}

function registerCaptureHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!selectedCaptureSourceId) {
      callback({});
      return;
    }
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
    const source = sources.find((s) => s.id === selectedCaptureSourceId);
    if (!source) {
      callback({});
      return;
    }
    callback({ video: source, audio: request.audioRequested && process.platform === 'win32' ? 'loopback' : undefined });
  });
}

function sourceKind(source: DesktopCapturerSource): 'screen' | 'window' {
  return source.id.startsWith('screen:') ? 'screen' : 'window';
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:save', (_e, patch) => saveSettings(patch));
  ipcMain.handle('network:info', () => getNetworkInfo());
  ipcMain.handle('capture:list-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      kind: sourceKind(source),
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      appIconDataUrl: source.appIcon?.toDataURL()
    }));
  });
  ipcMain.handle('capture:select-source', (_e, sourceId: string | null) => { selectedCaptureSourceId = sourceId; });
  ipcMain.handle('room:host', async (_e, input: { roomName: string; password?: string }) => roomServer.start(input.roomName, input.password));
  ipcMain.handle('room:stop-host', async () => roomServer.stop());
  ipcMain.handle('discovery:start', () => discovery.start());
  ipcMain.handle('discovery:stop', () => discovery.stop());
  ipcMain.handle('network:ensure-firewall', () => ensureFirewallRule(process.execPath));
  ipcMain.handle('clipboard:copy', (_e, text: string) => clipboard.writeText(text));
  ipcMain.handle('ptt:configure', (_e, enabled: boolean, key: string) => ptt.configure(Boolean(enabled), String(key)));
  ipcMain.handle('gpu:info', async () => {
    const featureStatus = app.getGPUFeatureStatus() as unknown as Record<string, string>;
    const basicInfo = await app.getGPUInfo('basic');
    return { featureStatus, basicInfo, supportedVideoCodecs: [] };
  });
  ipcMain.handle('app:version', () => app.getVersion());

  discovery.on('rooms', (rooms) => mainWindow?.webContents.send('discovery:rooms', rooms));
  ptt.on('state', (pressed: boolean) => mainWindow?.webContents.send('ptt:state', pressed));
}

app.setAppUserModelId('com.criacord.desktop');
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

app.whenReady().then(() => {
  if (process.argv.includes('--smoke-test')) {
    getNetworkInfo();
    loadSettings();
    console.log(`CriaCord ${app.getVersion()} smoke-test OK`);
    app.exit(0);
    return;
  }
  registerIpc();
  registerCaptureHandler();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
  ptt.stop();
  discovery.stop();
  void roomServer.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
