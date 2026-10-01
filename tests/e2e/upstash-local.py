# Traduce la API REST de Upstash a un Redis local, solo para las pruebas de punta a punta (nunca en producción).
# Traductor mínimo del protocolo REST de Upstash a un Redis local, solo para pruebas.
import json, redis, base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
r = redis.Redis(decode_responses=True)
r.response_callbacks.clear()
def run(cmd):
    c=r.connection_pool.get_connection('x')
    try:
        c.send_command(*[str(x) for x in cmd]); v=c.read_response()
        if isinstance(v,dict): v=[y for kv in v.items() for y in kv]
        if isinstance(v,set): v=list(v)
        return {"result": v}
    except Exception as e: return {"error": str(e)}
    finally: r.connection_pool.release(c)
class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])) or 'null')
        enc=self.headers.get('Upstash-Encoding')=='base64'
        def e(v):
            if isinstance(v,str): return base64.b64encode(v.encode()).decode() if enc else v
            if isinstance(v,list): return [e(x) for x in v]
            if isinstance(v,dict): return {k:e(x) for k,x in v.items()}
            return v
        def run2(c):
            o=run(c)
            if 'result' in o: o['result']=e(o['result']) if o['result'] is not True else 'OK'
            return o
        if self.path.startswith('/pipeline') or self.path.startswith('/multi-exec'): out=[run2(c) for c in body]
        else: out=run2(body)
        b=json.dumps(out).encode(); self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(b)
ThreadingHTTPServer(('127.0.0.1',8079),H).serve_forever()
