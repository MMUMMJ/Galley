import { blockDefaults } from '../model.js';
import { h } from '../editor/dom.js';
import { selectInput, checkbox, assetPicker, help, nested } from '../editor/fields.js';
import { richText, plainText } from '../editor/rich-text.js';
import { imageDetails } from '../editor/inline-images.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, Math.round(n * 10) / 10));

// Visual crop/highlight picker on the block's image, plus keyboard-accessible sliders.
function focusPicker(sub, ctx, stepIndex) {
  const st = sub.block.data;
  const assetId = ctx.block.data.asset;
  const url = assetId ? ctx.assetUrl(assetId) : '';
  const x = Number.isFinite(st.x) ? st.x : 40;
  const y = Number.isFinite(st.y) ? st.y : 40;
  const w = Number.isFinite(st.w) ? st.w : 30;
  const hPct = Number.isFinite(st.h) ? st.h : 30;

  const box = h('div', {
    class: 'sp-crop-box',
    style: `left:${x}%;top:${y}%;width:${w}%;height:${hPct}%`,
  });
  const stage = url ? h('div', {
    class: 'sp-crop-stage',
    title: 'Click or drag across the image to set the highlight area for this step',
  }, h('img', { src: url, alt: '', draggable: 'false' }), box) : null;

  const inputs = {};
  const setBox = (nx, ny, nw, nh) => {
    const cx = clamp(nx, 0, 100 - nw);
    const cy = clamp(ny, 0, 100 - nh);
    const cw = clamp(nw, 5, 100);
    const ch = clamp(nh, 5, 100);
    box.style.left = `${cx}%`;
    box.style.top = `${cy}%`;
    box.style.width = `${cw}%`;
    box.style.height = `${ch}%`;
    for (const [k, v] of [['x', cx], ['y', cy], ['w', cw], ['h', ch]]) {
      if (inputs[k]) inputs[k].value = String(Math.round(v));
    }
    sub.edit((d) => { d.x = cx; d.y = cy; d.w = cw; d.h = ch; });
  };

  if (stage) {
    let start = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.button && e.button !== 0) return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      const rect = stage.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * 100;
      const py = ((e.clientY - rect.top) / rect.height) * 100;
      start = { px, py, moved: false };
    });
    stage.addEventListener('pointermove', (e) => {
      if (!start) return;
      const rect = stage.getBoundingClientRect();
      const px = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
      const py = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
      if (Math.hypot(px - start.px, py - start.py) > 3) {
        start.moved = true;
        const left = Math.min(start.px, px);
        const top = Math.min(start.py, py);
        const width = Math.max(8, Math.abs(px - start.px));
        const height = Math.max(8, Math.abs(py - start.py));
        setBox(left, top, width, height);
      }
    });
    const finish = (e) => {
      if (!start) return;
      if (!start.moved) {
        const curW = Number(inputs.w?.value) || w;
        const curH = Number(inputs.h?.value) || hPct;
        setBox(start.px - curW / 2, start.py - curH / 2, curW, curH);
      }
      start = null;
      if (e && stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    };
    stage.addEventListener('pointerup', finish);
    stage.addEventListener('pointercancel', finish);
  }

  const slider = (key, label, min, max, val) => {
    const id = `sp-${ctx.block.id}-${stepIndex}-${key}`;
    const inp = h('input', {
      id, type: 'range', min: String(min), max: String(max), step: '1', value: String(Math.round(val)),
      'data-focus': `${sub.block.id}:${key}`,
      oninput: () => {
        const nx = Number(inputs.x.value);
        const ny = Number(inputs.y.value);
        const nw = Number(inputs.w.value);
        const nh = Number(inputs.h.value);
        setBox(nx, ny, nw, nh);
      },
    });
    inputs[key] = inp;
    return h('div', { class: 'sp-slider' }, h('label', { for: id }, label), inp);
  };

  return h('div', { class: 'sp-focus-picker' },
    stage ? h('p', { class: 'field-hint' }, 'Drag across the image (or click to centre) to choose the area to zoom in on:') : null,
    stage,
    h('div', { class: 'sp-sliders' },
      slider('x', 'Left (%)', 0, 95, x),
      slider('y', 'Top (%)', 0, 95, y),
      slider('w', 'Width (%)', 5, 100, w),
      slider('h', 'Height (%)', 5, 100, hPct)));
}

export default {
  type: 'scrollpoints',
  label: 'Scrollpoints',
  description: 'Zoom and pan across highlighted areas of one image as text steps scroll past. Showpiece.',
  defaults: () => blockDefaults('scrollpoints'),
  prompt: 'Use scrollpoints when a single detailed image — a map, diagram, document or editing timeline — rewards closer inspection step by step.',
  summary: (d) => `${(d.steps || []).length} steps · ${d.steps?.filter((s) => s && s.focus).length || 0} zoom points`,
  editorUI(el, ctx) {
    const steps = ctx.block.data.steps || [];
    const bid = ctx.block.id;
    const changeSteps = (fn, message) => {
      ctx.edit((data) => { data.steps = fn((data.steps || []).slice()); }, { rerender: true });
      ctx.announce(message);
    };
    const move = (i, delta) => changeSteps((next) => {
      const [st] = next.splice(i, 1);
      next.splice(i + delta, 0, st);
      return next;
    }, `Step moved to position ${i + delta + 1}.`);
    const moveAndFollow = (i, delta) => {
      move(i, delta);
      const to = i + delta;
      const key = (dir) => `[data-focus="${CSS.escape(`${bid}:sp-${dir}:${to}`)}"]`;
      const own = document.querySelector(key(delta < 0 ? 'up' : 'down'));
      (own && !own.disabled ? own : document.querySelector(key(delta < 0 ? 'down' : 'up')))?.focus();
    };

    el.append(
      assetPicker(ctx, 'asset', { label: 'Image to explore', kinds: ['image'] }),
      h('ol', { class: 'step-list' }, steps.map((st, i) => {
        const sub = nested(ctx, (d) => d.steps[i], `step${i}`);
        return h('li', {},
          h('fieldset', { class: 'field step-item' },
            h('legend', {}, `Step ${i + 1}`),
            richText(sub, 'text', {
              label: `Step ${i + 1} text (required)`, mode: 'blocks', images: true, rows: 3,
              hint: i === 0 ? 'Introduce the whole image first, or jump straight to a detail.' : null,
            }),
            imageDetails(sub, 'text'),
            selectInput(sub, 'align', {
              label: 'Text box position',
              fallback: 'left',
              hint: st.align === 'center' && st.focus
                ? 'A centred box can cover the highlighted area. Automatic, Left or Right keep it clear.'
                : st.focus ? 'With the box on one side, the zoom fits the highlighted area into the space beside it.' : null,
              options: [['auto', 'Automatic: away from the highlighted area'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']],
            }),
            checkbox(sub, 'focus', {
              label: 'Zoom into a highlighted area of the image on this step',
              hint: 'Leave unticked to show the full image.',
            }),
            st.focus ? focusPicker(sub, ctx, i) : null,
            h('div', { class: 'button-row' },
              h('button', { type: 'button', class: 'btn', disabled: i === 0, 'data-focus': `${bid}:sp-up:${i}`, onclick: () => moveAndFollow(i, -1) }, `Move step ${i + 1} up`),
              h('button', { type: 'button', class: 'btn', disabled: i === steps.length - 1, 'data-focus': `${bid}:sp-down:${i}`, onclick: () => moveAndFollow(i, 1) }, 'Move down'),
              h('button', {
                type: 'button', class: 'btn btn-danger', disabled: steps.length <= 1, 'data-focus': `${bid}:sp-del:${i}`,
                onclick: () => changeSteps((next) => next.filter((_, j) => j !== i), `Step ${i + 1} removed.`),
              }, 'Remove'))));
      })),
      h('button', {
        type: 'button', class: 'btn', 'data-focus': `${bid}:sp-add`,
        onclick: () => changeSteps((next) => [
          ...next,
          { text: '', align: 'auto', focus: true, x: 35, y: 35, w: 30, h: 30 },
        ], `Step ${steps.length + 1} added.`),
      }, 'Add a step'),
    );
  },
  validate: (d) => {
    const steps = d.steps || [];
    const issues = [];
    if (!d.asset) issues.push('Choose an image to explore.');
    if (steps.length < 2) issues.push('Scrollpoints need at least two steps.');
    steps.forEach((st, i) => { if (!plainText(st.text).trim()) issues.push(`Step ${i + 1} has no text. Every step needs some.`); });
    return issues;
  },
};
