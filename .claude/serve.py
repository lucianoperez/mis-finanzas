#!/usr/bin/env python3
import http.server, sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()
    def log_message(self, *a): pass  # silence logs

port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
http.server.test(HandlerClass=NoCacheHandler, port=port, bind='127.0.0.1')
