# Imita la API de Stripe Checkout para las pruebas de punta a punta (nunca en producción): toda sesión creada sale pagada.
import json, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
S = {}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def responder(self, d, code=200):
        out = json.dumps(d).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(out)
    def do_POST(self):
        f = dict(urllib.parse.parse_qsl(self.rfile.read(int(self.headers['Content-Length'])).decode()))
        i = f'cs_test_{len(S) + 1}'
        S[i] = {'id': i, 'object': 'checkout.session', 'payment_status': 'paid', 'amount_total': int(f['line_items[0][price_data][unit_amount]']),
                'metadata': {k[9:-1]: v for k, v in f.items() if k.startswith('metadata[')}, 'url': f'http://127.0.0.1:8077/pagina/{i}', 'form': f}
        self.responder(S[i])
    def do_GET(self):
        i = self.path.rsplit('/', 1)[-1]
        self.responder(S[i]) if i in S else self.responder({'error': {'message': 'No such session'}}, 404)
ThreadingHTTPServer(('127.0.0.1', 8077), H).serve_forever()
