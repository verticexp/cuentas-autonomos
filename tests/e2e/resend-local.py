# Imita la API de Resend para las pruebas de punta a punta: guarda cada email en /tmp/resend.json (nunca en producción).
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        body['auth'] = self.headers.get('Authorization')
        with open('/tmp/resend.json', 'a') as f: f.write(json.dumps(body) + '\n')
        out = json.dumps({'id': 'local-1'}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(out)
ThreadingHTTPServer(('127.0.0.1', 8078), H).serve_forever()
