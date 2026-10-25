// Modelos de la tarjeta «Toca presentar» de Impuestos: todos los que vencen con el trimestre t, no solo el 303 y el 130
// (auditoría 19-10-2026). Sin dependencias de la base de datos, para poder probarlo.
//   303 y 130: siempre que la persona los presente (aunque salgan a cero, se presentan).
//   111, 115, 123 y 349: solo si hay retenciones u operaciones. El 111 también con nóminas pagadas sin retención por su
//   cuantía: es la declaración negativa del art. 108.1 RIRPF (negativa111). En el 4T, el 111, el 115,
//   el 123 y el 216 vencen el 20 de enero y el resto el 30: llevan `dia: 20` para que la tarjeta lo diga.
//   216 (no residentes): con retenciones o, sin ellas, con rentas exentas pagadas (negativa216: se presenta como negativa,
//   instrucciones del 216).
//   202: el pago de abril va con el 1T y el de octubre con el 3T (el de diciembre no coincide con ningún trimestre); sale
//   si es a pagar y no está marcado, o si falta la cuota de la que sale (salvo que la sociedad aún no existiera ese año).
import { eur } from './formato.js';

const texto = (m) => (m.compensar ? `A compensar ${eur(m.compensar)}` : m.importe ? `A ingresar ${eur(m.importe)}` : 'Sin importe a ingresar');

// datos: { m303, m130 } como { importe, compensar? } o null; m111 y m115, el importe o null si no los presenta;
// m349: { total, operadores } o null; pagos202: la salida de modelo202 del año (o null si no es sociedad);
// pagados202: lo marcado como pagado ese año ({ 1: importe, … }); constitucion: AAAA-MM-DD o vacío.
export function modelosAPresentar(t, { m303 = null, m130 = null, m131 = null, m111 = null, negativa111 = false, m115 = null, m123 = null, m216 = null, negativa216 = false, m349 = null, m309 = null, pagos202 = null, pagados202 = {}, constitucion = '' } = {}) {
  const l = [];
  if (m303) l.push({ num: '303', modelo: '303 · IVA', href: '#m303', texto: texto(m303), importe: m303.importe || 0 });
  if (m130) l.push({ num: '130', modelo: '130 · IRPF', href: '#m130', texto: texto(m130), importe: m130.importe || 0 });
  if (m131) l.push({ num: '131', modelo: '131 · IRPF en módulos', href: '#m131', texto: texto(m131), importe: m131.importe || 0 });
  const dia = t === 4 ? 20 : undefined;
  if (m111 > 0 || (m111 === 0 && negativa111)) l.push({ num: '111', modelo: '111 · Retenciones', href: '#m111', texto: m111 > 0 ? texto({ importe: m111 }) : 'Negativo: sin importe, pero se presenta', importe: m111, dia });
  if (m115 > 0) l.push({ num: '115', modelo: '115 · Alquiler', href: '#m115', texto: texto({ importe: m115 }), importe: m115, dia });
  // 309: sin 303, el IVA de las compras a la UE o con inversión del sujeto pasivo (vence con el 303: el 30 de enero en el 4T).
  if (m309 > 0) l.push({ num: '309', modelo: '309 · IVA no periódico', href: '#m309', texto: texto({ importe: m309 }), importe: m309 });
  if (m123 > 0) l.push({ num: '123', modelo: '123 · Dividendos e intereses', href: '#m123', texto: texto({ importe: m123 }), importe: m123, dia });
  if (m216 > 0 || (m216 === 0 && negativa216)) l.push({ num: '216', modelo: '216 · No residentes', href: '#m216', texto: m216 > 0 ? texto({ importe: m216 }) : 'Negativa: sin importe, pero se presenta', importe: m216, dia });
  // También con solo rectificaciones de periodos anteriores (lib/modelos.js modelo349).
  if (m349?.operadores?.length || m349?.rectificaciones?.length) l.push({ num: '349', modelo: '349 · Ventas y compras con empresas de la UE', href: '#m349', texto: m349.operadores?.length ? `${m349.operadores.length} ${m349.operadores.length === 1 ? 'empresa' : 'empresas'} · ${eur(m349.total)}` : `${m349.rectificaciones.length === 1 ? '1 rectificación' : `${m349.rectificaciones.length} rectificaciones`}`, importe: 0 });
  const x = pagos202 && { 1: pagos202[0], 3: pagos202[1] }[t];
  const existia = (y) => !constitucion || Number(constitucion.slice(0, 4)) <= y;
  if (x && existia(x.de)) {
    if (x.cuota === null) l.push({ num: '202', modelo: '202 · Sociedades', href: '#m202', texto: `Falta la cuota de ${x.de}`, importe: 0 });
    else if (x.pago > 0 && pagados202?.[x.p] === undefined) l.push({ num: '202', modelo: '202 · Sociedades', href: '#m202', texto: texto({ importe: x.pago }), importe: x.pago });
  }
  return l;
}
