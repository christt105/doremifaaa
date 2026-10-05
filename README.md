# doremifaaa

Piano sight-reading trainer that runs in the browser. Plug a digital piano or MIDI keyboard into your computer (or Android phone) over USB and practise reading notes, recognising key signatures and playing your own scores with a cursor that follows what you play.

**Live app:** https://christt105.github.io/doremifaaa/ (installable as a PWA, works offline)

## Features

| Mode | What it does |
| --- | --- |
| **Notes** | A random note on the treble or bass staff, you play it. Choose how many ledger lines above and below, add a key signature or explicit accidentals. Spaced repetition brings back the notes you miss or read slowly. |
| **Key signatures** | Name the major or relative minor key by tapping it or playing the tonic. Shows the classic recognition tip when you miss, and only "graduates" a key once you answer it at a glance. |
| **Sight-reading** | Freshly generated fragments in four levels, in wait mode (the cursor waits for the right note) or in tempo with a metronome. |
| **Repertoire** | MusicXML scores (`.musicxml`, `.xml`, `.mxl`) rendered with OpenSheetMusicDisplay. The cursor waits until every note of the current position has been played, chords included. Right hand, left hand or both, loop any measure range, and a list of the measures with the most mistakes at the end. PDFs open in a reader whose pages turn with the sustain pedal. |
| **Progress** | Heatmap of misses per note on both clefs, weakest notes, key signature mastery and daily activity. Everything stays in the browser and can be exported. |

Your own scores can be added from the Repertoire page and are stored in the browser (IndexedDB). Three public domain samples are bundled.

## Input options

| Input | Where it works |
| --- | --- |
| USB-MIDI piano or keyboard | Desktop Chrome, Edge, Opera, Firefox; Chrome for Android with an OTG cable |
| On-screen keyboard | Everywhere (mouse or multi-touch) |
| Computer keyboard | `A W S E D F T G Y H U J K` play C to C, `Z` / `X` shift the octave |
| Microphone (experimental) | Everywhere with a mic, single notes only. Useful on iOS/Safari, which has no Web MIDI |

Web MIDI and the microphone need a secure context (HTTPS or `localhost`). The app only listens to MIDI and never requests SysEx.

## Self-hosting with your own library

The Docker image serves the app plus a small read-only API that turns a folder of Markdown notes (for example an Obsidian vault) into a repertoire:

- Every note whose frontmatter has `type: partitura` becomes a piece. `titulo`/`title`, `estado`/`status`, `dificultad`/`difficulty`, `tags`, `fuente`/`source` and `video` are shown in the list.
- The score is the file named in `musicxml:` (path or `[[wikilink]]`), an embedded `![[*.mxl]]`, or a `.mxl`/`.musicxml`/`.xml` file with the same name as the note anywhere in the vault.
- The PDF is the file named in `pdf:` or the first embedded `![[*.pdf]]`. If that file is a real PDF it is served as is. If it is a tiny text file containing a URL (for example a Paperless-ngx share link) the server proxies it. With `PAPERLESS_TOKEN` set, `paperless_id` is fetched straight from the Paperless API.
- `#/piece/<note name>` opens a piece directly (score if there is one, PDF otherwise), so you can link to it from the note itself.

```yaml
services:
  doremifaaa:
    build: https://github.com/christt105/doremifaaa.git
    container_name: doremifaaa
    restart: unless-stopped
    ports:
      - "8095:8080"
    environment:
      LIBRARY_NAME: "My vault"
      OBSIDIAN_VAULT: "MyVault"
      PAPERLESS_URL: "http://192.168.1.10:8010"
    volumes:
      - /path/to/obsidian/vault:/vault:ro
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `VAULT_DIR` | `/vault` | Folder to scan (mounted read-only) |
| `LIBRARY_DIRS` | whole vault | Comma separated subfolders to limit the scan |
| `NOTE_TYPE` | `partitura` | Frontmatter `type` that marks a piece |
| `SCAN_TTL_SECONDS` | `60` | How long a scan is cached |
| `LIBRARY_NAME` | | Name shown above the list |
| `OBSIDIAN_VAULT` | | Vault name, enables "open note" links (`obsidian://`) |
| `PAPERLESS_URL` | | Paperless-ngx base URL. Proxied links must point to this origin |
| `PAPERLESS_TOKEN` | | Optional API token to fetch documents by `paperless_id` |
| `ALLOWED_ORIGINS` | `https://christt105.github.io` | Origins allowed to call the API (CORS), so the public app can use your library when it is served over HTTPS |

### HTTPS for Web MIDI

Browsers only expose Web MIDI on HTTPS or `localhost`, so a plain `http://192.168.x.x:8095` works for reading and PDFs but not for MIDI. Options, from quickest to cleanest:

1. In Chrome (desktop or Android) open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add the exact origin (`http://192.168.1.15:8095`) and relaunch.
2. Put it behind your reverse proxy with a certificate, or `tailscale serve --bg --https=443 http://<host>:8095` once HTTPS certificates are enabled in the tailnet.
3. Use the public app and point Settings › Repertoire server to the HTTPS URL of your server (it needs CORS, see `ALLOWED_ORIGINS`).

## Converting PDFs to MusicXML

`tools/audiveris/` packages [Audiveris](https://github.com/Audiveris/audiveris) (optical music recognition) in a Docker image that converts a folder of PDFs in one go. Each page is first rasterised to A4 at 300 dpi, because some PDFs exported from score editors have huge page sizes that Audiveris refuses to load.

```bash
docker build -t audiveris tools/audiveris
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/pdfs:/in:ro" -v "$PWD/out:/out" audiveris
node tools/audiveris/check.mjs out/*.mxl
```

`check.mjs` lists the measures whose voices don't add up to the time signature and the measures where a staff has no notes, which is where OMR usually goes wrong. Fix those in MuseScore before practising with the score. Drop the resulting `.mxl` next to the note in your vault (same name) and the repertoire picks it up.

## Development

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server; `/api` is proxied to `localhost:8080` (override with `DOREMIFAAA_API`) |
| `npm run serve` | Library server (`VAULT_DIR=... npm run serve`), serving `dist/` too |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run deploy:pages` | Build and publish `dist/` to the `gh-pages` branch |
| `node scripts/make-samples.mjs` | Regenerate the bundled sample scores |

Stack: [Preact](https://preactjs.com), [VexFlow](https://www.vexflow.com) for generated exercises, [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org) for MusicXML, [pdf.js](https://mozilla.github.io/pdf.js/) for PDFs, TypeScript and Vite. The server is plain Node with no dependencies. The build uses relative paths, so it can be hosted in any subfolder.

## License

[MIT](LICENSE). The bundled sample arrangements are CC0.
