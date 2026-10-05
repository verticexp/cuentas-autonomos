# Imita la API de Enable Banking para las pruebas de punta a punta (nunca en producción).
# Comprueba la firma del JWT con /tmp/banco-pub.pem. Las cuentas y movimientos los carga la prueba con POST /_prueba.
import json, base64, subprocess, tempfile, time, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
D = {'cuentas': [], 'auth': {}, 'cerradas': [], 'llamadas': 0}
BANCOS = [{'name': 'Banco Simulado', 'country': 'ES', 'psu_types': ['personal', 'business'], 'maximum_consent_validity': 7776000},
          {'name': 'Caja Simulada', 'country': 'ES', 'psu_types': ['personal'], 'maximum_consent_validity': 15552000}]
def b64d(s): return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))
def firma_ok(h):
    try:
        cab, cuerpo, firma = h.split(' ', 1)[1].split('.')
        c, p = json.loads(b64d(cab)), json.loads(b64d(cuerpo))
        if c.get('alg') != 'RS256' or not c.get('kid') or p.get('aud') != 'api.enablebanking.com' or p.get('iss') != 'enablebanking.com' or p['exp'] < time.time() or p['exp'] - p['iat'] > 86400: return False
        with tempfile.NamedTemporaryFile() as f:
            f.write(b64d(firma)); f.flush()
            r = subprocess.run(['openssl', 'dgst', '-sha256', '-verify', '/tmp/banco-pub.pem', '-signature', f.name], input=f'{cab}.{cuerpo}'.encode(), capture_output=True)
        return r.returncode == 0
    except Exception: return False
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def responder(self, d, code=200):
        out = json.dumps(d).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(out)
    def cuerpo(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'{}') if n else {}
    def autorizado(self):
        if firma_ok(self.headers.get('Authorization', '')): D['llamadas'] += 1; return True
        self.responder({'message': 'Invalid JWT'}, 401); return False
    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/_prueba':
            D.update(self.cuerpo()); return self.responder({'ok': True})
        if not self.autorizado(): return
        b = self.cuerpo()
        if u.path == '/auth':
            if not (b.get('access', {}).get('valid_until') and b.get('aspsp', {}).get('name') and b.get('state') and b.get('redirect_url') and b.get('psu_type') in ('personal', 'business')):
                return self.responder({'message': 'Faltan datos'}, 422)
            i = str(len(D['auth']) + 1)
            D['auth'][i] = b
            return self.responder({'url': f'http://127.0.0.1:8074/autorizar/{i}', 'authorization_id': i})
        if u.path == '/sessions':
            i = str(b.get('code', '')).replace('codigo-', '')
            if i not in D['auth']: return self.responder({'message': 'Bad code'}, 400)
            a = D['auth'][i]
            return self.responder({'session_id': f'sesion-{i}', 'aspsp': a['aspsp'], 'psu_type': a['psu_type'], 'access': {'valid_until': a['access']['valid_until']},
                                   'accounts': [{'uid': c['uid'], 'account_id': {'iban': c['iban']}, 'name': c['nombre'], 'currency': 'EUR'} for c in D['cuentas']]})
        self.responder({'message': 'Not found'}, 404)
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = dict(urllib.parse.parse_qsl(u.query))
        if u.path == '/_prueba': return self.responder({'cerradas': D['cerradas'], 'llamadas': D['llamadas'], 'auth': D['auth']})
        if u.path.startswith('/autorizar/'):
            i = u.path.rsplit('/', 1)[-1]; a = D['auth'][i]
            sep = '&' if '?' in a['redirect_url'] else '?'
            destino = a['redirect_url'] + sep + (f'error=access_denied&state={a["state"]}' if a['aspsp']['name'] == 'Caja Simulada' else f'code=codigo-{i}&state={a["state"]}')
            self.send_response(302); self.send_header('Location', destino); self.end_headers(); return
        if not self.autorizado(): return
        if u.path == '/aspsps': return self.responder({'aspsps': [x for x in BANCOS if x['country'] == q.get('country', 'ES')]})
        partes = u.path.strip('/').split('/')
        if len(partes) == 3 and partes[0] == 'accounts':
            c = next((x for x in D['cuentas'] if x['uid'] == urllib.parse.unquote(partes[1])), None)
            if not c: return self.responder({'message': 'No account'}, 404)
            if partes[2] == 'balances':
                return self.responder({'balances': [{'name': 'x', 'balance_type': 'XPCD', 'balance_amount': {'amount': '1.00', 'currency': 'EUR'}},
                                                    {'name': 'Disponible', 'balance_type': 'CLAV', 'balance_amount': {'amount': f"{c['saldo']:.2f}", 'currency': 'EUR'}}]})
            if partes[2] == 'transactions':
                t = [x for x in c['movimientos'] if x.get('booking_date', '') >= q.get('date_from', '')]
                ini = int(q.get('continuation_key') or 0)
                return self.responder({'transactions': t[ini:ini + 2], 'continuation_key': str(ini + 2) if ini + 2 < len(t) else None})
        self.responder({'message': 'Not found'}, 404)
    def do_DELETE(self):
        if not self.autorizado(): return
        D['cerradas'].append(self.path.rsplit('/', 1)[-1]); self.responder({})
ThreadingHTTPServer(('127.0.0.1', 8074), H).serve_forever()
