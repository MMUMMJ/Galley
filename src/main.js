// Galley editor entry point: load the saved story, then wire up the panels.
import { load, createStory, createAsset, newId } from './model.js';
import './adapters/save-indexeddb.js';
import './adapters/export-zip.js';
import './adapters/export-html.js';
import './adapters/save-folder.js';
import { availableSavers } from './adapters/registry.js';
import { createStore, STORY_DETAILS } from './store.js';
import { loadAssets, putAsset, assetUrl, getBlob, pruneAssets } from './assets.js';
import { processFile } from './media.js';
import { createStatus } from './editor/status.js';
import { claimTab } from './editor/one-tab.js';
import { assetIdsInSnapshots } from './snapshots.js';
import { mountVersions } from './editor/versions.js';
import { mountMediaEditor } from './editor/media-editor.js';
import { mountBlockList } from './editor/block-list.js';
import { mountInspector } from './editor/inspector.js';
import { mountPreview } from './editor/preview.js';
import { mountToolbar, saveStatusText } from './editor/toolbar.js';
import { startAutosave } from './editor/autosave.js';
import { loadPack, setPack, applyPack, startStory } from './packs.js';
import { mountFileMenu } from './editor/file-menu.js';
import { mountChecks } from './editor/checks-panel.js';
import { mountFolder } from './editor/folder-ui.js';
import { mountCanvas } from './editor/canvas.js';
import { getSettings, setSetting } from './settings.js';

export const EDITOR_VERSION = '0.3.0';

const $ = (id) => document.getElementById(id);

async function boot() {
  // 0. One tab edits at a time (one-tab.js): wait until this one may.
  const tab = await claimTab($('tab-dialog'));
  const { announce, toast, alert } = createStatus($('announcer'), $('toasts'), $('alerts'));
  const statusLine = $('app-status');

  // 1. Load the saved story. If loading fails, don't autosave: an empty story
  //    must never overwrite one we couldn't read.
  let savers = availableSavers();
  let story = null;
  let problem = null;
  for (const saver of savers) {
    try {
      const raw = await saver.load();
      if (raw) {
        const result = load(raw);
        story = result.story;
        if (result.errors.length) console.warn('Galley: saved story has problems', result.errors);
        break;
      }
    } catch (err) {
      problem = err;
    }
  }
  if (problem && !story) {
    savers = [];
    toast(`Galley couldn't open this browser's saved story, so it won't save changes. ${problem.message}`, { tone: 'warning' });
  }

  // 2. Pack: ?pack=packs/<name>.json, or else the pack this story was made with.
  const packPath = new URLSearchParams(location.search).get('pack') || story?.meta.pack || null;
  let packReady = !packPath;
  if (packPath) {
    try {
      setPack(await loadPack(packPath));
      packReady = true;
    } catch (err) {
      toast(`${err.message} Carrying on without a pack.`, { tone: 'warning' });
    }
  }
  const before = story ? JSON.stringify(story) : '';
  if (!story) story = packReady ? startStory() : createStory();
  else if (packReady) applyPack(story); // records the pack; skeleton only if the story is empty
  const packChanged = Boolean(before) && JSON.stringify(story) !== before;

  await loadAssets(Object.keys(story.assets));
  // Media no story uses any more is deleted, except what an earlier version (snapshots.js) needs.
  if (!problem) pruneAssets(new Set([...Object.keys(story.assets), ...await assetIdsInSnapshots()]));

  // 3. State.
  const store = createStore(story);
  store.select(story.blocks[0] ? story.blocks[0].id : STORY_DETAILS);

  // Files this browser wouldn't store (full, or private browsing): kept in memory only, so they'd be
  // lost when the page closes. A warning stays until an export has saved a copy.
  const memoryOnly = new Set();
  function unstored(names) {
    names.forEach((n) => memoryOnly.add(n));
    if (!memoryOnly.size) return;
    const list = [...memoryOnly];
    alert('memory', `${list.length === 1 ? `"${list[0]}" is` : `${list.length} media files are`} only in memory: this browser wouldn't store ${list.length === 1 ? 'it' : 'them'} (it may be full, or in private browsing). Close this page and ${list.length === 1 ? 'it' : 'they'} will be lost. Export a copy to keep ${list.length === 1 ? 'it' : 'them'}.`,
      { action: 'Export a ZIP now', onAction: () => fileMenu.exportZip() });
  }
  window.addEventListener('galley:exported', () => { memoryOnly.clear(); alert('memory', null); });

  async function importFiles(files, kinds) {
    const added = [];
    for (const file of files) {
      statusLine.textContent = `Importing ${file.name}…`;
      announce(`Importing ${file.name}.`);
      try {
        const result = await processFile(file);
        if (!kinds.includes(result.kind)) {
          toast(`"${file.name}" is ${result.kind === 'image' ? 'an image' : `a ${result.kind} file`}. This needs ${kinds.join(' or ')}.`, { tone: 'warning' });
          continue;
        }
        const id = newId('a');
        if (!(await putAsset(id, result.blob))) unstored([result.name]);
        added.push({
          id,
          asset: createAsset({ name: result.name, mime: result.mime, bytes: result.bytes, width: result.width, height: result.height }),
        });
        if (result.warning) toast(result.warning, { tone: 'warning' });
      } catch (err) {
        toast(err.message, { tone: 'warning' });
      }
    }
    statusLine.textContent = '';
    if (added.length) announce(`Imported ${added.length} file${added.length === 1 ? '' : 's'}.`);
    return added;
  }

  // All media entry points share this editor; block layout remains in the block settings.
  mountMediaEditor(store, { importFiles, assetUrl, announce, toast,
    openSettings: (id) => {
      store.select(id, 'media-settings');
      if (!canvas.reveal(id, document.querySelector(`.rail-item[data-id="${CSS.escape(id)}"]`))) inspector.focusFirstField();
    },
  });

  // 4. Panels.
  mountToolbar(store, { undoBtn: $('undo'), redoBtn: $('redo'), newBtn: $('new-story'), announce });
  const inspector = mountInspector($('inspector'), store, { importFiles, assetUrl, announce });
  mountBlockList($('blocks'), store, { announce, toast, onAdded: () => inspector.focusFirstField() });
  const preview = mountPreview($('preview-frame'), store, { assetUrl });
  mountChecks(store, {
    button: $('checks'), panel: $('checks-panel'), announce,
    reveal: (id, from, focusTarget) => canvas.reveal(id, from, focusTarget),
    focusTarget: (target) => inspector.focusTarget(target),
  });

  // Canvas (the story with tools on it) or Panels (blocks | settings | preview). Remembered per browser.
  const canvas = mountCanvas($('canvas'), store, { app: $('app'), sheet: $('inspector'), inspector, assetUrl, importFiles, announce, toast, playFrom: preview.playFrom, openDemo: () => fileMenu.openDemo() });
  const viewButtons = document.querySelectorAll('[data-view]');
  function setView(view, { save = true, say = false } = {}) {
    const isCanvas = view !== 'classic';
    $('app').classList.toggle('view-canvas', isCanvas);
    $('canvas').hidden = !isCanvas;
    viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === (isCanvas ? 'canvas' : 'classic'))));
    if (isCanvas) canvas.show(); else canvas.hide();
    if (save) setSetting('view', isCanvas ? 'canvas' : 'classic');
    if (say) announce(isCanvas ? 'Canvas view: your story with editing tools on it.' : 'Panels view: blocks, settings and preview side by side.');
  }
  viewButtons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view, { say: true })));
  // ?view=classic or ?view=canvas in the address (a tutor's link, say) wins over the remembered choice.
  const asked = new URLSearchParams(location.search).get('view');
  setView(asked === 'classic' || asked === 'canvas' ? asked : (await getSettings()).view === 'classic' ? 'classic' : 'canvas', { save: false });
  mountVersions(store, { button: $('versions'), returnTo: $('file'), announce, toast });
  const fileMenu = mountFileMenu(store, {
    fileBtn: $('file'), menu: $('file-menu'), openBtn: $('open'), demoBtn: $('open-demo'), getBlob, announce, toast, alert, unstored,
    setStatus: (text) => { statusLine.textContent = text; },
  });

  mountFolder(store, {
    wrap: $('folder-wrap'), button: $('folder'), menu: $('folder-menu'), dialog: $('choice-dialog'),
    folderLine: $('folder-status'), exportLine: $('export-status'), exportButton: $('file'), announce, toast, unstored,
  });
  const autosave = startAutosave(store, savers, {
    getBlob,
    onStatus: (state, detail) => {
      statusLine.textContent = saveStatusText(state, detail);
      if (state === 'error') toast(`Your latest changes couldn't be saved: ${detail?.message || 'storage error'}`, { tone: 'warning' });
    },
  });
  // Another tab takes over: save what's pending (when asked nicely), then never save again here.
  tab.onLost((saved) => autosave.stop(saved));
  if (savers.length) statusLine.textContent = story.blocks.length ? 'Story restored from this browser' : '';
  if (packChanged || (!before && story.blocks.length)) autosave.markDirty(); // save the pack's changes
  document.documentElement.dataset.ready = 'true';
  // ?demo in the address (the demo page's "Open in Galley" link) opens the demo story. It comes
  // out of the address, so reloading doesn't open it again.
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) {
    params.delete('demo');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
    await fileMenu.openDemo();
  }
}

boot().catch((err) => {
  console.error(err);
  const status = $('app-status');
  if (status) status.textContent = `Galley couldn't start: ${err.message}`;
});
