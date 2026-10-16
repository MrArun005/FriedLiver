import path from 'node:path';
import { app, BrowserWindow, safeStorage } from 'electron';
import { AppController } from './controller';
import { SettingsStore, type SecretBox } from './settings';

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

async function createWindow(): Promise<void> {
  const settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'), secretBox);
  await settings.load();
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'FriedLiver',
    backgroundColor: '#000000',
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

void app.whenReady().then(createWindow);

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
