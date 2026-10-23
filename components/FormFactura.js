'use client';

import Termino from '@/components/Termino';
import { confirmar } from '@/components/Confirmar';
import useCambiosSinGuardar from '@/components/useCambiosSinGuardar';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { navegar } from '@/lib/transicion';
import Deslizable from './Deslizable';
import { baseLinea, desglose, importes, leerImporte, nifUE, numeroFactura, pagadoDe, pendienteDe, r2, trimestre } from '@/lib/calculos';
import { requisitosIncobrable } from '@/lib/incobrables';
import '@/app/lineas.css';
import '@/app/catalogo.css';
import '@/app/factura-movil.css';
import { eur } from '@/lib/formato';
import { IDIOMAS_FACTURA, MONEDAS, formatoDoc } from '@/lib/idiomas';
import { TIPOS_IGIC } from '@/lib/igic';
import { NOMBRES_UE, TIPOS_UE, tiposPais } from '@/lib/oss';
import { TIPOS_OPERACION } from '@/lib/operaciones';
import { NIF_ES } from '@/lib/verifactuXml';
import { evaluarRiesgo, tieneLimite } from '@/lib/riesgo';
import { mismoCliente, nombreForma } from '@/lib/terceros';
import { cambiarActividadFactura, etiquetaClienteFactura, lineaFacturaVacia, resolverClienteFactura } from '@/lib/formFactura';
import '@/app/riesgo.css';

const aTexto = (n) => String(n ?? '').replace('.', ',');
const lineaVacia = (ivaPct) => ({ concepto: '', cantidad: '1', precio: '', dto: '', ivaPct });
// Las facturas antiguas (una base, un IVA) se abren como una sola línea. En otra moneda, con los precios en esa moneda.
const lineasDe = (x) => (x.lineas?.length
  ? x.lineas.map((l) => ({ concepto: l.concepto, cantidad: aTexto(l.cantidad), precio: aTexto(l.precioDivisa ?? l.precio), dto: l.dto ? aTexto(l.dto) : '', ivaPct: l.ivaPct, ...(l.coste !== undefined ? { coste: aTexto(l.coste) } : {}), ...(l.producto ? { producto: l.producto } : {}), ...(l.albaran ? { albaran: l.albaran } : {}) }))
  : [{ concepto: x.concepto || '', cantidad: '1', precio: aTexto(x.baseDivisa ?? x.base), dto: '', ivaPct: x.ivaPct }]);
const numero = (v) => leerImporte(v) || 0;

// riesgos: lo que debe ahora cada cliente con riesgo máximo ({ id: euros }); el límite lo comprueba el servidor.
export default function FormFactura({ factura, clientes, numeros, hoy, rectifica: orig, plantilla, clienteInicial = null, notaDefecto = '', actividades, productos = [], stock = null, proyectos = [], riesgos = {}, recargo = false, oss = false, margenes = [], reagp = false, igic = false }) {
  const impuesto = igic ? 'IGIC' : 'IVA';
  const operaciones = igic ? { exenta: { nombre: 'Exenta de IGIC' }, exportacion: { nombre: 'Exportación de bienes' }, 'servicios-fuera': { nombre: 'No sujeta por localización' }, isp: { nombre: 'Inversión del sujeto pasivo (lo declara el cliente)' } } : TIPOS_OPERACION;
  // IVA y retención de cada actividad, para rellenar la factura nueva.
  const defecto = (id) => { const a = actividades.find((x) => x.id === id) || actividades[0]; return { ivaPct: a.ivaPct, irpfPct: a.irpfPct }; };
  const router = useRouter();
  const nueva = !factura;
  const [f, setF] = useState(() => factura
    ? { ...factura, lineas: lineasDe(factura) }
    : orig
      ? { actividad: orig.actividad, fecha: hoy, cliente: orig.cliente, irpfPct: orig.irpfPct, nota: '', cobrada: false, rectifica: orig.id, proyecto: orig.proyecto || '', ...(orig.recargo ? { recargo: true } : {}),
        // Mismo idioma y misma moneda y tipo de cambio que la factura que rectifica.
        ...(orig.idioma ? { idioma: orig.idioma } : {}), ...(orig.divisa ? { divisa: orig.divisa } : {}), ...(orig.oss ? { oss: orig.oss } : {}),
        lineas: orig.lineas?.length
          ? lineasDe(orig).map((l) => ({ ...l, precio: aTexto(-numero(l.precio)) }))
          : [{ concepto: `Anulación de la factura ${numeroFactura(orig)}`, cantidad: '1', precio: aTexto(-(orig.baseDivisa ?? orig.base)), dto: '', ivaPct: orig.ivaPct }] }
      : plantilla
        ? { actividad: plantilla.actividad, fecha: hoy, cliente: plantilla.cliente, lineas: lineasDe(plantilla), irpfPct: plantilla.irpfPct, nota: plantilla.nota || '', cobrada: false, proyecto: plantilla.proyecto || '', ...(plantilla.recargo ? { recargo: true } : {}), ...(plantilla.idioma ? { idioma: plantilla.idioma } : {}), ...(plantilla.oss ? { oss: plantilla.oss } : {}) }
      : { actividad: actividades[0].id, fecha: hoy, cliente: clienteInicial ? { nombre: clienteInicial.nombre, nif: clienteInicial.nif || '', direccion: clienteInicial.direccion || '', ciudad: clienteInicial.ciudad || '', email: clienteInicial.email || '', pais: clienteInicial.pais || '' } : { nombre: '', nif: '', direccion: '', ciudad: '' }, lineas: [lineaVacia(defecto(actividades[0].id).ivaPct)], nota: notaDefecto, cobrada: false, irpfPct: defecto(actividades[0].id).irpfPct });
  // «¿Salir sin guardar?» con cambios. El tipo de cambio que se pide solo al abrir una factura en otra moneda (pedido) no cuenta.
  const sinGuardar = useCambiosSinGuardar({ ...f, divisa: f.divisa && { ...f.divisa, pedido: undefined } });
  // La selección vive solo en el formulario; el cuerpo de la API conserva el cliente histórico completo.
  const [clienteSeleccionado, setClienteSeleccionado] = useState(() => resolverClienteFactura(clientes, f.cliente)?.id || '');
  // La retención de una plantilla ya está elegida. Un cambio manual cuenta incluso si coincide con el defecto.
  const irpfPersonalizado = useRef(Boolean(plantilla) || Number(f.irpfPct) !== Number(defecto(f.actividad).irpfPct));
  const ivasPersonalizados = useRef(new Set());
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const prefijo = useId();
  const formulario = useRef(null);
  const enviandoRef = useRef(false);
  const enfocarError = useRef(false);
  const idCampo = (campo) => `${prefijo}-${campo}`;
  const clavesCampo = (campo, adicionales = []) => [campo, ...adicionales];
  const atributos = (campo, adicionales = []) => {
    const claves = clavesCampo(campo, adicionales).filter((k) => errores[k]);
    return { id: idCampo(campo), 'aria-invalid': claves.length ? 'true' : undefined,
      'aria-describedby': claves.length ? claves.map((k) => `${idCampo(k)}-error`).join(' ') : undefined };
  };
  const mensaje = (campo, adicionales = []) => clavesCampo(campo, adicionales).map((k) => errores[k]
    ? <span className="ff-error-campo" id={`${idCampo(k)}-error`} key={k}>{errores[k]}</span> : null);
  const limpiarErrores = (...claves) => setErrores((actuales) => Object.fromEntries(
    Object.entries(actuales).filter(([k]) => !claves.some((c) => k === c || k.startsWith(`${c}.`)))
  ));
  useEffect(() => {
    if (!enfocarError.current) return;
    enfocarError.current = false;
    formulario.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [errores]);
  const [enviando, setEnviando] = useState(false);
  // Un campo obligatorio que está plegado no se podría rellenar: se despliega y se avisa ahí.
  useEffect(() => {
    const form = formulario.current;
    if (!form) return undefined;
    const alInvalido = (e) => {
      const campo = e.target;
      if (!campo.closest?.('.ff-datos-cliente') || campo.offsetParent !== null) return;
      setDatosCli(true);
      setTimeout(() => { campo.focus?.(); campo.reportValidity?.(); }, 60);
    };
    form.addEventListener('invalid', alInvalido, true);
    return () => form.removeEventListener('invalid', alInvalido, true);
  }, []);
  // Clave de idempotencia de este formulario: si se pulsa dos veces o se reintenta, sale una sola factura.
  const [idem] = useState(() => crypto.randomUUID());

  const poner = (k, v) => {
    if (k === 'irpfPct') irpfPersonalizado.current = true;
    limpiarErrores(k); setF((x) => ({ ...x, [k]: v }));
  };
  const ponerCliente = (k, v) => {
    if (k === 'nombre' || k === 'nif') setClienteSeleccionado('');
    limpiarErrores(`cliente.${k}`);
    setF((x) => ({ ...x, cliente: { ...x.cliente, [k]: v } }));
  };
  const ordenados = [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const ficha = resolverClienteFactura(clientes, f.cliente, clienteSeleccionado);
  const elegido = ficha?.id || '';
  const elegirCliente = (id) => {
    const coincidencias = clientes.filter((x) => x.id === id);
    if (id && coincidencias.length !== 1) return;
    const c = coincidencias[0];
    setClienteSeleccionado(c?.id || '');
    poner('cliente', c ? { nombre: c.nombre, nif: c.nif, direccion: c.direccion, ciudad: c.ciudad, email: c.email || '', pais: c.pais || '' } : { nombre: '', nif: '', direccion: '', ciudad: '', pais: '' });
  };
  // Móvil (solo en la factura nueva, app/factura-movil.css): buscador de clientes y, plegados, los datos del cliente y los
  // detalles (IRPF, nota, proyecto y evento). En el ordenador se ve todo como siempre.
  const [buscando, setBuscando] = useState('');
  const [cambiando, setCambiando] = useState(false);
  const [nuevoCli, setNuevoCli] = useState(false);
  const [datosCli, setDatosCli] = useState(false);
  const [detalles, setDetalles] = useState(() => Boolean((f.nota && (!nueva || orig || plantilla)) || f.proyecto || f.evento?.fecha || f.evento?.lugar || (nueva && Number(f.irpfPct) !== Number(defecto(f.actividad).irpfPct))));
  const [verEvento, setVerEvento] = useState(false);
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(buscando).trim();
  const resultados = ordenados.filter((c) => !q || norm(c.nombre).includes(q) || norm(c.nif).includes(q)).slice(0, q ? 6 : 4);
  const elegirBuscado = (id) => { elegirCliente(id); setCambiando(false); setNuevoCli(false); setDatosCli(false); setBuscando(''); };
  const clienteNuevo = () => { elegirCliente(''); if (buscando.trim()) ponerCliente('nombre', buscando.trim()); setNuevoCli(true); setCambiando(false); setBuscando(''); };
  const eligiendo = !nuevoCli && (cambiando || !f.cliente.nombre.trim());
  const camposAbiertos = nuevoCli || datosCli;
  // Retención según el cliente (auditoría 23-10-2026): un cliente de fuera de España no retiene en España, así que la factura
  // nueva va sin retención salvo que se haya elegido a mano; con NIF de persona (o sin NIF) puede ser un particular, que
  // tampoco retiene: se avisa con un botón para quitarla.
  const nifCli = String(f.cliente.nif || '').toUpperCase().replace(/[\s.-]/g, '').replace(/^ES(?=[0-9A-Z]{9}$)/, '');
  const clienteExtranjero = Boolean(nifCli) && !NIF_ES.test(nifCli);
  const clientePersona = !nifCli || /^([0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(nifCli);
  useEffect(() => {
    if (!nueva || orig || irpfPersonalizado.current) return;
    const objetivo = clienteExtranjero ? 0 : Number(defecto(f.actividad).irpfPct) || 0;
    if (Number(f.irpfPct) !== objetivo) setF((x) => ({ ...x, irpfPct: objetivo }));
  }, [clienteExtranjero]); // eslint-disable-line react-hooks/exhaustive-deps -- solo al cambiar de cliente
  const cambiarActividad = (a) => {
    if (nueva && !orig) limpiarErrores(...(!irpfPersonalizado.current ? ['irpfPct'] : []),
      ...f.lineas.flatMap((l, i) => lineaFacturaVacia(l) && !ivasPersonalizados.current.has(i) ? [`lineas.${i}.ivaPct`, ...(i === 0 ? ['ivaPct'] : [])] : []));
    const opciones = { nueva, rectificativa: Boolean(orig), irpfPersonalizado: irpfPersonalizado.current, ivasPersonalizados: [...ivasPersonalizados.current] };
    setF((x) => cambiarActividadFactura(x, a, defecto(a), opciones));
  };
  const ponerLinea = (i, k, v) => {
    if (k === 'ivaPct') ivasPersonalizados.current.add(i);
    limpiarErrores(`lineas.${i}.${k}`, ...(k === 'ivaPct' ? ['ivaPct'] : k !== 'concepto' ? ['base'] : []));
    setF((x) => ({ ...x, lineas: x.lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  };
  const quitarLinea = (i) => {
    ivasPersonalizados.current = new Set([...ivasPersonalizados.current].filter((j) => j !== i).map((j) => j > i ? j - 1 : j));
    setErrores((actuales) => Object.fromEntries(Object.entries(actuales).flatMap(([k, v]) => {
      if (k === 'lineas' || k === 'base') return [];
      const m = /^lineas\.(\d+)\.(.+)$/.exec(k);
      if (!m) return [[k, v]];
      const indice = Number(m[1]);
      return indice === i ? [] : [[`lineas.${indice > i ? indice - 1 : indice}.${m[2]}`, v]];
    })));
    setF((x) => ({ ...x, lineas: x.lineas.filter((_, j) => j !== i) }));
  };
  // Del catálogo: rellena la última línea si está vacía; si no, añade una.
  const delCatalogo = (p) => {
    const ult = f.lineas.at(-1);
    if (ult && !ult.concepto && !ult.precio) ivasPersonalizados.current.delete(f.lineas.length - 1);
    limpiarErrores('lineas', 'base', ...(ult && !ult.concepto && !ult.precio ? [`lineas.${f.lineas.length - 1}`] : []));
    setF((x) => {
      const l = { concepto: p.nombre, cantidad: '1', precio: aTexto(p.precio), dto: '', ivaPct: p.ivaPct, producto: p.id };
      const ult = x.lineas.at(-1);
      return { ...x, lineas: ult && !ult.concepto && !ult.precio ? [...x.lineas.slice(0, -1), l] : [...x.lineas, l] };
    });
  };
  const anadirLinea = () => { limpiarErrores('lineas', 'base'); setF((x) => ({ ...x, lineas: [...x.lineas, lineaVacia(x.lineas.at(-1)?.ivaPct ?? defecto(x.actividad).ivaPct)] })); };

  const nums = f.lineas.map((l) => ({ cantidad: numero(l.cantidad), precio: numero(l.precio), dto: Number(String(l.dto).replace(',', '.')) || 0, ivaPct: Number(l.ivaPct), ...(f.margen ? { coste: numero(l.coste) } : {}) }));
  // Régimen de margen (REBU, REAV): el precio lleva el IVA de su margen dentro; la base es la venta sin ese IVA.
  const tipos = desglose({ lineas: nums, recargo: Boolean(f.recargo), margen: f.margen });
  const base = r2(f.margen ? tipos.reduce((s, d) => s + d.base, 0) : nums.reduce((s, l) => s + baseLinea(l), 0));
  const t = importes({ base, lineas: nums, irpfPct: Number(f.irpfPct), recargo: Boolean(f.recargo), margen: f.margen, compensacion: f.compensacion });
  // En otra moneda, los importes se escriben y se ven en esa moneda; el contravalor en euros, debajo del total.
  const enOtra = Boolean(f.divisa?.moneda && f.divisa.moneda !== 'EUR');
  const dinero = enOtra ? formatoDoc({ divisa: f.divisa }).dinero : eur;
  const cambio = Number(String(f.divisa?.cambio ?? '').replace(',', '.'));
  const enEuros = enOtra && cambio > 0 ? r2(t.total / cambio) : null;
  const ponerDivisa = (cambios) => { limpiarErrores('divisa.cambio'); setF((x) => ({ ...x, divisa: { ...(x.divisa || {}), ...cambios } })); };
  // El tipo del BCE del día de la factura (o del último publicado antes), salvo que se haya escrito a mano.
  useEffect(() => {
    if (!enOtra || f.divisa?.fuente === 'manual' || !f.fecha) return;
    if (f.divisa?.fuente === 'BCE' && f.divisa?.pedido === `${f.divisa.moneda}:${f.fecha}`) return;
    let vivo = true;
    fetch(`/api/cambio?moneda=${encodeURIComponent(f.divisa.moneda)}&fecha=${encodeURIComponent(f.fecha)}`).then((r) => r.json()).then((d) => {
      if (vivo && d.ok) ponerDivisa({ cambio: d.cambio, fecha: d.fecha, fuente: 'BCE', pedido: `${d.moneda}:${f.fecha}` });
    }).catch(() => {});
    return () => { vivo = false; };
  }, [enOtra, f.divisa?.moneda, f.divisa?.fuente, f.divisa?.pedido, f.fecha]);
  // Ficha del cliente elegido: cómo y cuándo cobra, y su riesgo máximo con esta factura. Lo que ya debe incluye esta misma
  // factura si se está editando (propio), y lo cobrado no cuenta; si no suma riesgo, nunca se avisa.
  const resumen = ficha && [ficha.formaCobro && nombreForma(ficha.formaCobro), Number.isInteger(ficha.plazo) && (ficha.plazo ? `${ficha.plazo} días` : 'al contado'),
    ficha.comercial && `Comercial: ${ficha.comercial}`, ficha.zona && `Zona: ${ficha.zona}`].filter(Boolean).join(' · ');
  // El riesgo del cliente va en euros.
  const pendiente = f.cobrada ? 0 : r2((enEuros ?? t.total) - (factura ? pagadoDe(factura) : 0));
  const propio = factura && mismoCliente(factura.cliente, f.cliente) ? pendienteDe(factura) : 0;
  const riesgo = tieneLimite(ficha) ? evaluarRiesgo({ limite: ficha.riesgoMax, riesgo: Number(riesgos[ficha.id]) || 0, incremento: r2(pendiente - propio), cliente: ficha.nombre }) : null;

  const enviar = async (e) => {
    e.preventDefault();
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true); setError(''); setErrores({});
    try {
      const mandar = (extra = {}) => fetch('/api/facturas', { headers: { 'Content-Type': 'application/json' }, method: nueva ? 'POST' : 'PATCH', body: JSON.stringify({ ...(nueva ? { ...f, idem } : f), ...extra }) });
      let r = await mandar();
      let d = await r.json().catch(() => ({}));
      // La fecha no sigue el orden de la serie: se avisa y, si la persona lo confirma, se guarda igualmente.
      if (r.status === 409 && d.ordenFechas) {
        const seguir = await confirmar({ titulo: 'La fecha no sigue el orden de la serie', texto: `${d.error} Hacienda pide que número y fecha vayan en el mismo orden. Si es un error, cambia la fecha; si no, puedes guardarla igualmente.`, aceptar: 'Guardar igualmente', cancelar: 'Cambiar la fecha' });
        if (!seguir) { setEnviando(false); enviandoRef.current = false; setErrores({ fecha: d.error }); return; }
        r = await mandar({ forzarOrden: true });
        d = await r.json().catch(() => ({}));
      }
      if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      if (!r.ok) {
        if (r.status === 400 && d.errores) {
          enfocarError.current = true;
          const claves = Object.keys(d.errores);
          if (claves.some((k) => k.startsWith('cliente.'))) setDatosCli(true);
          if (claves.some((k) => ['irpfPct', 'nota', 'proyecto'].includes(k) || k.startsWith('evento'))) setDetalles(true);
          setErrores(d.errores);
        }
        throw new Error(d.error || 'No se ha podido guardar la factura. Revisa la conexión e inténtalo otra vez.');
      }
      await sinGuardar.guardado();
      if (nueva) navegar(router, `/facturas/${d.factura.id}`, 'fundido', undefined, true);
      router.refresh();
    } catch (err) { setError(err.message); setEnviando(false); enviandoRef.current = false; }
  };

  return (
    <form ref={formulario} className={`formulario ff${nueva ? ' ff-nuevo' : ''}`} onSubmit={enviar}>
      <div className={`ff-campos${detalles ? ' det-abierto' : ''}`}>
      <p className="rotulo">{nueva ? `Se numerará como ${numeros[f.actividad]}` : `Factura ${numeroFactura(f)}`}{orig ? <> · <Termino id="rectificativa">Rectificativa</Termino> de la {numeroFactura(orig)} (pon el importe que corrige: en negativo si anula)</> : ''}</p>
      {actividades.length > 1 && <Deslizable className={`tipo ${actividades.length === 2 ? 'dos' : 'varias'}`}>
        {actividades.map(({ id, nombre }) => (
          <button type="button" key={id} className={f.actividad === id ? 'activo' : ''} onClick={() => cambiarActividad(id)}>{nombre}</button>
        ))}
      </Deslizable>}

      <label>Fecha<input {...atributos('fecha')} className="campo" type="date" value={f.fecha} onChange={(e) => poner('fecha', e.target.value)} required />{mensaje('fecha')}</label>

      <fieldset>
        <legend>Cliente</legend>
        {nueva && (
          <div className="ff-m ff-cli">
            {eligiendo && !nuevoCli ? (
              <div className="ff-cli-busca">
                <input spellCheck={false} autoCorrect="off" autoCapitalize="characters" type="search" className="campo" placeholder="Buscar cliente por nombre o NIF" value={buscando} onChange={(e) => setBuscando(e.target.value)} aria-label="Buscar cliente" autoComplete="off" enterKeyHint="search" />
                <ul className="ff-cli-res">
                  {resultados.map((c) => <li key={c.id}><button type="button" onClick={() => elegirBuscado(c.id)}><strong>{c.nombre}</strong><small>{[c.nif || 'Sin NIF', c.ciudad].filter(Boolean).join(' · ')}</small></button></li>)}
                  <li><button type="button" className="ff-cli-nuevo" onClick={clienteNuevo}>+ Cliente nuevo{buscando.trim() ? `: «${buscando.trim()}»` : ''}</button></li>
                </ul>
                {cambiando && f.cliente.nombre.trim() && <button type="button" className="ff-cli-enlace" onClick={() => { setCambiando(false); setBuscando(''); }}>Dejar a {f.cliente.nombre}</button>}
              </div>
            ) : nuevoCli ? (
              <div className="ff-cli-sel">
                <span className="txt"><strong>Cliente nuevo</strong><small>Rellena sus datos</small></span>
                <button type="button" className="ff-cli-enlace" onClick={() => { setNuevoCli(false); setDatosCli(false); elegirCliente(''); }}>Elegir uno guardado</button>
              </div>
            ) : (
              <>
                <div className="ff-cli-sel">
                  <span className="txt"><strong>{f.cliente.nombre}</strong><small>{[f.cliente.nif, f.cliente.ciudad].filter(Boolean).join(' · ') || 'Sin NIF'}</small></span>
                  <button type="button" className="ff-cli-enlace" onClick={() => { setCambiando(true); setBuscando(''); }}>Cambiar</button>
                </div>
                <button type="button" className="ff-cli-enlace" aria-expanded={datosCli} onClick={() => setDatosCli((v) => !v)}>{datosCli ? 'Ocultar sus datos' : 'Ver o editar sus datos'}</button>
              </>
            )}
          </div>
        )}
        <div className={`ff-datos-cliente${camposAbiertos ? ' abierto' : ''}`}>
          <label className="ff-etiqueta-oculta" htmlFor={idCampo('cliente-selector')}>Elegir cliente</label>
          <select id={idCampo('cliente-selector')} className="campo ff-sel-cli" value={elegido || (f.cliente.nombre.trim() ? '__sin_ficha__' : '')} onChange={(e) => elegirCliente(e.target.value)}>
            {!elegido && f.cliente.nombre.trim() && <option value="__sin_ficha__" disabled>{etiquetaClienteFactura(f.cliente)} (sin ficha seleccionada)</option>}
            <option value="">+ Cliente nuevo</option>
            {ordenados.map((c) => <option key={c.id} value={c.id}>{etiquetaClienteFactura(c)}</option>)}
          </select>
          <label className="ff-etiqueta" htmlFor={idCampo('cliente.nombre')}>Nombre o razón social</label>
          <input {...atributos('cliente.nombre')} className="campo" placeholder="Ej.: Talleres García S.L." value={f.cliente.nombre} onChange={(e) => ponerCliente('nombre', e.target.value)} required />{mensaje('cliente.nombre')}
          <label className="ff-etiqueta" htmlFor={idCampo('cliente.nif')}>NIF</label>
          <input spellCheck={false} autoCorrect="off" autoCapitalize="characters" {...atributos('cliente.nif')} className="campo" placeholder="Ej.: B12345678" value={f.cliente.nif} onChange={(e) => ponerCliente('nif', e.target.value)} />{mensaje('cliente.nif')}
          <label className="ff-etiqueta" htmlFor={idCampo('cliente.pais')}>País (si no es España)</label>
          <input spellCheck={false} autoCorrect="off" autoCapitalize="characters" {...atributos('cliente.pais')} className="campo" placeholder="País del NIF si no es ES (US, PT, FR…)" maxLength={2} value={f.cliente.pais || ''} onChange={(e) => ponerCliente('pais', e.target.value.toUpperCase())} />{mensaje('cliente.pais')}
          <label className="ff-etiqueta" htmlFor={idCampo('cliente.direccion')}>Dirección</label>
          <input {...atributos('cliente.direccion')} className="campo" placeholder="Ej.: Calle Mayor, 1" value={f.cliente.direccion} onChange={(e) => ponerCliente('direccion', e.target.value)} />{mensaje('cliente.direccion')}
          <label className="ff-etiqueta" htmlFor={idCampo('cliente.ciudad')}>Código postal y ciudad</label>
          <input {...atributos('cliente.ciudad')} className="campo" placeholder="Ej.: 08001 Barcelona" value={f.cliente.ciudad} onChange={(e) => ponerCliente('ciudad', e.target.value)} />{mensaje('cliente.ciudad')}
          <label className="ff-etiqueta" htmlFor={idCampo('cliente.email')}>Email</label>
          <input autoComplete="email" {...atributos('cliente.email')} className="campo" type="email" placeholder="Ej.: cliente@empresa.es" value={f.cliente.email || ''} onChange={(e) => ponerCliente('email', e.target.value)} />{mensaje('cliente.email')}
        </div>
        {(resumen || riesgo) && (
          <div className={`ff-ficha${riesgo && !riesgo.ok ? ' excede' : ''}`}>
            {resumen && <p className="ff-ficha-resumen">{resumen}</p>}
            {riesgo && (
              <>
                <p className="ff-riesgo-cifras"><span>Riesgo <b>{eur(riesgo.riesgo)}</b> de {eur(riesgo.limite)}</span><span>Disponible <b>{eur(riesgo.disponible)}</b></span></p>
                <div className="ff-riesgo-barra" aria-hidden="true"><i style={{ width: `${riesgo.limite > 0 ? Math.min(100, Math.round((riesgo.nuevo / riesgo.limite) * 100)) : 100}%` }} /></div>
                {riesgo.ok
                  ? riesgo.nuevo !== riesgo.riesgo && <p className="ff-riesgo-nota">Con esta factura: {eur(riesgo.nuevo)}</p>
                  : <p className="error" role="alert">{riesgo.error}</p>}
              </>
            )}
          </div>
        )}
      </fieldset>

      <div className={`dos-col ff-det ff-evento${verEvento || f.evento?.fecha || f.evento?.lugar ? ' abierto' : ''}`}>
        <label>Fecha del servicio o del evento, si no es la de la factura (opcional)<input className="campo" type="date" value={f.evento?.fecha || ''} onChange={(e) => poner('evento', { ...f.evento, fecha: e.target.value })} /></label>
        <label>Lugar (opcional)<input className="campo" placeholder="Ej.: C/ Mayor, 1, Valencia" value={f.evento?.lugar || ''} onChange={(e) => poner('evento', { ...f.evento, lugar: e.target.value })} /></label>
      </div>
      <fieldset className="lineas">
        <legend>Conceptos</legend>
        {f.lineas.map((l, i) => (
          <div className="linea" key={i}>
            <div className="linea-cab">
              <label className="ff-etiqueta-oculta" htmlFor={idCampo(`lineas.${i}.concepto`)}>Concepto</label>
              <input {...atributos(`lineas.${i}.concepto`)} className="campo" placeholder="Ej.: Reparación de la instalación (2 horas)" value={l.concepto} onChange={(e) => ponerLinea(i, 'concepto', e.target.value)} required />
              {f.lineas.length > 1 && <button type="button" className="linea-quitar" aria-label="Quitar línea" onClick={() => quitarLinea(i)}>×</button>}
            </div>
            {mensaje(`lineas.${i}.concepto`)}
            <div className="linea-nums">
              <label>Cantidad<input {...atributos(`lineas.${i}.cantidad`)} className="campo" inputMode="decimal" value={l.cantidad} onChange={(e) => ponerLinea(i, 'cantidad', e.target.value)} />{mensaje(`lineas.${i}.cantidad`)}</label>
              <label>Precio<input {...atributos(`lineas.${i}.precio`, i === 0 ? ['base'] : [])} className="campo" inputMode="decimal" placeholder="0,00" value={l.precio} onChange={(e) => ponerLinea(i, 'precio', e.target.value)} />{mensaje(`lineas.${i}.precio`, i === 0 ? ['base'] : [])}</label>
              <label>Dto. %<input {...atributos(`lineas.${i}.dto`)} className="campo" inputMode="decimal" placeholder="0" value={l.dto} onChange={(e) => ponerLinea(i, 'dto', e.target.value)} />{mensaje(`lineas.${i}.dto`)}</label>
              {f.margen && <label>Coste<input className="campo" inputMode="decimal" placeholder="0,00" value={l.coste ?? ''} onChange={(e) => ponerLinea(i, 'coste', e.target.value)} aria-describedby={idCampo('margen-nota')} /></label>}
              <label>{impuesto}
                <select {...atributos(`lineas.${i}.ivaPct`, i === 0 ? ['ivaPct'] : [])} className="campo" value={l.ivaPct} onChange={(e) => ponerLinea(i, 'ivaPct', Number(e.target.value))}>
                  {[...new Set(igic ? TIPOS_IGIC : f.oss?.pais ? tiposPais(f.oss.pais) : [21, 10, 4, 0, Number(l.ivaPct)])].map((n) => <option key={n} value={n}>{String(n).replace('.', ',')}%</option>)}
                </select>{mensaje(`lineas.${i}.ivaPct`, i === 0 ? ['ivaPct'] : [])}
              </label>
            </div>
            <p className="linea-total">{stock && nueva && !orig && l.producto && stock[l.producto] !== undefined && <span className={`linea-stock${stock[l.producto] < nums[i].cantidad ? ' falta' : ''}`}>{stock[l.producto] < nums[i].cantidad ? `Solo quedan ${stock[l.producto]}` : `Quedan ${stock[l.producto]}`}</span>}{dinero(baseLinea(nums[i]))}</p>
          </div>
        ))}
        {productos.length > 0 && <div className="catalogo-chips" aria-label="Añadir del catálogo">{productos.map((p) => <button type="button" key={p.id} onClick={() => delCatalogo(p)}>+ {p.nombre}</button>)}</div>}
        {mensaje('lineas')}
        <button {...atributos('lineas')} type="button" className="boton sec" onClick={anadirLinea}>+ Añadir otro concepto</button>
      </fieldset>

      <label className="ff-det">Proyecto, obra o local (opcional)
        <input className="campo" list="proyectos-factura" value={f.proyecto || ''} onChange={(e) => poner('proyecto', e.target.value)} placeholder="Para ver la rentabilidad de cada uno" maxLength={60} />
      </label>
      <datalist id="proyectos-factura">{proyectos.map((p) => <option key={p} value={p} />)}</datalist>

      {(nums.some((l) => l.ivaPct === 0) || errores.operacion) && <label>¿Por qué va sin {impuesto}?
        {/* A un cliente de España sin IVA hay que decir el motivo (auditoría U-17): exenta, inversión del sujeto pasivo… cambian
            la prorrata y el 303. De la UE o de fuera, el de su NIF sirve por defecto. */}
        <select {...atributos('operacion')} className="campo" value={f.operacion || ''} required={!igic && !clienteExtranjero} onChange={(e) => poner('operacion', e.target.value || undefined)}>
          <option value="">{igic ? 'Tipo cero (sin otra operación)' : clienteExtranjero ? `Según el cliente: ${operaciones[nifUE(nifCli) ? 'servicios-ue' : 'servicios-fuera']?.nombre}` : 'Elige el motivo'}</option>
          {Object.entries(operaciones).map(([k, t]) => <option key={k} value={k}>{t.nombre}</option>)}
        </select>{mensaje('operacion')}
      </label>}

      {orig && <label>Motivo de la rectificación
        <select className="campo" value={f.motivoRectificacion || ''} onChange={(e) => poner('motivoRectificacion', e.target.value)}>
          <option value="">Otras causas (R4)</option>
          <option value="devolucion">Devolución, descuento, anulación o cambio de precio (R1, art. 80 Uno, Dos y Seis)</option>
          <option value="errorFactura">Error al hacer la factura: importe, tipo de {impuesto} o dato equivocado (R4)</option>
          <option value="errorDerecho">Error fundado de derecho (R1)</option>
          <option value="concurso">Concurso del cliente (R2, art. 80 Tres)</option>
          <option value="incobrable">Crédito incobrable: el cliente no paga (R3, art. 80 Cuatro)</option>
        </select>
      </label>}
      {orig && (() => {
        // Lo que cambia según el motivo (informe de la asesoría, 20-10-2026): dónde va en el 303 y en el IRPF.
        const motivo = f.motivoRectificacion || '';
        const cuota = r2(nums.reduce((s, l) => s + baseLinea(l) * (Number(l.ivaPct) || 0) / 100, 0));
        const otroT = orig.fecha.slice(0, 4) !== f.fecha.slice(0, 4) || trimestre(orig.fecha) !== trimestre(f.fecha);
        const otroAnio = orig.fecha.slice(0, 4) !== f.fecha.slice(0, 4);
        if (!igic && motivo === 'incobrable') {
          const r = requisitosIncobrable({ fechaOriginal: orig.fecha, fechaRectificativa: f.fecha, base: orig.base });
          return <div className="nota aviso-rect">
            {[...r.errores, ...r.avisos].map((t) => <p key={t}><strong>{t}</strong></p>)}
            <p>Para recuperar el IVA de un impagado hace falta:</p>
            <ul>{r.requisitos.map((t) => <li key={t}>{t}</li>)}</ul>
            {!r.errores.length && <p>Con esta fecha, el modelo 952 se presenta hasta el {r.limite952.split('-').reverse().join('/')}.</p>}
            <p>Si facturaste más de 6 millones el año pasado, la espera es de un año desde la factura, no de seis meses.</p>
            <label className="check"><input type="checkbox" checked={Boolean(f.reclamado)} onChange={(e) => poner('reclamado', e.target.checked)} /> He reclamado el cobro por vía judicial, con requerimiento notarial o por otro medio fehaciente que admita la ley</label>
          </div>;
        }
        if (!igic && motivo === 'errorFactura' && cuota > 0 && otroT) return <p className="nota aviso-rect">Sube el IVA por un error: no va en el 303 de este trimestre, sino en una autoliquidación rectificativa del {trimestre(orig.fecha)}T {orig.fecha.slice(0, 4)}, con recargo por presentarla tarde (art. 27 LGT) e intereses si procede (art. 89.Cinco de la Ley del IVA). Fisquo la cuenta en ese trimestre.{otroAnio ? ` En el IRPF cuenta en ${orig.fecha.slice(0, 4)}.` : ''}</p>;
        if (['errorFactura', 'errorDerecho'].includes(motivo) && otroAnio) return <p className="nota aviso-rect">Corrige un error de una factura de {orig.fecha.slice(0, 4)}: en el IRPF cuenta en ese año (su declaración de la renta), no en el 130 de {f.fecha.slice(0, 4)}.</p>;
        if (!igic && !motivo && cuota > 0 && otroT) return <p className="nota aviso-rect">Sube el IVA de una factura de otro trimestre: elige el motivo. Si es un error al facturar, va en una autoliquidación rectificativa de ese trimestre, no en este.</p>;
        return null;
      })()}

      <div className="ff-det termino-campo">
        <span id={idCampo('irpf-etiqueta')}><Termino id="retencion">Retención de IRPF</Termino></span>
        <select aria-labelledby={idCampo('irpf-etiqueta')} {...atributos('irpfPct')} className="campo" value={f.irpfPct} onChange={(e) => poner('irpfPct', Number(e.target.value))}>
          {[...new Set([15, 7, 0, Number(f.irpfPct) || 0])].map((n) => <option key={n} value={n}>{n}%</option>)}
        </select>{mensaje('irpfPct')}
        {!orig && Number(f.irpfPct) > 0 && clientePersona && f.cliente.nombre.trim() && <p className="nota">Si es un particular (no autónomo ni empresa), la factura va sin retención. <button type="button" className="enlace" onClick={() => poner('irpfPct', 0)}>Quitar la retención</button></p>}
        {clienteExtranjero && Number(f.irpfPct) === 0 && <p className="nota">Sin retención: el cliente es de fuera de España.</p>}
      </div>
      {/* Sin NIF del cliente solo cabe la factura simplificada (art. 4 del Reglamento de facturación): hasta 400 €, o 3.000 €
          en comercio y hostelería; por encima de 3.000 € el servidor ya lo pide (auditoría F1-10). */}
      {!orig && !nifCli && !f.oss?.pais && f.cliente.nombre.trim() && t.total + t.irpf > 400 && <p className="nota">Sin el NIF del cliente, esta factura solo vale como simplificada: hasta 400 € (3.000 € en comercio y hostelería). Pídele su NIF o DNI y añádelo.</p>}

      {!igic && (recargo || f.recargo) && <div className="check ff-det termino-check"><input id={idCampo('recargo')} aria-labelledby={idCampo('recargo-etiqueta')} type="checkbox" checked={Boolean(f.recargo)} onChange={(e) => poner('recargo', e.target.checked)} /><span id={idCampo('recargo-etiqueta')}><label htmlFor={idCampo('recargo')}>Cliente en </label><Termino id="recargo">recargo de equivalencia</Termino><label htmlFor={idCampo('recargo')}> (comercio minorista: 5,2 % con el 21 %, 1,4 % con el 10 %, 0,5 % con el 4 %)</label></span></div>}

      {!igic && (margenes.length > 0 || f.margen) && (
        <div className="ff-det">
          <label>Régimen de la factura
            <select className="campo" value={f.margen || ''} onChange={(e) => setF((x) => ({ ...x, margen: e.target.value || undefined, ...(e.target.value ? { recargo: false, oss: undefined, divisa: undefined } : { cuotasIncluidas: undefined }) }))}>
              <option value="">General: IVA sobre el precio</option>
              {(margenes.includes('rebu') || f.margen === 'rebu') && <option value="rebu">Bienes usados, arte o antigüedades (REBU): IVA sobre el margen</option>}
              {(margenes.includes('reav') || f.margen === 'reav') && <option value="reav">Agencia de viajes (REAV): IVA sobre el margen</option>}
            </select>
          </label>
          {f.margen && <p className="nota" id={idCampo('margen-nota')}>Pon en cada línea el precio final y lo que te costó{f.margen === 'reav' ? ' (los servicios del viaje que compraste para el cliente)' : ''}. La factura no desglosa el IVA: va dentro del margen y lleva la mención del régimen.</p>}
          {f.margen === 'reav' && <label className="check"><input type="checkbox" checked={Boolean(f.cuotasIncluidas)} onChange={(e) => poner('cuotasIncluidas', e.target.checked || undefined)} /> El cliente es una empresa y pide las «cuotas de IVA incluidas en el precio» (6 % del total)</label>}
        </div>
      )}
      {(reagp || f.compensacion) && (
        <label className="ff-det">Compensación del régimen de la agricultura (REAGP)
          <select className="campo" value={f.compensacion || ''} onChange={(e) => { const c = Number(e.target.value) || undefined; setF((x) => ({ ...x, compensacion: c, ...(c ? { lineas: x.lineas.map((l) => ({ ...l, ivaPct: 0 })) } : {}) })); }}>
            <option value="">Sin compensación (venta a un particular)</option>
            <option value="12">12 %: agricultura o forestal</option>
            <option value="10.5">10,5 %: ganadería o pesca</option>
          </select>
          {mensaje('compensacion')}
        </label>
      )}
      {!igic && (oss || f.oss) && (
        <label className="ff-det">Venta a un particular de otro país de la UE
          <select className="campo" value={f.oss?.pais || ''} onChange={(e) => {
            const pais = e.target.value;
            limpiarErrores('oss.pais');
            // Con el IVA de su país (el general, si el tipo de la línea no existe allí), sin retención ni recargo.
            setF((x) => ({ ...x, oss: pais ? { pais } : undefined, ...(pais ? { irpfPct: 0, recargo: false } : {}),
              lineas: x.lineas.map((l) => (pais && !tiposPais(pais).includes(Number(l.ivaPct)) ? { ...l, ivaPct: TIPOS_UE[pais].general } : !pais && ![21, 10, 4, 0].includes(Number(l.ivaPct)) ? { ...l, ivaPct: defecto(x.actividad).ivaPct } : l)) }));
          }}>
            <option value="">No: IVA español</option>
            {Object.entries(NOMBRES_UE).sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([k, n]) => <option key={k} value={k}>{n}: IVA de allí (ventanilla única)</option>)}
          </select>
          {mensaje('oss.pais')}
          {f.oss?.pais && <span className="nota">Con el IVA de {NOMBRES_UE[f.oss.pais]}: no va en el 303, sino en el modelo 369.</span>}
        </label>
      )}

      <label className="ff-det">Nota en la factura (opcional)
        <input className="campo" placeholder={`Ej.: operación exenta de ${impuesto}, inversión del sujeto pasivo`} value={f.nota || ''} onChange={(e) => poner('nota', e.target.value)} />
      </label>

      <div className="dos-col ff-det">
        <label>Idioma de la factura
          <select className="campo" value={f.idioma || 'es'} onChange={(e) => poner('idioma', e.target.value === 'es' ? undefined : e.target.value)}>
            {IDIOMAS_FACTURA.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        <label>Moneda
          <select className="campo" value={f.divisa?.moneda || 'EUR'} onChange={(e) => (e.target.value === 'EUR' ? poner('divisa', undefined) : poner('divisa', { moneda: e.target.value }))}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m === 'EUR' ? 'Euros (EUR)' : m}</option>)}
          </select>
        </label>
      </div>
      {enOtra && (
        <div className="ff-det">
          <label htmlFor={idCampo('divisa.cambio')}>Tipo de cambio: 1 € = … {f.divisa.moneda}</label>
          <input {...atributos('divisa.cambio')} className="campo" inputMode="decimal" value={aTexto(f.divisa.cambio ?? '')} onChange={(e) => ponerDivisa({ cambio: e.target.value, fuente: 'manual', fecha: undefined, pedido: undefined })} placeholder="Ej.: 1,0812" />
          {mensaje('divisa.cambio')}
          <p className="nota">{f.divisa.fuente === 'BCE' ? `El del Banco Central Europeo del ${f.divisa.fecha?.split('-').reverse().join('/')}, el oficial para el ${impuesto}.` : 'Escrito a mano.'} {f.divisa.fuente === 'manual' && <button type="button" className="enlace" onClick={() => ponerDivisa({ fuente: undefined, pedido: undefined })}>Usar el del BCE</button>} Los precios van en {f.divisa.moneda}; Fisquo guarda también su valor en euros para el {impuesto} y la contabilidad.</p>
        </div>
      )}

      {nueva && <button type="button" className="ff-m ff-det-boton" aria-expanded={detalles} onClick={() => setDetalles((v) => !v)}>{detalles ? 'Ocultar detalles' : 'Detalles: IRPF, nota, proyecto, idioma y moneda'}</button>}
      {nueva && detalles && !verEvento && !f.evento?.fecha && !f.evento?.lugar && <button type="button" className="ff-m ff-evento-boton" onClick={() => setVerEvento(true)}>+ Fecha y lugar del evento</button>}

      <label className="check"><input type="checkbox" checked={f.cobrada} onChange={(e) => poner('cobrada', e.target.checked)} /> Ya está cobrada</label>

      <div className="ff-pie">
        <div className="totales">
          <span>Base {dinero(t.base)}</span>{tipos.length > 1 ? tipos.map((x) => <span key={x.pct}>{impuesto} {x.pct} % {dinero(x.iva)}</span>) : <span>{impuesto} {dinero(t.iva)}</span>}{t.irpf > 0 && <span>IRPF −{dinero(t.irpf)}</span>}<strong>Total {dinero(t.total)}</strong>{enEuros !== null && <span>En euros {eur(enEuros)}</span>}
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : nueva ? 'Crear factura' : 'Guardar cambios'}</button>
      </div>
      </div>

      {/* En el ordenador, la factura se va dibujando al lado mientras se rellena */}
      <aside className="ff-vista" aria-label="Vista previa">
        <div className="ff-papel">
          <div className="ff-papel-cab"><b>Factura {nueva ? numeros[f.actividad] : numeroFactura(f)}</b><small>{f.fecha ? new Date(`${f.fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</small></div>
          <div className="ff-para"><small>Para</small><b>{f.cliente.nombre || 'Tu cliente'}</b>{f.cliente.nif && <small>{f.cliente.nif}</small>}</div>
          <ul className="ff-lineas">
            {f.lineas.map((l, i) => (
              <li key={i}><span>{l.concepto || 'Concepto'}<small>{aTexto(nums[i].cantidad)} × {dinero(nums[i].precio)}{nums[i].dto ? ` · −${aTexto(nums[i].dto)} %` : ''}</small></span><b>{dinero(baseLinea(nums[i]))}</b></li>
            ))}
          </ul>
          <dl className="ff-tot">
            {f.margen ? <div><dt>IVA del margen (no sale en la factura)</dt><dd>{dinero(t.iva)}</dd></div> : <>
              <div><dt>Base</dt><dd>{dinero(t.base)}</dd></div>
              {t.compensacion ? <div><dt>Compensación {aTexto(f.compensacion)} %</dt><dd>{dinero(t.compensacion)}</dd></div>
                : tipos.length > 1 ? tipos.map((x) => <div key={x.pct}><dt>{impuesto} {x.pct} %</dt><dd>{dinero(x.iva)}</dd></div>) : <div><dt>{impuesto}</dt><dd>{dinero(t.iva)}</dd></div>}
            </>}
            {t.recargo > 0 && <div><dt>Recargo de equivalencia</dt><dd>{dinero(t.recargo)}</dd></div>}
            {Number(f.irpfPct) > 0 && <div><dt>IRPF {f.irpfPct} %</dt><dd>−{dinero(t.irpf)}</dd></div>}
          </dl>
          <p className="ff-total"><span>Total</span><b key={t.total}>{dinero(t.total)}</b></p>
          {enEuros !== null && <p className="nota">En euros: {eur(enEuros)}</p>}
          {f.cobrada && <span className="estado-txt e-cobrada">Cobrada</span>}
        </div>
      </aside>
    </form>
  );
}
