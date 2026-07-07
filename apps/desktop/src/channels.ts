/** IPC channel names shared by main and preload. One channel per PlatformAdapter method. */
export const CH = {
  sessionOpen: 'session:open',
  sessionSaveAs: 'session:saveAs',
  sessionSave: 'session:save',
  speciesOpen: 'species:open',
  imagesPick: 'images:pick',
  imageLoad: 'image:load',
  imageRelink: 'image:relink',
  csvExport: 'csv:export',
  settingsLoad: 'settings:load',
  settingsSave: 'settings:save',
} as const;

/** Custom protocol that streams local image files into the renderer. */
export const IMAGE_SCHEME = 'qimg';
