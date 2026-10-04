# doremifaaa

Piano sight-reading trainer that runs in the browser. Plug a digital piano or MIDI keyboard into your computer (or Android phone) over USB and practise reading notes, recognising key signatures and playing your own scores with a cursor that follows what you play.

**Live app:** https://christt105.github.io/doremifaaa/

## Input options

| Input | Where it works |
| --- | --- |
| USB-MIDI piano or keyboard | Desktop Chrome, Edge, Opera, Firefox; Chrome for Android with an OTG cable |
| On-screen keyboard | Everywhere (mouse or multi-touch) |
| Computer keyboard | `A W S E D F T G Y H U J K` play C to C, `Z` / `X` shift the octave |
| Microphone (experimental) | Everywhere with a mic, single notes only. Useful on iOS/Safari, which has no Web MIDI |

Web MIDI and the microphone need a secure context (HTTPS or `localhost`). The app only listens to MIDI and never sends SysEx.

## Development

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm test` | Unit tests (Vitest) |

Stack: [Preact](https://preactjs.com), [VexFlow](https://www.vexflow.com) for generated exercises, TypeScript and Vite. The build is a static PWA with relative paths, so it can be hosted in any subfolder.

## License

[MIT](LICENSE)
