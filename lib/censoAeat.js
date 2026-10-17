import https from 'node:https';

const URL_CENSO = 'https://www1.agenciatributaria.gob.es/wlpl/BURT-JDIT/ws/VNifV2SOAP';
const NS = 'http://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/burt/jdit/ws/VNifV2Ent.xsd';
const escapar = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const sinServicio = () => ({ estado: 'sin-servicio', mensaje: 'No se ha podido comprobar el NIF en Hacienda. Queda pendiente de comprobación.' });

// El mismo certificado de cliente que Verifactu. La consulta completa tiene un máximo de 8 segundos.
function post(url, xml) {
  return new Promise((ok, mal) => {
    const req = https.request(url, {
      method: 'POST', timeout: 8000,
      pfx: Buffer.from(process.env.VERIFACTU_P12, 'base64'), passphrase: process.env.VERIFACTU_P12_CLAVE,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""', 'Content-Length': Buffer.byteLength(xml) },
    }, (res) => {
      let cuerpo = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        cuerpo += c;
        if (cuerpo.length > 1024 * 1024) req.destroy(new Error('Respuesta del censo demasiado grande'));
      });
      res.on('error', (e) => { clearTimeout(limite); mal(e); });
      res.on('end', () => { clearTimeout(limite); ok({ status: res.statusCode, cuerpo }); });
    });
    const limite = setTimeout(() => req.destroy(new Error('La AEAT no ha contestado a tiempo')), 8000);
    req.on('timeout', () => req.destroy(new Error('La AEAT no ha contestado a tiempo')));
    req.on('error', (e) => { clearTimeout(limite); mal(e); });
    req.end(xml);
  });
}

function descodificar(s) {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(s)) throw new Error('Entidad XML ilegible');
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (_, e) => {
    if (e[0] !== '#') return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e];
    const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    if (![9, 10, 13].includes(n) && !(n >= 32 && n <= 0xD7FF) && !(n >= 0xE000 && n <= 0xFFFD) && !(n >= 0x10000 && n <= 0x10FFFF)) throw new Error('Carácter XML ilegible');
    return String.fromCodePoint(n);
  });
}

// Lector limitado a XML de datos: comprueba cierres y entidades; no admite DTD ni entidades externas.
function leerXml(xml) {
  if (typeof xml !== 'string' || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml)) throw new Error('XML ilegible');
  const documento = { hijos: [], texto: '' }, pila = [documento];
  const tokens = /<!--[\s\S]*?-->|<\?xml\s[^?]*\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][\w.:-]*(?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>|[^<]+/gy;
  let posicion = 0, m;
  while ((m = tokens.exec(xml))) {
    posicion = tokens.lastIndex;
    const t = m[0], actual = pila.at(-1);
    if (t.startsWith('<!--')) {
      if (t.slice(4, -3).includes('--') || t.endsWith('--->')) throw new Error('Comentario XML ilegible');
      continue;
    }
    if (t.startsWith('<?xml')) {
      if (m.index !== 0 && !(m.index === 1 && xml[0] === '\uFEFF')) throw new Error('Declaración XML fuera de lugar');
      continue;
    }
    if (t.startsWith('<![CDATA[')) { if (pila.length === 1) throw new Error('CDATA fuera de raíz'); actual.texto += t.slice(9, -3); continue; }
    if (t.startsWith('</')) {
      if (pila.length === 1 || t.replace(/\s+>$/, '>') !== `</${actual.etiqueta}>`) throw new Error('Cierre XML ilegible');
      pila.pop();
    } else if (t[0] === '<') {
      descodificar(t);
      const atributos = [...t.matchAll(/\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"[^"]*"|'[^']*')/g)].map((a) => a[1]);
      if (new Set(atributos).size !== atributos.length) throw new Error('Atributo XML repetido');
      const etiqueta = /^<([^\s/>]+)/.exec(t)[1];
      const nodo = { etiqueta, nombre: etiqueta.split(':').at(-1), hijos: [], texto: '' };
      actual.hijos.push(nodo);
      if (!t.endsWith('/>')) pila.push(nodo);
    } else {
      if (t.includes(']]>')) throw new Error('Texto XML ilegible');
      actual.texto += descodificar(t);
    }
  }
  if (posicion !== xml.length || pila.length !== 1 || documento.hijos.length !== 1 || documento.texto.trim()) throw new Error('XML incompleto');
  return documento.hijos[0];
}

export async function comprobarNif({ nif, nombre }, opciones = {}) {
  if (!opciones.post && !(process.env.VERIFACTU_P12 && process.env.VERIFACTU_P12_CLAVE)) return sinServicio();
  const xml = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><VNifV2Ent xmlns="${NS}"><Contribuyente><Nif>${escapar(String(nif || '').trim().toUpperCase())}</Nif><Nombre>${escapar(String(nombre || '').trim().toUpperCase())}</Nombre></Contribuyente></VNifV2Ent></soap:Body></soap:Envelope>`;
  try {
    const res = await (opciones.post || post)(process.env.CENSO_URL || URL_CENSO, xml);
    if (res.status !== 200) return sinServicio();
    const raiz = leerXml(res.cuerpo);
    const hijo = (n, nombre) => { const hs = n?.hijos.filter((h) => h.nombre === nombre); return hs?.length === 1 ? hs[0] : null; };
    const salida = raiz.nombre === 'VNifV2Sal' ? raiz : hijo(hijo(raiz.nombre === 'Envelope' ? raiz : null, 'Body'), 'VNifV2Sal');
    const contribuyente = hijo(salida, 'Contribuyente');
    const resultado = hijo(contribuyente, 'Resultado');
    if (!resultado || resultado.hijos.length) return sinServicio();
    const valor = resultado.texto.trim().toUpperCase();
    const nombreAeat = hijo(contribuyente, 'Nombre')?.texto.trim();
    const datos = nombreAeat ? { nombreAeat } : {};
    if (valor.startsWith('NO IDENTIFICADO')) return { estado: 'no', ...datos };
    if (/^IDENTIFICADO-(BAJA|REVOCADO)$/.test(valor) || valor === 'REVOCADO') return { estado: 'baja', ...datos };
    if (valor === 'IDENTIFICADO') return { estado: 'ok', ...datos };
    return sinServicio();
  } catch { return sinServicio(); }
}
