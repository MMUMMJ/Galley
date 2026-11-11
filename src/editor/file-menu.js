// Export menu (built from the adapter registry) and Open.
import { ADAPTERS } from '../adapters/registry.js';
import { formatMB } from '../adapters/export-shared.js';
import { exportBytes } from '../checks/export-size.js';
import { openFile, openFolderAt } from '../open.js';
import { putAsset } from '../assets.js';
import { syncStoryPack, getPack } from '../packs.js';
import { STORY_DETAILS } from '../store.js';
import { takeSnapshot } from '../snapshots.js';
import { h } from './dom.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// The demo story: a tour of every block, published at demo/ as a saved folder.
export const DEMO_FOLDER = 'demo/';

// fileBtn opens the File menu, which already holds New story, Open… and the demo; exporters are
// added after them. Returns { openDemo, exportZip }. unstored(names): files the browser wouldn't keep.
export function mountFileMenu(store, { fileBtn: exportBtn, menu, openBtn, demoBtn, getBlob, announce, toast, alert = () => {}, setStatus, unstored = () => {} }) {
  const exporters = Object.values(ADAPTERS.exporters);
  const prepSummary = h('p', { class: 'export-prep-size' });
  const appendixCheck = h('input', {
    type: 'checkbox',
    onchange: (e) => {
      store.update((s) => { s.meta.appendix = e.target.checked; }, { from: 'file-menu' });
      announce(e.target.checked ? 'Reflection and maker\'s notes appendix will be included in exports.' : 'Appendix excluded from exports.');
    },
  });
  const prepItem = h('li', { class: 'export-prep' },
    prepSummary,
    h('label', { class: 'export-prep-check' },
      appendixCheck,
      h('span', {}, 'Include reflection & maker\'s notes appendix')));

  function refreshPrep() {
    const story = store.story;
    const assets = Object.values(story.assets || {});
    const bytes = exportBytes(story);
    const limitMB = getPack().maxExportMB || 100;
    const over = bytes > limitMB * 1024 * 1024;
    const biggest = [...assets].sort((a, b) => (b.bytes || 0) - (a.bytes || 0))[0];
    const bigNote = biggest && (over || (biggest.bytes || 0) >= 10 * 1024 * 1024)
      ? ` · Largest: ${biggest.name || 'file'} (${formatMB(biggest.bytes)})`
      : '';
    prepSummary.textContent = `Export size: ~${formatMB(bytes)} (${assets.length} media file${assets.length === 1 ? '' : 's'})${bigNote}`;
    prepSummary.classList.toggle('is-over', over);
    appendixCheck.checked = story.meta.appendix === true;
  }

  menu.append(prepItem, ...exporters.map((ex) => h('li', {},
    h('button', { type: 'button', class: 'menu-option', onclick: () => run(ex) },
      h('strong', {}, `Export: ${ex.label}`), h('span', {}, ex.description)))));
  // Any button choice closes the menu (the appendix checkbox stays open so they can export next).
  menu.addEventListener('click', (e) => { if (e.target.closest('button')) close(false); });

  const close = (refocus) => {
    menu.hidden = true;
    exportBtn.setAttribute('aria-expanded', 'false');
    if (refocus) exportBtn.focus();
  };
  exportBtn.addEventListener('click', () => {
    if (!menu.hidden) return close();
    refreshPrep();
    menu.hidden = false;
    exportBtn.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
  });
  menu.addEventListener('keydown', (e) => {
    const opts = Array.from(menu.querySelectorAll('button'));
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    if (e.key === 'ArrowDown') { e.preventDefault(); opts[(i + 1) % opts.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); opts[(i - 1 + opts.length) % opts.length].focus(); }
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== exportBtn) close();
  });

  async function run(exporter) {
    close(true);
    if (!store.story.blocks.length) {
      toast('There\'s nothing to export yet. Add some blocks first.', { tone: 'warning' });
      return;
    }
    exportBtn.disabled = true;
    setStatus('Exporting…');
    announce('Exporting. This can take a moment for big files.');
    try {
      const { blob, filename, warnings } = await exporter.export(store.story, {
        getBlob,
        onProgress: (done, total) => setStatus(`Exporting… ${done} of ${total}`),
      });
      download(blob, filename);
      window.dispatchEvent(new CustomEvent('galley:exported', { detail: { filename } }));
      const done = `Exported ${filename} (${formatMB(blob.size)}). Look in your Downloads folder.`;
      toast([done, ...warnings].join(' '), { tone: warnings.length ? 'warning' : undefined });
      setStatus(`Exported at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (err) {
      console.error(err);
      toast(`Export failed: ${err.message}`, { tone: 'warning' });
      setStatus('Export failed');
    } finally {
      exportBtn.disabled = false;
    }
  }

  const input = h('input', {
    type: 'file', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true',
    accept: '.zip,.html,.htm,.json,application/zip,application/x-zip-compressed,text/html,application/json',
    onchange: async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) await open(file);
    },
  });
  openBtn.after(input);
  const replaceOk = (what) => !store.story.blocks.length || window.confirm(`Open ${what}?\n\nIt will replace the story you are working on. `
    + 'You can bring the current one back with Undo until you close or reload this page.');
  openBtn.addEventListener('click', () => { if (replaceOk('a story')) input.click(); });

  // Opens the demo story in the editor, to explore and change.
  async function openDemo() {
    if (!replaceOk('the demo story')) return;
    await open({ name: 'the demo story', read: () => openFolderAt(DEMO_FOLDER) });
  }
  demoBtn?.addEventListener('click', openDemo);

  // file: a File the student picked, or { name, read() } for a story fetched from the web.
  async function open(file) {
    setStatus(`Opening ${file.name}…`);
    try {
      const { story, blobs, missing, errors = [] } = await (file.read ? file.read() : openFile(file));
      try {
        await syncStoryPack(story);
      } catch (err) {
        toast(`${err.message} Carrying on without a pack.`, { tone: 'warning' });
      }
      await takeSnapshot(store.story, `Before opening ${file.name}`).catch(() => {});
      const lost = [];
      for (const [id, blob] of blobs) if (!(await putAsset(id, blob))) lost.push(story.assets[id]?.name || id);
      store.update(() => story, { select: story.blocks[0]?.id ?? STORY_DETAILS, from: 'open', keepModified: true });
      const title = story.meta.title || story.blocks.find((b) => b.type === 'header')?.data.title || file.name;
      const note = missing.length
        ? ` ${missing.length} media file${missing.length === 1 ? ' is' : 's are'} missing: ${missing.join(', ')}. Open the ZIP rather than index.html to bring them in.`
        : '';
      toast(`Opened "${title}".${note}`, { tone: missing.length ? 'warning' : undefined });
      announce(`Opened ${title}.`);
      unstored(lost);
      // Problems Galley couldn't repair on opening: said plainly, and kept on screen until read.
      alert('repair', null);
      if (errors.length) {
        const where = (e) => { const m = /^blocks\[(\d+)\]/.exec(e.path || ''); return `${m ? `Block ${Number(m[1]) + 1}: ` : ''}${e.message}`; };
        alert('repair', `"${title}" opened, but ${errors.length === 1 ? 'one thing in it looks' : `${errors.length} things in it look`} wrong: ${errors.slice(0, 3).map(where).join(' ')}${errors.length > 3 ? ' …' : ''} Check the story before you carry on, and keep the file you opened: it hasn't been changed.`,
          { action: 'OK', onAction: () => alert('repair', null) });
      }
    } catch (err) {
      toast(`Couldn't open ${file.name}: ${err.message}`, { tone: 'warning' });
    } finally {
      setStatus('');
    }
  }
  return { openDemo, exportZip: () => run(ADAPTERS.exporters.zip) };
}
