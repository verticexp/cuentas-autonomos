'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

const CAMPOS = [
  ['nombre', 'Nombre o razón social (sale en la factura)'],
  ['nif', 'NIF'],
  ['direccion', 'Dirección'],
  ['ciudad', 'Ciudad y CP'],
  ['iban', 'IBAN'],
];

function Formulario({ titulo, inicial, enviar, children }) {
  const [datos, setDatos] = useState(inicial);
  const [msg, setMsg] = useState('');
  const guardar = async (e) => {
    e.preventDefault();
    setMsg('Guardando…');
    try { await enviar(datos, setDatos); setMsg('Guardado'); } catch (err) { setMsg(err.message); }
  };
  return (
    <form className="formulario tarjeta" onSubmit={guardar}>
      <h3>{titulo}</h3>
      {children(datos, (k, v) => setDatos((x) => ({ ...x, [k]: v })))}
      {msg && <p role="status" className={msg === 'Guardado' ? 'nota guardado' : msg === 'Guardando…' ? 'nota' : 'error'}>{msg === 'Guardado' ? '✓ Guardado' : msg}</p>}
      <button className="boton">Guardar</button>
    </form>
  );
}

function ProbarDrive({ error }) {
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
      {error && !msg && <p className="error">Último fallo: {error}</p>}
      <button type="button" className="boton sec" onClick={probar}>Probar conexión</button>
      {msg && <p className={msg.startsWith('✓') ? 'nota' : 'error'}>{msg}</p>}
    </div>
  );
}

export default function Ajustes({ seccion, emisor, drive, driveError, sociedad, nombre }) {
  const router = useRouter();
  return (
    <div className="tarjetas bloque">
      {seccion === 'facturacion' && <Formulario
        titulo="Datos de la empresa"
        inicial={emisor}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify(d) }); router.refresh(); }}
      >
        {(d, poner) => (
          <>
            {CAMPOS.map(([k, n]) => (
              <label key={k}>{n}<input {...(k === 'nif' ? { autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false } : {})} className="campo" value={d[k] || ''} onChange={(e) => poner(k, e.target.value)} required /></label>
            ))}
            <label>Email de contacto (opcional)<input autoComplete="email" className="campo" type="email" value={d.email || ''} onChange={(e) => poner('email', e.target.value)} placeholder="facturas@tuempresa.es" /></label>
            <label>Teléfono (opcional)<input inputMode="tel" autoComplete="tel" className="campo" type="tel" value={d.telefono || ''} onChange={(e) => poner('telefono', e.target.value)} /></label>
            <label>Web (opcional)<input className="campo" value={d.web || ''} onChange={(e) => poner('web', e.target.value)} placeholder="tuempresa.es" /></label>
            {sociedad && <label>Datos del Registro Mercantil<input className="campo" value={d.registro || ''} onChange={(e) => poner('registro', e.target.value)} placeholder="Registro Mercantil de Madrid, tomo 1234, folio 56, hoja M-78901" /></label>}
            {sociedad && <p className="nota">Las sociedades deben ponerlos en sus facturas y documentos. Salen al pie de cada factura.</p>}
            {!sociedad && <label>Límite de rendimiento neto anual (tarifa plana; SMI 2026: 17094)<input className="campo" type="number" min="0" placeholder="Vacío si no tienes tarifa plana" value={d.limite || ''} onChange={(e) => poner('limite', e.target.value)} /></label>}
            <p className="nota">El email, el teléfono y la web salen en tus facturas, debajo de tu dirección.</p>
          </>
        )}
      </Formulario>}
      {seccion === 'cobros' && <Formulario
        titulo="Cómo te pagan"
        inicial={{ plazo: emisor.plazo ?? 30, recordatorios: emisor.recordatorios || '', bizum: emisor.bizum || '', otroPago: emisor.otroPago || '' }}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ cobros: d }) }); router.refresh(); }}
      >
        {(d, poner) => (
          <>
            <label>Plazo de pago (días)<input className="campo" type="number" min="0" max="365" value={d.plazo} onChange={(e) => poner('plazo', e.target.value)} /></label>
            <p className="nota">Transferencia al IBAN de tus datos de empresa{emisor.iban ? ` (…${String(emisor.iban).replace(/\s/g, '').slice(-4)})` : ''}: sale siempre en la factura.</p>
            <label>Bizum (opcional)<input autoComplete="tel" className="campo" type="tel" inputMode="tel" value={d.bizum} onChange={(e) => poner('bizum', e.target.value)} placeholder="600 000 000" /></label>
            <label>Otra forma de pago (opcional)<input className="campo" value={d.otroPago} onChange={(e) => poner('otroPago', e.target.value)} placeholder="Efectivo, domiciliación, pagaré…" /></label>
            <label>Recordar por email las facturas vencidas cada (días)<input className="campo" type="number" min="0" max="60" placeholder="0 o vacío: no enviar recordatorios" value={d.recordatorios} onChange={(e) => poner('recordatorios', e.target.value)} /></label>
          </>
        )}
      </Formulario>}
      {seccion === 'marca' && <Formulario
        titulo="Textos de la factura"
        inicial={{ pie: emisor.pie || '', notaDefecto: emisor.notaDefecto || '' }}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ diseno: d }) }); router.refresh(); }}
      >
        {(d, poner) => (
          <>
            <label>Nota que llevan las facturas nuevas (se puede cambiar en cada una)<textarea className="campo" rows={3} maxLength={500} value={d.notaDefecto} onChange={(e) => poner('notaDefecto', e.target.value)} placeholder="Gracias por tu confianza." /></label>
            <label>Pie de página (textos legales)<textarea className="campo" rows={4} maxLength={500} value={d.pie} onChange={(e) => poner('pie', e.target.value)} placeholder="Ej.: protección de datos, condiciones de pago o «Operación exenta de IVA según el art. 20 de la Ley 37/1992»." /></label>
            <p className="nota">El pie sale abajo en todas las facturas y presupuestos. Las facturas ya emitidas no cambian.</p>
          </>
        )}
      </Formulario>}
      {seccion === 'perfil' && <Formulario
        titulo="Tu nombre"
        inicial={{ nombre: nombre || '' }}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ perfil: d }) }); router.refresh(); }}
      >
        {(d, poner) => (
          <>
            <input className="campo" value={d.nombre} onChange={(e) => poner('nombre', e.target.value)} maxLength={80} autoComplete="name" required aria-label="Tu nombre" />
            <p className="nota">Es como te ven las demás personas de tu empresa. El nombre de la empresa, en Datos de la empresa.</p>
          </>
        )}
      </Formulario>}
      {seccion === 'drive' && <Formulario
        titulo="Google Drive"
        inicial={{ url: drive?.url || '', token: drive?.token || '' }}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ drive: d }) }); router.refresh(); }}
      >
        {(d, poner) => (
          <>
            <p className="nota">Cada factura y gasto nuevo se guarda en tu Drive: el PDF en su carpeta y una fila en tus libros de Google Sheets.</p>
            <label>URL de la aplicación web de Apps Script<input className="campo" placeholder="https://script.google.com/macros/s/…/exec" value={d.url} onChange={(e) => poner('url', e.target.value)} /></label>
            <label>Clave (la misma que pusiste en el script)<input className="campo" type="password" autoComplete="off" value={d.token} onChange={(e) => poner('token', e.target.value)} /></label>
            {drive?.url && <ProbarDrive error={driveError} />}
          </>
        )}
      </Formulario>}
      {seccion === 'seguridad' && <Formulario
        titulo="Cambiar contraseña"
        inicial={{ actual: '', nueva: '' }}
        enviar={async (d, set) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify(d) }); set({ actual: '', nueva: '' }); }}
      >
        {(d, poner) => (
          <>
            <label>Contraseña actual<input className="campo" type="password" placeholder="Contraseña actual" autoComplete="current-password" value={d.actual} onChange={(e) => poner('actual', e.target.value)} required /></label>
            <label>Nueva contraseña<input className="campo" type="password" placeholder="Nueva (mínimo 8)" autoComplete="new-password" minLength={8} value={d.nueva} onChange={(e) => poner('nueva', e.target.value)} required /></label>
          </>
        )}
      </Formulario>}
    </div>
  );
}
