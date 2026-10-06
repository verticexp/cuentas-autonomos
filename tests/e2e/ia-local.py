# Imita la API de Claude para las pruebas de punta a punta (nunca en producción).
# Ticket (foto): «lee» siempre el mismo ticket. Asistente (con herramientas): elige la herramienta por palabras de la pregunta
# y responde copiando la cifra del resultado. Guarda cada petición del asistente en /tmp/ia.json.
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
HERRAMIENTA = [('iva', 'impuestos', {}), ('debe', 'facturas', {'estado': 'pendientes'}), ('gastado', 'gastos', {}), ('nómina', 'nominas', {}), ('banco', 'tesoreria', {'meses': 3})]
CAMPOS = ['iva_a_pagar_303', 'iva_a_compensar_303', 'total_a_cobrar', 'total_con_iva', 'coste_total_empresa', 'vas_a_cobrar']
def texto_de(m):
    return m['content'] if isinstance(m['content'], str) else ' '.join(c.get('text', '') for c in m['content'] if c.get('type') == 'text')
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def responder(self, contenido, stop='end_turn'):
        out = json.dumps({'content': contenido, 'stop_reason': stop}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(out)
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if 'tools' not in body:
            tiene_foto = body['messages'][0]['content'][0]['type'] in ('image', 'document')
            texto = 'Aquí está: {"proveedor": "Ferretería Sol", "nif": "B11111111", "fecha": "2026-09-12", "concepto": "Cables XLR", "base": null, "ivaPct": 21, "total": "60,50"}' if tiene_foto else 'nada'
            return self.responder([{'type': 'text', 'text': texto}])
        msgs = body['messages']
        preguntas = [texto_de(m) for m in msgs if m['role'] == 'user' and texto_de(m)]
        pregunta = next((p for p in reversed(preguntas) if 'no salen de las herramientas' not in p), '').lower()
        with open('/tmp/ia.json', 'a') as f:
            f.write(json.dumps({'herramientas': [t['name'] for t in body['tools']], 'pregunta': pregunta, 'sistema': body.get('system', ''), 'historial': len(msgs), 'auth': self.headers.get('x-api-key')}) + '\n')
        ultimo = msgs[-1]
        resultados = [c for c in ultimo['content'] if isinstance(ultimo['content'], list) and c.get('type') == 'tool_result']
        if resultados:
            d = json.loads(resultados[0]['content'])
            if 'error' in d: return self.responder([{'type': 'text', 'text': 'Con tus permisos no puedo ver eso.'}])
            cifra = next((d[k] for k in CAMPOS if k in d), None)
            if 'siempre inventa' in pregunta or ('inventa' in pregunta and 'no salen de las herramientas' not in texto_de(msgs[-1]) and len([m for m in msgs if m['role'] == 'assistant']) < 2):
                return self.responder([{'type': 'text', 'text': 'Llevas 9.999,99 € más o menos.'}])
            return self.responder([{'type': 'text', 'text': f'Son **{cifra}**.' if cifra else 'No hay datos.'}])
        elegida = next(((n, a) for k, n, a in HERRAMIENTA if k in pregunta), None)
        if not elegida: return self.responder([{'type': 'text', 'text': 'Puedo ayudarte con tus facturas, gastos e impuestos.'}])
        if elegida[0] not in [t['name'] for t in body['tools']]:
            return self.responder([{'type': 'text', 'text': 'Con tus permisos no puedo ver eso.'}])
        n = len([m for m in msgs if m['role'] == 'assistant'])
        self.responder([{'type': 'text', 'text': 'Lo miro.'}, {'type': 'tool_use', 'id': f'tu_{n}', 'name': elegida[0], 'input': elegida[1]}], 'tool_use')
ThreadingHTTPServer(('127.0.0.1', 8076), H).serve_forever()
