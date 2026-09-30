"""Regenerates public/fonts/pdf/*.ttf (Latin subsets for the quote PDF).
Sources: @fontsource woff files kept OUT of the repo bundle (pass dir as argv[1]).
Usage: pip install fonttools; python scripts/subset-pdf-fonts.py <dir-with-original-woffs>
No layout features are kept: the PDF shim (src/lib/quote-pdf/ttf.ts) does no shaping/kerning."""
import sys, os
from fontTools import subset
src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'fonts', 'pdf')
uni = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC, 0x2212]
for name in ['fraunces-latin-600-normal', 'manrope-latin-400-normal', 'manrope-latin-700-normal']:
    o = subset.Options()
    o.layout_features = []
    o.name_IDs = [1, 2, 4, 6]
    o.notdef_outline = True
    o.glyph_names = False
    o.hinting = False
    o.flavor = None
    o.drop_tables += ['GPOS', 'GSUB', 'GDEF', 'STAT', 'fvar', 'gvar', 'HVAR', 'MVAR', 'avar', 'DSIG']
    f = subset.load_font(os.path.join(src, name + '.woff'), o)
    s = subset.Subsetter(o); s.populate(unicodes=uni); s.subset(f)
    subset.save_font(f, os.path.join(out, name + '.ttf'), o)
