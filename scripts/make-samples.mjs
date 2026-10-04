import { writeFileSync } from 'node:fs';

const DIV = 4;
const DUR = { w: 16, 'h.': 12, h: 8, 'q.': 6, q: 4, '8': 2 };
const TYPE = { w: 'whole', 'h.': 'half', h: 'half', 'q.': 'quarter', q: 'quarter', '8': 'eighth' };

function pitch(token, fifths) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(token);
  if (!m) throw new Error(`bad pitch ${token}`);
  const [, step, acc, octave] = m;
  const sharps = ['F', 'C', 'G', 'D', 'A', 'E', 'B'].slice(0, Math.max(0, fifths));
  const flats = ['B', 'E', 'A', 'D', 'G', 'C', 'F'].slice(0, Math.max(0, -fifths));
  const alter = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
  const inKey = sharps.includes(step) ? 1 : flats.includes(step) ? -1 : 0;
  const accidental = alter !== inKey ? `<accidental>${alter === 1 ? 'sharp' : alter === -1 ? 'flat' : 'natural'}</accidental>` : '';
  return { xml: `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>`, accidental };
}

function notes(measure, staff, voice, fifths) {
  return measure
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [p, d] = tok.split(':');
      const dur = DUR[d];
      const dot = d.endsWith('.') ? '<dot/>' : '';
      if (p === 'R') return `<note><rest/><duration>${dur}</duration><voice>${voice}</voice><type>${TYPE[d]}</type>${dot}<staff>${staff}</staff></note>`;
      return p
        .split('+')
        .map((single, i) => {
          const { xml, accidental } = pitch(single, fifths);
          return `<note>${i ? '<chord/>' : ''}${xml}<duration>${dur}</duration><voice>${voice}</voice><type>${TYPE[d]}</type>${dot}${accidental}<staff>${staff}</staff></note>`;
        })
        .join('');
    })
    .join('');
}

function score({ title, composer, fifths, beats, tempo, rh, lh }) {
  const right = rh.split('|');
  const left = lh.split('|');
  if (right.length !== left.length) throw new Error(`${title}: ${right.length} vs ${left.length} measures`);
  const measureLen = beats * DIV;
  const measures = right
    .map((r, i) => {
      const attrs =
        i === 0
          ? `<attributes><divisions>${DIV}</divisions><key><fifths>${fifths}</fifths></key><time><beats>${beats}</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>`
          : '';
      const barline = i === right.length - 1 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : '';
      return `<measure number="${i + 1}">${attrs}${notes(r, 1, 1, fifths)}<backup><duration>${measureLen}</duration></backup>${notes(left[i], 2, 2, fifths)}${barline}</measure>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
<work><work-title>${title}</work-title></work>
<identification><creator type="composer">${composer}</creator><rights>Public domain melody. Arrangement by doremifaaa, CC0.</rights></identification>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
${measures}
</part>
</score-partwise>
`;
}

const pieces = {
  twinkle: {
    title: 'Twinkle, Twinkle, Little Star',
    composer: 'Traditional',
    fifths: 0,
    beats: 4,
    tempo: 90,
    rh: 'C4:q C4:q G4:q G4:q|A4:q A4:q G4:h|F4:q F4:q E4:q E4:q|D4:q D4:q C4:h|G4:q G4:q F4:q F4:q|E4:q E4:q D4:h|G4:q G4:q F4:q F4:q|E4:q E4:q D4:h|C4:q C4:q G4:q G4:q|A4:q A4:q G4:h|F4:q F4:q E4:q E4:q|D4:q D4:q C4:h',
    lh: 'C3:w|F3:h C3:h|F3:h C3:h|G2:h C3:h|C3:h D3:h|C3:h G2:h|C3:h D3:h|C3:h G2:h|C3:w|F3:h C3:h|F3:h C3:h|G2:h C3:h'
  },
  'ode-to-joy': {
    title: 'Ode to Joy',
    composer: 'Ludwig van Beethoven',
    fifths: 0,
    beats: 4,
    tempo: 100,
    rh: 'E4:q E4:q F4:q G4:q|G4:q F4:q E4:q D4:q|C4:q C4:q D4:q E4:q|E4:q. D4:8 D4:h|E4:q E4:q F4:q G4:q|G4:q F4:q E4:q D4:q|C4:q C4:q D4:q E4:q|D4:q. C4:8 C4:h',
    lh: 'C3+E3:h C3+E3:h|G2+B2:h G2+B2:h|C3+E3:h C3+E3:h|G2+B2:w|C3+E3:h C3+E3:h|G2+B2:h G2+B2:h|C3+E3:h C3+E3:h|G2+B2:h C3:h'
  },
  minuet: {
    title: 'Minuet in G',
    composer: 'Christian Petzold',
    fifths: 1,
    beats: 3,
    tempo: 100,
    rh: 'D5:q G4:8 A4:8 B4:8 C5:8|D5:q G4:q G4:q|E5:q C5:8 D5:8 E5:8 F#5:8|G5:q G4:q G4:q|C5:q D5:8 C5:8 B4:8 A4:8|B4:q C5:8 B4:8 A4:8 G4:8|F#4:q G4:8 A4:8 B4:8 G4:8|A4:h.|D5:q G4:8 A4:8 B4:8 C5:8|D5:q G4:q G4:q|E5:q C5:8 D5:8 E5:8 F#5:8|G5:q G4:q G4:q|C5:q D5:8 C5:8 B4:8 A4:8|B4:q C5:8 B4:8 A4:8 G4:8|A4:q B4:8 A4:8 G4:8 F#4:8|G4:h.',
    lh: 'G3+B3:h A3:q|B3:h.|C4:h.|B3:h.|A3:h.|G3:h.|D3:h B3:q|D3+F#3:h.|G3+B3:h A3:q|B3:h.|C4:h.|B3:h.|A3:h.|G3:h.|D3:h D3:q|G2:h.'
  }
};

for (const [file, p] of Object.entries(pieces)) writeFileSync(`public/samples/${file}.musicxml`, score(p));

writeFileSync(
  'public/samples/index.json',
  JSON.stringify(
    Object.entries(pieces).map(([file, p]) => ({ id: file, title: p.title, composer: p.composer, file: `${file}.musicxml` })),
    null,
    2
  ) + '\n'
);
