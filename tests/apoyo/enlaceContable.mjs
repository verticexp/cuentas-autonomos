// Validador independiente de los ficheros de enlace contable, escrito desde los manuales (no usa lib/exportarContable.js):
// - A3: «Enlace contable de entrada. Descripción de registros» (registros 0, 1, 2, 4 y 9, y la nota 2 sobre en qué columna
//   va cada importe). https://media.a3software.com/a3responde/files/5081-Enlace_contable_descripcion_registros_WEB.pdf
// - ContaPlus: «Protocolo de comunicación con Sage ContaPlus» (Diario, campos 1-31; Subcuentas, 1-24) y el importador de Sage 50 (formato
//   NominaPlus). https://grupo.sage.es/ayuda/documentacion/productos/contaplus/Manual_protocolos_ContaPlus.pdf
// Devuelve los errores, el saldo de cada subcuenta (debe − haber, en céntimos) con los asientos tal como los generaría el
// programa y su libro del IVA por trimestre, para compararlos con lo que dice Fisquo.

import { leerZip } from '../../lib/zip.js';

const fechaOk = (s) => /^\d{8}$/.test(s) && new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}T00:00:00Z`).toISOString().slice(0, 10).replaceAll('-', '') === s;
const trimestre = (s) => Math.ceil(Number(s.slice(4, 6)) / 3);
const libroVacio = () => ({ expedidas: { base: 0n, cuota: 0n, recargo: 0n }, recibidas: { base: 0n, cuota: 0n, deducible: 0n, baseDeducible: 0n } });

export function validarA3(contenido, { anio } = {}) {
  const b = Buffer.from(contenido, 'latin1');
  const errores = [], saldos = {}, libro = { 1: libroVacio(), 2: libroVacio(), 3: libroVacio(), 4: libroVacio() };
  const resumen = { registros: {}, asientos: 0, facturas: 0, rectificativas: 0 };
  const err = (n, m) => { if (errores.length < 50) errores.push(`registro ${n}: ${m}`); };
  if (b.length % 256) err(0, 'la longitud total no es múltiplo de 256');
  // A3 dice «importe»: signo + 10 enteros + punto + 2 decimales; porcentaje: xx.xx.
  const importe = (s, n, campo) => { if (!/^[+-]\d{10}\.\d{2}$/.test(s)) { err(n, `${campo} «${s}»`); return 0n; } return (s[0] === '-' ? -1n : 1n) * BigInt(s.slice(1).replace('.', '')); };
  const pct = (s, n, campo) => { if (!/^\d{2}\.\d{2}$/.test(s)) { err(n, `${campo} «${s}»`); return 0; } return Number(s); };
  // pendiente4: la rectificativa que acaba de cerrarse; su registro 4 va justo detrás.
  let digitos = null, abierto = null, pendiente4 = false;
  const cuenta = (s, n, campo = 'cuenta', vacia = false) => {
    const c = s.trimEnd();
    if (!c && vacia) return '';
    if (!/^\d{6,12}$/.test(c) || s !== c.padEnd(s.length)) { err(n, `${campo} «${s}»`); return c; }
    if (digitos === null) digitos = c.length; else if (c.length !== digitos) err(n, `${campo} de ${c.length} dígitos (antes ${digitos})`);
    return c;
  };
  const apuntar = (c, v) => { if (v) saldos[c] = (saldos[c] || 0n) + v; };
  const cerrar = (n) => {
    const s = abierto.lineas.reduce((t, [, v]) => t + v, 0n);
    if (s) err(n, `asiento descuadrado en ${s} céntimos`);
    if (abierto.lineas.length < 2) err(n, 'asiento con menos de dos apuntes');
    for (const [c, v] of abierto.lineas) apuntar(c, v);
    if (abierto.factura) {
      // El total de la cabecera es lo que va a la cuenta del cliente o proveedor: debe cuadrar con las líneas de IVA.
      if (abierto.total !== abierto.cabecera) err(n, `el total de la factura (${abierto.cabecera}) no es la suma de sus líneas (${abierto.total})`);
      pendiente4 = abierto.rect;
    }
    resumen.asientos++;
    abierto = null;
  };
  for (let i = 0; i * 256 < b.length; i++) {
    const r = b.subarray(i * 256, i * 256 + 256), n = i + 1;
    if (r.some((c, k) => k < 254 && (c < 0x20 || c > 0x7e))) err(n, 'carácter que no es ASCII imprimible');
    if (r[254] !== 13 || r[255] !== 10) err(n, 'sin CR+LF en 255-256');
    const t = r.toString('latin1'), p = (d, l) => t.slice(d - 1, d - 1 + l), vacio = (d, l, campo) => { if (p(d, l).trim()) err(n, `${campo} (${d}-${d + l - 1}) no está en blanco`); };
    if (p(1, 1) !== '4') err(n, 'tipo de formato distinto de 4');
    if (!/^\d{5}$/.test(p(2, 5)) || p(2, 5) === '00000') err(n, 'código de empresa');
    if (!fechaOk(p(7, 8)) || (anio && !p(7, 8).startsWith(String(anio)))) err(n, `fecha «${p(7, 8)}»`);
    if (p(254, 1) !== 'N') err(n, 'indicador de generado distinto de N');
    const tipo = p(15, 1);
    if (pendiente4 && tipo !== '4') { err(n, 'rectificativa sin su registro 4 detrás'); pendiente4 = false; }
    resumen.registros[tipo] = (resumen.registros[tipo] || 0) + 1;
    if (tipo !== '4' && p(253, 1) !== 'E') err(n, 'moneda distinta de E');
    if (tipo === '0') {
      const c = cuenta(p(16, 12), n), linea = p(69, 1);
      if (!'DH'.includes(p(58, 1)) || p(58, 1) === ' ') err(n, 'D/H');
      if (!p(59, 10).trim()) err(n, 'documento vacío');
      vacio(114, 138, 'reserva');
      if (!' SN'.includes(p(252, 1))) err(n, 'marca de analítica');
      const v = importe(p(100, 14), n, 'importe'), firmado = p(58, 1) === 'D' ? v : -v;
      if (linea === 'I') { if (abierto) err(n, 'empieza un asiento sin terminar el anterior'); abierto = { lineas: [], doc: p(59, 10), fecha: p(7, 8) }; }
      else if (!abierto) err(n, `línea «${linea}» fuera de un asiento`);
      else if (abierto.factura) err(n, 'registro 0 dentro de una factura');
      else if (linea !== 'M' && linea !== 'U') err(n, `línea «${linea}»`);
      if (abierto) {
        if (abierto.doc !== p(59, 10) || abierto.fecha !== p(7, 8)) err(n, 'cambia el documento o la fecha dentro del asiento');
        abierto.lineas.push([c, firmado]);
        if (linea === 'U') cerrar(n);
      }
    } else if (tipo === '1' || tipo === '2') {
      if (abierto) err(n, 'empieza una factura sin terminar el asiento anterior');
      const c = cuenta(p(16, 12), n);
      const tf = p(58, 1);
      if (!'123'.includes(tf) || tf === ' ') err(n, `tipo de factura «${tf}»`);
      if (!p(59, 10).trim()) err(n, 'número de factura vacío');
      if (p(69, 1) !== 'I') err(n, 'la cabecera de la factura no lleva I');
      vacio(114, 62, 'reserva'); vacio(235, 2, 'reserva');
      const nif = p(176, 14).trim();
      if (nif && !/^[0-9A-Z]{2,14}$/.test(nif)) err(n, `NIF «${nif}»`);
      if (!nif && (p(190, 40).trim() || p(230, 5).trim())) err(n, 'nombre o código postal sin NIF');
      if (p(230, 5).trim() && !/^\d{5}$/.test(p(230, 5))) err(n, `código postal «${p(230, 5)}»`);
      for (const [d, campo] of [[237, 'fecha de operación'], [245, 'fecha de factura']]) if (p(d, 8).trim() && !fechaOk(p(d, 8))) err(n, `${campo} «${p(d, 8)}»`);
      const ffac = p(245, 8).trim() || p(7, 8);
      abierto = { lineas: [], doc: p(59, 10), fecha: p(7, 8), factura: true, rect: tipo === '2', tf, contra: c, cabecera: importe(p(100, 14), n, 'importe'), total: 0n, ffac, nueves: 0 };
      resumen.facturas++;
      if (tipo === '2') resumen.rectificativas++;
    } else if (tipo === '9') {
      if (!abierto?.factura) { err(n, 'registro 9 fuera de una factura'); continue; }
      if (abierto.doc !== p(59, 10) || abierto.fecha !== p(7, 8)) err(n, 'cambia el documento o la fecha dentro de la factura');
      const f = abierto, c = cuenta(p(16, 12), n), linea = p(69, 1);
      if (!'CA'.includes(p(58, 1)) || p(58, 1) === ' ') err(n, 'tipo de importe (C/A)');
      if (linea !== 'M' && linea !== 'U') err(n, `línea «${linea}»`);
      const subtipo = p(100, 2);
      const validos = f.tf === '1' ? ['01', '02', '03', '04', '05', '06', '07', '08', '09'] : ['01', '02', '03', '04', '06', '07'];
      if (!validos.includes(subtipo)) err(n, `subtipo «${subtipo}»`);
      const base = importe(p(102, 14), n, 'base'), piva = pct(p(116, 5), n, '% IVA'), cuota = importe(p(121, 14), n, 'cuota');
      const pre = pct(p(135, 5), n, '% recargo'), recargo = importe(p(140, 14), n, 'recargo');
      const pret = pct(p(154, 5), n, '% retención'), ret = importe(p(159, 14), n, 'retención');
      const impreso = p(173, 2);
      if (impreso.trim() && !(/^\d{2}$/.test(impreso) && Number(impreso) >= 1 && Number(impreso) <= 39)) err(n, `impreso «${impreso}»`);
      const sujeta = p(175, 1);
      if (!'SN'.includes(sujeta) || sujeta === ' ') err(n, 'operación sujeta (S/N)');
      // Nota 3: con IVA, recargo o retención, la línea va como sujeta.
      if (sujeta === 'N' && (cuota || recargo || ret)) err(n, 'línea con IVA, recargo o retención marcada como no sujeta');
      if (!' SN'.includes(p(176, 1))) err(n, 'marca del 415');
      vacio(178, 14, 'reserva');
      // Cuota y recargo, según la base y el tipo (con margen: la cuota del TPV o el reparto de la cuota deducible).
      const cerca = (x, esperado) => (x - esperado < 0n ? esperado - x : x - esperado) <= 5n;
      if (!cerca(cuota, BigInt(Math.round((Number(base) * piva) / 100)))) err(n, `cuota ${cuota} lejos de base ${base} × ${piva} %`);
      if (!cerca(recargo, BigInt(Math.round((Number(base) * pre) / 100)))) err(n, `recargo ${recargo} lejos de base ${base} × ${pre} %`);
      if (ret && !pret) err(n, 'retención sin porcentaje');
      const civa = cuenta(p(192, 12), n, 'cuenta de IVA', true), crec = cuenta(p(204, 12), n, 'cuenta de recargo', true);
      const cret = cuenta(p(216, 12), n, 'cuenta de retención', true), civa2 = cuenta(p(228, 12), n, 'cuenta de IVA 2', true);
      cuenta(p(240, 12), n, 'cuenta de recargo 2', true);
      if (cuota && !civa) err(n, 'cuota sin cuenta de IVA');
      if (recargo && !crec) err(n, 'recargo sin cuenta de recargo');
      if (ret && !cret) err(n, 'retención sin cuenta de retención');
      // Nota 2: con C, la base va al haber en las expedidas y al debe en las recibidas (al revés si es un abono, registro
      // 2); con A, al revés. El IVA y el recargo van con la base; el IVA 2 (autorrepercutido), enfrente; la retención y el
      // total, a la cuenta del cliente o proveedor, enfrente.
      const alDebe = (f.tf !== '1') !== f.rect !== (p(58, 1) === 'A');
      const s = alDebe ? 1n : -1n;
      f.lineas.push([c, s * base]);
      if (cuota) f.lineas.push([civa, s * cuota]);
      if (civa2 && cuota) f.lineas.push([civa2, -s * cuota]);
      if (recargo) f.lineas.push([crec, s * recargo]);
      if (ret) f.lineas.push([cret, -s * ret]);
      const parte = base + (civa2 ? 0n : cuota) + recargo - ret;
      f.lineas.push([f.contra, -s * parte]);
      f.total += p(58, 1) === 'A' ? -parte : parte;
      f.nueves++;
      if (sujeta === 'S') {
        // Libro del IVA: el abono resta; por la fecha de la factura.
        const signo = f.rect ? -1n : 1n, q = libro[trimestre(f.ffac)];
        if (f.tf === '1') { q.expedidas.base += signo * base; q.expedidas.cuota += signo * cuota; q.expedidas.recargo += signo * recargo; }
        else {
          q.recibidas.base += signo * base; q.recibidas.cuota += signo * cuota;
          if (subtipo !== '07') { q.recibidas.deducible += signo * cuota; q.recibidas.baseDeducible += signo * base; }
        }
      }
      if (linea === 'U') cerrar(n);
    } else if (tipo === '4') {
      if (abierto) err(n, 'registro 4 dentro de un asiento');
      if (!pendiente4) err(n, 'registro 4 sin una rectificativa delante');
      pendiente4 = false;
      if (!fechaOk(p(59, 8))) err(n, `fecha de la factura rectificada «${p(59, 8)}»`);
      if (!p(67, 10).trim()) err(n, 'número de la factura rectificada vacío');
      vacio(16, 43, 'reserva');
    } else err(n, `tipo de registro «${tipo}»`);
  }
  if (abierto) err('fin', 'el último asiento no termina en U');
  if (pendiente4) err('fin', 'rectificativa sin su registro 4 detrás');
  return { errores, saldos, libro, resumen: { ...resumen, digitos } };
}

// Subcuentas (XSubCta, campos 1-24 del protocolo en posiciones fijas, 385 caracteres): código, título, NIF, TipoIVA, TPC,
// RecEquiv, IdNif y país. Los tipos de IVA (*3) que admite cada cuenta: repercutido (477) y soportado (472).
const TIPOS_IVA = { 477: 'GNVXYEPJMH', 472: 'OICZARPJBK' };
function leerSubcuentas(texto, err) {
  const m = new Map();
  if (texto && !texto.endsWith('\r\n')) err('XSubCta', 'sin CRLF al final');
  (texto ? texto.slice(0, -2).split('\r\n') : []).forEach((f, i) => {
    const p = (d, l) => f.slice(d - 1, d - 1 + l), n = `XSubCta ${i + 1}`;
    if (f.length !== 385) err(n, `${f.length} caracteres (385)`);
    if (/[^\x20-\x7e]/.test(f)) err(n, 'carácter que no es ASCII');
    const cod = p(1, 12).trimEnd();
    if (!/^\d+$/.test(cod)) err(n, `código «${p(1, 12)}»`);
    if (m.has(cod)) err(n, `subcuenta ${cod} repetida`);
    if (!p(13, 40).trim()) err(n, 'sin título');
    for (const [d, campo] of [[153, 'Divisa'], [159, 'Documento'], [160, 'AjustaMe'], [195, 'LInterrump']]) if (!'FT'.includes(p(d, 1)) || p(d, 1) === ' ') err(n, campo);
    for (const [d, campo] of [[208, 'TPC'], [213, 'RecEquiv']]) if (!/^ *\d{1,2}\.\d{2}$/.test(p(d, 5))) err(n, `${campo} «${p(d, 5)}»`);
    const s = { tipoIva: p(161, 1).trim(), tpc: Number(p(208, 5)), re: Number(p(213, 5)), nif: p(53, 15).trim(), idNif: p(383, 1).trim(), pais: p(384, 2).trim(), cp: p(148, 5).trim() };
    if (/^47[27]/.test(cod) && s.tipoIva && !TIPOS_IVA[cod.slice(0, 3)].includes(s.tipoIva)) err(n, `TipoIVA «${s.tipoIva}» en la ${cod.slice(0, 3)}`);
    if (s.nif) {
      if (!'1234567'.includes(s.idNif) || !s.idNif) err(n, `IdNif «${s.idNif}» con NIF`);
      if (s.idNif === '1' && (s.pais !== 'ES' || !/^[0-9A-Z]{9}$/.test(s.nif))) err(n, `NIF español «${s.nif}» o país «${s.pais}»`);
      if (s.idNif === '2' && (!/^[A-Z]{2}$/.test(s.pais) || !s.nif.startsWith(s.pais === 'GR' ? 'EL' : s.pais))) err(n, `NIF-IVA «${s.nif}» y país «${s.pais}»`);
      if (s.cp && !/^\d{5}$/.test(s.cp)) err(n, `código postal «${s.cp}»`);
    }
    m.set(cod, s);
  });
  return m;
}

// contenido: el XDiario (texto) o el .zip con XDiario.txt y XSubCta.txt. Con las subcuentas, además: que existan todas,
// que las de IVA lleven su tipo y su porcentaje (el del apunte) y que la contrapartida de los apuntes de IVA con NIF diga
// de qué país es. libro[q].tipos: la base de cada tipo de IVA de ContaPlus (de la subcuenta), para el 303 y el 349.
export function validarContaplus(contenido, { anio } = {}) {
  const errores = [], saldos = {}, libro = { 1: libroVacio(), 2: libroVacio(), 3: libroVacio(), 4: libroVacio() };
  const err = (n, m) => { if (errores.length < 50) errores.push(`línea ${n}: ${m}`); };
  let subcuentas = null;
  if (typeof contenido !== 'string') {
    const z = leerZip(Buffer.from(contenido));
    if (Object.keys(z).join() !== 'XDiario.txt,XSubCta.txt') err('zip', `ficheros ${Object.keys(z).join(', ')} (XDiario.txt y XSubCta.txt)`);
    subcuentas = leerSubcuentas(z['XSubCta.txt']?.toString('latin1') || '', err);
    contenido = z['XDiario.txt']?.toString('latin1') || '';
  }
  for (const q of [1, 2, 3, 4]) libro[q].tipos = {};
  const cent = (s) => { const t = s.trim(); return /^-?\d+\.\d{2}$/.test(t) ? BigInt(t.replace('.', '')) : null; };
  if (contenido && !contenido.endsWith('\r\n')) err('fin', 'sin CRLF al final');
  const filas = contenido ? contenido.slice(0, -2).split('\r\n') : [];
  const porAsiento = new Map(), resumen = { apuntes: filas.length, apuntesIva: 0 };
  let digitos = null;
  filas.forEach((f, i) => {
    const n = i + 1, p = (d, l) => f.slice(d - 1, d - 1 + l);
    if (f.length < 255) err(n, 'menos de 255 caracteres');
    if (/[^\x20-\x7e]/.test(f)) err(n, 'carácter que no es ASCII');
    if (!/^ *\d+$/.test(p(1, 6))) err(n, 'Asien no numérico');
    if (!fechaOk(p(7, 8)) || (anio && !p(7, 8).startsWith(String(anio)))) err(n, `fecha «${p(7, 8)}»`);
    const c = p(15, 12).trimEnd();
    if (!/^\d+$/.test(c)) err(n, `subcuenta «${p(15, 12)}»`);
    if (digitos === null) digitos = c.length; else if (c.length !== digitos) err(n, `subcuenta de ${c.length} dígitos (antes ${digitos})`);
    for (const [d, l, campo] of [[39, 16, 'PtaDebe'], [80, 16, 'PtaHaber'], [104, 16, 'BaseImpo'], [239, 16, 'EuroDebe'], [255, 16, 'EuroHaber'], [271, 16, 'BaseEuro']])
      if (cent(p(d, l)) === null || !/^ *\S+$/.test(p(d, l))) err(n, `${campo} «${p(d, l)}»`);
    for (const [d, l, campo] of [[120, 5, 'IVA'], [125, 5, 'Recequiv']]) if (!/^ *\d{1,2}\.\d{2}$/.test(p(d, l))) err(n, `${campo} «${p(d, l)}»`);
    if (!/^ *\d+$/.test(p(96, 8))) err(n, `Factura «${p(96, 8)}»`);
    if (p(238, 1) !== '2') err(n, 'MonedaUso distinto de 2 (euros)');
    if (!'FT'.includes(p(287, 1)) || p(287, 1) === ' ') err(n, 'NoConv');
    const d = cent(p(239, 16)) ?? 0n, h = cent(p(255, 16)) ?? 0n;
    if (d && h) err(n, 'debe y haber a la vez');
    if (d < 0n || h < 0n) err(n, 'importe negativo');
    if (!p(55, 25).trim()) err(n, 'concepto vacío');
    const auxiliar = p(211, 1), contra = p(27, 12).trimEnd();
    const iva = /^47[27]/.test(c) && auxiliar !== '*';
    if (iva) {
      // Apunte de IVA (nota 2): contrapartida, factura, base e IVA.
      resumen.apuntesIva++;
      if (!/^\d+$/.test(contra) || contra.length !== c.length) err(n, `Contra «${p(27, 12)}» en un apunte de IVA`);
      if (!(Number(p(96, 8)) > 0)) err(n, 'apunte de IVA sin número de factura');
      const base = cent(p(271, 16)) ?? 0n, piva = Number(p(120, 5)), pre = Number(p(125, 5));
      const importe = d - h, esperado = BigInt(Math.round((Number(base) * (piva + (c.startsWith('477') ? pre : 0))) / 100));
      const abs = (x) => (x < 0n ? -x : x);
      const emitida = contra.startsWith('43');
      // Repercutido al haber (base positiva) y soportado al debe; el autorrepercutido de una compra, también al haber.
      const signo = c.startsWith('477') ? -1n : 1n;
      if (abs(signo * importe - esperado) > 5n) err(n, `importe ${importe} lejos de base ${base} × ${piva + pre} %`);
      const q = libro[trimestre(p(7, 8))];
      if (subcuentas) {
        const s = subcuentas.get(c), t = subcuentas.get(contra);
        if (s && !s.tipoIva) err(n, `subcuenta de IVA ${c} sin TipoIVA`);
        if (s && (s.tpc !== piva || s.re !== pre)) err(n, `IVA ${piva}/${pre} % en la subcuenta ${c} de ${s.tpc}/${s.re} %`);
        if (s?.tipoIva) q.tipos[s.tipoIva] = (q.tipos[s.tipoIva] || 0n) + base;
        if (t?.nif && !t.pais && t.idNif !== '6') err(n, `contrapartida ${contra} sin país`);
      }
      if (c.startsWith('477') && emitida) {
        const recargo = BigInt(Math.round((Number(base) * pre) / 100));
        q.expedidas.base += base; q.expedidas.recargo += recargo; q.expedidas.cuota += -importe - recargo;
      } else if (c.startsWith('472')) { q.recibidas.baseDeducible += base; q.recibidas.deducible += importe; }
      else if (c.startsWith('477')) q.recibidas.autorrepercutido = (q.recibidas.autorrepercutido || 0n) - importe;
    } else if (auxiliar !== '*' && auxiliar !== ' ') err(n, `Auxiliar «${auxiliar}»`);
    const a = p(1, 6).trim();
    porAsiento.set(a, (porAsiento.get(a) || 0n) + d - h);
    saldos[c] = (saldos[c] || 0n) + d - h;
  });
  if (subcuentas) for (const c of new Set([...Object.keys(saldos), ...filas.map((f) => f.slice(26, 38).trim()).filter(Boolean)])) if (!subcuentas.has(c)) err('XSubCta', `falta la subcuenta ${c}`);
  for (const [a, s] of porAsiento) if (s) err(`asiento ${a}`, `descuadrado en ${s} céntimos`);
  const nums = [...porAsiento.keys()].map(Number);
  if (nums.some((x, i) => x !== i + 1)) err(0, 'asientos no consecutivos o desordenados');
  return { errores, saldos, libro, resumen: { ...resumen, asientos: porAsiento.size, digitos } };
}
