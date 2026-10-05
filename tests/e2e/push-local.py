# Imita un servicio push (FCM/Apple) para las pruebas de punta a punta (nunca en producción): guarda cada aviso recibido.
import json, base64, ssl, subprocess, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers['Content-Length']))
        if self.path.startswith('/caducada'):
            self.send_response(410); self.end_headers(); return
        with open('/tmp/push.json', 'a') as f:
            f.write(json.dumps({'ruta': self.path, 'auth': self.headers.get('Authorization', ''), 'cuerpo': base64.b64encode(cuerpo).decode()}) + '\n')
        self.send_response(201); self.end_headers()
# web-push solo habla HTTPS: certificado propio de un solo uso (el servidor de pruebas arranca con NODE_TLS_REJECT_UNAUTHORIZED=0).
if not os.path.exists('/tmp/push-cert.pem'):
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', '/tmp/push-key.pem', '-out', '/tmp/push-cert.pem', '-days', '2', '-subj', '/CN=127.0.0.1'], check=True, capture_output=True)
srv = ThreadingHTTPServer(('127.0.0.1', 8075), H)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain('/tmp/push-cert.pem', '/tmp/push-key.pem')
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
srv.serve_forever()
