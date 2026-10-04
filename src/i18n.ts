import { settings, type Lang } from './lib/settings';
import { useStore } from './lib/store';

type Dict = Record<string, string>;

const es: Dict = {
  'nav.home': 'Inicio',
  'nav.notes': 'Notas',
  'nav.keys': 'Armaduras',
  'nav.sight': 'Primera vista',
  'nav.library': 'Repertorio',
  'nav.stats': 'Progreso',
  'nav.settings': 'Ajustes',
  'input.connect': 'Conectar piano',
  'input.connecting': 'Conectando…',
  'input.ready': '{n} dispositivo(s) MIDI',
  'input.none': 'Sin dispositivos MIDI',
  'input.denied': 'Permiso MIDI denegado',
  'input.unsupported': 'Este navegador no tiene Web MIDI',
  'input.insecure': 'Web MIDI necesita HTTPS',
  'input.mic': 'Micrófono',
  'home.title': 'Lee partituras tocando tu piano',
  'home.lead': 'Conecta un piano o teclado por USB-MIDI y practica la lectura de notas, las armaduras y tu propio repertorio. Si no tienes MIDI, usa el teclado en pantalla, el del ordenador o el micrófono.',
  'home.test': 'Prueba de entrada',
  'home.testHint': 'Toca cualquier tecla del piano: debería aparecer aquí.',
  'home.lastNotes': 'Últimas notas',
  'home.noNotes': 'Todavía no ha llegado ninguna nota.',
  'home.modes': 'Modos',
  'home.notes.desc': 'Notas sueltas en clave de sol y fa, con líneas adicionales a tu medida.',
  'home.keys.desc': 'Reconoce armaduras de un vistazo, con repetición espaciada.',
  'home.sight.desc': 'Fragmentos cortos generados al momento para leer sin preparar.',
  'home.library.desc': 'Tus partituras en MusicXML o PDF. El cursor avanza cuando aciertas.',
  'home.stats.desc': 'Qué notas y armaduras te cuestan de verdad.',
  'home.kbdHint': 'Teclado del ordenador: A W S E D F T G Y H U J K = Do a Do. Z y X cambian de octava.',
  'home.browserNote': 'Web MIDI funciona en Chrome, Edge, Opera y Firefox de escritorio, y en Chrome para Android con cable OTG. Safari e iOS no lo soportan: allí usa el micrófono.',
  'settings.title': 'Ajustes',
  'settings.lang': 'Idioma',
  'settings.naming': 'Nombre de las notas',
  'settings.naming.solfege': 'Do Re Mi',
  'settings.naming.letters': 'C D E',
  'settings.midiInput': 'Entrada MIDI',
  'settings.midiAll': 'Todas',
  'settings.soundOnScreen': 'Sonido al tocar en pantalla o con el teclado del ordenador',
  'settings.soundOnMidi': 'Sonido también para la entrada MIDI (si tu teclado no suena)',
  'settings.feedbackSounds': 'Sonidos de acierto y fallo',
  'settings.showNoteNames': 'Mostrar nombres en el teclado en pantalla',
  'settings.mic': 'Entrada por micrófono (experimental, solo notas sueltas)',
  'settings.micLevel': 'Nivel',
  'settings.library': 'Servidor de repertorio',
  'settings.libraryHint': 'URL de un servidor doremifaaa con tu repertorio. Vacío usa el mismo servidor que sirve la app, si lo tiene.',
  'settings.data': 'Datos',
  'settings.export': 'Exportar progreso',
  'settings.import': 'Importar progreso',
  'settings.reset': 'Borrar progreso',
  'settings.resetConfirm': 'Pulsa otra vez para confirmar',
  'settings.imported': 'Progreso importado',
  'common.start': 'Empezar',
  'common.stop': 'Parar',
  'common.next': 'Siguiente',
  'common.restart': 'Reiniciar',
  'common.back': 'Volver',
  'common.correct': 'Correcto',
  'common.wrong': 'Fallo',
  'common.accuracy': 'Precisión',
  'common.streak': 'Racha',
  'common.time': 'Tiempo medio',
  'common.done': 'Terminado',
  'common.treble': 'Clave de sol',
  'common.bass': 'Clave de fa',
  'common.both': 'Ambas',
  'common.loading': 'Cargando…',
  'common.error': 'Error',
  'common.seconds': '{n} s'
};

const en: Dict = {
  'nav.home': 'Home',
  'nav.notes': 'Notes',
  'nav.keys': 'Key signatures',
  'nav.sight': 'Sight-reading',
  'nav.library': 'Repertoire',
  'nav.stats': 'Progress',
  'nav.settings': 'Settings',
  'input.connect': 'Connect piano',
  'input.connecting': 'Connecting…',
  'input.ready': '{n} MIDI device(s)',
  'input.none': 'No MIDI devices',
  'input.denied': 'MIDI permission denied',
  'input.unsupported': 'This browser has no Web MIDI',
  'input.insecure': 'Web MIDI needs HTTPS',
  'input.mic': 'Microphone',
  'home.title': 'Read sheet music by playing your piano',
  'home.lead': 'Connect a piano or keyboard over USB-MIDI and practise note reading, key signatures and your own repertoire. No MIDI? Use the on-screen keyboard, your computer keyboard or the microphone.',
  'home.test': 'Input test',
  'home.testHint': 'Play any key on your piano: it should show up here.',
  'home.lastNotes': 'Last notes',
  'home.noNotes': 'No notes received yet.',
  'home.modes': 'Modes',
  'home.notes.desc': 'Single notes on treble and bass clef, with as many ledger lines as you want.',
  'home.keys.desc': 'Recognise key signatures at a glance, with spaced repetition.',
  'home.sight.desc': 'Short fragments generated on the fly to read unprepared.',
  'home.library.desc': 'Your scores in MusicXML or PDF. The cursor moves on when you play the right notes.',
  'home.stats.desc': 'Which notes and key signatures really trip you up.',
  'home.kbdHint': 'Computer keyboard: A W S E D F T G Y H U J K = C to C. Z and X change octave.',
  'home.browserNote': 'Web MIDI works in desktop Chrome, Edge, Opera and Firefox, and in Chrome for Android over an OTG cable. Safari and iOS do not support it: use the microphone there.',
  'settings.title': 'Settings',
  'settings.lang': 'Language',
  'settings.naming': 'Note names',
  'settings.naming.solfege': 'Do Re Mi',
  'settings.naming.letters': 'C D E',
  'settings.midiInput': 'MIDI input',
  'settings.midiAll': 'All',
  'settings.soundOnScreen': 'Sound when playing on screen or with the computer keyboard',
  'settings.soundOnMidi': 'Sound for MIDI input too (if your keyboard is silent)',
  'settings.feedbackSounds': 'Right and wrong sounds',
  'settings.showNoteNames': 'Show note names on the on-screen keyboard',
  'settings.mic': 'Microphone input (experimental, single notes only)',
  'settings.micLevel': 'Level',
  'settings.library': 'Repertoire server',
  'settings.libraryHint': 'URL of a doremifaaa server with your repertoire. Leave empty to use the server hosting the app, if it has one.',
  'settings.data': 'Data',
  'settings.export': 'Export progress',
  'settings.import': 'Import progress',
  'settings.reset': 'Delete progress',
  'settings.resetConfirm': 'Press again to confirm',
  'settings.imported': 'Progress imported',
  'common.start': 'Start',
  'common.stop': 'Stop',
  'common.next': 'Next',
  'common.restart': 'Restart',
  'common.back': 'Back',
  'common.correct': 'Correct',
  'common.wrong': 'Wrong',
  'common.accuracy': 'Accuracy',
  'common.streak': 'Streak',
  'common.time': 'Average time',
  'common.done': 'Done',
  'common.treble': 'Treble clef',
  'common.bass': 'Bass clef',
  'common.both': 'Both',
  'common.loading': 'Loading…',
  'common.error': 'Error',
  'common.seconds': '{n} s'
};

const dicts: Record<Lang, Dict> = { es, en };

export function addStrings(lang: Lang, strings: Dict): void {
  Object.assign(dicts[lang], strings);
}

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let text = dicts[lang][key] ?? dicts.es[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

export function t(key: string, params?: Record<string, string | number>): string {
  return translate(settings.get().lang, key, params);
}

export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const { lang } = useStore(settings);
  return (key, params) => translate(lang, key, params);
}
