"""Local-only preview. Proxies only Komari's public read-only endpoints."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.request import urlopen, Request
from urllib.parse import urlsplit, unquote
from pathlib import Path
import json
import argparse

ROOT = Path(__file__).resolve().parent
REMOTE = ''
PREFIX = '/themes/webstack-observatory/dist/'

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT/'dist'), **kwargs)

    def do_GET(self):
        parsed = urlsplit(self.path)
        allowed = parsed.path in ('/api/nodes','/api/public','/api/records/load','/api/task/ping') or parsed.path.startswith('/api/recent/')
        if allowed:
            if not REMOTE:
                self.send_error(503,'Set --remote to preview live public data, or use ?demo=1')
                return
            try:
                with urlopen(Request(REMOTE+self.path, headers={'User-Agent':'WebStackLab-Theme-Preview/1.0'}), timeout=20) as response:
                    body = response.read()
                self.send_response(200)
                self.send_header('Content-Type','application/json; charset=utf-8')
                self.send_header('Cache-Control','no-store')
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                self.send_error(502,'Public monitoring data temporarily unavailable')
            return
        if parsed.path.startswith('/api/'):
            self.send_error(426 if parsed.path=='/api/clients' else 404)
            return
        if parsed.path.startswith(PREFIX):
            self.path = '/' + parsed.path[len(PREFIX):]
        elif parsed.path in ('/','/index.html'):
            self.path = '/index.html'
        else:
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        if not REMOTE:
            self.send_error(503,'No remote configured')
            return
        if self.path != '/api/rpc2':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length','0'))
            if length <= 0 or length > 64000:
                raise ValueError('Invalid body size')
            body = self.rfile.read(length)
            request = json.loads(body)
            if request.get('method') not in ('public:queryMetrics','public:getPingMetricStats'):
                raise ValueError('Only public read-only metric queries are allowed')
            allowed = {'traffic.up','traffic.down','net.in.rate','net.out.rate'}
            if request.get('method')=='public:queryMetrics' and not set(request.get('params',{}).get('metric_keys',[])).issubset(allowed):
                raise ValueError('Unsupported metric')
            with urlopen(Request(REMOTE+'/api/rpc2',data=body,headers={'Content-Type':'application/json'}),timeout=25) as response:
                result = response.read()
            self.send_response(200)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.end_headers()
            self.wfile.write(result)
        except ValueError:
            self.send_error(400)
        except Exception:
            self.send_error(502)

    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description='Local theme preview; demo needs no remote or credentials.')
    parser.add_argument('--remote',default='',help='Optional Komari public origin, for example https://monitor.example.com')
    parser.add_argument('--port',type=int,default=8765)
    args=parser.parse_args()
    if args.remote:
        parsed=urlsplit(args.remote)
        if parsed.scheme not in ('http','https') or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            parser.error('--remote must be an HTTP(S) origin without credentials, query, or fragment')
    REMOTE=args.remote.rstrip('/')
    server = ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Local: http://127.0.0.1:{args.port}/?demo=1',flush=True)
    server.serve_forever()
