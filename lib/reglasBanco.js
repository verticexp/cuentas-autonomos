// Reglas del banco (Banco › Reglas automáticas): «si el concepto contiene X (y el importe está entre A y B, cargo o abono)
// → es un gasto de este proveedor / esta categoría» o «→ ignorar». Sin dependencias de servidor, para poder probarlo.
//
// Una regla solo da pistas: no apunta nada por su cuenta.
//   · gasto: al movimiento se le presta el proveedor (conReglas) y lib/banco.js sugerencias propone su gasto con las
//     garantías de siempre (importe exacto, fechas, un solo candidato, sin conflictos). Si no hay gasto que cuadre, el
//     movimiento sigue por revisar. La categoría de la regla solo se pone al gasto que aún no tiene una.
//   · ignorar: el movimiento se aparta (traspaso entre cuentas, comisión ya apuntada).
// Solo cuentan los movimientos pendientes: una regla nunca toca lo que ya está emparejado o ignorado, y nunca empareja un
// movimiento con dos documentos. Lo que la persona devolvió a pendiente a mano (autoDescartada) no se aparta solo: la
// regla de gasto le sigue dando su proveedor (se confirma a mano), la de ignorar no lo toca.
import { CATEGORIAS } from './categorias.js';

export const MAX_REGLAS = 100;
export const ACCIONES = { gasto: 'Es un gasto de un proveedor', ignorar: 'Ignorarlo (traspaso, comisión ya apuntada…)' };
export const SIGNOS = { cargo: 'Cargo', abono: 'Abono', ambos: 'Los dos' };

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const texto = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const centimos = (n) => Math.round(n * 100);
const palabrasDe = (s) => norm(s).split(' ').filter(Boolean);
const conLetras = (s) => palabrasDe(s).some((w) => w.length >= 3);
const es = (objeto, clave) => typeof clave === 'string' && Object.hasOwn(objeto, clave);

// Un importe escrito a la española («1.234,50», «12,5 €») o un número. null si está vacío, NaN si no es un importe.
function importe(v) {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v * 100) / 100 : NaN;
  let s = String(v).replace(/[\s\u00A0€]/g, '');
  // «1.234,50» y «1.000» (miles) o «1234.50» (decimales): como se escriben aquí.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^\d{1,9}(\.\d{1,2})?$/.test(s) ? Number(s) : NaN;
}

// Lo que se guarda de una regla (sin id ni fecha) o el error para quien la escribe. Lo usan el servidor y el formulario.
export function limpiarRegla(b = {}) {
  const contiene = texto(b.contiene, 80);
  if (!conLetras(contiene)) return { error: 'Escribe lo que sale en el concepto del banco: al menos una palabra de 3 letras o números' };
  if (!es(ACCIONES, b.accion)) return { error: 'Elige qué hacer cuando la regla encaje' };
  const signo = es(SIGNOS, b.signo) ? b.signo : 'ambos';
  if (b.accion === 'gasto' && signo === 'abono') return { error: 'Un gasto es siempre un cargo: elige «Cargo»' };
  const min = importe(b.min), max = importe(b.max);
  if (Number.isNaN(min) || Number.isNaN(max)) return { error: 'Escribe los importes con números, por ejemplo 25 o 25,50' };
  if (min !== null && max !== null && min > max) return { error: 'El importe de «desde» no puede ser mayor que el de «hasta»' };
  const regla = { contiene, signo: b.accion === 'gasto' ? 'cargo' : signo, accion: b.accion, ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) };
  if (b.accion === 'ignorar') return { regla };
  const proveedor = texto(b.proveedor, 80);
  if (!proveedor) return { error: 'Escribe el proveedor: así lo busca Fisquo entre tus gastos' };
  if (!conLetras(proveedor)) return { error: 'El nombre del proveedor necesita alguna palabra de 3 letras o más' };
  const categoria = texto(b.categoria, 4);
  if (categoria && !CATEGORIAS.some((c) => c.id === categoria)) return { error: 'Esa categoría no existe' };
  return { regla: { ...regla, proveedor, ...(categoria ? { categoria } : {}) } };
}

// Quién puede crear, editar o borrar la regla: los permisos que hacen falta para ignorar o emparejar lo que cubre
// (lib/permisos.js: facturar para los abonos, gastar para los cargos).
export const permisosDeRegla = (r) => (r.accion === 'gasto' || r.signo === 'cargo' ? ['gastar'] : r.signo === 'abono' ? ['facturar'] : ['gastar', 'facturar']);

export const pendiente = (m) => Boolean(m) && (!m.estado || m.estado === 'pendiente');
// Lo que Fisquo puede dejar hecho solo: pendiente y sin devolver a pendiente a mano.
export const sinResolver = (m) => pendiente(m) && !m.autoDescartada;

export function encaja(r, m) {
  if (!r || !pendiente(m) || !Number.isFinite(m.importe) || !m.importe) return false;
  if (r.accion === 'ignorar' && m.autoDescartada) return false;
  if ((r.signo === 'cargo' && m.importe > 0) || (r.signo === 'abono' && m.importe < 0)) return false;
  if (r.accion === 'gasto' && m.importe > 0) return false;
  const c = centimos(Math.abs(m.importe));
  if (r.min != null && c < centimos(r.min)) return false;
  if (r.max != null && c > centimos(r.max)) return false;
  const t = norm(`${m.concepto || ''} ${m.contraparte || ''}`);
  const ws = palabrasDe(r.contiene);
  return ws.length > 0 && ws.every((w) => t.includes(w));
}

// La más concreta gana (más texto, con rango de importe, con cargo o abono); a igualdad, la más antigua.
const peso = (r) => norm(r.contiene).length + (r.min != null || r.max != null ? 50 : 0) + (r.signo && r.signo !== 'ambos' ? 10 : 0);
export const ordenar = (reglas) => [...(reglas || [])].filter((r) => r?.id && es(ACCIONES, r.accion))
  .sort((a, b) => peso(b) - peso(a) || String(a.creada || '').localeCompare(String(b.creada || '')) || String(a.id).localeCompare(String(b.id)));

// Para cada movimiento pendiente, la regla que le toca: { gasto: id → regla, ignorar: id → regla }. Nunca dos.
export function aplicarReglas(movimientos, reglas) {
  const orden = ordenar(reglas), gasto = new Map(), ignorar = new Map();
  if (orden.length) {
    for (const m of movimientos || []) {
      const r = pendiente(m) && orden.find((x) => encaja(x, m));
      if (r) (r.accion === 'gasto' ? gasto : ignorar).set(m.id, r);
    }
  }
  return { gasto, ignorar };
}

// Los movimientos para calcular sugerencias: a los cargos que encajan con una regla de gasto se les presta el proveedor
// como contraparte, y lib/banco.js lo trata como un nombre más del concepto. El resto, tal cual (mismo objeto).
export function conReglas(movimientos, reglas) {
  const { gasto } = aplicarReglas(movimientos, reglas);
  if (!gasto.size) return movimientos;
  return movimientos.map((m) => {
    const r = gasto.get(m.id);
    return r ? { ...m, contraparte: [m.contraparte, r.proveedor].filter(Boolean).join(' ') } : m;
  });
}

// ¿El gasto es del proveedor de la regla? Todas las palabras del nombre más corto salen en el otro.
export function proveedorCoincide(r, g) {
  const a = palabrasDe(r?.proveedor).filter((w) => w.length >= 3), b = palabrasDe(g?.proveedor).filter((w) => w.length >= 3);
  if (!a.length || !b.length) return false;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  return corto.every((w) => largo.includes(w));
}

// Frase de la regla para la lista y las sugerencias. dinero: cómo se escribe un importe (por defecto, «25 €»).
export function resumenRegla(r, dinero = (n) => `${String(n).replace('.', ',')} €`, nombreCategoria = (id) => CATEGORIAS.find((c) => c.id === id)?.nombre) {
  const importes = r.min != null && r.max != null ? `, de ${dinero(r.min)} a ${dinero(r.max)}` : r.min != null ? `, desde ${dinero(r.min)}` : r.max != null ? `, hasta ${dinero(r.max)}` : '';
  const que = r.signo === 'cargo' ? 'un cargo' : r.signo === 'abono' ? 'un abono' : 'un movimiento';
  const cuando = `Si ${que} contiene «${r.contiene}»${importes}`;
  const cat = r.categoria && nombreCategoria(r.categoria);
  return { cuando, entonces: r.accion === 'gasto' ? `es un gasto de ${r.proveedor}${cat ? ` (${cat})` : ''}` : 'se ignora' };
}

// Qué poner en «contiene» al crear una regla desde un movimiento: la contraparte o, si no hay, las palabras que distinguen
// su concepto (sin «recibo», «transferencia»…, sin números ni siglas de dos letras).
const GENERICAS = new Set(['recibo', 'transferencia', 'transf', 'pago', 'cobro', 'bizum', 'tarjeta', 'compra', 'desde', 'para', 'factura', 'concepto', 'favor', 'cuenta', 'adeudo', 'abono', 'ingreso', 'sepa', 'domiciliacion', 'trf']);
export function sugerirContiene(m) {
  const de = (s) => palabrasDe(s).filter((w) => w.length >= 3 && !/^\d+$/.test(w));
  const base = de(m.contraparte);
  const todas = base.length ? base : de(m.concepto);
  const utiles = todas.filter((w) => !GENERICAS.has(w));
  return (utiles.length ? utiles : todas).slice(0, 2).join(' ');
}

// Los valores con los que se abre el formulario desde un movimiento («Crear regla con esto»). clase: lo que Fisquo cree que es.
export function reglaDesde(m, clase) {
  const cargo = m.importe < 0;
  return { contiene: sugerirContiene(m), signo: cargo ? 'cargo' : 'abono', accion: cargo && clase !== 'traspaso' ? 'gasto' : 'ignorar', proveedor: cargo ? texto(m.contraparte, 80) : '', categoria: '', min: '', max: '' };
}
