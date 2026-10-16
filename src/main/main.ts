import path from 'node:path';
import { app, BrowserWindow, Menu, safeStorage, type MenuItemConstructorOptions } from 'electron';
import { EVENT_CHANNEL, type MainEvent } from '../shared/ipc';
import { AppController } from './controller';
import { SettingsStore, type SecretBox } from './settings';
import { adoptLoginShellPath } from './shellEnv';

// `--folder <path>` (or FRIEDLIVER_FOLDER) opens a folder at startup.
function initialFolder(): string | null {
  const i = process.argv.indexOf('--folder');
  const folder = i >= 0 ? process.argv[i + 1] : process.env.FRIEDLIVER_FOLDER;
  return folder ? path.resolve(folder) : null;
}

// A separate profile (layout, theme, settings) for tests and screenshots, so runs don't leak into each other.
if (process.env.FRIEDLIVER_USER_DATA) app.setPath('userData', process.env.FRIEDLIVER_USER_DATA);

/** API keys are sealed with the OS keychain (Keychain, DPAPI, libsecret). */
const secretBox: SecretBox = {
  protection: () => {
    if (!safeStorage.isEncryptionAvailable()) return 'none';
    // Without a keyring on Linux, Electron falls back to a fixed key: better than plain text, but say so.
    return process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text' ? 'basic' : 'os';
  },
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (sealed) => safeStorage.decryptString(sealed),
};

let controller: AppController | undefined;

function sendMenu(action: Extract<MainEvent, { type: 'menu' }>['action']): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(EVENT_CHANNEL, { type: 'menu', action } satisfies MainEvent);
}

/**
 * macOS needs a real app menu: without its Edit roles, Cmd+C/V/Z stop working
 * in text fields. Windows and Linux get no menu bar; everything is in the
 * command palette.
 */
function installMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => sendMenu('settings') },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder…', accelerator: 'Cmd+O', click: () => sendMenu('openFolder') },
        { label: 'Go to File…', accelerator: 'Cmd+P', click: () => sendMenu('quickOpen') },
        { type: 'separator' },
        // Cmd+W closes the editor tab (handled in the window), so the window gets Cmd+Shift+W.
        { label: 'Close Window', accelerator: 'Cmd+Shift+W', role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Not the undo/redo roles: those do a native undo that skips Monaco's own history.
        { label: 'Undo', accelerator: 'Cmd+Z', click: () => sendMenu('undo') },
        { label: 'Redo', accelerator: 'Cmd+Shift+Z', click: () => sendMenu('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette…', accelerator: 'Cmd+Shift+P', click: () => sendMenu('commandPalette') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow(): Promise<void> {
  const settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'), secretBox);
  await settings.load();
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'FriedLiver',
    backgroundColor: '#000000',
    // Packaged builds take the icon from the installer; this covers `npm start`.
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The spellchecker loads dictionaries into the renderer; an editor doesn't need it.
      spellcheck: false,
    },
  });
  controller = new AppController(win, settings, {
    initialFolder: initialFolder(),
    demoAgentScript: path.join(__dirname, 'demo-agent.js'),
    version: app.getVersion(),
  });
  controller.register();
  win.on('closed', () => {
    void controller?.dispose();
    controller = undefined;
  });
  void win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

void app.whenReady().then(async () => {
  installMenu();
  // Before any agent starts: agents installed with npm must be on PATH.
  await adoptLoginShellPath();
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

// Agents and shells are child processes; make sure none outlive the app.
app.on('before-quit', () => {
  void controller?.dispose();
});
