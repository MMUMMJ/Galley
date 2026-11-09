# Galley

A scrollytelling editor for journalism students at Manchester Metropolitan University. Students build feature articles and reflective process portfolios, then export a self-contained package to submit through Moodle.

The build is planned phase by phase in [BUILD-PLAN.md](BUILD-PLAN.md).

### Why Galley?

In letterpress printing, a galley was the shallow metal tray where typesetters collected and arranged lines of type before locking them up for the press.

Galley does the same job for a digital story. Students gather their words, pictures and scroll effects in one place, shape them on the page, and lock them into a finished package ready to publish. The name nods to the newsroom craft behind the work.

(Galley was called Illuminate until November 2026. It still opens stories exported under the old name.)

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
- Colour schemes and block backgrounds: six ready-made colour schemes (House, Wire, Long read, Magazine, Night desk, Investigation), all checked for 4.5:1 contrast, chosen in Story details; a pack can lock one as its house style. Any block can sit on a full-width coloured band, from the scheme's colours or any colour; Galley picks black or white text for it. Print always uses black on white.
- Scroll sequence layouts: side by side (text left or right), overlay (text boxes left, centre or right), and text column (one continuous column of text, left, centre or right, while full-screen images crossfade behind).
- Canvas view: the editor opens on the story itself, drawn as readers will see it (without movement, so every step and effect is visible). A rail of numbered blocks sits on the left; clicking a block selects it and shows its toolbar (Settings, Up, Down, Duplicate, Delete); **+ Add** appears between blocks and opens the illustrated block picker; Settings slide in the familiar Write / Look / Notes panel from the right. **Classic** (blocks, settings and preview side by side) is one click away in the header, and each browser remembers the choice. A link can choose for students: `?view=classic` or `?view=canvas`.
- Typing on the canvas (stage 2): click a headline, kicker, standfirst, byline, paragraph, column, quote, attribution, big number (and its unit, context and source), divider label or the text of a scroll sequence or scrollpoints step and type straight onto the page. A small bar above the text names what is being typed and offers bold, italics, links, subheadings, lists and media where they apply, plus Settings and Done. Enter (one-line text) and Tab move on to the next piece of text in the block; Esc or Done finishes. Empty text shows what goes there; optional pieces (kicker, byline, unit, role, divider label) appear only while their block is selected. Each spell of typing is one undo step. The edit marks come from the runtime only when the canvas asks for them (`renderArticle(story, { mode: 'preview', editable: true })`), never in exports or the preview.
- Media on the canvas (stage 3): click an image or video (including a full-page header's background and a scroll step's image) for a small bar with Replace…, Alt text and Settings. Replace swaps the file in that block only and carries over the old file's alt text, caption, credit and licence; Alt text edits the description in place (an amber dot marks a file with none). Scroll steps show as numbered cards. Scroll sequences, scrollpoints, big numbers and before/after sliders get a Play button that opens the preview tab at that block, so the effect can be seen moving.
- Media in the text: Text blocks, Columns and scroll steps can hold images and videos inside the text (full width, or floated left or right with the text wrapping round) and embedded links (YouTube, Vimeo, Spotify, SoundCloud play in the story; other sites show as a link card). The toolbar's **Media** button adds them. Saved as a line of its own: `![name](asset:id "left")` for a file, `![Embed](https://…)` for an embed.
- Columns block: two or three columns of text, either **separate** (each column written on its own, e.g. two sides of a story) or **flowing** (one text running from column to column, like print). Two columns sit side by side down to 560px wide and three down to 720px; narrower screens get one column, in order.
- Editor redesign: a File menu (New story, Open…, Export) with Undo, Redo and Checks; compact one-line block cards whose actions show only on the selected block; Write / Look / Notes tabs in the inspector; and a formatted text editor (bold, italics, links, subheadings, lists, images) so students never type Markdown. Pasting from Word or the web keeps only that formatting. **+ Add block** opens a picker with a card and a small animation for each block type the pack allows (still pictures under reduced motion).

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
| `scheme` | Locks the colour scheme as the course's house style: `house`, `wire`, `longread`, `magazine`, `nightdesk` or `investigation` |

## Test the runtime

Serve the folder (below) and open <http://localhost:8000/test/runtime.html>. Pick a fixture to render it through the runtime. The page also shows any problems `src/model.js` finds in the fixture.

- **Open as exported page** builds the page the way an export will: CSS and runtime inlined, story JSON embedded.
- **Open exported page without JavaScript** builds the same page with no script, to check that the content still reads. Use it for print preview too.

Behind the formatted editor, text is saved as a small Markdown subset, which is what the runtime reads: each line is a paragraph; `## ` and `### ` start headings; `- ` and `1. ` start list items; `**bold**`, `*italic*`, `[text](https://…)`, bare `https://` links, and `![name](asset:<id> "left"|"right")` images on their own line. A backslash makes a symbol literal (`\*`). Students never see it.

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
