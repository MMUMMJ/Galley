# Illuminate: build plan (greenfield)

*Illuminate is a scrollytelling editor for journalism students at Manchester Metropolitan University (MMU). It replaces Shorthand.*

Put this file in the root of a **new, empty** repo. Work through it **one phase per session**. At the end of each phase, stop, summarise what changed, and list anything that fell short of the acceptance criteria. Don't start the next phase until the user says so.

## What this is
Students build feature articles and reflective process portfolios, then export a self-contained package to submit through Moodle, where links aren't allowed.

**First principle: industry-facing pedagogy.** The editor should feel like newsroom practice: structured content, the fields journalists actually fill in, and showpiece blocks that teach a technique. Saving, exporting and submission are **adapters** at the edge. They never shape the core.

An earlier prototype ("Story Studio" v0.2, a single `index.html`) may be supplied in `reference/`. **Read it for reference only.** Its hand-rolled ZIP writer and `IntersectionObserver` pattern are worth looking at. Do not copy its structure.

## Architecture
Illuminate is two separate things:

1. **The editor.** The authoring app, hosted on GitHub Pages. Plain ES modules in `src/`, with no build step and no dependencies. Each file should stay under roughly 400 lines.
2. **The runtime.** A small, stable renderer (`runtime/illuminate-runtime.js` + `runtime/illuminate.css`) that turns story JSON into the reader-facing page. **The exporter inlines the runtime into every export.** A submitted story therefore never depends on the live site, which is essential for retaining assessed work. The runtime is versioned (`RUNTIME_VERSION`) and changes rarely. The editor's preview uses the same runtime, so what students see is what gets submitted.

```
/index.html               editor shell
/src/
  model.js                story schema, defaults, validation, migrations (schemaVersion)
  store.js                in-memory state + undo
  blocks/                 one module per block type: {type, label, defaults, editorUI, validate, prompt}
  editor/                 block list, inspector, metadata panel, checks panel, toolbar
  adapters/
    registry.js           ADAPTERS = { exporters: {}, savers: {} }
    save-indexeddb.js
    save-folder.js        (Phase 9)
    export-zip.js
    export-html.js
  checks/                 one module per check
  packs.js                load + apply prompt packs
/runtime/
  illuminate-runtime.js
  illuminate.css
/packs/
  digital-publishing.json
  advanced-storytelling.json
/test/
  fixtures/               sample stories (clean + deliberately flawed)
  runtime.html            opens fixtures through the runtime
```

## Hard constraints (never break these)
1. **No dependencies, no build step, no CDN, no frameworks.** Vanilla JavaScript (ES2020+), HTML and CSS.
2. **No backend, no network calls, no analytics, no accounts.** Student data leaves the browser only as files the student saves themselves.
3. **Exports work offline** from an unzipped folder opened via `file://`, in current Edge, Chrome, Safari and Firefox. Exports contain no third-party scripts. Embeds are link cards with an archived screenshot; only YouTube, Vimeo, Spotify and SoundCloud get inline iframes.
4. **The story is data.** Every export contains the story JSON (`<script type="application/json" id="illuminate-source">`) and can be re-opened in the editor. The JSON includes `schemaVersion` and `runtimeVersion`.
5. **Accessibility:**
   - every action works from the keyboard;
   - visible focus;
   - every drag action also has a button;
   - nothing in the editor appears only on hover;
   - `prefers-reduced-motion` turns off every animation in both the editor and the export;
   - no effect hides content;
   - alt text is stored separately from the caption;
   - semantic HTML in the export (`article`, `figure`, `figcaption`, headings in order).
6. **No scrolljacking.** Use CSS `position: sticky` and `IntersectionObserver` only.
7. **iPad support:** the editor must be fully usable in iPad Safari (touch, on-screen keyboard), even where some adapters aren't available.
8. Don't change code outside the phase you're working on.

## Story model (Phase 1 defines it; later phases extend it)
```json
{
  "schemaVersion": 1,
  "runtimeVersion": "1.0.0",
  "meta": { "title": "", "standfirst": "", "byline": "", "seoTitle": "", "seoDescription": "",
            "shareImage": null, "shareText": "", "pack": null, "created": "", "modified": "" },
  "blocks": [ { "id": "b_xxx", "type": "text", "effect": "none", "note": "", "data": {} } ],
  "assets": { "a_xxx": { "name": "", "mime": "", "bytes": 0, "alt": "", "caption": "", "credit": "", "licence": "" } },
  "reflection": [ { "q": "", "a": "" } ]
}
```
Assets are stored as Blobs in IndexedDB and referenced by ID. They are never base64-encoded in the JSON, except in the single-file HTML export.

## Phase 0: scaffold
- Set up the repo structure above, an `index.html` shell, a `README.md`, a `.nojekyll` file, and a GitHub Pages-ready layout.
- **Acceptance:** opening `index.html` in a browser (or from Pages) shows an empty editor shell with no console errors.

## Phase 1: model + runtime (the reader-facing page first)
- Write `model.js`: the schema, defaults, validation and a migration hook.
- Write the runtime. It renders a story object into a page for these blocks: **header** (full-screen or compact; one compact header per article in a portfolio), **text** (a mini-markdown subset: paragraphs, `##` headings, bold, italic, links, lists), **quote**, **media** (image, video or audio; column, wide or full width), **gallery** (grid with a keyboard-accessible lightbox), **embed**, **divider** (empty means `* * *`), and **references** (collapsible).
- Include a print stylesheet.
- Build `test/runtime.html` to render the fixtures.
- **Acceptance:** the fixtures render correctly offline, with JavaScript disabled (content still readable), in print preview, and with reduced motion on. Lighthouse accessibility scores ≥ 95 on the fixture.

## Phase 2: editor core
- Block list: add, delete, duplicate, and move up or down (buttons plus drag).
- An inspector panel for each block's fields. A live preview through the runtime.
- Media import: downscale images to 1800px (JPEG, or WebP for PNGs). Store video and audio as they are, with a size warning.
- Undo and redo.
- Autosave to IndexedDB through the saver adapter interface. Build `adapters/registry.js` now, with `save-indexeddb.js` as the first saver.
- **Acceptance:** a full story can be built, edited, reordered and recovered after a page reload. Everything works by keyboard and on iPad.

## Phase 3: exporters + open
- **ZIP exporter.** Hand-written ZIP writer with stored (uncompressed) entries. Output: `index.html` (runtime inlined, plus the story JSON), `assets/` with the original files, and `README.txt` (how to open it, plus the story's word and asset counts).
- **Single-file HTML exporter.** Everything inlined. Warn when the result is over 25 MB.
- **Open.** Accept an Illuminate ZIP, an Illuminate HTML file, or a ZIP that was unzipped and re-zipped with compression on Windows or Mac, including when everything is nested inside a folder. Use `DecompressionStream('deflate-raw')` to read compressed entries.
- Build the export menu from the adapter registry.
- **Acceptance:** export, delete the local copy, then re-open the file: the story is identical. The exported folder works offline in all four browsers.

## Phase 4: newsroom metadata
- A metadata panel with:
  - title;
  - standfirst;
  - byline;
  - SEO title (live character count, flag above 60);
  - SEO description (flag above 155);
  - share image (chosen from the story's assets);
  - share text.
- Per-asset fields: alt text, caption, credit, and licence (Own work / CC BY / CC BY-SA / CC BY-NC / OGL / Used with permission / Other).
- The export writes `<title>`, a meta description, Open Graph tags and Twitter-card tags.
- **Acceptance:** the exported `<head>` is valid and complete, and the metadata round-trips through export and open.

## Phase 5: showpiece blocks (pedagogically useful bells and whistles)
Every block needs a craft prompt, a required "craft field", and must work offline in the export.
- **Scroll sequence.** Sticky media plus text steps, overlay or side-by-side (side-by-side is the default). **Every step must have text.**
- **Before/after slider.**
  - Two images, each with a **required label or date** and a credit.
  - The control is an `<input type="range">`.
  - With reduced motion on, show the two images side by side instead.
- **Big number.**
  - Fields: value, unit, context line, and a **required source** (name plus URL or reference).
  - Counts up when it scrolls into view; under reduced motion it shows the final value straight away.
  - The editor shows an "unsourced" badge until the source is filled in.
- **Acceptance:** each block works in the editor, in the export, by keyboard, under reduced motion, and when re-opened.

## Phase 6: effects layer
- Add a per-block `effect` field: `none`, `fade`, `rise`, `slide` or `zoom`. CSS only, triggered by the runtime's IntersectionObserver.
- Show the chosen effect as a badge on the block in the editor.
- Choosing an effect opens an optional note prompt: "What does this movement do for the reader?"
- Content must be visible without JavaScript and under reduced motion.
- **Acceptance:** effects run in the export and switch off under reduced motion. No content is ever hidden.

## Phase 7: pedagogy layer + prompt packs
- Craft prompts: one per block type, shown above the block's fields.
- A maker's note on every block (on or off per pack).
- Story-level reflection questions.
- An optional maker's notes appendix in the export.
- Pack schema. Every key is optional; a pack is loaded with `?pack=packs/x.json`:
```json
{ "name": "", "blocks": ["header","text","..."], "prompts": {}, "reflection": [],
  "includeNotes": true, "skeleton": [ { "type": "header" }, { "type": "text", "heading": "" } ],
  "effectNotes": "optional", "sourcing": "inline", "requireShowpiece": 0, "maxExportMB": 100 }
```
- `skeleton` pre-populates the story only when the story is empty.
- Write two packs:
  - `digital-publishing.json`: editorial work, no scroll sequence, `sourcing: "inline"`, effect notes optional.
  - `advanced-storytelling.json`: all blocks, a portfolio skeleton (Idea & inspirations → Audience / research → Planning & technical practice → Post-production → Reflection → References), `includeNotes: false`, `effectNotes: "required"`, `sourcing: "both"`.
- **Acceptance:** each pack produces the right skeleton, block menu and prompts.

## Phase 8: checks (prompts, not marks)
Show the checks in a panel. Each item jumps to its block. The wording asks a question and never says "error". Each check lives in its own module.
- Media with no alt text, credit or licence.
- **Search-results links**, e.g. `google.*/search`, `bing.com/search`, `duckduckgo.com/?q`. Message: "This is a search results page, not a source."
- **Citation matching:** author–year citations in the text, e.g. `(Smith 2021)`, `Smith (2021)`, `(Smith and Jones, 2021, p.4)`, compared against the References entries. Report citations with no reference and references never cited. Match on surname plus year.
- **Statistics with no source:** a heuristic. Flag a sentence containing a percentage or a large number ("million", "billion", or digits ≥1,000) with no link or citation in the same sentence. Frame it as "Where's this figure from?"
- A big number with no source; a before/after side with no label.
- **Effects mirror:** a neutral count, e.g. "9 effects across 12 blocks; 6 on images with no caption". If the pack requires effect notes, list the effects that have none.
- **Video likely to play badly on Windows:** `.mov` files, or a weak `canPlayType` result. Suggest the iPhone "Most Compatible" setting or converting the file first.
- Long runs of text with no break; scroll steps that are too long.
- Total export size against the pack's `maxExportMB`.
- **Acceptance:** every check fires on `test/fixtures/flawed.json` and stays silent on `clean.json`.

## Phase 9: folder saver (adapter)
- Use `showDirectoryPicker()`. The student picks a folder (intended to be inside their synced OneDrive folder). Autosave the **unzipped** project there: `index.html`, `story.json` and `assets/`.
  - Debounce writes. Only write assets that have changed.
  - Store the directory handle in IndexedDB, and ask for permission again (`queryPermission` / `requestPermission`) when needed.
- Detect support. Without the API (Safari, iPad, Firefox), hide the option and show: "To save straight to your OneDrive folder, use Chrome or Edge. Until then, Export is your save."
- Show "Last saved to folder" and "Last exported" times in the header, with a nudge when the last export is more than 3 days old.
- Call `navigator.storage.persist()` on first use.
- **Acceptance:** works in Edge and Chrome; Safari and iPad show the fallback; a saved folder re-opens as a project.

## Phase 10 (optional): installable editor
- Add `manifest.webmanifest` and a service worker so the editor works offline once loaded, and can be added to the home screen. Home-screen web apps may be less exposed to Safari clearing a site's stored data. **Test this on iPad; don't assume it.**
- **Cache strategy:** network-first for `index.html` and `src/`, falling back to the cache when offline. Each release bumps `CACHE_VERSION`. When a new version is detected, show a banner: "A new version of Illuminate is available — reload". Never leave students silently on a stale build.
- Never cache student data in the service worker. That stays in IndexedDB and the student's saved files.
- **Acceptance:** after one online visit, the editor loads with the network off. A new deploy is picked up on the next reload.

## Parked (don't build)
- Audio quote, timeline and annotated-image (hotspots) blocks.
- Pan-and-zoom scroll sequences.
- DropZip, the marking viewer.
- Group editing.

## Manual test matrix (the user runs this after Phase 9)
Each run uses a story with a video: build, save, re-open on a second machine, export, and submit to Moodle.
1. Windows, Edge, OneDrive
2. Mac, Chrome, OneDrive (Files On-Demand on)
3. Mac, Safari (export fallback)
4. iPad, Safari (export to OneDrive via the Files app)
5. Corporate PC, Edge (profile wiped at logout)
