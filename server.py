#!/usr/bin/env python3
"""
Yu Yu Hakusho TCG Database & Deck Builder Local Server
Serves the web application, card database, high-resolution scans, and local deck storage API.
Zero external dependencies (uses Python standard library).
"""

import os
import sys
import json
import mimetypes
from urllib.parse import urlparse, parse_qs, unquote
from http.server import HTTPServer, SimpleHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DECKS_DIR = os.path.join(BASE_DIR, 'decks')

os.makedirs(DECKS_DIR, exist_ok=True)

class YYHTCGRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        # API: List saved decks
        if path == '/api/decks':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            decks = []
            for f in sorted(os.listdir(DECKS_DIR)):
                if f.endswith('.json'):
                    deck_path = os.path.join(DECKS_DIR, f)
                    try:
                        with open(deck_path, 'r', encoding='utf-8') as df:
                            data = json.load(df)
                            data['filename'] = f
                            decks.append(data)
                    except Exception as e:
                        print(f"Error reading {f}: {e}")
            self.wfile.write(json.dumps(decks).encode('utf-8'))
            return

        # API: Get single deck
        if path.startswith('/api/decks/'):
            filename = path.replace('/api/decks/', '')
            deck_path = os.path.join(DECKS_DIR, filename)
            if os.path.exists(deck_path):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                with open(deck_path, 'r', encoding='utf-8') as df:
                    self.wfile.write(df.read().encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
            return

        # Default static file handling
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == '/api/decks':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                deck_data = json.loads(body.decode('utf-8'))
                deck_name = deck_data.get('name', 'Untitled Deck').strip()
                # Clean filename
                clean_name = "".join(c for c in deck_name if c.isalnum() or c in (' ', '_', '-')).rstrip()
                if not clean_name: clean_name = 'deck'
                deck_id = deck_data.get('id', clean_name.lower().replace(' ', '_'))
                filename = f"{deck_id}.json"
                deck_data['id'] = deck_id

                deck_path = os.path.join(DECKS_DIR, filename)
                with open(deck_path, 'w', encoding='utf-8') as df:
                    json.dump(deck_data, df, indent=2, ensure_ascii=False)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'ok', 'filename': filename, 'id': deck_id}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path.startswith('/api/decks/'):
            filename = path.replace('/api/decks/', '')
            deck_path = os.path.join(DECKS_DIR, filename)
            if os.path.exists(deck_path):
                os.remove(deck_path)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'deleted'}).encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
            return

        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def run_server(port=8000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, YYHTCGRequestHandler)
    print(f"================================================================")
    print(f" Yu Yu Hakusho TCG Database & Deck Builder Server Running!")
    print(f" Local App URL: http://localhost:{port}/")
    print(f" Press Ctrl+C to stop.")
    print(f"================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    port = 8000
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    run_server(port)
