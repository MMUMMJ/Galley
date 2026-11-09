// Illuminate editor entry point: load the saved story, then wire up the panels.
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
  const { announce, toast } = createStatus($('announcer'), $('toasts'));
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
        if (result.errors.length) console.warn('Illuminate: saved story has problems', result.errors);
        break;
      }
    } catch (err) {
      problem = err;
    }
  }
  if (problem && !story) {
    savers = [];
    toast(`Illuminate couldn't open this browser's saved story, so it won't save changes. ${problem.message}`, { tone: 'warning' });
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
  if (!problem) pruneAssets(new Set(Object.keys(story.assets)));

  // 3. State.
  const store = createStore(story);
  store.select(story.blocks[0] ? story.blocks[0].id : STORY_DETAILS);

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
        if (!(await putAsset(id, result.blob))) {
          toast(`"${result.name}" couldn't be stored in this browser. It will be lost when you close the page.`, { tone: 'warning' });
        }
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

  // 4. Panels.
  mountToolbar(store, { undoBtn: $('undo'), redoBtn: $('redo'), newBtn: $('new-story'), announce });
  const inspector = mountInspector($('inspector'), store, { importFiles, assetUrl, announce });
  mountBlockList($('blocks'), store, { announce, toast, onAdded: () => inspector.focusFirstField() });
  mountPreview($('preview-frame'), store, { assetUrl });
  mountChecks(store, { button: $('checks'), panel: $('checks-panel'), announce });

  // Canvas (the story with tools on it) or Classic (blocks | settings | preview). Remembered per browser.
  const canvas = mountCanvas($('canvas'), store, { app: $('app'), sheet: $('inspector'), inspector, assetUrl, importFiles, announce, toast });
  const viewButtons = document.querySelectorAll('[data-view]');
  function setView(view, { save = true, say = false } = {}) {
    const isCanvas = view !== 'classic';
    $('app').classList.toggle('view-canvas', isCanvas);
    $('canvas').hidden = !isCanvas;
    viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === (isCanvas ? 'canvas' : 'classic'))));
    if (isCanvas) canvas.show(); else canvas.hide();
    if (save) setSetting('view', isCanvas ? 'canvas' : 'classic');
    if (say) announce(isCanvas ? 'Canvas view: your story with editing tools on it.' : 'Classic view: blocks, settings and preview side by side.');
  }
  viewButtons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view, { say: true })));
  // ?view=classic or ?view=canvas in the address (a tutor's link, say) wins over the remembered choice.
  const asked = new URLSearchParams(location.search).get('view');
  setView(asked === 'classic' || asked === 'canvas' ? asked : (await getSettings()).view === 'classic' ? 'classic' : 'canvas', { save: false });
  mountFileMenu(store, {
    fileBtn: $('file'), menu: $('file-menu'), openBtn: $('open'), getBlob, announce, toast,
    setStatus: (text) => { statusLine.textContent = text; },
  });

  mountFolder(store, {
    wrap: $('folder-wrap'), button: $('folder'), menu: $('folder-menu'), dialog: $('choice-dialog'),
    folderLine: $('folder-status'), exportLine: $('export-status'), exportButton: $('file'), announce, toast,
  });
  const autosave = startAutosave(store, savers, {
    getBlob,
    onStatus: (state, detail) => {
      statusLine.textContent = saveStatusText(state, detail);
      if (state === 'error') toast(`Your latest changes couldn't be saved: ${detail?.message || 'storage error'}`, { tone: 'warning' });
    },
  });
  if (savers.length) statusLine.textContent = story.blocks.length ? 'Story restored from this browser' : '';
  if (packChanged || (!before && story.blocks.length)) autosave.markDirty(); // save the pack's changes
  document.documentElement.dataset.ready = 'true';
}

boot().catch((err) => {
  console.error(err);
  const status = $('app-status');
  if (status) status.textContent = `Illuminate couldn't start: ${err.message}`;
});
