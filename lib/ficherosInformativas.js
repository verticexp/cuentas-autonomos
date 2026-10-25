// Diseños BOE: 180 (2023), 190 (2025), 347 (2025) y Anexo 349. Registros de 500 bytes ISO-8859-1.
import { importe, nombreFiscal, numero, partirNombre, registro, texto } from './ficheroAeat.js';
import { r2 } from './calculos.js';

const suma = (lista, campo) => r2(lista.reduce((s, p) => s + Number(p[campo] || 0), 0));
const signo = (v) => v < 0 ? 'N' : ' ';
const conSigno = (v, lon) => signo(v) + importe(Math.abs(v), lon);
const nifLimpio = (n) => String(n || '').toUpperCase().replace(/[\s.-]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
function nifEspanol(n, nombre) {
  const nif = nifLimpio(n);
  if (!/^(\d{8}[A-Z]|[XYZKLM]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])$/.test(nif)) throw new Error(`Falta un NIF español válido de ${nombre || 'un perceptor'}: revísalo en su ficha, facturas o gastos`);
  return nif;
}
function correoContacto(email) {
  const correo = String(email || '').trim().toUpperCase();
  if (correo && (correo.length > 50 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+$/.test(correo))) throw new Error('Revisa el correo de la persona de contacto del 190');
  return correo.padEnd(50, ' ');
}
const nombreContacto = (nombre) => { const p = partirNombre(nombre); return texto(`${p.apellidos} ${p.nombre}`, 40); };

// Tipo 1 común, posiciones 1-135. El 349 exige blanco en 58; los demás, soporte T.
function cabecera(modelo, yo, anio, periodo) {
  let telefono = String(yo.telefono || '').replace(/[\s()+.-]/g, '');
  if (/^(0034|34)\d{9}$/.test(telefono)) telefono = telefono.slice(-9);
  if (!/^[1-9]\d{8}$/.test(telefono)) throw new Error('Rellena un teléfono de contacto de 9 dígitos en Ajustes para generar el fichero');
  if (!String(yo.contacto || '').trim()) throw new Error('Rellena tu nombre de usuario para usarlo como persona de contacto');
  // Primera declaración: secuencia 0001 por modelo, ejercicio y periodo; no es un justificante expedido por AEAT.
  // Se admite un identificativo explícito para una secuencia gestionada por el llamante.
  const codigoPeriodo = periodo?.endsWith('T') ? String(20 + Number(periodo[0])) : periodo || '00';
  const identificativo = String(yo.identificativo || `${modelo}${anio}${codigoPeriodo}0001`);
  if (!new RegExp(`^${modelo}\\d{10}$`).test(identificativo)) throw new Error(`El identificativo debe tener 13 dígitos y empezar por ${modelo}`);
  return [[1, `1${modelo}${numero(anio, 4)}${nifEspanol(yo.nif, 'el declarante')}`],
    [18, nombreFiscal(yo.nif, yo.nombre, 40)], [58, modelo === '349' ? ' ' : 'T'], [59, telefono],
    [68, nombreContacto(yo.contacto)], [108, identificativo], [123, numero(0, 13)]];
}
function perceptor(modelo, yo, anio, p) {
  const nif = nifEspanol(p.nif, p.nombre);
  if (!String(p.nombre || '').trim()) throw new Error(`Falta el nombre del perceptor ${nif}`);
  return [[1, `2${modelo}${numero(anio, 4)}${yo.nif}`], [18, nif], [36, nombreFiscal(nif, p.nombre, 40)]];
}
const salida = (cab, detalles) => ({ contenido: [registro(500, cab), ...detalles].join('\r\n') });
// Códigos de provincia sin datos: 00, conforme a la regla de numéricos sin contenido. Nunca se supone una provincia.
const provincia = (v, max = 53) => {
  if (!v) return '00';
  if (!/^\d{1,2}$/.test(String(v)) || Number(v) < 1 || Number(v) > max) throw new Error(`Código de provincia no válido: ${v}`);
  return numero(Number(v), 2);
};

// DR_Mod_180_2023, tipo 2, 76-134. Sin desglose adicional de devengo ni direcciones en modelo180.
export function fichero180(yo, anio, m) {
  const detalles = m.arrendadores.map((p) => {
    if (p.base < 0 && !p.ejercicioDevengo) throw new Error(`Falta el ejercicio de devengo del reintegro de ${p.nombre} en el 180`);
    const situacion = Number(p.situacion || 0);
    if (![0, 1, 2, 3, 4].includes(situacion)) throw new Error(`Situación del inmueble no válida: ${p.situacion}`);
    if ([1, 2, 3].includes(situacion) && !/^[A-Z0-9]{20}$/.test(String(p.refCatastral || '').toUpperCase())) throw new Error(`Revisa la referencia catastral de ${p.nombre}`);
    return registro(500, [...perceptor('180', yo, anio, p), [76, provincia(p.provincia)], [78, '1'],
      [79, conSigno(p.base, 13)], [93, '1900'], [97, importe(p.retenciones, 13)], [110, numero(p.ejercicioDevengo || 0, 4)],
      [114, numero(situacion, 1)], [115, texto(p.refCatastral, 20)],
      // 316-327 son numéricos dentro de la dirección; modelo180 no conserva dirección ni provincia.
      [316, numero(0, 12)]]);
  });
  return salida([...cabecera('180', yo, anio), [136, numero(detalles.length, 9)],
    [145, conSigno(suma(m.arrendadores, 'base'), 15)], [161, importe(suma(m.arrendadores, 'retenciones'), 15)]], detalles);
}

// DISENOS_LOGICOS_190_2025, tipo 2: A sin subclave (numérico vacío = 00), E/G/H/I con su subclave.
export function fichero190(yo, anio, m) {
  const detalles = m.perceptores.map((p) => {
    if (p.percepciones < 0 && !p.ejercicioDevengo) throw new Error(`Falta el ejercicio de devengo del reintegro de ${p.nombre} en el 190`);
    const subclaves = { E: ['01', '02', '03', '04'], G: ['01', '02', '03', '04', '05', '06', '07', '08'], H: ['01', '02', '03', '04'], I: ['01', '02', '03'] };
    if (p.clave !== 'A' && !subclaves[p.clave]?.includes(p.subclave)) throw new Error(`Clave o subclave del 190 no válida: ${p.clave}${p.subclave || ''}`);
    const campos = [...perceptor('190', yo, anio, p), [76, provincia(p.provincia)], [78, p.clave], [79, p.clave === 'A' ? '00' : p.subclave],
      [81, conSigno(p.percepciones, 13)], [95, importe(p.retenciones, 13)],
      [109, numero(0, 39)], [148, numero(p.ejercicioDevengo || 0, 4)], [152, '0'],
      [153, numero(p.clave === 'A' ? p.nacimiento || 0 : 0, 4)],
      // Situación 3: no comunicada; es el valor que permite expresamente el diseño (157).
      [157, numero(p.clave === 'A' ? p.situacionFamiliar || 3 : 0, 1)],
      [158, p.clave === 'A' && p.situacionFamiliar === 2 ? nifEspanol(p.nifConyuge, `el cónyuge de ${p.nombre}`) : texto('', 9)],
      [167, numero(p.clave === 'A' ? p.discapacidad || 0 : 0, 1)], [168, numero(p.clave === 'A' ? p.contrato || 1 : 0, 1)], [169, '0'],
      [170, numero(p.clave === 'A' ? p.movilidad || 0 : 0, 1)], [171, numero(0, 13)],
      [184, importe(p.gastosDeducibles || 0, 13)], [197, numero(0, 26)],
      [223, numero(p.hijos?.menores3?.total || 0, 1)], [224, numero(p.hijos?.menores3?.porEntero || 0, 1)],
      [225, numero(p.hijos?.resto?.total || 0, 2)], [227, numero(p.hijos?.resto?.porEntero || 0, 2)],
      [229, numero(0, 26)], [256, numero(0, 26)], [283, numero(0, 39)], [322, '0'],
      // Clave E: retenciones íntegramente estatales (323-335); reparto foral no calculado por la app.
      [323, importe(p.clave === 'E' ? p.retenciones : 0, 13)], [336, numero(0, 59)]];
    return registro(500, campos);
  });
  return salida([...cabecera('190', yo, anio), [136, numero(detalles.length, 9)],
    [145, conSigno(suma(m.perceptores, 'percepciones'), 15)], [161, importe(suma(m.perceptores, 'retenciones'), 15)], [176, correoContacto(yo.email)]], detalles);
}

// 347, tipo 2 de declarado (D). modelo347 no calcula registros de inmueble del arrendador (I).
export function fichero347(yo, anio, m) {
  if (m.sinNif?.length) throw new Error(`Falta el NIF o país de: ${m.sinNif.map((p) => p.nombre).join(', ')}`);
  const declarados = [...m.ventas, ...m.compras];
  // La provincia del declarado residente es obligatoria (77-78): sale del código postal de su ficha o de la factura.
  const sinProvincia = [...new Set(declarados.filter((p) => p.provincia !== '99' && !p.provincia).map((p) => p.nombre))];
  if (sinProvincia.length) throw new Error(`Falta el código postal de ${sinProvincia.join(', ')}: ponlo en su ficha (Ciudad y CP) para saber su provincia`);
  const detalles = declarados.map((p) => {
    const extranjero = p.provincia === '99';
    if (extranjero && (!/^[A-Z]{2}$/.test(p.pais || '') || p.pais === 'ES')) throw new Error(`Falta un país válido de ${p.nombre}`);
    if (!['A', 'B'].includes(p.clave)) throw new Error(`Clave del 347 no válida: ${p.clave}`);
    if (p.nif && p.nifComunitario) throw new Error(`NIF español y comunitario incompatibles: ${p.nombre}`);
    if (!p.nif && !p.nifComunitario && !extranjero) throw new Error(`Falta el NIF de ${p.nombre}`);
    const nif = p.nif ? nifEspanol(p.nif, p.nombre) : '';
    const campos = [[1, `2347${numero(anio, 4)}${yo.nif}`], [18, texto(nif, 9)], [36, nombreFiscal(nif, p.nombre, 40)],
      [76, 'D'], [77, extranjero ? '99' : provincia(p.provincia, 52)], [79, extranjero ? p.pais : '  '], [82, p.clave],
      [83, conSigno(p.total, 15)], [100, p.arrendamiento ? 'X' : ' '], [101, importe(p.metalico || 0, 15)],
      [116, conSigno(0, 15)], [132, numero(p.ejercicioMetalico || 0, 4)],
      [264, texto(p.nifComunitario, 17)], [281, p.caja ? 'X' : ' '], [282, p.isp ? 'X' : ' '],
      [284, conSigno(p.importeCaja || 0, 15)], [300, numero(0, 6)]];
    for (let i = 0; i < 4; i++) {
      // Criterio de caja: sin desglose trimestral (136-263); importes numéricos sin contenido, a ceros.
      campos.push([136 + 32 * i, conSigno(!m.soloAnual && !p.caja ? p.trimestres?.[i] || 0 : 0, 15)], [152 + 32 * i, conSigno(0, 15)]);
    }
    return registro(500, campos);
  });
  return salida([...cabecera('347', yo, anio), [136, numero(detalles.length, 9)], [145, conSigno(suma(declarados, 'total'), 15)],
    [161, numero(0, 9)], [170, conSigno(0, 15)]], detalles);
}

// DR_Anexo_349, tipo 2: base ordinaria en 134-146; rectificaciones, 147-178 (base nueva y anterior).
export function fichero349(yo, anio, periodo, m) {
  if (!/^([1-4]T|0[1-9]|1[0-2])$/.test(periodo)) throw new Error('Periodo del 349 no válido');
  if (m.negativos?.length) throw new Error('El 349 contiene bases negativas: enlaza los abonos con su operación original para declararlos como rectificaciones');
  const operador = (p, rectificacion) => {
    const nif = String(p.nif || '').toUpperCase().replace(/[\s.-]/g, '');
    if (!/^[A-Z]{2}[A-Z0-9]{2,15}$/.test(nif)) throw new Error(`Revisa el NIF comunitario de ${p.nombre}`);
    if (!['E', 'S', 'I', 'A', 'T'].includes(p.clave)) throw new Error(`Clave del 349 no calculada por Fisquo: ${p.clave}`);
    if (!p.nombre) throw new Error(`Falta el nombre del operador ${nif}`);
    const campos = [[1, `2349${numero(anio, 4)}${yo.nif}`], [76, texto(nif, 17)], [93, texto(p.nombre, 40)], [133, p.clave]];
    if (rectificacion) {
      if (!/^([1-4]T|0[1-9]|1[0-2]|0A)$/.test(p.periodo)) throw new Error('Periodo de la rectificación del 349 no válido');
      campos.push([147, numero(p.ejercicio, 4)], [151, p.periodo], [153, importe(p.base, 13)], [166, importe(p.anterior, 13)]);
    } else campos.push([134, importe(p.base, 13)]);
    return registro(500, campos);
  };
  const rectificaciones = m.rectificaciones || [];
  return salida([...cabecera('349', yo, anio, periodo), [136, periodo], [138, numero(m.operadores.length, 9)],
    [147, importe(suma(m.operadores, 'base'), 15)], [162, numero(rectificaciones.length, 9)], [171, importe(suma(rectificaciones, 'base'), 15)],
    // Periodo mensual que acumula los dos primeros meses: el cálculo indica el mes de corte.
    [186, m.mensual && Number(periodo) === Number(m.mensual.slice(5, 7)) && Number(periodo) % 3 === 2 ? 'X' : ' ']],
  [...m.operadores.map((p) => operador(p, false)), ...rectificaciones.map((p) => operador(p, true))]);
}
