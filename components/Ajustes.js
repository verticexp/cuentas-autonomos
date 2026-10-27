'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import useCambiosSinGuardar from './useCambiosSinGuardar';
import { AYUDA_CONTRASENA } from '@/lib/contrasena';
import { useT } from '@/components/Idioma';
import '@/app/ajustes-formularios.css';

const CAMPOS = [
  ['nombre', 'Nombre o razón social (sale en la factura)'],
  ['nif', 'NIF'],
  ['direccion', 'Dirección'],
  ['ciudad', 'Ciudad y CP'],
];

// refrescar: tras guardar, se pide de nuevo la pantalla (la lista de Ajustes enseña lo guardado en sus filas).
function Formulario({ titulo, inicial, enviar, refrescar = true, children }) {
  const tr = useT();
  const router = useRouter();
  const [datos, setDatos] = useState(inicial);
  // «Guardar», como el «OK» de iOS: solo se puede tocar si algo ha cambiado desde lo último guardado.
  const [original, setOriginal] = useState(inicial);
  const [msg, setMsg] = useState('');
  const cambiado = JSON.stringify(datos) !== JSON.stringify(original);
  // «¿Salir sin guardar?» al cerrar la hoja (CerrarAjustes, ArrastrarAjustes) o con el atrás del sistema. Se registra si hay
  // cambios (no los datos: al guardar a veces se vacían, como la contraseña) y, guardado, solo se suelta la entrada de aviso.
  const sinGuardar = useCambiosSinGuardar(cambiado);
  const guardar = async (e) => {
    e.preventDefault();
    setMsg('Guardando…');
    let final = datos;
    try { await enviar(datos, (x) => { final = x; setDatos(x); }); setOriginal(final); setMsg('Guardado'); } catch (err) { setMsg(err.message); return; }
    await sinGuardar.soltar(); // la entrada de aviso se quita antes de refrescar
    if (refrescar) router.refresh();
  };
  return (
    <form className="formulario aj-form" onSubmit={guardar}>
      <h3 aria-level={2}>{tr(titulo)}</h3>
      {children(datos, (k, v) => setDatos((x) => ({ ...x, [k]: v })))}
      {msg && <p role="status" className={msg === 'Guardado' ? 'nota aj-pie guardado' : msg === 'Guardando…' ? 'nota aj-pie' : 'error aj-pie'}>{msg === 'Guardado' ? tr('✓ Guardado') : tr(msg)}</p>}
      <button className="boton" disabled={!cambiado || msg === 'Guardando…'}>{tr('Guardar')}</button>
    </form>
  );
}

function ProbarDrive({ error }) {
  const tr = useT();
  const [msg, setMsg] = useState('');
  const probar = async () => {
    setMsg('Probando…');
    try {
      const r = await llamar('/api/drive', { method: 'POST' });
      setMsg(r.ok ? '✓ Conectado: las facturas nuevas se guardarán en tu Drive.' : r.error);
    } catch (e) { setMsg(e.message); }
  };
  return (
    <div style={{ marginTop: -4 }}>
      {error && !msg && <p className="error">{tr('Último fallo: {error}', { error })}</p>}
      <button type="button" className="boton sec" onClick={probar}>{tr('Probar conexión')}</button>
      {msg && <p className={msg.startsWith('✓') ? 'nota' : 'error'}>{tr(msg)}</p>}
    </div>
  );
}

// extra: otra tarjeta de la sección en la misma rejilla (el cobro con tarjeta en Cobros).
export default function Ajustes({ seccion, emisor, drive, driveError, sociedad, nombre, extra = null }) {
  const tr = useT();
  return (
    <div className="tarjetas bloque">
      {seccion === 'facturacion' && <Formulario
        titulo="Lo que sale en tus facturas"
        inicial={emisor}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify(d) }); }}
      >
        {(d, poner) => (
          <>
            <div className="aj-grupo">
            {CAMPOS.map(([k, n]) => (
              <label key={k}>{tr(n)}<input {...(k === 'nif' ? { autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false } : {})} className="campo" value={d[k] || ''} onChange={(e) => poner(k, e.target.value)} required /></label>
            ))}
            <label>{tr('IBAN (opcional: sale en tus facturas para que te paguen por transferencia)')}<input autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="campo" value={d.iban || ''} onChange={(e) => poner('iban', e.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" /></label>
            <label>{tr('Email de contacto (opcional)')}<input autoComplete="email" className="campo" type="email" value={d.email || ''} onChange={(e) => poner('email', e.target.value)} placeholder="facturas@tuempresa.es" /></label>
            <label>{tr('Teléfono (opcional)')}<input inputMode="tel" autoComplete="tel" className="campo" type="tel" value={d.telefono || ''} onChange={(e) => poner('telefono', e.target.value)} /></label>
            <label>{tr('Web (opcional)')}<input className="campo" value={d.web || ''} onChange={(e) => poner('web', e.target.value)} placeholder="tuempresa.es" /></label>
            <label>{tr('Código de cuenta de cotización (opcional, si tienes trabajadores)')}<input className="campo" inputMode="numeric" value={d.ccc || ''} onChange={(e) => poner('ccc', e.target.value)} placeholder="0111 28 123456789" /></label>
            {sociedad && <label>{tr('Datos del Registro Mercantil')}<input className="campo" value={d.registro || ''} onChange={(e) => poner('registro', e.target.value)} placeholder={tr('Registro Mercantil de Madrid, tomo 1234, folio 56, hoja M-78901')} /></label>}
            {!sociedad && <label>{tr('Límite de rendimiento neto anual (tarifa plana; SMI 2026: 17094)')}<input className="campo" type="number" min="0" placeholder={tr('Vacío si no tienes tarifa plana')} value={d.limite || ''} onChange={(e) => poner('limite', e.target.value)} /></label>}
            </div>
            {sociedad && <p className="nota">{tr('Las sociedades deben ponerlos en sus facturas y documentos. Salen al pie de cada factura.')}</p>}
            <p className="nota">{tr('El email, el teléfono y la web salen en tus facturas, debajo de tu dirección.')}</p>
          </>
        )}
      </Formulario>}
      {seccion === 'cobros' && <Formulario
        titulo="Cómo te pagan"
        inicial={{ plazo: emisor.plazo ?? 30, recordatorios: emisor.recordatorios || '', bizum: emisor.bizum || '', otroPago: emisor.otroPago || '' }}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ cobros: d }) }); }}
      >
        {(d, poner) => (
          <>
            <div className="aj-grupo">
            <label>{tr('Plazo de pago (días)')}<input className="campo" type="number" min="0" max="365" value={d.plazo} onChange={(e) => poner('plazo', e.target.value)} /></label>
            <label>{tr('Bizum (opcional)')}<input autoComplete="tel" className="campo" type="tel" inputMode="tel" value={d.bizum} onChange={(e) => poner('bizum', e.target.value)} placeholder="600 000 000" /></label>
            <label>{tr('Otra forma de pago (opcional)')}<input className="campo" value={d.otroPago} onChange={(e) => poner('otroPago', e.target.value)} placeholder={tr('Efectivo, domiciliación, pagaré…')} /></label>
            <label>{tr('Recordar por email las facturas vencidas cada (días)')}<input className="campo" type="number" min="0" max="60" placeholder={tr('0 o vacío: no enviar recordatorios')} value={d.recordatorios} onChange={(e) => poner('recordatorios', e.target.value)} /></label>
            </div>
            <p className="nota">{tr('Transferencia al IBAN de tus datos de empresa{iban}: sale siempre en la factura.', { iban: emisor.iban ? ` (…${String(emisor.iban).replace(/\s/g, '').slice(-4)})` : '' })}</p>
          </>
        )}
      </Formulario>}
      {seccion === 'marca' && <Formulario
        titulo="Textos de la factura"
        inicial={{ pie: emisor.pie || '', notaDefecto: emisor.notaDefecto || '' }}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ diseno: d }) }); }}
      >
        {(d, poner) => (
          <>
            <div className="aj-grupo">
            <label>{tr('Nota que llevan las facturas nuevas (se puede cambiar en cada una)')}<textarea className="campo" rows={3} maxLength={500} value={d.notaDefecto} onChange={(e) => poner('notaDefecto', e.target.value)} placeholder={tr('Gracias por tu confianza.')} /></label>
            <label>{tr('Pie de página (textos legales)')}<textarea className="campo" rows={4} maxLength={500} value={d.pie} onChange={(e) => poner('pie', e.target.value)} placeholder={tr('Ej.: protección de datos, condiciones de pago o «Operación exenta de IVA según el art. 20 de la Ley 37/1992».')} /></label>
            </div>
            <p className="nota">{tr('El pie sale abajo en todas las facturas y presupuestos. Las facturas ya emitidas no cambian.')}</p>
          </>
        )}
      </Formulario>}
      {seccion === 'perfil' && <Formulario
        titulo="Tu nombre"
        inicial={{ nombre: nombre || '' }}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ perfil: d }) }); }}
      >
        {(d, poner) => (
          <>
            <div className="aj-grupo"><label><input className="campo" value={d.nombre} onChange={(e) => poner('nombre', e.target.value)} maxLength={80} autoComplete="name" required aria-label={tr('Tu nombre')} /></label></div>
            <p className="nota">{tr('Es como te ven las demás personas de tu empresa. El nombre de la empresa, en Datos de la empresa.')}</p>
          </>
        )}
      </Formulario>}
      {seccion === 'drive' && <Formulario
        titulo="Conexión con tu Drive"
        inicial={{ url: drive?.url || '', token: drive?.token || '' }}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ drive: d }) }); }}
      >
        {(d, poner) => (
          <>
            <p className="nota">{tr('Cada factura y gasto nuevo se guarda en tu Drive: el PDF en su carpeta y una fila en tus libros de Google Sheets.')}</p>
            <div className="aj-grupo">
            <label>{tr('URL de la aplicación web de Apps Script')}<input className="campo" placeholder="https://script.google.com/macros/s/…/exec" value={d.url} onChange={(e) => poner('url', e.target.value)} /></label>
            <label>{tr('Clave (la misma que pusiste en el script)')}<input className="campo" type="password" autoComplete="off" value={d.token} onChange={(e) => poner('token', e.target.value)} /></label>
            </div>
            {drive?.url && <ProbarDrive error={driveError} />}
          </>
        )}
      </Formulario>}
      {seccion === 'seguridad' && <Formulario
        titulo="Cambiar contraseña"
        refrescar={false}
        inicial={{ actual: '', nueva: '' }}
        enviar={async (d, set) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify(d) }); set({ actual: '', nueva: '' }); }}
      >
        {(d, poner) => (
          <>
            <div className="aj-grupo">
            <label>{tr('Contraseña actual')}<input className="campo" type="password" placeholder={tr('Contraseña actual')} autoComplete="current-password" value={d.actual} onChange={(e) => poner('actual', e.target.value)} required /></label>
            <label>{tr('Nueva contraseña')}<input className="campo" type="password" placeholder={tr('Nueva contraseña')} autoComplete="new-password" minLength={10} value={d.nueva} onChange={(e) => poner('nueva', e.target.value)} required /><small className="nota">{tr(AYUDA_CONTRASENA)}</small></label>
            </div>
          </>
        )}
      </Formulario>}
      {extra}
    </div>
  );
}
