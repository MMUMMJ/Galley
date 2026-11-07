// Illuminate editor entry point: load the saved story, then wire up the panels.
import { load, createStory, createAsset, newId } from './model.js';
import './adapters/save-indexeddb.js';
import './adapters/export-zip.js';
import './adapters/export-html.js';
import { availableSavers } from './adapters/registry.js';
import { createStore } from './store.js';
import { loadAssets, putAsset, assetUrl, getBlob, pruneAssets } from './assets.js';
import { processFile } from './media.js';
import { createStatus } from './editor/status.js';
import { mountBlockList } from './editor/block-list.js';
import { mountInspector } from './editor/inspector.js';
import { mountPreview } from './editor/preview.js';
import { mountToolbar, saveStatusText } from './editor/toolbar.js';
import { startAutosave } from './editor/autosave.js';
import { mountFileMenu } from './editor/file-menu.js';

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
  story = story || createStory();

  await loadAssets(Object.keys(story.assets));
  if (!problem) pruneAssets(new Set(Object.keys(story.assets)));

  // 2. State.
  const store = createStore(story);
  if (story.blocks[0]) store.select(story.blocks[0].id);

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

  // 3. Panels.
  mountToolbar(store, { undoBtn: $('undo'), redoBtn: $('redo'), newBtn: $('new-story'), announce });
  const inspector = mountInspector($('inspector'), store, { importFiles, assetUrl, announce });
  mountBlockList($('blocks'), store, { announce, toast, onAdded: () => inspector.focusFirstField() });
  mountPreview($('preview-frame'), store, { assetUrl });
  mountFileMenu(store, {
    exportBtn: $('export'), menu: $('export-menu'), openBtn: $('open'), getBlob, announce, toast,
    setStatus: (text) => { statusLine.textContent = text; },
  });

  startAutosave(store, savers, {
    getBlob,
    onStatus: (state, detail) => {
      statusLine.textContent = saveStatusText(state, detail);
      if (state === 'error') toast(`Your latest changes couldn't be saved: ${detail?.message || 'storage error'}`, { tone: 'warning' });
    },
  });
  if (savers.length) statusLine.textContent = story.blocks.length ? 'Story restored from this browser' : '';
  document.documentElement.dataset.ready = 'true';
}

boot().catch((err) => {
  console.error(err);
  const status = $('app-status');
  if (status) status.textContent = `Illuminate couldn't start: ${err.message}`;
});
