/**
 * Electron main process. Owns all filesystem and dialog access; the renderer
 * (packages/ui) is sandboxed with context isolation and reaches the platform
 * only through the preload bridge (see preload.ts / PlatformAdapter in core).
 *
 * Renderer source:
 * - QUADRATOR_DEV_URL set → Vite dev server (run `npm -w @quadrator/ui run dev`).
 * - otherwise → the built UI at packages/ui/dist.
 * QUADRATOR_SMOKE=1 exits right after the window finishes loading (CI smoke).
 */
import { BrowserWindow, app, dialog, ipcMain, net, protocol } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CH, IMAGE_SCHEME } from './channels.ts';

interface FileRefPlain {
  id: string;
  name: string;
}

const SESSION_FILTERS = [{ name: 'Quadrator session', extensions: ['json'] }];
const CSV_FILTERS = [{ name: 'CSV', extensions: ['csv'] }];
const IMAGE_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'tif', 'tiff', 'webp'] },
];

protocol.registerSchemesAsPrivileged([
  { scheme: IMAGE_SCHEME, privileges: { stream: true } },
]);

function refFor(filePath: string): FileRefPlain {
  return { id: filePath, name: path.basename(filePath) };
}

function imageUrlFor(filePath: string): string {
  return `${IMAGE_SCHEME}://local/?path=${encodeURIComponent(filePath)}`;
}

async function openTextFile(
  win: BrowserWindow,
  title: string,
  filters: Electron.FileFilter[]
): Promise<{ ref: FileRefPlain; text: string } | null> {
  const r = await dialog.showOpenDialog(win, { title, filters, properties: ['openFile'] });
  const filePath = r.filePaths[0];
  if (r.canceled || filePath === undefined) return null;
  return { ref: refFor(filePath), text: await fs.readFile(filePath, 'utf8') };
}

async function saveTextFile(
  win: BrowserWindow,
  title: string,
  suggestedName: string,
  filters: Electron.FileFilter[],
  text: string
): Promise<FileRefPlain | null> {
  const r = await dialog.showSaveDialog(win, { title, defaultPath: suggestedName, filters });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, text, 'utf8');
  return refFor(r.filePath);
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function registerIpc(win: BrowserWindow): void {
  ipcMain.handle(CH.sessionOpen, () => openTextFile(win, 'Open session', SESSION_FILTERS));

  ipcMain.handle(CH.sessionSaveAs, (_e, text: string, suggestedName: string) =>
    saveTextFile(win, 'Save session', suggestedName, SESSION_FILTERS, text)
  );

  ipcMain.handle(CH.sessionSave, async (_e, id: string, text: string) => {
    await fs.writeFile(id, text, 'utf8');
  });

  ipcMain.handle(CH.speciesOpen, () =>
    openTextFile(win, 'Open species CSV', CSV_FILTERS)
  );

  ipcMain.handle(CH.imagesPick, async (): Promise<FileRefPlain[]> => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Add survey images',
      filters: IMAGE_FILTERS,
      properties: ['openFile', 'multiSelections'],
    });
    return r.canceled ? [] : r.filePaths.map(refFor);
  });

  ipcMain.handle(CH.imageLoad, async (_e, id: string): Promise<string> => {
    await fs.access(id); // reject unresolvable ids before handing out a URL
    return imageUrlFor(id);
  });

  ipcMain.handle(CH.imageRelink, async (_e, missingName: string): Promise<FileRefPlain | null> => {
    const r = await dialog.showOpenDialog(win, {
      title: `Locate image: ${missingName}`,
      filters: IMAGE_FILTERS,
      properties: ['openFile'],
    });
    const filePath = r.filePaths[0];
    return r.canceled || filePath === undefined ? null : refFor(filePath);
  });

  ipcMain.handle(CH.csvExport, (_e, text: string, suggestedName: string) =>
    saveTextFile(win, 'Export CSV', suggestedName, CSV_FILTERS, text)
  );

  ipcMain.handle(CH.settingsLoad, async (): Promise<unknown> => {
    try {
      return JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as unknown;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  });

  ipcMain.handle(CH.settingsSave, async (_e, value: unknown) => {
    await fs.writeFile(settingsPath(), JSON.stringify(value, null, 2), 'utf8');
  });
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  registerIpc(win);

  const devUrl = process.env['QUADRATOR_DEV_URL'];
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    await win.loadFile(
      path.join(__dirname, '..', '..', '..', 'packages', 'ui', 'dist', 'index.html')
    );
  }

  // CI/diagnostic hooks: SMOKE exits after a successful load; SHOT also
  // writes a PNG of the rendered window first.
  const shotPath = process.env['QUADRATOR_SHOT'];
  if (shotPath) {
    await new Promise((r) => setTimeout(r, 1500)); // let Vue/Vuetify paint
    // Optional scripted interaction before the capture (diagnostics/CI).
    const script = process.env['QUADRATOR_SHOT_SCRIPT'];
    if (script) {
      await win.webContents.executeJavaScript(script);
      await new Promise((r) => setTimeout(r, 800));
    }
    const image = await win.webContents.capturePage();
    await fs.writeFile(shotPath, image.toPNG());
    console.log(`QUADRATOR_SHOT: wrote ${shotPath}`);
  }
  if (process.env['QUADRATOR_SMOKE'] || shotPath) {
    console.log('QUADRATOR_SMOKE: window loaded OK');
    app.quit();
  }
}

app.whenReady().then(() => {
  // Stream local images to the sandboxed renderer without weakening
  // webSecurity: qimg://local/?path=<encoded absolute path>.
  protocol.handle(IMAGE_SCHEME, (request) => {
    const filePath = new URL(request.url).searchParams.get('path');
    if (!filePath) return new Response('missing path', { status: 400 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
