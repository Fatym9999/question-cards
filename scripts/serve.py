#!/usr/bin/env python3
"""Локальный сервер статических файлов. Читает BASE_PATH прямо из js/config.js."""
import argparse
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
match = re.search(r"export const BASE_PATH = ['\"]([^'\"]+)['\"]", (ROOT / 'js/config.js').read_text())
if not match:
    raise SystemExit('Не найдена константа BASE_PATH в js/config.js')
BASE_PATH = match.group(1)
if not BASE_PATH.startswith('/') or not BASE_PATH.endswith('/'):
    raise SystemExit('BASE_PATH должен начинаться и заканчиваться символом /')


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript; charset=utf-8'}

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/' and BASE_PATH != '/':
            self.send_response(302)
            self.send_header('Location', BASE_PATH)
            self.end_headers()
            return
        if not path.startswith(BASE_PATH):
            self.send_error(404)
            return
        self.path = '/' + self.path[len(BASE_PATH):]
        super().do_GET()

    def do_HEAD(self):
        if not urlsplit(self.path).path.startswith(BASE_PATH):
            self.send_error(404)
            return
        self.path = '/' + self.path[len(BASE_PATH):]
        super().do_HEAD()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT)))
    print(f'Открой http://localhost:{args.port}{BASE_PATH}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
