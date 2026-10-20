'use client';

import { useId, useRef, useState } from 'react';
import { vistaImportacion } from '@/lib/vistaImportacion';
import Link from 'next/link';
import { eur, fechaCorta } from '@/lib/formato';
import { saldoDe as saldo } from '@/lib/calculos';
import '@/app/importar.css';

const TIPOS = [['clientes', 'Clientes'], ['facturas', 'Facturas'], ['gastos', 'Gastos'], ['productos', 'Productos'], ['saldos', 'Saldos'], ['bienes', 'Bienes']];
const DESTINO = { facturas: '/facturas', gastos: '/gastos', productos: '/facturas/catalogo', saldos: '/contabilidad?ver=balance', bienes: '/contabilidad?ver=bienes' };
const CONTABLE = ['saldos', 'bienes'];
const CAMPO = { nombre: 'Nombre', nif: 'NIF', email: 'Email', direccion: 'Dirección', cp: 'CP', ciudad: 'Población', numero: 'Número', fecha: 'Fecha', cliente: 'Cliente', concepto: 'Concepto', base: 'Base', ivaPct: '% IVA', iva: 'IVA', irpfPct: '% IRPF', irpf: 'Retención', total: 'Total', estado: 'Estado', pendiente: 'Pendiente', proveedor: 'Proveedor', proveedorNif: 'NIF proveedor', precio: 'Precio', cuenta: 'Cuenta', debe: 'Debe', haber: 'Haber', deudor: 'Saldo deudor', acreedor: 'Saldo acreedor', saldo: 'Saldo', valor: 'Valor', acumulada: 'Amortizado', tipo: 'Tipo', coef: '% anual' };
const ESTADO = { nuevo: 'Nuevo', duplicado: 'Ya existe', error: 'Error', agrupada: 'Suma de otras', omitida: 'Se salta' };

// Una línea legible de cada fila de la vista previa.
function resumen(tipo, d) {
  if (tipo === 'clientes') return [d.nombre, [d.nif, d.ciudad, d.email].filter(Boolean).join(' · ')];
  if (tipo === 'productos') return [d.nombre, `${eur(d.precio)} · IVA ${d.ivaPct} %`];
  if (tipo === 'saldos') return [`${d.cuenta} · ${d.nombre || ''}`, `${d.saldo >= 0 ? 'Deudor' : 'Acreedor'} ${eur(Math.abs(d.saldo))}`];
  if (tipo === 'bienes') return [d.concepto, `${fechaCorta(d.fecha)} · ${eur(d.base)} · amortizado ${eur(d.inversion.acumulada)}`];
  if (tipo === 'gastos') return [d.concepto, `${fechaCorta(d.fecha)} · ${eur(d.base)} + IVA ${d.ivaPct} %${d.pendiente ? ' · sin pagar' : ''}`];
  return [`${d.importada} · ${d.cliente.nombre}`, `${fechaCorta(d.fecha)} · ${eur(d.base)} + IVA ${d.ivaPct} %${d.irpfPct ? ` − IRPF ${d.irpfPct} %` : ''} · ${d.cobrada ? 'cobrada' : d.pagos?.length ? `cobrada en parte (pendiente ${eur(saldo(d))})` : 'pendiente'}`];
}

// Importar desde Holded o Excel: se elige qué, se sube el archivo, se revisa la vista previa y se guarda.
export default function Importar() {
  const ayudaId = useId();
  const [tipo, setTipo] = useState('clientes');
  const [archivo, setArchivo] = useState(null);
  const [vista, setVista] = useState(null);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [fecha, setFecha] = useState('');
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState('todos');
  const enCurso = useRef(false);
  const reiniciar = () => { setPagina(1); setEstado('todos'); setVista(null); setMsg(''); };
  const filas = vistaImportacion(vista?.items || [], estado, pagina);
  const pedir = async (guardar) => {
    if (enCurso.current || !archivo) return;
    enCurso.current = true;
    setOcupado(true); setMsg(''); setPagina(1);
    const fd = new FormData();
    fd.set('tipo', tipo); fd.set('archivo', archivo);
    if (fecha) fd.set('fecha', fecha);
    if (guardar) fd.set('guardar', '1');
    try {
      const r = await fetch('/api/importar', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setVista(null); setMsg(d.error || 'No se pudo leer el archivo'); return; }
      setVista(d); setPagina(1);
      if (!fecha && d.corte) setFecha(d.corte);
      if (guardar) setMsg(`✓ Importados ${d.guardados}`);
    } catch { setMsg('Sin conexión: inténtalo de nuevo'); } finally { enCurso.current = false; setOcupado(false); }
  };
  const cambiar = (t) => { if (enCurso.current) return; setTipo(t); reiniciar(); };
  const hecho = vista && 'guardados' in vista;
  return (
    <div className="importar">
      <section className="formulario tarjeta">
        <h3>Qué quieres importar</h3>
        <div className="tipo importar-tipos">{TIPOS.map(([k, n]) => <button type="button" disabled={ocupado} key={k} className={tipo === k ? 'activo' : ''} onClick={() => cambiar(k)}>{n}</button>)}</div>
        {CONTABLE.includes(tipo) ? <>
          <p className="nota">{tipo === 'saldos'
            ? 'Para traer la contabilidad de otro programa (Holded, A3, Sage, Contasol…): exporta el balance de sumas y saldos a Excel a la fecha del cambio y súbelo. Pasa a ser el asiento de apertura; lo anterior a esa fecha no se vuelve a contabilizar. Puedes traer también las facturas sin cobrar y los gastos sin pagar: cuando se cobren o paguen, se apuntará solo el cobro o el pago.'
            : 'Exporta el libro o inventario de bienes de inversión con la fecha de compra, el valor y lo ya amortizado a la fecha del cambio. Fisquo sigue amortizándolos desde ahí, con el mismo % si lo trae el archivo.'}</p>
          <label className="asiento-campo">Fecha de los saldos (la del cambio de programa)<input className="campo" type="date" disabled={ocupado} value={fecha} onChange={(e) => { if (enCurso.current) return; setFecha(e.target.value); reiniciar(); }} /></label>
        </> : <p className="nota">Desde Holded: exporta {TIPOS.find((t) => t[0] === tipo)[1].toLowerCase()} a Excel y súbelo tal cual. También vale un Excel o CSV tuyo con la primera fila de títulos.</p>}
        <label className="importar-archivo">
          <input type="file" disabled={ocupado} accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => { if (enCurso.current) return; setArchivo(e.target.files?.[0] || null); reiniciar(); }} />
        </label>
        {!archivo && <p id={`${ayudaId}-archivo`} className="nota">Elige un archivo para ver la vista previa.</p>}
        <button className="boton" disabled={!archivo || ocupado} aria-describedby={!archivo ? `${ayudaId}-archivo` : undefined} onClick={() => pedir(false)}>{ocupado && !vista ? 'Leyendo…' : 'Ver vista previa'}</button>
        {msg && <p role="status" className={msg.startsWith('✓') ? 'nota guardado' : 'error'}>{msg}</p>}
      </section>

      {vista && (
        <section className="importar-previa">
          <p className="resumen-linea importar-cuenta">
            <span>Nuevos <strong>{vista.nuevos}</strong></span>
            <span>Ya existen <strong>{vista.duplicados}</strong></span>
            {vista.errores > 0 && <span className="rojo">Con errores <strong>{vista.errores}</strong></span>}
          </p>
          {tipo === 'saldos' && <p className={`nota${vista.descuadre ? ' rojo' : ''}`}>Saldos deudores {eur(vista.debe)} · acreedores {eur(vista.haber)}{vista.descuadre ? ` · la diferencia (${eur(Math.abs(vista.descuadre))}) irá a la cuenta 129, resultado del ejercicio${vista.conResultados ? ': revisa el archivo, porque ya trae cuentas de gastos e ingresos' : ''}` : ' · cuadra'}.</p>}
          {tipo === 'facturas' && vista.pendienteTotal !== undefined && <p className="nota">Pendiente de cobro de las facturas nuevas: <strong>{eur(vista.pendienteTotal)}</strong>{vista.parciales ? ` · ${vista.parciales} cobradas en parte (sin fecha ni método del cobro: no constan en el archivo)` : ''}. Compáralo con tu programa de origen antes de importar.</p>}
          <p className="nota">Columnas: {Object.entries(vista.columnas).map(([k, c]) => `${CAMPO[k] || k} ← «${c}»`).join(' · ')}</p>
          <label>Filtrar por estado
            <select className="campo" value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}>
              <option value="todos">Todos</option>
              <option value="nuevo">Nuevos</option>
              <option value="duplicado">Duplicados</option>
              <option value="error">Errores</option>
              {['omitida', 'agrupada'].filter((e) => vista.items.some((x) => x.estado === e)).map((e) => <option key={e} value={e}>{e === 'omitida' ? 'Omitidas' : 'Agrupadas'}</option>)}
            </select>
          </label>
          <p className="nota" role="status">Filas {filas.desde}–{filas.hasta} de {filas.total}</p>
          {!filas.total && <p className="nota">No hay filas con este estado.</p>}
          <ul className="grupo-lista importar-filas">
            {filas.items.map((x) => {
              const [a, b] = x.datos ? resumen(tipo, x.datos) : [`Fila ${x.n}`, x.error];
              return (
                <li key={x.n} className={`fila importar-fila i-${x.estado}`}>
                  <span className="txt"><strong>{a}</strong><small>{b}</small></span>
                  <span className={`importar-estado i-${x.estado}`}>{hecho && x.estado === 'nuevo' ? 'Importado' : ESTADO[x.estado]}</span>
                </li>
              );
            })}
          </ul>
          <nav aria-label="Páginas de la vista previa" className="importar-paginacion">
            <button type="button" className="boton sec" aria-label="Página anterior de la vista previa" disabled={filas.pagina <= 1} aria-describedby={filas.pagina <= 1 ? `${ayudaId}-paginas` : undefined} onClick={() => setPagina(filas.pagina - 1)}>Anterior</button>
            <span id={`${ayudaId}-paginas`}>Página {filas.pagina} de {filas.paginas}{filas.paginas === 1 ? ' · Solo hay una página' : filas.pagina <= 1 ? ' · Primera página' : filas.pagina >= filas.paginas ? ' · Última página' : ''}</span>
            <button type="button" className="boton sec" aria-label="Página siguiente de la vista previa" disabled={filas.pagina >= filas.paginas} aria-describedby={filas.pagina >= filas.paginas ? `${ayudaId}-paginas` : undefined} onClick={() => setPagina(filas.pagina + 1)}>Siguiente</button>
          </nav>
          {hecho
            ? DESTINO[tipo] && <Link href={DESTINO[tipo]} className="boton sec">Ver {TIPOS.find((t) => t[0] === tipo)[1].toLowerCase()}</Link>
            : <button className="boton" disabled={!vista.nuevos || ocupado || (CONTABLE.includes(tipo) && !fecha)} aria-describedby={!vista.nuevos || (CONTABLE.includes(tipo) && !fecha) ? `${ayudaId}-guardar` : undefined} onClick={() => pedir(true)}>{ocupado ? 'Importando…' : !vista.nuevos ? 'No hay nada nuevo' : tipo === 'saldos' ? `Crear la apertura con ${vista.nuevos} cuentas` : `Importar ${vista.nuevos}`}</button>}
          {!hecho && (!vista.nuevos || (CONTABLE.includes(tipo) && !fecha)) && <p id={`${ayudaId}-guardar`} className="nota">{!vista.nuevos ? 'No hay filas nuevas para importar.' : CONTABLE.includes(tipo) && !fecha ? 'Indica la fecha de los saldos para importar.' : ''}</p>}
          {!hecho && tipo === 'saldos' && <p className="nota">Si ya había un asiento de apertura, se sustituye.</p>}
          {!hecho && vista.duplicados > 0 && <p className="nota">Lo que ya existe no se toca{tipo === 'facturas' ? ': se compara por serie y número' : tipo === 'clientes' ? ': se compara por nombre o NIF' : tipo === 'gastos' ? ': se compara por fecha, importe y concepto' : ': se compara por nombre'}.</p>}
        </section>
      )}
    </div>
  );
}
