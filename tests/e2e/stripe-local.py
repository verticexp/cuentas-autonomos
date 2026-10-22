# Imita la API de Stripe para las pruebas de punta a punta (nunca en producción): toda sesión creada sale pagada y toda
# cuenta conectada (Accounts v2) sale lista para cobrar.
import json, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
S = {}
C = {}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def responder(self, d, code=200):
        out = json.dumps(d).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(out)
    def cuerpo(self):
        return self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode()
    def do_POST(self):
        ruta = self.path.split('?')[0]
        if ruta == '/v2/core/accounts':
            d = json.loads(self.cuerpo() or '{}')
            i = f'acct_test{len(C) + 1}'
            C[i] = {'id': i, 'object': 'v2.core.account', 'display_name': d.get('display_name'), 'dashboard': d.get('dashboard'),
                    'configuration': {'merchant': {'capabilities': {'card_payments': {'status': 'active'}}}}, 'peticion': d}
            return self.responder(C[i])
        if ruta == '/v2/core/account_links':
            d = json.loads(self.cuerpo() or '{}')
            if d.get('account') not in C: return self.responder({'error': {'message': 'No such account'}}, 404)
            return self.responder({'object': 'v2.core.account_link', 'account': d['account'], 'url': f"http://127.0.0.1:8077/alta/{d['account']}", 'use_case': d.get('use_case')})
        f = dict(urllib.parse.parse_qsl(self.cuerpo()))
        i = f'cs_test_{len(S) + 1}'
        S[i] = {'id': i, 'object': 'checkout.session', 'payment_status': 'paid', 'currency': 'eur', 'amount_total': int(f['line_items[0][price_data][unit_amount]']),
                'metadata': {k[9:-1]: v for k, v in f.items() if k.startswith('metadata[')}, 'url': f'http://127.0.0.1:8077/pagina/{i}', 'form': f,
                'cuenta': self.headers.get('Stripe-Account')}
        self.responder(S[i])
    def do_GET(self):
        ruta = self.path.split('?')[0]
        i = ruta.rsplit('/', 1)[-1]
        if ruta.startswith('/v2/core/accounts/'):
            return self.responder(C[i]) if i in C else self.responder({'error': {'message': 'No such account'}}, 404)
        # Una sesión de una cuenta conectada solo se lee con su Stripe-Account (como en Stripe).
        if i in S and S[i].get('cuenta') == self.headers.get('Stripe-Account'): return self.responder(S[i])
        self.responder({'error': {'message': 'No such session'}}, 404)
ThreadingHTTPServer(('127.0.0.1', 8077), H).serve_forever()
