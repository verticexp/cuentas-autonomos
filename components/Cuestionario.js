'use client';

import { useState } from 'react';
import { llamar } from './Acciones';
import { limpiarFiscal, modelosDe } from '@/lib/empresa';

const IVAS = [[21, '21 %'], [10, '10 %'], [4, '4 %'], [0, 'Sin IVA']];
const RETENCIONES = [[15, '15 %'], [7, '7 % (nuevos autónomos)'], [0, 'Sin retención']];

function Opcion({ activo, titulo, detalle, onClick }) {
  return (
    <button type="button" className={`opcion${activo ? ' activa' : ''}`} onClick={onClick} aria-pressed={activo}>
      <span><strong>{titulo}</strong>{detalle && <small>{detalle}</small>}</span>
      <i aria-hidden />
    </button>
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

// Preguntas una a una; al final, los modelos que le tocan.
export default function Cuestionario({ inicial, editar, conFacturas }) {
  const [paso, setPaso] = useState(0);
  const [fiscal, setFiscal] = useState(inicial.fiscal);
  const [emisor, setEmisor] = useState(inicial.emisor);
  const [acts, setActs] = useState(inicial.actividades.length ? inicial.actividades : [{ nombre: '', ivaPct: 21, irpfPct: inicial.fiscal.tipo === 'sociedad' ? 0 : 15 }]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const sociedad = fiscal.tipo === 'sociedad';
  const f = (k, v) => setFiscal((x) => ({ ...x, [k]: v }));
  const e = (k, v) => setEmisor((x) => ({ ...x, [k]: v }));
  const a = (i, k, v) => setActs((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const pasos = [
    {
      titulo: '¿Cómo trabajas?',
      texto: 'Según la forma, Hacienda te pide unos modelos u otros.',
      listo: true,
      cuerpo: (
        <div className="opciones">
          <Opcion activo={!sociedad} titulo="Autónomo" detalle="Trabajas por tu cuenta, con tu NIF" onClick={() => f('tipo', 'autonomo')} />
          <Opcion activo={sociedad} titulo="Sociedad" detalle="SL, SA, cooperativa… con CIF propio" onClick={() => { f('tipo', 'sociedad'); setActs((l) => l.map((x) => ({ ...x, irpfPct: 0 }))); }} />
        </div>
      ),
    },
    {
      titulo: sociedad ? 'Datos de la sociedad' : 'Tus datos',
      texto: 'Salen en cada factura.',
      listo: emisor.nombre.trim() && emisor.nif.trim(),
      cuerpo: (
        <div className="grupo-c campos">
          <input className="campo" placeholder={sociedad ? 'Razón social' : 'Nombre y apellidos'} value={emisor.nombre} onChange={(x) => e('nombre', x.target.value)} autoComplete="organization" />
          <input className="campo" placeholder={sociedad ? 'CIF' : 'NIF'} value={emisor.nif} onChange={(x) => e('nif', x.target.value.toUpperCase())} />
          <input className="campo" placeholder="Dirección" value={emisor.direccion} onChange={(x) => e('direccion', x.target.value)} autoComplete="street-address" />
          <input className="campo" placeholder="Código postal y ciudad" value={emisor.ciudad} onChange={(x) => e('ciudad', x.target.value)} />
          <input className="campo" placeholder="IBAN para cobrar (opcional)" value={emisor.iban} onChange={(x) => e('iban', x.target.value.toUpperCase())} />
        </div>
      ),
    },
    {
      titulo: '¿A qué te dedicas?',
      texto: 'Cada actividad tiene su propia numeración de facturas. Puedes añadir varias.',
      listo: acts.every((x) => String(x.nombre).trim()),
      cuerpo: (
        <>
          {acts.map((x, i) => {
            const fija = x.id && conFacturas.includes(x.id);
            return (
              <div key={i} className="grupo-c actividad-form">
                <div className="fila-act">
                  <input className="campo" placeholder={i === 0 ? 'Por ejemplo: Diseño gráfico' : 'Otra actividad'} value={x.nombre} onChange={(v) => a(i, 'nombre', v.target.value)} />
                  {acts.length > 1 && !fija && <button type="button" className="quitar" aria-label="Quitar" onClick={() => setActs((l) => l.filter((_, j) => j !== i))}>Quitar</button>}
                </div>
                <p className="mini-t">IVA de tus facturas</p>
                <div className="segmentado">{IVAS.map(([v, n]) => <a key={v} href="#" role="button" className={Number(x.ivaPct) === v ? 'activo' : ''} onClick={(ev) => { ev.preventDefault(); a(i, 'ivaPct', v); }}>{n}</a>)}</div>
                {!sociedad && <>
                  <p className="mini-t">Retención de IRPF <small>(si facturas a empresas o autónomos como profesional)</small></p>
                  <div className="segmentado">{RETENCIONES.map(([v, n]) => <a key={v} href="#" role="button" className={Number(x.irpfPct) === v ? 'activo' : ''} onClick={(ev) => { ev.preventDefault(); a(i, 'irpfPct', v); }}>{n}</a>)}</div>
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
      titulo: 'Un par de preguntas más',
      texto: 'Para saber qué modelos tienes que presentar.',
      listo: true,
      cuerpo: (
        <>
          <p className="mini-t fuera">¿Cobras IVA?</p>
          <div className="opciones">
            <Opcion activo={fiscal.iva === 'general'} titulo="Sí, cobro IVA" onClick={() => f('iva', 'general')} />
            <Opcion activo={fiscal.iva === 'exento'} titulo="No, mi actividad está exenta" detalle="Sanidad, enseñanza, seguros, alquiler de vivienda…" onClick={() => f('iva', 'exento')} />
            {!sociedad && <Opcion activo={fiscal.iva === 'recargo'} titulo="Tienda con recargo de equivalencia" detalle="Comercio minorista: el IVA lo paga tu proveedor" onClick={() => f('iva', 'recargo')} />}
          </div>
          <div className="grupo-c">
            {!sociedad && <SiNo valor={fiscal.retenidas} cambiar={(v) => f('retenidas', v)} titulo="Más del 70 % de lo que facturas lleva retención" detalle="Si es así, no tienes que presentar el 130" />}
            <SiNo valor={fiscal.trabajadores} cambiar={(v) => f('trabajadores', v)} titulo="Tengo trabajadores o pago a profesionales con retención" />
            <SiNo valor={fiscal.alquiler} cambiar={(v) => f('alquiler', v)} titulo="Alquilo un local u oficina" />
            <SiNo valor={fiscal.intracom} cambiar={(v) => f('intracom', v)} titulo="Compro o vendo a empresas de otros países de la UE" />
          </div>
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
            <div key={m.id} className="celda"><span className="modelo-num">{m.id}</span><span className="txt">{m.nombre}<small>{m.cuando}</small></span>{m.calcula && <span className="v">Calculado</span>}</div>
          ))}
        </div>
      ),
    },
  ];
  const p = pasos[paso];
  const ultimo = paso === pasos.length - 1;

  async function terminar() {
    setGuardando(true); setError('');
    try {
      await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ configuracion: { fiscal: limpiarFiscal(fiscal), emisor, actividades: acts } }) });
      location.href = '/';
    } catch (err) { setError(err.message); setGuardando(false); }
  }

  return (
    <div className="cuestionario">
      <div className="progreso" aria-label={`Paso ${paso + 1} de ${pasos.length}`}>{pasos.map((_, i) => <span key={i} className={i <= paso ? 'hecho' : ''} />)}</div>
      {paso === 0 && !editar && <p className="hola">Bienvenido. Antes de empezar, cuéntanos cómo trabajas para preparar la app a tu medida.</p>}
      <div className="paso" key={paso}>
        <h1 className="titulo">{p.titulo}</h1>
        <p className="grupo-pie arriba">{p.texto}</p>
        {p.cuerpo}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="cuestionario-botones">
        {paso > 0 ? <button type="button" className="boton sec" onClick={() => setPaso(paso - 1)}>Atrás</button> : editar ? <a href="/ajustes" className="boton sec">Cancelar</a> : <span />}
        <button type="button" className="boton" disabled={!p.listo || guardando} onClick={() => (ultimo ? terminar() : setPaso(paso + 1))}>{ultimo ? (guardando ? 'Guardando…' : editar ? 'Guardar' : 'Empezar') : 'Siguiente'}</button>
      </div>
    </div>
  );
}
