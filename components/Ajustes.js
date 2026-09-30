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
      {msg && <p className={msg === 'Guardado' ? 'nota' : 'error'}>{msg}</p>}
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

export default function Ajustes({ emisor, drive, driveError }) {
  const router = useRouter();
  return (
    <div className="tarjetas bloque">
      <Formulario
        titulo="Datos de facturación"
        inicial={{ plazo: 30, ...emisor }}
        enviar={async (d) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify(d) }); router.refresh(); }}
      >
        {(d, poner) => (
          <>
            {CAMPOS.map(([k, n]) => (
              <label key={k}>{n}<input className="campo" value={d[k] || ''} onChange={(e) => poner(k, e.target.value)} required /></label>
            ))}
            <label>Plazo de pago (días)<input className="campo" type="number" min="0" value={d.plazo} onChange={(e) => poner('plazo', e.target.value)} /></label>
            <label>Límite de rendimiento neto anual (tarifa plana; SMI 2026: 17094)<input className="campo" type="number" min="0" placeholder="Vacío si no tienes tarifa plana" value={d.limite || ''} onChange={(e) => poner('limite', e.target.value)} /></label>
          </>
        )}
      </Formulario>
      <Formulario
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
      </Formulario>
      <Formulario
        titulo="Cambiar contraseña"
        inicial={{ actual: '', nueva: '' }}
        enviar={async (d, set) => { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify(d) }); set({ actual: '', nueva: '' }); }}
      >
        {(d, poner) => (
          <>
            <input className="campo" type="password" placeholder="Contraseña actual" autoComplete="current-password" value={d.actual} onChange={(e) => poner('actual', e.target.value)} required />
            <input className="campo" type="password" placeholder="Nueva (mínimo 8)" autoComplete="new-password" minLength={8} value={d.nueva} onChange={(e) => poner('nueva', e.target.value)} required />
          </>
        )}
      </Formulario>
    </div>
  );
}
