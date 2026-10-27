'use client';

import { useId, useRef, useState } from 'react';
import { vistaImportacion } from '@/lib/vistaImportacion';
import Link from 'next/link';
import { eur, fechaCorta, pctCorto } from '@/lib/formato';
import { saldoDe as saldo } from '@/lib/calculos';
import Vacio from './Vacio';
import { ORIGENES, guiaDe } from '@/lib/importarOrigen';
import { useT } from '@/components/Idioma';
import '@/app/importar.css';

const TIPOS = [['clientes', 'Clientes'], ['facturas', 'Facturas'], ['gastos', 'Gastos'], ['productos', 'Productos'], ['saldos', 'Saldos'], ['bienes', 'Bienes']];
const DESTINO = { facturas: '/facturas', gastos: '/gastos', productos: '/facturas/catalogo', saldos: '/contabilidad?ver=balance', bienes: '/contabilidad?ver=bienes' };
const CONTABLE = ['saldos', 'bienes'];
const CAMPO = { nombre: 'Nombre', nif: 'NIF', email: 'Email', direccion: 'Dirección', cp: 'CP', ciudad: 'Población', numero: 'Número', fecha: 'Fecha', cliente: 'Cliente', concepto: 'Concepto', base: 'Base', ivaPct: '% IVA', iva: 'IVA', irpfPct: '% IRPF', irpf: 'Retención', total: 'Total', estado: 'Estado', pendiente: 'Pendiente', proveedor: 'Proveedor', proveedorNif: 'NIF proveedor', precio: 'Precio', cuenta: 'Cuenta', debe: 'Debe', haber: 'Haber', deudor: 'Saldo deudor', acreedor: 'Saldo acreedor', saldo: 'Saldo', valor: 'Valor', acumulada: 'Amortizado', tipo: 'Tipo', coef: '% anual', deduciblePct: '% deducible' };
// Instrucciones: qué columnas hacen falta (en negrita) y cuáles son opcionales, con títulos que se reconocen.
const AYUDA = {
  clientes: [['Nombre', 'o «Razón social», «Cliente», «Empresa»', true], ['NIF', 'o «CIF», «DNI»'], ['Email', 'o «Correo»'], ['Dirección'], ['Código postal', 'o «CP»'], ['Población', 'o «Ciudad»']],
  facturas: [['Número', 'o «Nº factura»', true], ['Fecha', '', true], ['Cliente', '', true], ['Base imponible', 'o «Total»: al menos una de las dos', true], ['% IVA', 'o «IVA» en euros'], ['NIF'], ['Concepto'], ['% IRPF', 'o «Retención»'], ['Estado', '«Cobrada», «Pendiente»…; sin columna, se dan por cobradas'], ['Pendiente', 'lo que falta por cobrar']],
  gastos: [['Fecha', '', true], ['Base imponible', 'o «Total»', true], ['Concepto', 'o «Proveedor»: al menos uno de los dos', true], ['NIF proveedor'], ['% IVA', 'o «IVA» en euros'], ['% IRPF'], ['Estado', '«Pagado», «Pendiente»…']],
  productos: [['Nombre', 'o «Producto», «Servicio»', true], ['Precio', 'o «PVP»', true], ['% IVA']],
  saldos: [['Cuenta', '', true], ['Saldo', 'o «Debe» y «Haber», o «Saldo deudor» y «Saldo acreedor»', true], ['Nombre', 'de la cuenta']],
  bienes: [['Fecha', 'de compra', true], ['Concepto', '', true], ['Valor', 'de compra', true], ['Amortizado', 'acumulado a la fecha del cambio'], ['Tipo', 'de bien'], ['% anual', 'coeficiente de amortización']],
};
const ESTADO = { nuevo: 'Nuevo', completar: 'Se completa', quitada: 'Quitada', duplicado: 'Ya existe', error: 'Error', agrupada: 'Suma de otras', omitida: 'Se salta' };

// Una línea legible de cada fila de la vista previa.
function resumen(tipo, d, tr) {
  if (tipo === 'clientes') return [d.nombre, [d.nif, d.ciudad, d.email].filter(Boolean).join(' · ')];
  if (tipo === 'productos') return [d.nombre, `${eur(d.precio)} · IVA ${pctCorto(d.ivaPct)}`];
  if (tipo === 'saldos') return [`${d.cuenta} · ${d.nombre || ''}`, `${d.saldo >= 0 ? tr('Deudor') : tr('Acreedor')} ${eur(Math.abs(d.saldo))}`];
  if (tipo === 'bienes') return [d.concepto, `${fechaCorta(d.fecha)} · ${eur(d.base)} · ${tr('amortizado {importe}', { importe: eur(d.inversion.acumulada) })}`];
  if (tipo === 'gastos') return [d.concepto, `${fechaCorta(d.fecha)} · ${eur(d.base)} + IVA ${pctCorto(d.ivaPct)}${d.pendiente ? ` · ${tr('sin pagar')}` : ''}`];
  return [`${d.importada} · ${d.cliente.nombre}`, `${fechaCorta(d.fecha)} · ${eur(d.base)} + IVA ${pctCorto(d.ivaPct)}${d.irpfPct ? ` − IRPF ${pctCorto(d.irpfPct)}` : ''} · ${d.cobrada ? tr('cobrada') : d.pagos?.length ? tr('cobrada en parte (pendiente {importe})', { importe: eur(saldo(d)) }) : tr('pendiente')}`];
}

// Importar desde Holded, Quipu u otro programa o Excel: se elige de dónde se viene y qué, se sube el archivo, se revisa la
// vista previa y se guarda. origen: el que trae la tarjeta «¿Vienes de otro programa?» (lib/importarOrigen.js).
export default function Importar({ origen: origenInicial = null }) {
  const tr = useT();
  const ayudaId = useId();
  const [origen, setOrigen] = useState(origenInicial);
  const guia = guiaDe(origen);
  const [tipo, setTipo] = useState('clientes');
  const [archivo, setArchivo] = useState(null);
  const [vista, setVista] = useState(null);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [fecha, setFecha] = useState('');
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState('todos');
  const [elegir, setElegir] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const enCurso = useRef(false);
  // Revisión a mano: filas quitadas y filas saltadas que se importan igualmente (números de fila del archivo).
  const revision = useRef({ quitar: [], incluir: [] });
  const columnasElegidas = useRef(null);
  const repetir = useRef(false);
  const reiniciar = () => { setPagina(1); setEstado('todos'); setVista(null); setMsg(''); setElegir(null); setAbierta(null); revision.current = { quitar: [], incluir: [] }; columnasElegidas.current = null; };
  const filas = vistaImportacion(vista?.items || [], estado, pagina);
  const pedir = async (guardar, cols = columnasElegidas.current, mantenerPagina = false) => {
    if (enCurso.current || !archivo) return;
    enCurso.current = true;
    setOcupado(true); setMsg(''); if (!mantenerPagina) setPagina(1);
    const fd = new FormData();
    fd.set('tipo', tipo); fd.set('archivo', archivo);
    if (fecha) fd.set('fecha', fecha);
    if (guardar) fd.set('guardar', '1');
    if (cols) fd.set('columnas', JSON.stringify(cols));
    fd.set('quitar', JSON.stringify(revision.current.quitar)); fd.set('incluir', JSON.stringify(revision.current.incluir));
    try {
      const r = await fetch('/api/importar', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      // Con la cabecera leída, se pueden elegir las columnas a mano aunque falte alguna obligatoria.
      if (d.cabecera) columnasElegidas.current = { fila: d.fila, mapa: d.mapa };
      if (d.cabecera) setElegir((antes) => { const sug = d.sugeridas || antes?.sugeridas || []; return { fila: d.fila, mapa: d.mapa, campos: d.campos, requeridos: d.requeridos, cabecera: d.cabecera, ejemplos: d.ejemplos, sugeridas: sug.filter((k) => k in d.mapa) }; });
      if (!r.ok) { setVista(null); setMsg(d.error || 'No se ha podido leer el archivo. Comprueba el formato e inténtalo otra vez.'); return; }
      setVista(d); if (!mantenerPagina) setPagina(1);
      if (!fecha && d.corte) setFecha(d.corte);
      if (guardar) setMsg(`✓ Importados ${d.guardados}${d.completados ? ` · completados ${d.completados}` : ''}`);
    } catch { setMsg('Sin conexión: inténtalo de nuevo'); } finally {
      enCurso.current = false; setOcupado(false);
      // Si se quitó o añadió otra fila mientras tanto, se rehace la vista previa con lo último.
      if (repetir.current && !guardar) { repetir.current = false; pedir(false, undefined, true); }
    }
  };
  // Quitar una fila o recuperar una saltada: se rehace la vista previa (los repetidos pueden cambiar) sin cambiar de página.
  const revisar = (lista, n) => {
    const l = revision.current[lista];
    revision.current = { ...revision.current, [lista]: l.includes(n) ? l.filter((x) => x !== n) : [...l, n] };
    if (enCurso.current) { repetir.current = true; return; }
    pedir(false, undefined, true);
  };
  // Cambiar a mano qué columna es un dato: la columna deja de usarse para cualquier otro y se rehace la vista previa.
  const asignar = (campo, valor) => {
    if (enCurso.current || !elegir) return;
    const mapa = Object.fromEntries(Object.entries(elegir.mapa).filter(([k, c]) => k !== campo && String(c) !== valor));
    if (valor !== '') mapa[campo] = Number(valor);
    setElegir({ ...elegir, mapa, sugeridas: elegir.sugeridas.filter((k) => k !== campo) });
    columnasElegidas.current = { fila: elegir.fila, mapa };
    pedir(false, { fila: elegir.fila, mapa });
  };
  const obligatorio = (k) => elegir.requeridos.some((r) => r.split('|').includes(k));
  const cambiar = (t) => { if (enCurso.current) return; setTipo(t); reiniciar(); };
  const hecho = vista && 'guardados' in vista;
  const pendiente = tr('Pendiente de cobro de las facturas nuevas: {x}{parciales}. Compáralo con tu programa de origen antes de importar.', { x: '\u0001', parciales: vista?.parciales ? ` · ${tr('{n} cobradas en parte (sin fecha ni método del cobro: no constan en el archivo)', { n: vista.parciales })}` : '' }).split('\u0001');
  const nombreTipo = tr(TIPOS.find((t) => t[0] === tipo)[1]).toLowerCase();
  const filaDe = tipo === 'clientes' ? 'cliente' : tipo === 'productos' ? 'producto' : tipo === 'facturas' ? 'factura' : 'gasto';
  return (
    <div className="importar">
      <section className="formulario tarjeta importar-origen" aria-labelledby={`${ayudaId}-origen`}>
        <h3 id={`${ayudaId}-origen`}>{tr('¿De dónde vienes?')}</h3>
        <div className="tipo importar-tipos" role="group" aria-labelledby={`${ayudaId}-origen`}>{ORIGENES.map((o) => <button type="button" key={o.id} aria-pressed={origen === o.id} className={origen === o.id ? 'activo' : ''} onClick={() => setOrigen(o.id)}>{tr(o.corto)}</button>)}</div>
        {guia ? (
          <div className="importar-guia">
            <p><strong>{tr(guia.titulo)}</strong></p>
            <ol>{guia.pasos.map((x) => <li key={x}>{tr(x)}</li>)}</ol>
            <p className="nota">{tr(guia.nota)}</p>
          </div>
        ) : <p className="nota">{tr('Elige tu programa y te decimos qué exportar. Si no está en la lista, vale cualquier Excel o CSV.')}</p>}
      </section>

      <section className="formulario tarjeta">
        <h3>{tr('Qué quieres importar')}</h3>
        <div className="tipo importar-tipos">{TIPOS.map(([k, n]) => <button type="button" disabled={ocupado} key={k} className={tipo === k ? 'activo' : ''} onClick={() => cambiar(k)}>{tr(n)}</button>)}</div>
        {CONTABLE.includes(tipo) ? <>
          <p className="nota">{tipo === 'saldos'
            ? tr('Para traer la contabilidad de otro programa (Holded, A3, Sage, Contasol…): exporta el balance de sumas y saldos a Excel a la fecha del cambio y súbelo. Pasa a ser el asiento de apertura; lo anterior a esa fecha no se vuelve a contabilizar. Puedes traer también las facturas sin cobrar y los gastos sin pagar: cuando se cobren o paguen, se apuntará solo el cobro o el pago.')
            : tr('Exporta el libro o inventario de bienes de inversión con la fecha de compra, el valor y lo ya amortizado a la fecha del cambio. Fisquo sigue amortizándolos desde ahí, con el mismo % si lo trae el archivo.')}</p>
          <label className="asiento-campo">{tr('Fecha de los saldos (la del cambio de programa)')}<input className="campo" type="date" disabled={ocupado} value={fecha} onChange={(e) => { if (enCurso.current) return; setFecha(e.target.value); reiniciar(); }} /></label>
        </> : <p className="nota">{origen === 'otro' ? tr('Exporta {tipo} a Excel o CSV y súbelo tal cual. Una fila de títulos y debajo una fila por cada {fila}.', { tipo: nombreTipo, fila: tr(filaDe) }) : tr('Desde {programa}: exporta {tipo} a Excel o CSV y súbelo tal cual. También vale tu propio Excel o CSV: una fila de títulos y debajo una fila por cada {fila}.', { programa: guia?.nombre || 'Holded', tipo: nombreTipo, fila: tr(filaDe) })}</p>}
        <details className="importar-ayuda">
          <summary>{tr('Cómo preparar el archivo')}</summary>
          <ul>{AYUDA[tipo].map(([n, otros, req]) => <li key={n}>{req ? <strong>{tr(n)}</strong> : tr(n)}{otros ? ` ${otros.startsWith('o ') ? `(${tr(otros)})` : `· ${tr(otros)}`}` : ''}{req ? ` · ${tr('obligatoria')}` : ''}</li>)}</ul>
          <p className="nota">{tr('El orden de las columnas da igual, las que sobran se descartan y no importa si hay un título encima de la tabla. Si alguna columna se llama de otra forma, después de subir el archivo puedes indicar cuál es cuál{ia}. Las filas de totales y cualquier otra tabla debajo de la lista (un resumen, por ejemplo) se saltan solas. En la vista previa puedes tocar cada fila para ver de dónde sale cada dato, quitar las que no quieras o importar una que se haya saltado. Nada se guarda hasta que revisas la vista previa y pulsas «Importar».', { ia: tipo === 'saldos' || tipo === 'bienes' ? '' : tr(': la IA lo intenta primero sola') })}{tipo === 'facturas' ? ` ${tr('Mejor importa antes los clientes: así las facturas los encuentran con todos sus datos.')}` : tipo === 'clientes' ? ` ${tr('Si un cliente ya existe (por ejemplo, creado al importar facturas), solo se rellenan sus datos vacíos: lo que ya tiene no se toca.')}` : ''}</p>
        </details>
        <label className="importar-archivo">
          <input type="file" disabled={ocupado} accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => { if (enCurso.current) return; setArchivo(e.target.files?.[0] || null); reiniciar(); }} />
        </label>
        {!archivo && <p id={`${ayudaId}-archivo`} className="nota">{tr('Elige un archivo para ver la vista previa.')}</p>}
        <button className="boton" disabled={!archivo || ocupado} aria-describedby={!archivo ? `${ayudaId}-archivo` : undefined} onClick={() => pedir(false)}>{ocupado && !vista ? tr('Leyendo…') : tr('Ver vista previa')}</button>
        {msg && <p role="status" className={msg.startsWith('✓') ? 'nota guardado' : 'error'}>{tr(msg)}</p>}
      </section>

      {elegir && !(vista && 'guardados' in vista) && (
        <section className="importar-columnas tarjeta">
          <h3>{tr('Qué es cada columna')}</h3>
          <p className="nota">{vista ? tr('Revisa que cada dato sale de la columna correcta. Si no, cámbialo y la vista previa se actualiza.') : tr('No se han reconocido todas las columnas obligatorias. Indica en qué columna está cada dato.')}</p>
          {elegir.sugeridas.length > 0 && <p className="nota">{tr('✦ Columnas sugeridas por la IA a partir de los títulos y de unos ejemplos: compruébalas.')}</p>}
          <div className="importar-columnas-lista">
            {elegir.campos.map((k) => (
              <label key={k} className="asiento-campo">
                <span>{tr(CAMPO[k] || k)}{obligatorio(k) ? ' *' : ''}{elegir.sugeridas.includes(k) ? ` · ✦ ${tr('IA')}` : ''}</span>
                <select className="campo" aria-label={tr('Columna de {campo}', { campo: tr(CAMPO[k] || k) })} disabled={ocupado} value={k in elegir.mapa ? String(elegir.mapa[k]) : ''} onChange={(e) => asignar(k, e.target.value)}>
                  <option value="">{tr('— No está en el archivo —')}</option>
                  {elegir.cabecera.map((h, c) => <option key={c} value={c}>{h || tr('Columna {n}', { n: c + 1 })}{elegir.ejemplos[c]?.[0] ? ` ${tr('(p. ej. {ejemplo})', { ejemplo: elegir.ejemplos[c][0] })}` : ''}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="nota">{tr('* Obligatoria')}{elegir.requeridos.some((r) => r.includes('|')) ? ` ${tr('(de las alternativas, como «Base» o «Total», basta con una)')}` : ''}.</p>
        </section>
      )}

      {vista && (
        <section className="importar-previa">
          <p className="resumen-linea importar-cuenta">
            <span>{tr('Nuevos')} <strong>{vista.nuevos}</strong></span>
            {vista.completar > 0 && <span>{tr('Se completan')} <strong>{vista.completar}</strong></span>}
            <span>{tr('Ya existen')} <strong>{vista.duplicados}</strong></span>
            {vista.errores > 0 && <span className="rojo">{tr('Con errores')} <strong>{vista.errores}</strong></span>}
            {vista.quitadas > 0 && <span>{tr('Quitadas')} <strong>{vista.quitadas}</strong></span>}
            {tipo !== 'saldos' && vista.items.some((x) => x.estado === 'omitida') && <span>{tr('Se saltan')} <strong>{vista.items.filter((x) => x.estado === 'omitida').length}</strong></span>}
          </p>
          {tipo === 'saldos' && <p className={`nota${vista.descuadre ? ' rojo' : ''}`}>{tr('Saldos deudores {debe} · acreedores {haber}', { debe: eur(vista.debe), haber: eur(vista.haber) })}{vista.descuadre ? ` ${tr('· la diferencia ({importe}) irá a la cuenta 129, resultado del ejercicio{revisa}', { importe: eur(Math.abs(vista.descuadre)), revisa: vista.conResultados ? tr(': revisa el archivo, porque ya trae cuentas de gastos e ingresos') : '' })}` : ` ${tr('· cuadra')}`}.</p>}
          {tipo === 'facturas' && vista.pendienteTotal !== undefined && <p className="nota">{pendiente[0]}<strong>{eur(vista.pendienteTotal)}</strong>{pendiente[1]}</p>}
          <label>{tr('Filtrar por estado')}
            <select className="campo" value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}>
              <option value="todos">{tr('Todos')}</option>
              <option value="nuevo">{tr('Nuevos')}</option>
              {vista.completar > 0 && <option value="completar">{tr('Se completan')}</option>}
              <option value="duplicado">{tr('Duplicados')}</option>
              <option value="error">{tr('Errores')}</option>
              {['omitida', 'agrupada', 'quitada'].filter((e) => vista.items.some((x) => x.estado === e)).map((e) => <option key={e} value={e}>{tr({ omitida: 'Omitidas', agrupada: 'Agrupadas', quitada: 'Quitadas' }[e])}</option>)}
            </select>
          </label>
          <p className="nota" role="status">{tr('Filas {desde}–{hasta} de {total}', { desde: filas.desde, hasta: filas.hasta, total: filas.total })}</p>
          {!filas.total && <Vacio compacto tipo="resultados" icono="excel" titulo={tr('No hay filas con este estado')}>{tr('Elige otro estado en el filtro para ver el resto de filas.')}</Vacio>}
          <ul className="grupo-lista importar-filas">
            {filas.items.map((x) => {
              const [a, b] = x.completa ? [x.datos.nombre, tr('Se añade: {campos}', { campos: Object.entries(x.completa).map(([k, v]) => `${tr(CAMPO[k] || k)} ${v}`).join(' · ') })] : x.datos ? resumen(tipo, x.datos, tr) : [x.original?.find(Boolean) || tr('Fila {n}', { n: x.n }), tr('Fila {n} · {detalle}', { n: x.n, detalle: x.estado === 'quitada' ? tr('no se importará') : tr(x.error) })];
              // Qué columna del archivo va a cada dato, para revisar la fila contra el Excel.
              const campoDe = Object.fromEntries(Object.entries(vista.mapa || {}).map(([k, c]) => [c, k]));
              const accion = hecho || tipo === 'saldos' ? null
                : ['nuevo', 'completar'].includes(x.estado) && !x.incluida ? [tr('Quitar'), () => revisar('quitar', x.n)]
                  : x.estado === 'quitada' ? [tr('Volver a añadir'), () => revisar('quitar', x.n)]
                    : x.estado === 'omitida' ? [tr('Importar igualmente'), () => revisar('incluir', x.n)]
                      : x.incluida ? [tr('Saltar'), () => revisar('incluir', x.n)] : null;
              return (
                <li key={x.n} className={`fila importar-fila i-${x.estado}`}>
                  <div className="importar-fila-linea">
                    <button type="button" className="txt importar-abrir" aria-expanded={abierta === x.n} onClick={() => setAbierta(abierta === x.n ? null : x.n)}>
                      <strong>{a}</strong><small>{b}</small>
                    </button>
                    <span className={`importar-estado i-${x.estado}`}>{tr(hecho && x.estado === 'nuevo' ? 'Importado' : hecho && x.estado === 'completar' ? 'Completado' : x.incluida ? 'Se importa igualmente' : ESTADO[x.estado])}</span>
                    {accion && <button type="button" className="boton sec importar-accion" onClick={accion[1]}>{accion[0]}</button>}
                  </div>
                  {abierta === x.n && x.original && (
                    <dl className="importar-detalle">
                      <div><dt>{tr('Fila del archivo')}</dt><dd>{x.n}</dd></div>
                      {x.original.map((v, c) => (v || campoDe[c] !== undefined) && (
                        <div key={c}><dt>{vista.cabecera?.[c] || tr('Columna {n}', { n: c + 1 })}{campoDe[c] ? ` → ${tr(CAMPO[campoDe[c]] || campoDe[c])}` : ` ${tr('(no se usa)')}`}</dt><dd>{v || '—'}</dd></div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
          <nav aria-label={tr('Páginas de la vista previa')} className="importar-paginacion">
            <button type="button" className="boton sec" aria-label={tr('Página anterior de la vista previa')} disabled={filas.pagina <= 1} aria-describedby={filas.pagina <= 1 ? `${ayudaId}-paginas` : undefined} onClick={() => setPagina(filas.pagina - 1)}>{tr('Anterior')}</button>
            <span id={`${ayudaId}-paginas`}>{tr('Página {pagina} de {paginas}', { pagina: filas.pagina, paginas: filas.paginas })}{filas.paginas === 1 ? ` ${tr('· Solo hay una página')}` : filas.pagina <= 1 ? ` ${tr('· Primera página')}` : filas.pagina >= filas.paginas ? ` ${tr('· Última página')}` : ''}</span>
            <button type="button" className="boton sec" aria-label={tr('Página siguiente de la vista previa')} disabled={filas.pagina >= filas.paginas} aria-describedby={filas.pagina >= filas.paginas ? `${ayudaId}-paginas` : undefined} onClick={() => setPagina(filas.pagina + 1)}>{tr('Siguiente')}</button>
          </nav>
          {hecho
            ? DESTINO[tipo] && <Link href={DESTINO[tipo]} className="boton sec">{tr('Ver {tipo}', { tipo: nombreTipo })}</Link>
            : <button className="boton" disabled={!(vista.nuevos || vista.completar) || ocupado || (CONTABLE.includes(tipo) && !fecha)} aria-describedby={!(vista.nuevos || vista.completar) || (CONTABLE.includes(tipo) && !fecha) ? `${ayudaId}-guardar` : undefined} onClick={() => pedir(true)}>{ocupado ? tr('Importando…') : vista.completar && !vista.nuevos ? tr('Completar {n}', { n: vista.completar }) : !vista.nuevos ? tr('No hay nada nuevo') : tipo === 'saldos' ? tr('Crear la apertura con {n} cuentas', { n: vista.nuevos }) : vista.completar ? tr('Importar {n} y completar {m}', { n: vista.nuevos, m: vista.completar }) : tr('Importar {n}', { n: vista.nuevos })}</button>}
          {!hecho && (!(vista.nuevos || vista.completar) || (CONTABLE.includes(tipo) && !fecha)) && <p id={`${ayudaId}-guardar`} className="nota">{!(vista.nuevos || vista.completar) ? tr('No hay filas nuevas para importar.') : CONTABLE.includes(tipo) && !fecha ? tr('Indica la fecha de los saldos para importar.') : ''}</p>}
          {!hecho && tipo === 'saldos' && <p className="nota">{tr('Si ya había un asiento de apertura, se sustituye.')}</p>}
          {!hecho && vista.duplicados > 0 && <p className="nota">{tr('Lo que ya existe no se toca{detalle}.', { detalle: tr(tipo === 'facturas' ? ': se compara por serie y número' : tipo === 'clientes' ? ': se compara por nombre o NIF, y de los que ya existen solo se rellenan los datos vacíos' : tipo === 'gastos' ? ': se compara por fecha, importe y concepto, y por proveedor y número de factura cuando los tienen' : ': se compara por nombre') })}</p>}
        </section>
      )}
    </div>
  );
}
