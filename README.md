# Illuminate

A scrollytelling editor for journalism students at Manchester Metropolitan University. Students build feature articles and reflective process portfolios, then export a self-contained package to submit through Moodle.

The build is planned phase by phase in [BUILD-PLAN.md](BUILD-PLAN.md).

## Status

- Phase 1 (model + runtime): the story model (`src/model.js`) and the reader-facing renderer (`runtime/`).
- Phase 2 (editor core): build, edit and reorder blocks, import media, undo and redo, live preview, autosave to this browser.
- Phase 3 (export + open): export a ZIP or a single web page; open either one again to keep editing.
- Phase 4 (newsroom metadata): Story details panel (title, standfirst, byline, SEO title and description, share image and text); exports write `<title>`, description, Open Graph and Twitter-card tags.
- Phase 5 (showpiece blocks): scroll sequence, before/after slider and big number, each with a craft prompt and required fields. Every effect is optional: without JavaScript, in print and with reduced motion the content is all there.
- Phase 6 (effects): fade, rise, slide or zoom per block, run once by the runtime as the reader scrolls. Nothing is hidden without JavaScript, in print, or with reduced motion. Choosing an effect offers a note: "What does this movement do for the reader?"
- Phase 7 (pedagogy + packs): craft prompts on every block, maker's notes, reflection questions, an optional maker's notes appendix in the export, and prompt packs.
- Phase 8 (checks): a Checks panel of editor's questions (never marks), one module per check in `src/checks/`. Run <http://localhost:8000/test/checks.html> to confirm every check fires on `test/fixtures/flawed.json` and stays silent on `clean.json`.
- Phase 9 (folder saver): in Chrome and Edge, **Save to folder…** keeps an unzipped copy (`index.html`, `story.json`, `assets/`) in a folder the student chooses, ideally inside their synced OneDrive folder. Choosing a folder that already has a story offers to open it. Other browsers show: "To save straight to your OneDrive folder, use Chrome or Edge. Until then, Export is your save." The header shows when the story was last saved to the folder and last exported, and nudges after 3 days without an export.

## Prompt packs

A pack sets up the editor for a course. Give students a link with `?pack=`:

- `…/index.html?pack=packs/digital-publishing.json` (Digital Publishing)
- `…/index.html?pack=packs/advanced-storytelling.json` (Advanced Storytelling)

The story remembers its pack, so later visits don't need the link. Packs must live in `packs/`; any other address is refused. Every key in a pack is optional:

| Key | What it does |
|---|---|
| `name` | Shown in the editor as "Pack: …" |
| `blocks` | Which blocks the Add block menu offers |
| `prompts` | Craft prompts by block type, replacing the defaults |
| `reflection` | Reflection questions added to every story |
| `includeNotes` | `false` hides the maker's note on each block |
| `skeleton` | Blocks to start an empty story with |
| `effectNotes` | `"off"`, `"optional"` or `"required"` |
| `sourcing` | `"inline"`, `"references"` or `"both"` (used by the checks in Phase 8) |
| `requireShowpiece` | How many showpiece blocks the course expects (shown as progress) |
| `maxExportMB` | Export size limit (used by the checks in Phase 8) |

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
  checks/           one module per check (questions, never marks)
runtime/            reader-facing renderer, inlined into every export
packs/              prompt packs
test/fixtures/      sample stories
```

## Rules

- No dependencies, build step, CDN or frameworks.
- No backend, network calls, analytics or accounts.
- Every action works by keyboard and on iPad Safari.

See BUILD-PLAN.md for the full set of constraints.
