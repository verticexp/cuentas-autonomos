// Comprobación de integridad de la facturación de una empresa (auditoría de octubre de 2026). Pura: recibe los datos y
// devuelve las incidencias. La usan la migración (scripts/migrar-integridad.mjs) y las pruebas.
// datos: { facturas, borradas, registros, cabeza (huella de la cabeza Verifactu), numeracion ({ 'serie|año': n }) }
export function comprobarIntegridad({ facturas = [], borradas = [], registros = [], cabeza = '', numeracion = {} }) {
  const inc = [];
  // Números repetidos dentro de una serie y año (las importadas conservan su número de origen y no cuentan).
  const vistos = new Map();
  for (const f of [...facturas, ...borradas].filter((x) => !x.importada)) {
    const k = `${f.serie || '-'}|${f.anio}|${f.numero}`;
    if (vistos.has(k)) inc.push({ tipo: 'numero-repetido', detalle: `${k}: ${vistos.get(k)} y ${f.id}` });
    else vistos.set(k, f.id);
  }
  // Contador por detrás de lo emitido (permitiría reutilizar un número).
  const max = {};
  for (const f of [...facturas, ...borradas].filter((x) => !x.importada)) { const k = `${f.serie || '-'}|${f.anio}`; max[k] = Math.max(max[k] || 0, f.numero); }
  for (const [k, n] of Object.entries(numeracion)) if (max[k] > Number(n)) inc.push({ tipo: 'contador-atrasado', detalle: `${k}: contador ${n}, emitida la ${max[k]}` });
  // Huecos dentro de una serie y año (art. 6.1.a del Reglamento de facturación: numeración correlativa), contando las
  // borradas, que conservan su número. Desde la primera emitida en Fisquo: empezar en otro número (quien viene de otro
  // programa) no es un hueco (auditoría 28-10-2026).
  const numeros = {};
  for (const f of [...facturas, ...borradas].filter((x) => !x.importada && Number.isInteger(x.numero))) (numeros[`${f.serie || '-'}|${f.anio}`] ||= new Set()).add(f.numero);
  for (const [k, s] of Object.entries(numeros)) {
    const faltan = [];
    for (let i = Math.min(...s) + 1; i < Math.max(...s) && faltan.length <= 10; i++) if (!s.has(i)) faltan.push(i);
    if (faltan.length) inc.push({ tipo: 'hueco', detalle: `${k}: falta${faltan.length > 1 ? 'n' : ''} ${faltan.slice(0, 10).join(', ')}${faltan.length > 10 ? '…' : ''}` });
  }
  // Cadena Verifactu: un solo primer registro, cada uno enlaza con uno que existe, ninguno con dos sucesores y la
  // cabeza es el último. Cada registro tiene su factura y cada factura con Verifactu su registro.
  if (registros.length || cabeza || [...facturas, ...borradas].some((f) => f.verifactu)) {
    const huellas = new Map(registros.map((r) => [r.Huella, r]));
    const primeros = registros.filter((r) => !r.HuellaAnterior);
    if (registros.length && primeros.length !== 1) inc.push({ tipo: 'cadena-primeros', detalle: `${primeros.length} registros sin anterior` });
    const hijos = new Map();
    for (const r of registros) {
      if (r.HuellaAnterior && !huellas.has(r.HuellaAnterior)) inc.push({ tipo: 'cadena-rota', detalle: `${r.NumSerieFactura}: su anterior no existe` });
      if (r.HuellaAnterior) hijos.set(r.HuellaAnterior, [...(hijos.get(r.HuellaAnterior) || []), r.NumSerieFactura]);
    }
    for (const [h, xs] of hijos) if (xs.length > 1) inc.push({ tipo: 'cadena-bifurcada', detalle: `${huellas.get(h)?.NumSerieFactura || h}: ${xs.join(', ')}` });
    if (cabeza && hijos.has(cabeza)) inc.push({ tipo: 'cabeza-atrasada', detalle: 'la cabeza de la cadena tiene sucesor' });
    if (cabeza && !huellas.has(cabeza)) inc.push({ tipo: 'cabeza-desconocida', detalle: cabeza });
    // Los registros de facturas anuladas o borradas cuelgan de «facturasBorradas».
    const ids = new Set([...facturas, ...borradas].map((f) => f.id));
    for (const r of registros) if (!ids.has(r.factura)) inc.push({ tipo: 'registro-huerfano', detalle: `${r.NumSerieFactura} (${r.factura})` });
    for (const f of [...facturas, ...borradas].filter((x) => x.verifactu)) if (!huellas.has(f.verifactu.huella)) inc.push({ tipo: 'factura-sin-registro', detalle: f.id });
    for (const f of borradas.filter((x) => x.verifactu && !x.verifactu.anulacion)) inc.push({ tipo: 'verifactu-borrada-sin-anular', detalle: f.id });
  }
  for (const f of facturas.filter((x) => !x.emisor)) inc.push({ tipo: 'sin-instantanea', detalle: f.id });
  return inc;
}

// Contadores a partir de lo ya emitido (para inicializar la numeración de las empresas de antes).
export function contadoresDe(facturas = [], borradas = []) {
  const c = {};
  for (const f of [...facturas, ...borradas].filter((x) => !x.importada && Number.isInteger(x.numero))) { const k = `${f.serie || '-'}|${f.anio}`; c[k] = Math.max(c[k] || 0, f.numero); }
  return c;
}
