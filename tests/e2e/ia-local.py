# Imita la API de Claude para las pruebas de punta a punta (nunca en producción): «lee» siempre el mismo ticket.
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        tiene_foto = body['messages'][0]['content'][0]['type'] == 'image'
        texto = 'Aquí está: {"proveedor": "Ferretería Sol", "nif": "B11111111", "fecha": "2026-09-12", "concepto": "Cables XLR", "base": null, "ivaPct": 21, "total": "60,50"}' if tiene_foto else 'nada'
        out = json.dumps({'content': [{'type': 'text', 'text': texto}]}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(out)
ThreadingHTTPServer(('127.0.0.1', 8076), H).serve_forever()
