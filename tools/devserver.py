"""Dev server for Midnight Menagerie.

No-cache on everything (agents must always see the current build), correct MIME
types for ES modules, and a tiny /api/progress endpoint the live progress page polls.
"""
import http.server, socketserver, os, sys, json, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript', '.mjs': 'text/javascript',
        '.json': 'application/json', '.css': 'text/css',
        '.wasm': 'application/wasm', '.mp3': 'audio/mpeg',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
        '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8',
    }
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()
    def send_head(self):
        """Adds HTTP Range support so <audio> can seek into an unbuffered region."""
        rng = self.headers.get('Range')
        if not rng or not rng.startswith('bytes='):
            return super().send_head()
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        try:
            first, _, last = rng[6:].partition('-')
            start = int(first) if first else max(0, size - int(last))
            end = int(last) if (last and first) else size - 1
        except ValueError:
            return super().send_head()
        if start >= size or start > end:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        end = min(end, size - 1)
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        return _Slice(f, end - start + 1)

    def log_message(self, fmt, *args):
        if '404' in (fmt % args):
            sys.stderr.write("404 %s\n" % (fmt % args))

class _Slice:
    """File-like wrapper that stops after n bytes, for 206 responses."""
    def __init__(self, f, n):
        self.f, self.left = f, n
    def read(self, sz=-1):
        if self.left <= 0:
            return b''
        if sz is None or sz < 0:
            sz = self.left
        d = self.f.read(min(sz, self.left))
        self.left -= len(d)
        return d
    def close(self):
        self.f.close()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    with Server(('127.0.0.1', PORT), Handler) as httpd:
        print(f"Midnight Menagerie dev server → http://localhost:{PORT}/game/index.html", flush=True)
        httpd.serve_forever()
