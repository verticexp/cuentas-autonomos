import { importes, r2 } from './calculos.js';
import { claveProveedor } from './proveedores.js';
import { fechaCorta } from './formato.js';

export const normalizarNumero = (n) => String(n ?? '').toLowerCase()
  .replace(/[\s\-/]/g, '').replace(/\d+/g, (parte) => parte.replace(/^0+(?=\d)/, ''));

// Las partes del número (letras y cifras, sin ceros a la izquierda): «F-0012» y «f12» son la misma, pero «1-23» y «12-3»
// no, aunque sin separadores las dos digan «123».
const partesNumero = (n) => (String(n ?? '').toLowerCase().normalize('NFD').match(/[a-z]+|\d+/g) || []).map((p) => p.replace(/^0+(?=\d)/, '')).join('|');
const normalizarTexto = (s) => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const totalCentimos = (g) => { const i = importes(g); return Math.round(r2(i.base + i.iva) * 100); };
const dia = (fecha) => Date.parse(`${fecha}T00:00:00Z`) / 864e5;
const fechaVisible = (fecha) => fechaCorta(String(fecha));

// Una coincidencia por gasto: prevalece el archivo, después el número y finalmente la aproximación.
// Seguras primero; dentro de cada certeza se conserva el orden de gastos.
export function posiblesDuplicados(nuevo, gastos, { dias = 7 } = {}) {
  const proveedor = claveProveedor(nuevo);
  const numero = normalizarNumero(nuevo.numero);
  const concepto = normalizarTexto(nuevo.concepto);
  const total = totalCentimos(nuevo);
  const resultados = [];

  for (const g of gastos) {
    if (nuevo.id != null && g.id === nuevo.id) continue;
    const mismoProveedor = Boolean(proveedor) && proveedor === claveProveedor(g);
    const nombre = String(g.proveedor || g.proveedorNif || proveedor).trim();
    const fecha = fechaVisible(g.fecha);
    let motivo;
    let certeza = 'segura';

    if (nuevo.archivo?.huella && nuevo.archivo.huella === g.archivo?.huella) {
      motivo = `Mismo archivo adjunto del ${fecha}`;
    } else if (mismoProveedor && numero && numero === normalizarNumero(g.numero)) {
      // Segura solo si coinciden las partes; si solo coincide al quitar los separadores, puede ser otra factura.
      const mismas = partesNumero(nuevo.numero) === partesNumero(g.numero);
      if (!mismas) certeza = 'probable';
      motivo = mismas ? `Misma factura de ${nombre} (nº ${g.numero}) del ${fecha}` : `Número parecido de ${nombre} (nº ${g.numero}) del ${fecha}`;
    } else if (Math.abs(total - totalCentimos(g)) <= 1) {
      certeza = 'probable';
      if (mismoProveedor && Math.abs(dia(nuevo.fecha) - dia(g.fecha)) <= dias) {
        motivo = `Mismo importe de ${nombre} con fecha cercana (${fecha})`;
      } else if (!proveedor && !claveProveedor(g) && concepto
        && concepto === normalizarTexto(g.concepto) && nuevo.fecha === g.fecha) {
        motivo = `Mismo concepto e importe del ${fecha}`;
      }
    }
    if (motivo) resultados.push({ id: g.id, motivo, certeza });
  }

  return resultados.sort((a, b) => Number(a.certeza === 'probable') - Number(b.certeza === 'probable'));
}
