// Folder saving controls (Chrome and Edge), the "Last saved to folder" and
// "Last exported" lines, and a nudge when the last export is over 3 days old.
import {
  folderSupported, folderStatus, onFolderStatus, restoreFolder, pickFolder, inspectFolder,
  readProject, connectFolder, disconnectFolder, reconnectFolder, saveFolderNow,
} from '../adapters/save-folder.js';
import { getSettings, setSetting } from '../settings.js';
import { putAsset, getBlob } from '../assets.js';
import { syncStoryPack } from '../packs.js';
import { STORY_DETAILS } from '../store.js';
import { h } from './dom.js';

export const UNSUPPORTED = 'To save straight to your OneDrive folder, use Chrome or Edge. Until then, Export is your save.';
const DAY = 24 * 60 * 60 * 1000;
const NUDGE_DAYS = 3;

export function ago(date) {
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((startOfDay(new Date()) - startOfDay(date)) / DAY);
  if (days <= 0) return `today at ${time}`;
  if (days === 1) return `yesterday at ${time}`;
  if (days < 7) return `${days} days ago`;
  return `on ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// A small accessible choice dialog. Resolves with the chosen value, or 'cancel' on Esc.
function ask(dialog, message, choices) {
  return new Promise((resolve) => {
    const done = (value) => { dialog.close(); resolve(value); };
    dialog.replaceChildren(
      h('p', { id: 'choice-message' }, message),
      h('div', { class: 'button-row' }, choices.map(([value, label], i) => h('button', {
        type: 'button', class: `btn${i === 0 ? ' btn-primary' : ''}`, onclick: () => done(value),
      }, label))));
    dialog.setAttribute('aria-labelledby', 'choice-message');
    dialog.addEventListener('cancel', () => resolve('cancel'), { once: true });
    dialog.showModal();
  });
}

let persistAsked = false;
async function askToPersist() {
  if (persistAsked) return;
  persistAsked = true; // set before any await, so two quick calls can't both ask
  const s = await getSettings();
  if (s.persistAsked || !navigator.storage || typeof navigator.storage.persist !== 'function') return;
  await setSetting('persistAsked', true);
  try { await navigator.storage.persist(); } catch { /* the browser said no; the folder and exports still protect the work */ }
}

export async function mountFolder(store, { wrap, button, menu, folderLine, exportLine, exportButton, dialog, announce, toast }) {
  // ---- Last exported, with a nudge after 3 days
  async function renderExport() {
    if (!store.story.blocks.length) { exportLine.replaceChildren(); return; }
    const s = await getSettings();
    const at = s.exportedAt ? new Date(s.exportedAt) : null;
    const since = at || new Date(Date.parse(store.story.meta.created) || Date.now());
    const stale = Date.now() - since.getTime() > NUDGE_DAYS * DAY;
    exportLine.classList.toggle('is-nudge', stale);
    exportLine.replaceChildren(
      at ? `Last exported ${ago(at)}.` : 'Not exported yet.',
      stale ? ' ' : '',
      stale ? h('button', {
        type: 'button', class: 'link-button',
        // Stop this click reaching the page, which would close the menu it opens.
        onclick: (e) => { e.stopPropagation(); exportButton.click(); },
      }, 'Export a copy to keep it safe') : '');
  }
  window.addEventListener('galley:exported', async () => {
    await setSetting('exportedAt', new Date().toISOString());
    renderExport();
  });
  let hadBlocks = store.story.blocks.length > 0;
  store.subscribe((change) => {
    if (change.type === 'select') return;
    // A different story (New story, or Open… a file) must never overwrite the folder's story.
    if ((change.from === 'toolbar' || change.from === 'open') && folderSupported() && folderStatus().connected) {
      const { name } = folderStatus();
      disconnectFolder();
      toast(`Stopped saving to "${name}", so this story doesn't replace the one saved there. Use Save to folder… to choose a folder for it.`, { tone: 'warning' });
    }
    const has = store.story.blocks.length > 0;
    if (has) askToPersist(); // first use: ask the browser not to clear this site's storage
    if (has !== hadBlocks || change.from === 'open' || change.from === 'open-folder') renderExport();
    hadBlocks = has;
  });
  renderExport();
  if (hadBlocks) askToPersist();
  setInterval(() => { renderExport(); renderFolder(folderStatus()); }, 60 * 1000);

  // ---- Folder saving
  if (!folderSupported()) {
    wrap.hidden = true;
    folderLine.textContent = UNSUPPORTED;
    folderLine.classList.add('is-note');
    return;
  }
  wrap.hidden = false;

  function renderFolder(st) {
    button.classList.toggle('btn-warn', st.connected && st.permission !== 'granted');
    if (!st.connected) {
      button.textContent = 'Save to folder…';
      button.removeAttribute('aria-expanded');
      folderLine.textContent = '';
      return;
    }
    if (st.permission !== 'granted') {
      button.textContent = 'Reconnect folder';
      button.removeAttribute('aria-expanded');
      folderLine.textContent = `Saving to "${st.name}" is paused until you reconnect the folder.`;
      return;
    }
    button.textContent = `Folder: ${st.name}`;
    button.setAttribute('aria-expanded', String(!menu.hidden));
    folderLine.textContent = st.error || (st.saving ? `Saving to "${st.name}"…`
      : st.lastSaved ? `Last saved to folder ${ago(st.lastSaved)}.` : `Saving to "${st.name}".`);
    folderLine.classList.toggle('is-problem', Boolean(st.error));
  }

  async function choose() {
    let handle;
    try { handle = await pickFolder(); } catch (err) {
      if (err.name !== 'AbortError') toast(`Couldn't open that folder: ${err.message}`, { tone: 'warning' });
      return;
    }
    const info = await inspectFolder(handle);
    if (info.hasStory) {
      const choice = await ask(dialog,
        `"${handle.name}" already has a Galley story${info.title ? `: "${info.title}"` : ''}. What would you like to do?`,
        [['open', 'Open that story'], ['replace', 'Save my current story there instead (replaces it)'], ['cancel', 'Cancel']]);
      if (choice === 'open') return openFrom(handle);
      if (choice !== 'replace') return;
    } else if (info.otherFiles) {
      const choice = await ask(dialog,
        `"${handle.name}" already has ${info.otherFiles} other item${info.otherFiles === 1 ? '' : 's'} in it. Galley will add index.html, story.json and an assets folder. A new, empty folder for each story keeps things tidy.`,
        [['use', 'Use this folder anyway'], ['cancel', 'Choose a different folder']]);
      if (choice !== 'use') return;
    }
    await connectFolder(handle);
    await saveFolderNow(store.story, getBlob);
    askToPersist();
    toast(`Saving to "${handle.name}". Every change is saved there as well as in this browser.`);
    announce(`Saving to the folder ${handle.name}.`);
  }

  // Re-opens a saved folder as the current project.
  async function openFrom(handle) {
    try {
      const { story, blobs, missing } = await readProject(handle);
      try {
        await syncStoryPack(story);
      } catch (err) {
        toast(`${err.message} Carrying on without a pack.`, { tone: 'warning' });
      }
      for (const [id, blob] of blobs) await putAsset(id, blob);
      store.update(() => story, { select: story.blocks[0]?.id ?? STORY_DETAILS, from: 'open-folder', keepModified: true });
      await connectFolder(handle);
      toast(`Opened the story in "${handle.name}" and saving there.${missing.length ? ` ${missing.length} media file(s) are missing from its assets folder: ${missing.join(', ')}.` : ''}`,
        { tone: missing.length ? 'warning' : undefined });
    } catch (err) {
      toast(`Couldn't open the story in "${handle.name}": ${err.message}`, { tone: 'warning' });
    }
  }

  const closeMenu = (refocus) => {
    menu.hidden = true;
    renderFolder(folderStatus());
    if (refocus) button.focus();
  };
  menu.replaceChildren(...[
    ['Save now', async () => { closeMenu(true); await saveFolderNow(store.story, getBlob); }],
    ['Use a different folder…', async () => { closeMenu(true); await choose(); }],
    ['Stop saving to this folder', async () => {
      closeMenu(true);
      await disconnectFolder();
      toast('Stopped saving to the folder. Your story is still saved in this browser, and the folder keeps the last copy.');
    }],
  ].map(([label, run]) => h('li', {}, h('button', { type: 'button', class: 'menu-option', onclick: run }, h('strong', {}, label)))));

  button.addEventListener('click', async () => {
    const st = folderStatus();
    if (!st.connected) return choose();
    if (st.permission !== 'granted') {
      if (await reconnectFolder()) {
        await saveFolderNow(store.story, getBlob);
        announce('Folder reconnected.');
      }
      return;
    }
    menu.hidden = !menu.hidden;
    renderFolder(st);
    if (!menu.hidden) menu.querySelector('button').focus();
  });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); } });
  document.addEventListener('click', (e) => { if (!menu.hidden && !wrap.contains(e.target)) closeMenu(false); });

  onFolderStatus(renderFolder);
  await restoreFolder();
}
