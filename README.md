# Illuminate

A scrollytelling editor for journalism students at Manchester Metropolitan University. Students build feature articles and reflective process portfolios, then export a self-contained package to submit through Moodle.

The build is planned phase by phase in [BUILD-PLAN.md](BUILD-PLAN.md).

## Status

- Phase 1 (model + runtime): the story model (`src/model.js`) and the reader-facing renderer (`runtime/`).
- Phase 2 (editor core): build, edit and reorder blocks, import media, undo and redo, live preview, autosave to this browser.
- Phase 3 (export + open): export a ZIP or a single web page; open either one again to keep editing.
- Phase 4 (newsroom metadata): Story details panel (title, standfirst, byline, SEO title and description, share image and text); exports write `<title>`, description, Open Graph and Twitter-card tags.
- Phase 5 (showpiece blocks): scroll sequence, before/after slider and big number, each with a craft prompt and required fields. Every effect is optional: without JavaScript, in print and with reduced motion the content is all there.

## Test the runtime

Serve the folder (below) and open <http://localhost:8000/test/runtime.html>. Pick a fixture to render it through the runtime. The page also shows any problems `src/model.js` finds in the fixture.

- **Open as exported page** builds the page the way an export will: CSS and runtime inlined, story JSON embedded.
- **Open exported page without JavaScript** builds the same page with no script, to check that the content still reads. Use it for print preview too.

Mini-markdown in text blocks: each line is a paragraph; `## ` and `### ` start headings; `- ` and `1. ` start list items; `**bold**`, `*italic*`, `[text](https://…)`, and bare `https://` links.

## Run it locally

The editor uses ES modules, which Chrome and Edge refuse to load from a `file://` page. Serve the folder instead:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

The editor saves to this browser automatically. **Export** is how a student keeps a copy and submits: the ZIP is best for Moodle; the single web page is handy for short stories without video. **Open…** brings either one back into the editor. To start again, use **New story** (you can undo it until you reload).

(Exported stories are different: they are built to open straight from `file://`.)

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.

`.nojekyll` stops Pages running Jekyll, so files and folders are served exactly as they are.

## Layout

```
index.html          editor shell
src/                editor (plain ES modules, no build step)
  main.js           entry point: loads the saved story, wires up the panels
  model.js          story schema, defaults, validation, migrations
  store.js          in-memory state with undo and redo
  db.js             IndexedDB wrapper
  assets.js         asset files (Blobs) in IndexedDB
  media.js          image downscaling, video and audio checks
  zip-write.js      hand-written ZIP writer (stored entries)
  zip-read.js       ZIP reader (stored or deflate, ZIP64)
  open.js           opens an exported ZIP, HTML page or story JSON
  blocks/           one module per block type
  editor/           editor UI panels and styles
  adapters/         savers and exporters
  checks/           one module per check
runtime/            reader-facing renderer, inlined into every export
packs/              prompt packs
test/fixtures/      sample stories
```

## Rules

- No dependencies, build step, CDN or frameworks.
- No backend, network calls, analytics or accounts.
- Every action works by keyboard and on iPad Safari.

See BUILD-PLAN.md for the full set of constraints.
