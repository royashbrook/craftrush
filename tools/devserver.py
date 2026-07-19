#!/usr/bin/env python3
"""Static server that disables caching, so edited ES modules always reload.
Usage: python3 tools/devserver.py [port]  (serves the repo root)"""
import sys, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8300

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()
    def log_message(self, *a):
        pass

ThreadingHTTPServer(('127.0.0.1', PORT), NoCache).serve_forever()
