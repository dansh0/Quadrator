/**
 * Preload: the only code that spans the isolation boundary. Exposes a
 * PlatformAdapter-shaped bridge on window.quadrator; every method is a thin
 * ipcRenderer.invoke — no logic, no Node access for the renderer. The UI
 * wraps this bridge in ElectronPlatformAdapter (packages/ui) to normalize
 * errors into PlatformIOError.
 */
import type { FileRef, PlatformAdapter } from '@quadrator/core';
import { contextBridge, ipcRenderer } from 'electron';
import { CH } from './channels.ts';

const bridge: PlatformAdapter = {
  capabilities: { persistentFileIds: true, canOverwrite: true },

  openSession: () => ipcRenderer.invoke(CH.sessionOpen),
  saveSessionAs: (text: string, suggestedName: string) =>
    ipcRenderer.invoke(CH.sessionSaveAs, text, suggestedName),
  saveSession: (ref: FileRef, text: string) => ipcRenderer.invoke(CH.sessionSave, ref.id, text),

  openSpeciesCsv: () => ipcRenderer.invoke(CH.speciesOpen),

  pickImages: () => ipcRenderer.invoke(CH.imagesPick),
  loadImage: (ref: FileRef) => ipcRenderer.invoke(CH.imageLoad, ref.id),
  relinkImage: (missing: FileRef) => ipcRenderer.invoke(CH.imageRelink, missing.name),

  exportCsv: (text: string, suggestedName: string) =>
    ipcRenderer.invoke(CH.csvExport, text, suggestedName),

  loadSettings: () => ipcRenderer.invoke(CH.settingsLoad),
  saveSettings: (value: unknown) => ipcRenderer.invoke(CH.settingsSave, value),
};

contextBridge.exposeInMainWorld('quadrator', bridge);
