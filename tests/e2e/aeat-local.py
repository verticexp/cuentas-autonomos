# Imita el servicio web de VERI*FACTU de la AEAT para las pruebas de punta a punta (nunca en producción).
# Como el de verdad: HTTPS con certificado de cliente obligatorio, SOAP 1.1, valida el envío contra los esquemas oficiales
# (tests/verifactu), comprueba la huella y el encadenamiento de cada registro y contesta con TiempoEsperaEnvio y CSV.
# Guarda cada envío en /tmp/aeat.json. AEAT_ESPERA: segundos de espera entre envíos que devuelve (por defecto 2).
import json, os, re, ssl, subprocess, tempfile, shutil, hashlib, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
ESQ = os.path.join(AQUI, '..', 'verifactu')
NS_SI = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd'
NS_R = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd'
ESPERA = os.environ.get('AEAT_ESPERA', '2')
REGISTRADOS = {}  # (nif, numserie, fecha) -> huella

def esquemas():
    d = tempfile.mkdtemp(prefix='aeat-')
    for f in ['SuministroLR.xsd', 'xmldsig-stub.xsd']: shutil.copy(os.path.join(ESQ, f), d)
    si = open(os.path.join(ESQ, 'SuministroInformacion.xsd'), encoding='utf-8').read().replace('http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd', 'xmldsig-stub.xsd')
    open(os.path.join(d, 'SuministroInformacion.xsd'), 'w', encoding='utf-8').write(si)
    return d
DIR = esquemas()

def valor(bloque, tag):
    m = re.search(r'<(?:\w+:)?%s>([^<]*)</(?:\w+:)?%s>' % (tag, tag), bloque)
    return m.group(1) if m else ''

def huella(campos):
    return hashlib.sha256('&'.join('%s=%s' % (k, v.strip()) for k, v in campos).encode('utf-8')).hexdigest().upper()

def fault(texto):
    return 500, '<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><env:Fault><faultcode>env:Client</faultcode><faultstring>%s</faultstring></env:Fault></env:Body></env:Envelope>' % texto

def procesar(xml):
    m = re.search(r'<(\w+):RegFactuSistemaFacturacion>([\s\S]*)</\1:RegFactuSistemaFacturacion>', xml)
    if not m: return fault('Falta RegFactuSistemaFacturacion')
    ns = ' '.join(re.findall(r'xmlns:\w+="[^"]+"', re.search(r'<\w+:Envelope([^>]*)>', xml).group(1)))
    cuerpo = '<%s:RegFactuSistemaFacturacion %s>%s</%s:RegFactuSistemaFacturacion>' % (m.group(1), ns, m.group(2), m.group(1))
    f = os.path.join(DIR, 'r-%s.xml' % uuid.uuid4().hex)
    open(f, 'w', encoding='utf-8').write(cuerpo)
    r = subprocess.run(['xmllint', '--noout', '--schema', os.path.join(DIR, 'SuministroLR.xsd'), f], capture_output=True, text=True)
    if r.returncode: return fault('Codigo[4102].El XML no cumple el esquema: ' + r.stderr.strip().splitlines()[0].replace('<', ''))
    cab = re.search(r'<\w+:Cabecera>([\s\S]*?)</\w+:Cabecera>', m.group(2)).group(1)
    lineas, mal = [], 0
    for alta in re.findall(r'<\w+:RegistroAlta>([\s\S]*?)</\w+:RegistroAlta>', m.group(2)):
        idf = re.search(r'<\w+:IDFactura>([\s\S]*?)</\w+:IDFactura>', alta).group(1)
        clave = (valor(idf, 'IDEmisorFactura'), valor(idf, 'NumSerieFactura'), valor(idf, 'FechaExpedicionFactura'))
        anterior = re.search(r'<\w+:RegistroAnterior>([\s\S]*?)</\w+:RegistroAnterior>', alta)
        previa = valor(anterior.group(1), 'Huella') if anterior else ''
        calc = huella([('IDEmisorFactura', clave[0]), ('NumSerieFactura', clave[1]), ('FechaExpedicionFactura', clave[2]), ('TipoFactura', valor(alta, 'TipoFactura')),
                       ('CuotaTotal', valor(alta, 'CuotaTotal')), ('ImporteTotal', valor(alta, 'ImporteTotal')), ('Huella', previa), ('FechaHoraHusoGenRegistro', valor(alta, 'FechaHoraHusoGenRegistro'))])
        # La huella va al final del registro (la de RegistroAnterior va antes, dentro de Encadenamiento).
        propia = re.findall(r'<(?:\w+:)?Huella>([^<]*)</(?:\w+:)?Huella>', alta)[-1]
        error = ''
        if clave in REGISTRADOS: error = '<CodigoErrorRegistro>3000</CodigoErrorRegistro><DescripcionErrorRegistro>Registro de facturacion duplicado.</DescripcionErrorRegistro>'
        elif calc != propia: error = '<CodigoErrorRegistro>2000</CodigoErrorRegistro><DescripcionErrorRegistro>El calculo de la huella suministrada es incorrecta.</DescripcionErrorRegistro>'
        else: REGISTRADOS[clave] = propia
        mal += 1 if error else 0
        lineas.append('<RespuestaLinea><IDFactura><sf:IDEmisorFactura>%s</sf:IDEmisorFactura><sf:NumSerieFactura>%s</sf:NumSerieFactura><sf:FechaExpedicionFactura>%s</sf:FechaExpedicionFactura></IDFactura><Operacion><sf:TipoOperacion>Alta</sf:TipoOperacion></Operacion><EstadoRegistro>%s</EstadoRegistro>%s</RespuestaLinea>' % (clave + ('Incorrecto' if error else 'Correcto', error)))
    estado = 'Correcto' if not mal else 'Incorrecto' if mal == len(lineas) else 'ParcialmenteCorrecto'
    csv = 'A-' + uuid.uuid4().hex[:14].upper() if mal < len(lineas) else ''
    resp = '<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><RespuestaRegFactuSistemaFacturacion xmlns="%s" xmlns:sf="%s">%s<Cabecera>%s</Cabecera><TiempoEsperaEnvio>%s</TiempoEsperaEnvio><EstadoEnvio>%s</EstadoEnvio>%s</RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>' % (
        NS_R, NS_SI, '<CSV>%s</CSV>' % csv if csv else '', re.sub(r'<\w+:', '<sf:', re.sub(r'</\w+:', '</sf:', cab)), ESPERA, estado, ''.join(lineas))
    return 200, resp

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        xml = self.rfile.read(int(self.headers['Content-Length'])).decode('utf-8')
        estado, resp = procesar(xml)
        with open('/tmp/aeat.json', 'a') as f:
            f.write(json.dumps({'ruta': self.path, 'certificado': self.connection.getpeercert() is not None, 'soapaction': self.headers.get('SOAPAction', ''), 'estado': estado, 'envio': xml, 'respuesta': resp}) + '\n')
        b = resp.encode('utf-8')
        self.send_response(estado); self.send_header('Content-Type', 'text/xml; charset=utf-8'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)

# Certificados de un solo uso: el del servidor y el de cliente (este, en .p12 para Netto: /tmp/aeat-cliente.p12, clave «prueba»).
if not os.path.exists('/tmp/aeat-cliente.p12'):
    for n in ['servidor', 'cliente']:
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', '/tmp/aeat-%s-key.pem' % n, '-out', '/tmp/aeat-%s.pem' % n, '-days', '2', '-subj', '/CN=%s' % ('127.0.0.1' if n == 'servidor' else 'B12345674 Empresa de pruebas')], check=True, capture_output=True)
    subprocess.run(['openssl', 'pkcs12', '-export', '-inkey', '/tmp/aeat-cliente-key.pem', '-in', '/tmp/aeat-cliente.pem', '-out', '/tmp/aeat-cliente.p12', '-passout', 'pass:prueba'], check=True, capture_output=True)
srv = ThreadingHTTPServer(('127.0.0.1', 8073), H)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain('/tmp/aeat-servidor.pem', '/tmp/aeat-servidor-key.pem')
ctx.verify_mode = ssl.CERT_REQUIRED; ctx.load_verify_locations('/tmp/aeat-cliente.pem')  # sin certificado de cliente, no hay conexión
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
srv.serve_forever()
