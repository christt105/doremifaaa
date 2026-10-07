#!/usr/bin/env python3
"""Prepare a vector score PDF for optical music recognition.

Pages drawn with a SMuFL music font (MuseScore, Dorico, Finale exports) are
rewritten so that only the music is left:

- Note name noteheads (U+E150..U+E1AF, the beginner style with the letter
  inside the head) become plain filled or hollow ellipses, and the white
  shapes drawn behind them are dropped.
- Text in ordinary fonts (fingerings, chord symbols, titles), metronome
  marks and images (logos) are dropped.

Pages without a SMuFL font (scans) are copied untouched.

Usage: clean_pdf.py in.pdf out.pdf
"""
import re
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, FloatObject, NameObject

KAPPA = 0.5523
HEAD_HEIGHT = 0.28
HOLES = {'Half': (0.6, 0.4), 'Whole': (0.4, 0.6)}
METRONOME = range(0xECA0, 0xECC0)
TEXT_OPS = (b'Tj', b'TJ', b"'", b'"')
FILL_COLOR_OPS = (b'g', b'rg', b'k', b'sc', b'scn')


def head_kind(cp):
    """(kind, has_name) for a SMuFL note name notehead, else None."""
    kinds = ('Whole', 'Half', 'Black')
    if 0xE150 <= cp < 0xE168:
        return kinds[(cp - 0xE150) // 8], True
    if 0xE168 <= cp < 0xE1AD:
        return kinds[(cp - 0xE168) // 23], True
    if 0xE1AD <= cp < 0xE1B0:
        return kinds[cp - 0xE1AD], False
    return None


def to_unicode(font):
    if '/ToUnicode' not in font:
        return {}
    cmap = font['/ToUnicode'].get_object().get_data().decode('latin-1')
    uni = {}
    for block in re.findall(r'beginbfrange(.*?)endbfrange', cmap, re.S):
        for lo, hi, dst in re.findall(r'<(\w+)>\s*<(\w+)>\s*(\[[^\]]*\]|<\w+>)', block):
            lo, hi = int(lo, 16), int(hi, 16)
            if dst.startswith('['):
                for i, d in enumerate(re.findall(r'<(\w+)>', dst)):
                    uni[lo + i] = int(d[:4], 16)
            else:
                for i in range(hi - lo + 1):
                    uni[lo + i] = int(dst[1:5], 16) + i
    for block in re.findall(r'beginbfchar(.*?)endbfchar', cmap, re.S):
        for src, dst in re.findall(r'<(\w+)>\s*<(\w+)>', block):
            uni[int(src, 16)] = int(dst[:4], 16)
    return uni


def cid_widths(font):
    widths = {}
    if font.get('/Subtype') != '/Type0':
        return widths
    w = font['/DescendantFonts'].get_object()[0].get_object().get('/W', [])
    w = w.get_object() if w else []
    i = 0
    while i + 1 < len(w):
        start = int(w[i])
        if isinstance(w[i + 1], list):
            for j, v in enumerate(w[i + 1]):
                widths[start + j] = float(v) / 1000
            i += 2
        else:
            for c in range(start, int(w[i + 1]) + 1):
                widths[c] = float(w[i + 2]) / 1000
            i += 3
    return widths


class Font:
    def __init__(self, font):
        self.uni = to_unicode(font)
        self.widths = cid_widths(font)
        self.two_byte = font.get('/Subtype') == '/Type0'
        values = list(self.uni.values())
        self.music = bool(values) and all(0xE000 <= v < 0xF900 for v in values if v)
        self.text = bool(values) and not self.music

    def codes(self, data):
        if self.two_byte:
            return [int.from_bytes(data[i:i + 2], 'big') for i in range(0, len(data) - 1, 2)]
        return list(data)


def ellipse(cx, cy, rx, ry):
    kx, ky = rx * KAPPA, ry * KAPPA
    points = [
        ((cx + rx, cy), b'm'),
        ((cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry), b'c'),
        ((cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy), b'c'),
        ((cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry), b'c'),
        ((cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy), b'c'),
    ]
    return [([FloatObject(round(v, 3)) for v in xy], op) for xy, op in points] + [([], b'h')]


def head_path(kind, width, tm, size):
    """Notehead outline in user space for a glyph drawn at text matrix tm."""
    a, b, c, d, e, f = tm
    if abs(b) > 1e-6 or abs(c) > 1e-6:
        return None
    rx, ry = width * size * abs(a) / 2, HEAD_HEIGHT * size * abs(d) / 2
    cx = e + width * size * a / 2
    path = ellipse(cx, f, rx, ry)
    if kind in HOLES:
        hx, hy = HOLES[kind]
        return path + ellipse(cx, f, rx * hx, ry * hy) + [([], b'f*')]
    return path + [([], b'f')]


def mul(m, n):
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D,
            e * A + f * C + E, e * B + f * D + F)


def clean_page(page, reader):
    res = page.get('/Resources')
    res = res.get_object() if res else {}
    font_dict = res.get('/Font')
    font_dict = font_dict.get_object() if font_dict else {}
    fonts = {name: Font(ref.get_object()) for name, ref in font_dict.items()}
    if not any(f.music for f in fonts.values()):
        return False
    xobjects = res.get('/XObject')
    xobjects = xobjects.get_object() if xobjects else {}
    images = {name for name, ref in xobjects.items() if ref.get_object().get('/Subtype') == '/Image'}
    stream = ContentStream(page.get_contents(), reader)
    out, pending = [], []
    font, size, tm, tlm, white = None, 0, None, None, False
    for operands, op in stream.operations:
        if op in FILL_COLOR_OPS:
            values = [float(v) for v in operands if isinstance(v, (int, float))]
            white = op != b'k' and bool(values) and all(v >= 0.99 for v in values)
        elif op == b'BT':
            tm = tlm = (1, 0, 0, 1, 0, 0)
        elif op == b'Tf':
            font, size = fonts.get(operands[0]), float(operands[1])
        elif op == b'Tm':
            tm = tlm = tuple(float(v) for v in operands)
        elif op in (b'Td', b'TD'):
            tm = tlm = mul((1, 0, 0, 1, float(operands[0]), float(operands[1])), tlm)
        elif op == b'Do' and operands[0] in images:
            continue
        elif op in TEXT_OPS and font is not None:
            if font.text:
                continue
            if font.music and op == b'Tj':
                cids = font.codes(operands[0].original_bytes)
                if all(font.uni.get(cid, 0) in METRONOME for cid in cids):
                    continue
                head = head_kind(font.uni.get(cids[0], 0)) if len(cids) == 1 else None
                if head:
                    kind, named = head
                    path = head_path(kind, font.widths.get(cids[0], 0.36), tm, size)
                    if path and (named or not white):
                        pending.extend(path)
                    if path:
                        continue
        out.append((operands, op))
        if op == b'ET' and pending:
            out.extend(pending)
            pending = []
    stream.operations = out
    page[NameObject('/Contents')] = stream
    return True


def main(src, dst):
    reader = PdfReader(src)
    writer = PdfWriter()
    for page in reader.pages:
        clean_page(page, reader)
        writer.add_page(page)
    with open(dst, 'wb') as fh:
        writer.write(fh)


if __name__ == '__main__':
    main(*sys.argv[1:3])
