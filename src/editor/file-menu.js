// Export menu (built from the adapter registry) and Open.
import { ADAPTERS } from '../adapters/registry.js';
import { formatMB } from '../adapters/export-shared.js';
import { openFile } from '../open.js';
import { putAsset } from '../assets.js';
import { h } from './dom.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function mountFileMenu(store, { exportBtn, menu, openBtn, getBlob, announce, toast, setStatus }) {
  const exporters = Object.values(ADAPTERS.exporters);
  menu.replaceChildren(...exporters.map((ex) => h('li', {},
    h('button', { type: 'button', class: 'menu-option', onclick: () => run(ex) },
      h('strong', {}, ex.label), h('span', {}, ex.description)))));

  const close = (refocus) => {
    menu.hidden = true;
    exportBtn.setAttribute('aria-expanded', 'false');
    if (refocus) exportBtn.focus();
  };
  exportBtn.addEventListener('click', () => {
    if (!menu.hidden) return close();
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
      window.dispatchEvent(new CustomEvent('illuminate:exported', { detail: { filename } }));
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
  openBtn.addEventListener('click', () => {
    if (store.story.blocks.length && !window.confirm('Open a story?\n\nIt will replace the story you are working on. '
      + 'You can bring the current one back with Undo until you close or reload this page.')) return;
    input.click();
  });

  async function open(file) {
    setStatus(`Opening ${file.name}…`);
    try {
      const { story, blobs, missing } = await openFile(file);
      for (const [id, blob] of blobs) await putAsset(id, blob);
      store.update(() => story, { select: story.blocks[0]?.id ?? null, from: 'open', keepModified: true });
      const title = story.meta.title || story.blocks.find((b) => b.type === 'header')?.data.title || file.name;
      const note = missing.length
        ? ` ${missing.length} media file${missing.length === 1 ? ' is' : 's are'} missing: ${missing.join(', ')}. Open the ZIP rather than index.html to bring them in.`
        : '';
      toast(`Opened "${title}".${note}`, { tone: missing.length ? 'warning' : undefined });
      announce(`Opened ${title}.`);
    } catch (err) {
      toast(`Couldn't open ${file.name}: ${err.message}`, { tone: 'warning' });
    } finally {
      setStatus('');
    }
  }
}
