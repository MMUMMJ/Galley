<h1>
  <picture>
    <source srcset="galley-brand/logo/svg/galley-lockup-dark.svg" media="(prefers-color-scheme: dark)">
    <img src="galley-brand/logo/svg/galley-lockup-light.svg" alt="Galley" height="72">
  </picture>
</h1>

A scrollytelling editor for journalism students at Manchester Metropolitan University. Students build feature articles and reflective process portfolios, then export a self-contained package to submit through Moodle.

Use it at **https://mmummj.github.io/Galley/**.

See what it can do in **[the demo story](https://mmummj.github.io/Galley/demo/)**, a tour of every kind of block made in Galley itself. [Open it in the editor](https://mmummj.github.io/Galley/?demo) to see how it's built, or choose **File & Export → Open the demo story** at any time.

### Why Galley?

In letterpress printing, a galley was the shallow metal tray where typesetters collected and arranged lines of type before locking them up for the press.

Galley does the same job for a digital story. Students gather their words, pictures and scroll effects in one place, shape them on the page, and lock them into a finished package ready to publish. The name nods to the newsroom craft behind the work.

(Galley was called Illuminate until November 2026. It still opens stories exported under the old name.)

## What it does

- **Write on the page.** The canvas shows the story as readers will see it. Click any text to type; click any picture to replace it or write its alt text. **Classic** view (blocks, settings and preview side by side) is one click away, and `?view=classic` or `?view=canvas` in a link chooses for students.
- **Fourteen kinds of block:** header, text, columns, quote, media (image, video or sound), gallery, embed, divider and references, plus the showpieces: scroll sequence, text column, scrollpoints, before and after, and big number. Text can hold images, videos and embeds (YouTube, Vimeo, Spotify and SoundCloud play in the story; other sites show as a link card).
- **Movement that never gets in the way.** Fade, rise, slide and zoom effects, and showpieces that move as the reader scrolls. Without JavaScript, in print and with reduced motion, everything is still there. On the canvas nothing moves, so every step can be edited; **Play** and **Preview** show the movement.
- **Six colour schemes,** all checked for 4.5:1 contrast, and coloured bands behind any block.
- **Newsroom details:** title, standfirst, byline, SEO title and description, and the picture and text used when the story is shared.
- **Teaching built in:** a craft prompt on every block, maker's notes, reflection questions, and course packs that set up the editor for a module.
- **Checks:** the questions an editor would ask before publishing (missing alt text, unsourced figures, search-results links, uncited references, long stretches of text), as prompts, never marks.
- **Saving and publishing:** Galley saves in the browser as students work. **Export** makes a ZIP for Moodle or a single web page, and **Open…** brings either back into the editor. In Chrome and Edge, **Save to folder…** keeps an up-to-date copy in a folder, such as one in OneDrive.
- **Accessible:** everything works from the keyboard and on an iPad, and buttons' spoken names match their visible text.

## The demo story

`demo/` is the demo story, saved the way Galley's **Save to folder** saves any story: `index.html` (the published page, at `/Galley/demo/`), `story.json` and `assets/`. The editor's **Open the demo story** (and the address `?demo`) loads the same files.

To change it, open the demo in Galley, make the changes, choose **Save to folder…**, pick this repository's `demo/` folder, then commit. Galley rewrites all three parts.

Two items are still placeholders, and their block **Notes** say so. To swap one, click the file on the canvas and choose **Replace…**:

- the sound clip (a computer voice standing in for an interview)
- the Before and after pair (marked-up and corrected proofs)

The screenshots and the screen recording show Galley itself. Retake them if the editor changes a lot.

## Course packs

A pack sets up the editor for a course. Give students a link with `?pack=`:

- `…/index.html?pack=packs/digital-publishing.json` (Digital Publishing)
- `…/index.html?pack=packs/advanced-storytelling.json` (Advanced Storytelling)

The story remembers its pack, so later visits don't need the link. Packs must live in `packs/`; any other address is refused. Every key in a pack is optional:

| Key | What it does |
|---|---|
| `name` | Shown in the editor as the course pack's name |
| `blocks` | Which blocks the Add block menu offers |
| `prompts` | Craft prompts by block type, replacing the defaults |
| `reflection` | Reflection questions added to every story |
| `includeNotes` | `false` hides the maker's note on each block |
| `skeleton` | Blocks to start an empty story with |
| `effectNotes` | `"off"`, `"optional"` or `"required"` |
| `sourcing` | `"inline"`, `"references"` or `"both"`: how the checks expect sources to be given |
| `requireShowpiece` | How many showpiece blocks the course expects (shown as progress) |
| `maxExportMB` | Export size limit, used by the checks |
| `scheme` | Locks the colour scheme as the course's house style: `house`, `wire`, `longread`, `magazine`, `nightdesk` or `investigation` |

## Run it locally

The editor uses ES modules, which Chrome and Edge refuse to load from a `file://` page. Serve the folder instead:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. (Exported stories are different: they are built to open straight from `file://`.)

## Tests

The tests need Node and Python 3. Galley itself doesn't: the test tools are never part of the site.

```sh
npm install
npx playwright install chromium webkit
npm test
```

- `test/unit/` (Node's own test runner): the story model, loading and migrating stories.
- `test/e2e/` (Playwright, in Chromium and in WebKit at iPad size): export and reopen, saving and reloading, undo, two tabs, storage failure, earlier versions, broken checks, damaged ZIPs, folder saving, keyboard editing, pasting, and story files that try to run code.
- `test/checks.html` and `test/runtime.html`: pages to try the checks and the runtime by eye, with the sample stories in `test/fixtures/`.

GitHub runs the tests on every push (`.github/workflows/test.yml`). If they crawl on a Mac (macOS can slow down the timers of processes running in the background), run them with `taskpolicy -t 0 -l 0 npm test`.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.

`.nojekyll` stops Pages running Jekyll, so files and folders are served exactly as they are.

## How it's built

```text
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
  open.js           opens an exported ZIP, HTML page or story JSON, or the demo's folder
  blocks/           one module per block type
  editor/           editor UI panels and styles
  adapters/         savers and exporters
  checks/           one module per check (questions, never marks)
runtime/            reader-facing renderer, inlined into every export
packs/              course packs
demo/               the demo story: a saved folder, published at /Galley/demo/
galley-brand/       logos, colours and type (see its README)
test/               tests (see Tests)
```

The site's icons (`favicon.*`, `apple-touch-icon.png`, `site.webmanifest`, `icons/`) and link-preview image (`social/og-image.png`) sit in the root.

Behind the formatted editor, text is saved as a small Markdown subset, which is what the runtime reads: each line is a paragraph; `## ` and `### ` start headings; `- ` and `1. ` start list items; `**bold**`, `*italic*`, `[text](https://…)` and bare `https://` links; and, on lines of their own, `![name](asset:<id> "left"|"right")` for a picture or video and `![Embed](https://…)` for an embed. A backslash makes a symbol literal (`\*`). Students never see it.

`RUNTIME_VERSION` in `src/model.js` must match the one in `runtime/galley-runtime.js`. Change both whenever the runtime changes.

## Rules

1. **No dependencies, no build step, no CDN, no frameworks.** Vanilla JavaScript, HTML and CSS. (`package.json` lists only the test tools.)
2. **No backend, network calls, analytics or accounts.** Student work leaves the browser only as files the student saves themselves.
3. **Exports work offline** from an unzipped folder opened via `file://`, in current Edge, Chrome, Safari and Firefox, with no third-party scripts.
4. **The story is data.** Every export contains the story JSON and can be opened in the editor again.
5. **Accessibility:** everything works from the keyboard, focus is always visible, every drag has a button, nothing appears only on hover, reduced motion turns off every animation, no effect hides content, alt text is kept separate from the caption, and exports use semantic HTML.
6. **No scrolljacking:** CSS `position: sticky` and `IntersectionObserver` only.
7. **iPad:** the editor is fully usable in iPad Safari.
