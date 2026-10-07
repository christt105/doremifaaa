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

The app is available in English and Spanish and picks your browser's language. Adding another language only takes a JSON file: see [Adding a language](CONTRIBUTING.md#adding-a-language).

## Input options

| Input | Where it works |
| --- | --- |
| USB-MIDI piano or keyboard | Desktop Chrome, Edge, Opera, Firefox; Chrome for Android with an OTG cable |
| On-screen keyboard | Everywhere (mouse or multi-touch) |
| Computer keyboard | `A W S E D F T G Y H U J K` play C to C, `Z` / `X` shift the octave |
| Microphone (experimental) | Everywhere with a mic, single notes only. Useful on iOS/Safari, which has no Web MIDI |

Web MIDI and the microphone need a secure context (HTTPS or `localhost`). The app only listens to MIDI and never requests SysEx.

## Self-hosting with your own library

The Docker image serves the app plus a small API that turns a folder of Markdown notes (for example an Obsidian vault) into a read-only repertoire, and can keep its own store of uploaded scores next to it (see [Score store](#score-store)):

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
      - ./data:/data
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `VAULT_DIR` | `/vault` | Folder to scan (mounted read-only) |
| `LIBRARY_DIRS` | whole vault | Comma separated subfolders to limit the scan |
| `EXCLUDE_DIRS` | `Templates` | Comma separated subfolders to skip. Notes with Templater or `{{...}}` placeholders are skipped too |
| `NOTE_TYPE` | `partitura` | Frontmatter `type` that marks a piece |
| `SCAN_TTL_SECONDS` | `60` | How long a scan is cached |
| `LIBRARY_NAME` | | Name shown above the list |
| `OBSIDIAN_VAULT` | | Vault name, enables "open note" links (`obsidian://`) |
| `PAPERLESS_URL` | | Paperless-ngx base URL. Link stubs are only proxied when they point to this origin |
| `PAPERLESS_TOKEN` | | Optional API token to fetch documents by `paperless_id` |
| `ALLOWED_ORIGINS` | `https://christt105.github.io` | Origins allowed to call the API (CORS), so the public app can use your library when it is served over HTTPS. Also the origins allowed to write to the store (`*` only opens reads) |
| `DATA_DIR` | `/data` | Folder of the score store (database and files). Unset outside Docker, which disables the store |
| `WRITE_TOKEN` | | If set, every write needs `Authorization: Bearer <token>` |
| `MAX_UPLOAD_MB` | `50` | Largest file accepted by the store |

### Score store

Besides the vault, which is never written to, the server keeps its own store of pieces: MusicXML (`.musicxml`, `.xml`, `.mxl`) and PDF files you upload, with their metadata. Store pieces are listed together with the vault pieces, and a vault piece that has been imported into the store only shows up once, as the store piece. `#/piece/<note name>` links keep working after an import.

Everything lives in `DATA_DIR`: a SQLite database (`doremifaaa.db`) and one folder per piece under `files/`. Mount it as a volume and back it up. The image runs as the `node` user (uid 1000), so a bind mount like `./data` must be writable by that uid (`mkdir data && sudo chown 1000:1000 data`). If the folder cannot be opened the server keeps serving the vault and reports the problem in `/api/health` (`storeError`).

Uploaded files are checked by content, not by name: a score must be MusicXML or a compressed `.mxl`, a PDF must start with `%PDF-`. Anything else is refused (415), and so is anything above `MAX_UPLOAD_MB` (413). Replacing a score can keep the first version as the original.

#### Write protection

Reads are open like the rest of the API. Every write (upload, edit, delete) is checked first:

| Check | Rule |
| --- | --- |
| Origin | Requests without an `Origin` header (curl, scripts) pass. A browser `Origin` must be listed in `ALLOWED_ORIGINS`, or be the server itself when it is reached by IP address, `localhost` or a host name listed in `ALLOWED_ORIGINS`. `Origin: null` is refused. `*` in `ALLOWED_ORIGINS` does not allow writes. Refused with 403 |
| Token | With `WRITE_TOKEN` set, writes need `Authorization: Bearer <token>`, otherwise 401 |

The origin check stops other websites from changing your library through your browser. It does not stop someone who can reach the server on your network, so set `WRITE_TOKEN` if the server is reachable by people you do not trust.

#### API

| Request | What it does |
| --- | --- |
| `GET /api/library` | Store and vault pieces |
| `GET /api/pieces/<id>` | One piece |
| `GET /api/pieces/<id>/score`, `/pdf`, `/original` | The files |
| `POST /api/pieces?name=<file name>&title=<title>` | Upload one file (raw body) as a new piece. `title` defaults to the file name |
| `PATCH /api/pieces/<id>` | Edit `title`, `composer`, `status`, `difficulty`, `tags`, `source`, `video`, `startedAt`, `finishedAt`, `notes` (JSON, `null` clears) |
| `PUT /api/pieces/<id>/score?keepOriginal=1` | Replace the score, keeping the current one as the original if there is none yet |
| `PUT /api/pieces/<id>/pdf` | Replace the PDF |
| `DELETE /api/pieces/<id>/score`, `/pdf`, `/original` | Remove one file |
| `DELETE /api/pieces/<id>` | Remove the piece and its files |

Vault pieces answer 409 to every write.

```bash
SERVER=http://192.168.1.15:8095
AUTH="Authorization: Bearer $WRITE_TOKEN"   # only with WRITE_TOKEN set

curl -X POST -H "$AUTH" --data-binary @"Route 201.pdf" "$SERVER/api/pieces?name=Route%20201.pdf"
curl -X POST -H "$AUTH" --data-binary @minuet.mxl "$SERVER/api/pieces?name=minuet.mxl&title=Minuet%20in%20G"
curl -X PATCH -H "$AUTH" -H "Content-Type: application/json" -d '{"composer":"Petzold","tags":["baroque"]}' "$SERVER/api/pieces/<id>"
curl -X PUT -H "$AUTH" --data-binary @minuet-fixed.mxl "$SERVER/api/pieces/<id>/score?keepOriginal=1"
curl -X DELETE -H "$AUTH" "$SERVER/api/pieces/<id>"
```

### HTTPS for Web MIDI

Browsers only expose Web MIDI on HTTPS or `localhost`, so a plain `http://192.168.x.x:8095` works for reading and PDFs but not for MIDI. Options, from quickest to cleanest:

1. In Chrome (desktop or Android) open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add the exact origin (`http://192.168.1.15:8095`) and relaunch.
2. Put it behind your reverse proxy with a certificate, or `tailscale serve --bg --https=443 http://<host>:8095` once HTTPS certificates are enabled in the tailnet.
3. Use the public app and point Settings › Repertoire server to the HTTPS URL of your server (it needs CORS, see `ALLOWED_ORIGINS`).

## Development

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server; `/api` is proxied to `localhost:8080` (override with `DOREMIFAAA_API`) |
| `npm run serve` | Library server (`VAULT_DIR=... DATA_DIR=... npm run serve`), serving `dist/` too |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run deploy:pages` | Build and publish `dist/` to the `gh-pages` branch |
| `node scripts/make-samples.mjs` | Regenerate the bundled sample scores |

Stack: [Preact](https://preactjs.com), [VexFlow](https://www.vexflow.com) for generated exercises, [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org) for MusicXML, [pdf.js](https://mozilla.github.io/pdf.js/) for PDFs, TypeScript and Vite. The server is plain Node with no dependencies (the store uses the built-in `node:sqlite`, Node 22.13 or newer). The build uses relative paths, so it can be hosted in any subfolder.

## License

[MIT](LICENSE). The bundled sample arrangements are CC0.
