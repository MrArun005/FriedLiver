import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { AppController } from './controller';

// `--folder <path>` (or FRIEDLIVER_FOLDER) opens a folder at startup.
function initialFolder(): string | null {
  const i = process.argv.indexOf('--folder');
  const folder = i >= 0 ? process.argv[i + 1] : process.env.FRIEDLIVER_FOLDER;
  return folder ? path.resolve(folder) : null;
}

// A separate profile (layout, theme) for tests and screenshots, so runs don't leak into each other.
if (process.env.FRIEDLIVER_USER_DATA) app.setPath('userData', process.env.FRIEDLIVER_USER_DATA);

let controller: AppController | undefined;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'FriedLiver',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The spellchecker loads dictionaries into the renderer; an editor doesn't need it.
      spellcheck: false,
    },
  });
  controller = new AppController(win, {
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
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Agents are child processes; make sure none outlive the app.
app.on('before-quit', () => {
  void controller?.dispose();
});
