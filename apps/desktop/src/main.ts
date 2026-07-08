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
import { parseSession } from '@quadrator/core';
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

/**
 * Only paths the user has actually authorized — picked in a dialog, or named
 * inside a session document the user opened (or the autosaved snapshot in
 * settings) — may be read back by the renderer via qimg:// or image:load.
 * This keeps a compromised renderer from using the shell to read arbitrary
 * files.
 */
const allowedImagePaths = new Set<string>();

function allowImagePath(filePath: string): void {
  allowedImagePaths.add(path.resolve(filePath));
}

function isImagePathAllowed(filePath: string): boolean {
  return allowedImagePaths.has(path.resolve(filePath));
}

/** Authorize the image paths named in session text; ignore unparseable text. */
function allowSessionImages(text: string): void {
  try {
    for (const quadrat of parseSession(text).quadrats) allowImagePath(quadrat.imagePath);
  } catch {
    // Corrupt/unknown sessions grant nothing; the renderer surfaces the error.
  }
}

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
  ipcMain.handle(CH.sessionOpen, async () => {
    const r = await openTextFile(win, 'Open session', SESSION_FILTERS);
    if (r !== null) allowSessionImages(r.text);
    return r;
  });

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
    if (r.canceled) return [];
    for (const filePath of r.filePaths) allowImagePath(filePath);
    return r.filePaths.map(refFor);
  });

  ipcMain.handle(CH.imageLoad, async (_e, id: string): Promise<string> => {
    if (!isImagePathAllowed(id)) throw new Error(`image path not authorized: ${id}`);
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
    if (r.canceled || filePath === undefined) return null;
    allowImagePath(filePath);
    return refFor(filePath);
  });

  ipcMain.handle(CH.csvExport, (_e, text: string, suggestedName: string) =>
    saveTextFile(win, 'Export CSV', suggestedName, CSV_FILTERS, text)
  );

  ipcMain.handle(CH.settingsLoad, async (): Promise<unknown> => {
    let settings: unknown;
    try {
      settings = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as unknown;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    // The crash-recovery snapshot lives in settings; authorize its images so
    // "Continue Last Session" can display them after a restart.
    const snapshot = (settings as { lastSessionText?: unknown } | null)?.lastSessionText;
    if (typeof snapshot === 'string') allowSessionImages(snapshot);
    return settings;
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
  } else if (app.isPackaged) {
    // The renderer snapshot bundled by build.mjs, packaged next to dist/.
    await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  } else {
    // Unpackaged: serve the UI build directly so it is never stale.
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
    if (!isImagePathAllowed(filePath)) return new Response('path not authorized', { status: 403 });
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
