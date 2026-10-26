"""Build the two critical assets without external dependencies."""
from pathlib import Path
import re

assets = Path(__file__).resolve().parent / 'dist' / 'assets'
css = '\n'.join((assets / name).read_text(encoding='utf-8') for name in
                ('style.css', 'refined.css', 'cyber.css', 'stable.css'))
css = re.sub(r'/\*[\s\S]*?\*/', '', css).replace('@charset "UTF-8";', '')
(assets / 'bundle.css').write_text(re.sub(r'\s+', ' ', css).strip(), encoding='utf-8')
(assets / 'bundle.js').write_text(
    (assets / 'analytics.js').read_text(encoding='utf-8') + '\n;\n' +
    (assets / 'app.js').read_text(encoding='utf-8'), encoding='utf-8')
print('Built bundle.css and bundle.js')
