// Test harness for test/runtime.html: renders fixtures through the runtime
// and reports what src/model.js thinks of them.
import { load, RUNTIME_VERSION as MODEL_RUNTIME_VERSION } from '../src/model.js';

const FIXTURES = { feature: 'Feature article', portfolio: 'Process portfolio', showpiece: 'Showpiece blocks', effects: 'Effects', 'edge-cases': 'Edge cases' };
const $ = (id) => document.getElementById(id);
const R = window.Illuminate;
let story = null;

const assetUrl = (id, asset) => new URL('fixtures/' + R.assetPath(id, asset), location.href).href;

async function text(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function report(errors, warnings) {
  const versionOk = R.RUNTIME_VERSION === MODEL_RUNTIME_VERSION;
  const list = (items, cls) => (items.length
    ? `<ul class="${cls}">${items.map((e) => `<li><code>${esc(e.path)}</code> ${esc(e.message)}</li>`).join('')}</ul>` : '');
  $('t-summary').textContent = `Model checks: ${errors.length} errors, ${warnings.length} warnings`
    + (versionOk ? '' : ' · RUNTIME VERSION MISMATCH');
  $('t-report-body').innerHTML =
    `<p class="${versionOk ? 't-ok' : 't-bad'}">Runtime ${esc(R.RUNTIME_VERSION)}; model expects ${esc(MODEL_RUNTIME_VERSION)}.</p>`
    + list(errors, 't-bad') + list(warnings, 't-warn')
    + (errors.length + warnings.length ? '' : '<p class="t-ok">No structural problems.</p>');
}

async function show(name) {
  try {
    const raw = JSON.parse(await text(`fixtures/${name}.json`));
    const result = load(raw);
    story = result.story;
    report(result.errors, result.warnings);
    const mode = $('t-preview').checked ? 'preview' : 'export';
    $('t-story').innerHTML = R.renderArticle(story, { assetUrl, mode });
    R.enhance($('t-story'));
    document.title = `${FIXTURES[name]} · Illuminate runtime fixtures`;
    history.replaceState(null, '', `?fixture=${encodeURIComponent(name)}`);
  } catch (e) {
    $('t-story').innerHTML = `<p class="t-bad" style="padding:16px">Could not load fixture: ${esc(e.message)}</p>`;
  }
}

// Builds the page exactly as an export would (CSS and, optionally, the runtime inlined).
async function openStatic(withJs) {
  if (!story) return;
  const tab = window.open('', '_blank');
  const [css, js] = await Promise.all([
    text('../runtime/illuminate.css'),
    withJs ? text('../runtime/illuminate-runtime.js') : Promise.resolve(undefined),
  ]);
  const html = R.renderDocument(story, { css, js, assetUrl });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  if (tab) tab.location.href = url; else location.href = url;
}

const select = $('t-fixture');
select.innerHTML = Object.entries(FIXTURES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
const requested = new URLSearchParams(location.search).get('fixture');
select.value = Object.hasOwn(FIXTURES, requested) ? requested : 'feature';
select.addEventListener('change', () => show(select.value));
$('t-preview').addEventListener('change', () => show(select.value));
$('t-static').addEventListener('click', () => openStatic(true));
$('t-nojs').addEventListener('click', () => openStatic(false));
show(select.value);
