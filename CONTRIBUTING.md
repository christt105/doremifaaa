# Contributing

Thanks for wanting to improve doremifaaa! Bug reports, ideas and pull requests are all welcome.

## Development

```bash
npm install
npm run dev
```

Before opening a pull request, make sure these pass:

```bash
npm run typecheck
npm test
npx vite build
```

## Adding a language

Every text in the app lives in one JSON file per language in [`src/locales/`](src/locales). English (`en.json`) is the reference: any text missing from another language falls back to English, so a partial translation is fine and can be finished later.

1. Copy `src/locales/en.json` to `src/locales/<code>.json`, where `<code>` is the language's [BCP 47 tag](https://www.w3.org/International/articles/language-tags/) (`de`, `fr`, `pt-BR`, …).
2. Fill in `_meta`:
   - `name`: the language's name in that language (`Deutsch`, `Français`, `Português (Brasil)`).
   - `noteNames`: the default note names for people who use it, `solfege` (Do Re Mi), `letters` (C D E) or `german` (C D E with H for B natural and B for B flat).
3. Translate the values. Do not change the keys, and keep every placeholder in braces (`{n}`, `{note}`, `{total}`…) exactly as it is in English.
4. Plurals: keys ending in `.one` and `.other` are forms of the same text, picked with [`Intl.PluralRules`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules) from `{n}`. If your language needs other forms (`zero`, `two`, `few`, `many`), add them next to the English ones, for example `player.wrongs.few`.
5. Run `npm test`. It fails if a key does not exist in `en.json` or a placeholder differs, and lists the keys still missing (those only produce a warning).
6. Run `npm run dev`, pick your language in Settings and check every page, also at phone width.
7. Open a pull request.

That is all: the language shows up in Settings by itself, and the app picks it automatically for people whose browser is set to it. Numbers and dates are formatted with `Intl` for your language without any extra work.

If you would like a language but cannot translate it yourself, open a [new language issue](../../issues/new?template=new-language.md).
