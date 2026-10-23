'use client';

import { useEffect, useRef, useState } from 'react';
import ProgresoAlta from './ProgresoAlta';
import usePasosEnHistorial from './usePasosEnHistorial';
import { llamar } from './Acciones';
import { TIPOS_IGIC } from '@/lib/igic';
import { limpiarFiscal, modelosDe, usaIgic } from '@/lib/empresa';
import { OPCIONES_TERRITORIO, esForal, territorioDe } from '@/lib/territorios';

const IVAS = [[21, '21 %'], [10, '10 %'], [4, '4 %'], [0, 'Sin IVA']];
// El 7 % es el de los nuevos autónomos (año de alta y los dos siguientes); el detalle va en una segunda línea corta.
const RETENCIONES = [[15, '15 %'], [7, <>7 %<small>Nuevo autónomo</small></>], [0, 'Sin retención']];

function Opcion({ activo, titulo, detalle, onClick, grupo }) {
  return (
    <label className={`opcion${activo ? ' activa' : ''}`}>
      {/* El círculo a la izquierda, como en el registro. */}
      <input type="radio" name={grupo} checked={activo} onChange={onClick} />
      <span><strong>{titulo}</strong>{detalle && <small>{detalle}</small>}</span>
    </label>
  );
}

function SiNo({ valor, cambiar, titulo, detalle }) {
  return (
    <label className="celda sino">
      <span className="txt">{titulo}{detalle && <small>{detalle}</small>}</span>
      <input type="checkbox" role="switch" checked={valor} onChange={(e) => cambiar(e.target.checked)} />
    </label>
  );
}

function CamposEmisor({ emisor, sociedad, cambiar }) {
  const campos = [
    ['nombre', sociedad ? 'Razón social' : 'Nombre y apellidos', 'organization', false],
    ['nif', sociedad ? 'CIF' : 'NIF/NIE', 'off', false],
    ['direccion', 'Dirección fiscal', 'street-address', true],
    ['ciudad', 'Ciudad', 'address-level2', true],
    ['iban', 'IBAN para cobrar', 'off', true],
  ];
  return <div className="grupo-c alta-campos">{campos.map(([clave, titulo, completar, opcional]) => (
    <label className="alta-campo" key={clave}>
      <span>{titulo}{opcional ? ' (opcional)' : ' (obligatorio)'}</span>
      <input className="campo" value={emisor[clave]} autoComplete={clave === 'nombre' && !sociedad ? 'name' : completar} required={!opcional} onChange={(ev) => cambiar(clave, ['nif', 'iban'].includes(clave) ? ev.target.value.toUpperCase() : ev.target.value)} />
    </label>
  ))}</div>;
}

// Preguntas una a una; al final, los modelos que le tocan.
export default function Cuestionario({ inicial, editar, conFacturas, puedeFacturar = true }) {
  // Los datos fiscales del registro ya están guardados. Se revisan sin repetir dos pantallas.
  const datosCompletos = !editar && Boolean(inicial.emisor.nombre?.trim() && inicial.emisor.nif?.trim());
  const [paso, setPaso] = useState(0);
  const [terminado, setTerminado] = useState(false);
  const tituloRef = useRef(null);
  const errorRef = useRef(null);
  useEffect(() => {
    tituloRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [paso, terminado]);
  const [fiscal, setFiscal] = useState(inicial.fiscal);
  const [emisor, setEmisor] = useState(inicial.emisor);
  const [acts, setActs] = useState(inicial.actividades.length ? inicial.actividades : [{ nombre: '', ivaPct: usaIgic(inicial.fiscal) ? 7 : 21, irpfPct: inicial.fiscal.tipo === 'sociedad' ? 0 : 15 }]);
  const [error, setError] = useState('');
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const [guardando, setGuardando] = useState(false);
  const sociedad = fiscal.tipo === 'sociedad';
  const igic = usaIgic(fiscal);
  // Navarra y País Vasco (lib/territorios.js): sin módulos ni simplificado en Fisquo; en Navarra no hay el 7 % de los nuevos
  // autónomos; la exención del pago fraccionado por retenciones es del 70 % (del 50 % en Gipuzkoa) y no existe en Navarra ni Álava.
  const territorio = territorioDe(fiscal), foral = esForal(fiscal);
  const pctRetenidas = territorio === 'gipuzkoa' ? 50 : 70;
  const retenciones = territorio === 'navarra' ? RETENCIONES.filter(([v]) => v !== 7) : RETENCIONES;
  const impuesto = igic ? 'IGIC' : 'IVA';
  const tipos = igic ? TIPOS_IGIC.map((p) => [p, `${String(p).replace('.', ',')} %`]) : IVAS;
  const f = (k, v) => setFiscal((x) => ({ ...x, [k]: v }));
  const e = (k, v) => setEmisor((x) => ({ ...x, [k]: v }));
  const a = (i, k, v) => setActs((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const todosPasos = [
    {
      titulo: '¿Cómo trabajas?',
      texto: 'Según la forma, Hacienda te pide unos modelos u otros.',
      listo: true,
      cuerpo: (
        <div className="opciones">
          <Opcion grupo="forma" activo={!sociedad} titulo="Autónomo" detalle="Trabajas por tu cuenta, con tu NIF" onClick={() => f('tipo', 'autonomo')} />
          <Opcion grupo="forma" activo={sociedad} titulo="Sociedad" detalle="SL, SA, cooperativa… con CIF propio" onClick={() => { f('tipo', 'sociedad'); setActs((l) => l.map((x) => ({ ...x, irpfPct: 0 }))); }} />
        </div>
      ),
    },
    {
      titulo: sociedad ? 'Datos de la sociedad' : 'Tus datos',
      texto: 'Salen en cada factura.',
      listo: emisor.nombre.trim() && emisor.nif.trim(),
      falta: 'Escribe el nombre y el NIF para seguir.',
      cuerpo: (
        <CamposEmisor emisor={emisor} sociedad={sociedad} cambiar={e} />
      ),
    },
    {
      titulo: '¿A qué te dedicas?',
      texto: 'Cada actividad tiene su propia numeración de facturas. Puedes añadir varias.',
      listo: acts.every((x) => String(x.nombre).trim()) && Boolean(emisor.nombre.trim() && emisor.nif.trim()),
      falta: acts.every((x) => String(x.nombre).trim()) ? 'Faltan el nombre y el NIF de tus datos.' : 'Escribe el nombre de tu actividad para seguir.',
      cuerpo: (
        <>
          <label className="alta-campo"><span>¿Dónde presentas tus impuestos?</span>
            <select className="campo" value={territorioDe(fiscal)} onChange={(ev) => {
              const t = ev.target.value, canarias = t === 'canarias';
              setFiscal((x) => limpiarFiscal({ ...x, territorio: t }));
              setActs((l) => l.map((x) => ({ ...x, ivaPct: (canarias ? TIPOS_IGIC : [21, 10, 4, 0]).includes(Number(x.ivaPct)) ? x.ivaPct : canarias ? 7 : 21 })));
            }}>{OPCIONES_TERRITORIO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          </label>
          {acts.map((x, i) => {
            const fija = x.id && conFacturas.includes(x.id);
            return (
              <div key={i} className="grupo-c actividad-form">
                <div className="fila-act">
                  <label className="alta-campo"><span>{i === 0 ? 'Nombre de tu actividad' : `Actividad ${i + 1}`}</span><input className="campo" placeholder="Por ejemplo: Diseño gráfico" value={x.nombre} onChange={(v) => a(i, 'nombre', v.target.value)} /></label>
                  {acts.length > 1 && !fija && <button type="button" className="quitar" aria-label="Quitar" onClick={() => setActs((l) => l.filter((_, j) => j !== i))}>Quitar</button>}
                </div>
                <p className="mini-t">{impuesto} de tus facturas</p>
                {igic ? <select className="campo" aria-label={`IGIC de ${x.nombre || 'tu actividad'}`} value={x.ivaPct} onChange={(ev) => a(i, 'ivaPct', Number(ev.target.value))}>{tipos.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
                  : <div className="segmentado">{tipos.map(([v, n]) => <button key={v} type="button" aria-pressed={Number(x.ivaPct) === v} className={Number(x.ivaPct) === v ? 'activo' : ''} onClick={() => a(i, 'ivaPct', v)}>{n}</button>)}</div>}
                {!sociedad && <>
                  <p className="mini-t">Retención de IRPF <small>(solo actividades profesionales —diseño, consultoría, formación, abogacía…— cuando facturas a empresas o autónomos; obras, reparaciones, comercio u hostelería van sin retención)</small></p>
                  <div className="segmentado">{retenciones.map(([v, n]) => <button key={v} type="button" aria-pressed={Number(x.irpfPct) === v} className={Number(x.irpfPct) === v ? 'activo' : ''} onClick={() => a(i, 'irpfPct', v)}>{n}</button>)}</div>
                  <label className="alta-campo"><span>Epígrafe del IAE (opcional)</span><small>Está en tu alta de autónomo; va en los libros registro.</small><input className="campo" inputMode="numeric" placeholder="Por ejemplo: 844" value={x.iae || ''} onChange={(v) => a(i, 'iae', v.target.value)} /></label>
                </>}
                {fija && <p className="mini-t">Ya tiene facturas: su numeración no cambia.</p>}
              </div>
            );
          })}
          {acts.length < 8 && <button type="button" className="boton sec ancho" onClick={() => setActs((l) => [...l, { nombre: '', ivaPct: l[0]?.ivaPct ?? 21, irpfPct: sociedad ? 0 : (l[0]?.irpfPct ?? 15) }])}>Añadir otra actividad</button>}
        </>
      ),
    },
    {
      titulo: 'Prepara tus impuestos',
      texto: 'Para saber qué modelos tienes que presentar.',
      listo: true,
      cuerpo: (
        <>
          <p className="mini-t fuera">¿Cobras {impuesto}?</p>
          <div className="opciones">
            <Opcion grupo="regimen-iva" activo={fiscal.iva === 'general'} titulo={`Sí, cobro ${impuesto}`} onClick={() => f('iva', 'general')} />
            <Opcion grupo="regimen-iva" activo={fiscal.iva === 'exento'} titulo="No, mi actividad está exenta" detalle="Sanidad, enseñanza, seguros, alquiler de vivienda…" onClick={() => f('iva', 'exento')} />
            {!igic && !sociedad && <Opcion grupo="regimen-iva" activo={fiscal.iva === 'recargo'} titulo="Tienda con recargo de equivalencia" detalle="Comercio minorista: el IVA lo paga tu proveedor" onClick={() => f('iva', 'recargo')} />}
            {!igic && !foral && !sociedad && <Opcion grupo="regimen-iva" activo={fiscal.iva === 'simplificado'} titulo="Régimen simplificado (módulos)" detalle="El IVA trimestral sale de los módulos de tu actividad" onClick={() => setFiscal((x) => ({ ...x, iva: 'simplificado', irpf: 'modulos' }))} />}
            {!igic && !sociedad && <Opcion grupo="regimen-iva" activo={fiscal.iva === 'reagp'} titulo="Agricultura, ganadería o pesca (REAGP)" detalle="No cobras IVA: cobras la compensación del 12 % o del 10,5 %" onClick={() => f('iva', 'reagp')} />}
          </div>
          <div className="grupo-c">
            {!sociedad && !foral && <SiNo valor={fiscal.irpf === 'modulos'} cambiar={(v) => setFiscal((x) => ({ ...x, irpf: v ? 'modulos' : undefined, ...(!v && x.iva === 'simplificado' ? { iva: 'general' } : {}) }))} titulo="Estoy en módulos (estimación objetiva)" detalle="Presentas el 131 en vez del 130" />}
            {!sociedad && fiscal.irpf !== 'modulos' && !['navarra', 'alava'].includes(territorio) && <SiNo valor={fiscal.retenidas} cambiar={(v) => f('retenidas', v)} titulo={`Más del ${pctRetenidas} % de lo que facturas lleva retención`} detalle="Si es así, no tienes que presentar el 130" />}
            <SiNo valor={fiscal.trabajadores} cambiar={(v) => f('trabajadores', v)} titulo="Tengo trabajadores o pago a profesionales con retención" />
            <SiNo valor={fiscal.alquiler} cambiar={(v) => f('alquiler', v)} titulo="Alquilo un local u oficina" />
            {!igic && <SiNo valor={fiscal.intracom} cambiar={(v) => f('intracom', v)} titulo="Compro o vendo a empresas de otros países de la UE" />}
            <SiNo valor={fiscal.inventario} cambiar={(v) => f('inventario', v)} titulo="Vendo productos y quiero controlar el stock" detalle="Inventario: entradas, salidas, stock mínimo y su valor" />
            {!igic && ['general', 'simplificado'].includes(fiscal.iva) && <SiNo valor={Boolean(fiscal.rebu)} cambiar={(v) => f('rebu', v)} titulo="Vendo bienes usados, arte o antigüedades con el IVA sobre el margen" detalle="Régimen especial de los bienes usados (REBU)" />}
            {!igic && ['general', 'simplificado'].includes(fiscal.iva) && <SiNo valor={Boolean(fiscal.reav)} cambiar={(v) => f('reav', v)} titulo="Soy una agencia de viajes" detalle="Régimen especial de las agencias de viajes (REAV): IVA sobre el margen" />}
            <SiNo valor={Boolean(fiscal.capital)} cambiar={(v) => f('capital', v)} titulo="Pago dividendos o intereses a socios o a quien me prestó dinero" detalle="Retención del 19 %: modelos 123 y 193" />
            {!igic && fiscal.iva === 'general' && <SiNo valor={Boolean(fiscal.oss)} cambiar={(v) => f('oss', v)} titulo="Vendo a particulares de otros países de la UE con el IVA de su país" detalle="Ventanilla única (OSS): ese IVA va en el modelo 369" />}
            {!igic && fiscal.iva === 'general' && <SiNo valor={Boolean(fiscal.recc)} cambiar={(v) => f('recc', v ? { desde: `${new Date().getFullYear()}-01-01` } : undefined)} titulo="Estoy en el criterio de caja (RECC)" detalle="El IVA de tus facturas se paga al cobrarlas y el de tus gastos se deduce al pagarlos" />}
          </div>
          {!igic && fiscal.iva === 'general' && fiscal.recc && (
            <div className="alta-campos">
              <label className="alta-campo"><span>En el criterio de caja desde</span><small>La fecha de la opción en el 036 (normalmente, el 1 de enero).</small>
                <input className="campo" type="date" min="2014-01-01" value={fiscal.recc.desde || ''} onChange={(v) => f('recc', { ...fiscal.recc, desde: v.target.value })} /></label>
              <label className="alta-campo"><span>Hasta (solo si has renunciado o te han excluido)</span><small>El último día en que lo aplicaste: lo facturado hasta entonces sigue devengando el IVA al cobrarse.</small>
                <input className="campo" type="date" min="2014-01-01" value={fiscal.recc.hasta || ''} onChange={(v) => f('recc', { ...fiscal.recc, hasta: v.target.value || undefined })} /></label>
            </div>
          )}
          {!sociedad && (
            <details className="alta-renta">
              <summary>Para el borrador de la renta (opcional)</summary>
              <p className="nota">Con esto la renta tiene en cuenta tus mínimos familiares y las reducciones para rendimientos bajos. Solo se usa en el borrador.</p>
              <div className="alta-campos">
                <label className="alta-campo"><span>Tu año de nacimiento</span><input className="campo" inputMode="numeric" placeholder="1985" value={fiscal.renta?.nacimiento || ''} onChange={(v) => f('renta', { ...fiscal.renta, nacimiento: v.target.value })} /></label>
                <label className="alta-campo"><span>Hijos menores de 25 que viven contigo</span><small>Su año de nacimiento, separados por comas.</small><input className="campo" placeholder="2015, 2019" value={Array.isArray(fiscal.renta?.hijos) ? fiscal.renta.hijos.join(', ') : fiscal.renta?.hijos || ''} onChange={(v) => f('renta', { ...fiscal.renta, hijos: v.target.value })} /></label>
                <label className="alta-campo"><span>Padres o abuelos mayores de 65 que viven contigo</span><small>Su año de nacimiento, separados por comas.</small><input className="campo" placeholder="1950" value={Array.isArray(fiscal.renta?.ascendientes) ? fiscal.renta.ascendientes.join(', ') : fiscal.renta?.ascendientes || ''} onChange={(v) => f('renta', { ...fiscal.renta, ascendientes: v.target.value })} /></label>
                <label className="alta-campo"><span>Otras rentas del año, en euros</span><small>Nómina, alquileres, intereses… (para calcular tu tipo).</small><input className="campo" inputMode="decimal" placeholder="0" value={fiscal.renta?.otrasRentas || ''} onChange={(v) => f('renta', { ...fiscal.renta, otrasRentas: v.target.value })} /></label>
              </div>
              <div className="grupo-c">
                <SiNo valor={fiscal.renta?.compartidos !== false} cambiar={(v) => f('renta', { ...fiscal.renta, compartidos: v })} titulo="El otro progenitor también hace la renta" detalle="Cada uno aplica la mitad del mínimo por hijos" />
                <SiNo valor={Boolean(fiscal.renta?.dependiente)} cambiar={(v) => f('renta', { ...fiscal.renta, dependiente: v })} titulo="Trabajas para un único cliente (o eres TRADE)" detalle="Sin empleados y con al menos el 70 % de tus ingresos con retención: reducción de 2.000 € o más" />
              </div>
            </details>
          )}
          {sociedad && (
            <label className="alta-campo"><span>Fecha de constitución de la sociedad (opcional)</span>
              <small>Las sociedades nuevas pagan el 15 % del Impuesto sobre Sociedades el primer año con beneficio y el siguiente.</small>
              <input className="campo" type="date" min="1900-01-01" value={fiscal.constitucion || ''} onChange={(v) => f('constitucion', v.target.value)} />
            </label>
          )}
        </>
      ),
    },
    {
      titulo: 'Tus modelos',
      texto: 'Esto es lo que te toca presentar. La app calcula los marcados; el resto, tu gestor.',
      listo: true,
      cuerpo: (
        <div className="grupo-c">
          {modelosDe(limpiarFiscal(fiscal)).map((m) => (
            <div key={m.id} className="celda"><span className="modelo-num">{m.num || m.id}</span><span className="txt">{m.nombre}<small>{m.cuando}</small></span>{m.calcula && <span className="v">Calculado</span>}</div>
          ))}
        </div>
      ),
    },
  ];
  const pasos = datosCompletos ? todosPasos.slice(2) : todosPasos;
  const p = pasos[paso];
  const ultimo = paso === pasos.length - 1;
  const historial = usePasosEnHistorial({
    paso, base: 0, total: pasos.length, bloqueado: guardando,
    cambiarPaso: (n) => { setError(''); setTerminado(false); setPaso(n); },
  });

  async function terminar() {
    if (guardando) return;
    setGuardando(true); setError('');
    try {
      await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ configuracion: { fiscal: limpiarFiscal(fiscal), emisor, actividades: acts } }) });
      if (editar) location.replace('/ajustes');
      // La pantalla final deja el último paso detrás para poder revisarlo.
      else { historial.avanzar(paso); setGuardando(false); setTerminado(true); }
    } catch (err) { setError(err.message); setGuardando(false); }
  }

  if (terminado) return (
    <div className="cuestionario">
      <ProgresoAlta paso={pasos.length} total={pasos.length} etiqueta="Negocio preparado" />
      <div className="alta-final">
        <span className="alta-exito" aria-hidden>✓</span>
        <h1 className="titulo" ref={tituloRef} tabIndex={-1}>Tu negocio ya está preparado</h1>
        <p className="grupo-pie">Tus datos, actividades e impuestos están guardados. ¿Por dónde quieres empezar?</p>
        <div className="alta-acciones">
          {puedeFacturar && <a className="boton" href="/facturas/nueva">Crear mi primera factura</a>}
          <a className="boton sec" href="/ajustes/importar">Importar mis datos</a>
        </div>
        <a className="alta-resumen-enlace" href="/">Ir al resumen</a>
      </div>
    </div>
  );

  function atras() { if (guardando) return; historial.atras(); }
  function avanzar() { historial.avanzar(paso + 1); }

  return (
    <div className="cuestionario" aria-busy={guardando}>
      {editar ? <p className="nota" role="status">Configuración del negocio · Paso {paso + 1} de {pasos.length}</p> : <ProgresoAlta paso={paso + 1} total={pasos.length} etiqueta="Preparar tu negocio" />}
      {paso === 0 && !editar && <p className="hola">Tu cuenta ya está creada. Ahora preparamos tus actividades e impuestos. Podrás cambiar esta configuración en Ajustes.</p>}
      <div className="paso" key={paso}>
        <h1 className="titulo" ref={tituloRef} tabIndex={-1}>{p.titulo}</h1>
        <p className="grupo-pie arriba">{p.texto}</p>
        {p.cuerpo}
        {datosCompletos && paso === 0 && (
          <details className="alta-datos">
            <summary>Revisar datos de facturación y cuenta de cobro</summary>
            <p>{emisor.nombre} · {emisor.nif}<br />{emisor.direccion}<br />{emisor.cp} {emisor.ciudad} {emisor.provincia}</p>
            <CamposEmisor emisor={emisor} sociedad={sociedad} cambiar={e} />
          </details>
        )}
      </div>
      {error && <p className="error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
      {!p.listo && !guardando && p.falta && <p className="nota cuestionario-falta" id="cuestionario-falta">{p.falta}</p>}
      <div className="cuestionario-botones">
        {paso > 0 ? <button type="button" className="boton sec" disabled={guardando} onClick={atras}>Atrás</button> : editar ? <a href="/ajustes" className="boton sec">Cancelar</a> : <span />}
        <button type="button" className="boton" disabled={!p.listo || guardando} aria-describedby={!p.listo && p.falta ? 'cuestionario-falta' : undefined} onClick={() => (ultimo ? terminar() : avanzar())}>{ultimo ? (guardando ? 'Guardando…' : editar ? 'Guardar' : 'Terminar') : 'Siguiente'}</button>
      </div>
    </div>
  );
}
