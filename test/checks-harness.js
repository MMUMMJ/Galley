// Runs every check over the flawed and clean fixtures (Phase 8 acceptance test).
import { load } from '../src/model.js';
import { normalisePack, isPackPath } from '../src/packs.js';
import { runChecks, CHECKS } from '../src/checks/index.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const probe = document.createElement('video');
const canPlayType = (mime) => probe.canPlayType(mime);

async function run(name) {
  const { story } = load(await (await fetch(`fixtures/${name}.json`)).json());
  let pack = normalisePack({});
  if (isPackPath(story.meta.pack)) {
    // Packs live at the site root; this page is in test/.
    pack = normalisePack(await (await fetch(`../${story.meta.pack}`)).json(), story.meta.pack);
  }
  return runChecks(story, { pack, canPlayType });
}

async function main() {
  const [flawed, clean] = await Promise.all([run('flawed'), run('clean')]);
  let failures = 0;
  document.getElementById('rows').innerHTML = CHECKS.map((c) => {
    const f = flawed.find((r) => r.id === c.id).items;
    const k = clean.find((r) => r.id === c.id).items;
    const ok = f.length > 0 && k.length === 0;
    if (!ok) failures++;
    return `<tr><th scope="row">${esc(c.title)}</th>
      <td class="${ok ? 'pass' : 'fail'}">${ok ? 'Pass' : 'Fail'}</td>
      <td><ul>${f.map((i) => `<li>${esc(i.message)}</li>`).join('') || '<li>(nothing asked)</li>'}</ul></td>
      <td>${k.length ? `<ul>${k.map((i) => `<li>${esc(i.message)}</li>`).join('')}</ul>` : 'Silent'}</td></tr>`;
  }).join('');
  document.getElementById('summary').textContent = failures
    ? `${failures} of ${CHECKS.length} checks didn't behave as expected.`
    : `All ${CHECKS.length} checks pass: each asks about flawed.json and is silent on clean.json.`;
}

main().catch((e) => { document.getElementById('summary').textContent = `Couldn't run: ${e.message}`; });
