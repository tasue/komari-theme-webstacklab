"""Build and package a Komari theme with files at the ZIP root."""
from pathlib import Path
import json
import runpy
import zipfile

root = Path(__file__).resolve().parent
runpy.run_path(str(root / 'build_assets.py'), run_name='__main__')
manifest = json.loads((root / 'komari-theme.json').read_text(encoding='utf-8'))
release = root / 'release'
release.mkdir(exist_ok=True)
target = release / f"WebStackLab-Observatory-v{manifest['version']}.zip"
files = [root / name for name in ('komari-theme.json', 'preview.png', 'LICENSE', 'LICENSES.md', 'README.md')]
files += [p for p in (root / 'dist').rglob('*') if p.is_file()]
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path, path.relative_to(root).as_posix())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert 'komari-theme.json' in archive.namelist()
    assert 'dist/index.html' in archive.namelist()
print(target)
