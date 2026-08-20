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
        super().end_headers()
    def log_message(self, fmt, *args):
        if '404' in (fmt % args):
            sys.stderr.write("404 %s\n" % (fmt % args))

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    with Server(('127.0.0.1', PORT), Handler) as httpd:
        print(f"Midnight Menagerie dev server → http://localhost:{PORT}/game/index.html", flush=True)
        httpd.serve_forever()
