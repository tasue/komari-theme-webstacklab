import json, math
from pathlib import Path

root = Path(__file__).parent
source = json.loads((root / 'world-source.geojson').read_text(encoding='utf-8'))

def simplify(points, epsilon=.12):
    if len(points) < 4:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]
    den = math.hypot(dx, dy)
    distances = [abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/den if den else math.hypot(p[0]-a[0], p[1]-a[1]) for p in points]
    index = max(range(len(points)), key=lambda i: distances[i])
    if distances[index] > epsilon:
        return simplify(points[:index+1], epsilon)[:-1] + simplify(points[index:], epsilon)
    return [a, b]

result = []
for feature in source['features']:
    p = feature['properties']
    if p['ADMIN'] == 'Antarctica':
        continue
    geometry = feature['geometry']
    polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
    paths = []
    for poly in polygons:
        for ring in poly:
            ring = simplify(ring)
            paths.append('M' + 'L'.join(f'{(lon+180)*1000/360:.1f},{(82-lat)*500/142:.1f}' for lon,lat in ring) + 'Z')
    code = p.get('ISO_A2_EH') or p.get('ISO_A2')
    result.append({'code':code, 'name':p['ADMIN'], 'd':''.join(paths)})
(root/'dist/assets/world.js').write_text('window.WORLD_SHAPES='+json.dumps(result,separators=(',',':'))+';',encoding='utf-8')
print('Map countries:',len(result))
