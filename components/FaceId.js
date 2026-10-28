'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MARCA, activarFaceId, faceIdDisponible, nombreDispositivo } from '@/lib/faceid';
import { ESTE, activarNativo, estadoNativo, nombreTipo, quitarDeEsteIphone } from '@/lib/faceidNativo';
import { fechaCorta } from '@/lib/formato';
import { useT } from '@/components/Idioma';

// Ajustes → Face ID: activarlo en este dispositivo y ver en cuáles está. En la web, con llaves de acceso (lib/faceid.js);
// en la app de iOS, con el Face ID nativo del iPhone (lib/faceidNativo.js), como en la app de un banco.
// lista: [{ id, nombre, creada, usada, tipo: 'llave' | 'nativo' }].
export default function FaceId({ lista, bloqueo = false }) {
  const tr = useT();
  const router = useRouter();
  const [disponible, setDisponible] = useState(null);
  // En la app: { disponible, tipo, tiene } del plugin; null en el navegador.
  const [nativo, setNativo] = useState(undefined);
  const [este, setEste] = useState('');
  const [msg, setMsg] = useState('');
  const [bloquear, setBloquear] = useState(bloqueo);

  useEffect(() => {
    estadoNativo().then((e) => {
      setNativo(e);
      if (e) { setDisponible(e.disponible); try { setEste(localStorage.getItem(ESTE) || ''); } catch {} }
      else faceIdDisponible().then(setDisponible);
    });
  }, []);
  const nombre = nativo ? nombreTipo(nativo.tipo) : 'Face ID';
  const activadoAqui = nativo ? nativo.tiene && lista.some((k) => k.id === este) : false;

  async function activar() {
    setMsg('');
    try {
      if (nativo) { const id = await activarNativo(nombreDispositivo()); setEste(id); setNativo({ ...nativo, tiene: true }); }
      else await activarFaceId(nombreDispositivo());
      setMsg(`Listo: la próxima vez entrarás con ${nombre}.`); router.refresh();
    } catch (e) { setMsg(e.name === 'NotAllowedError' ? 'Cancelado.' : e.message); }
  }

  async function cambiarBloqueo(e) {
    const valor = e.target.checked;
    setBloquear(valor);
    const r = await fetch('/api/cuenta', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bloqueoPantalla: valor }) }).catch(() => null);
    if (!r?.ok) { setBloquear(!valor); setMsg('No se ha podido guardar. Inténtalo otra vez.'); }
  }

  async function quitar(k) {
    await fetch(k.tipo === 'nativo' ? `/api/dispositivo?id=${encodeURIComponent(k.id)}` : `/api/passkey?id=${encodeURIComponent(k.id)}`, { method: 'DELETE' });
    if (k.tipo === 'nativo' && k.id === este) { await quitarDeEsteIphone(); setEste(''); setNativo((n) => n && { ...n, tiene: false }); }
    if (k.tipo !== 'nativo' && lista.filter((x) => x.tipo !== 'nativo').length <= 1) localStorage.removeItem(MARCA);
    router.refresh();
  }

  return (
    <section className="tarjeta formulario faceid">
      <h3>{tr(nombre)}</h3>
      <p className="nota">{tr('Con {nombre} entras sin escribir la contraseña. Tu cara nunca sale del dispositivo.', { nombre: tr(nombre) })}</p>
      <label className="check">
        <input type="checkbox" checked={bloquear} onChange={cambiarBloqueo} />
        {tr('Pedir {nombre} o contraseña cada vez que abra Fisquo', { nombre: tr(nombre) })}
      </label>
      {lista.length > 0 && (
        <ul className="dispositivos">
          {lista.map((k) => (
            <li key={`${k.tipo}-${k.id}`}>
              <span className="txt"><strong>{k.nombre}{k.tipo === 'nativo' && k.id === este ? ` ${tr('(este iPhone)')}` : ''}</strong><small>{k.tipo === 'nativo' ? `${tr('App de Fisquo')} · ` : ''}{tr('Activado el {fecha}', { fecha: fechaCorta(k.creada.slice(0, 10)) })}{k.usada ? ` · ${tr('último uso {fecha}', { fecha: fechaCorta(k.usada.slice(0, 10)) })}` : ''}</small></span>
              <button type="button" className="borrar" onClick={() => quitar(k)}>{tr('Quitar')}</button>
            </li>
          ))}
        </ul>
      )}
      {disponible === false && <p className="nota">{tr('Este dispositivo no tiene Face ID ni huella.')}</p>}
      {disponible && !activadoAqui && <button type="button" className="boton" onClick={activar}>{nativo ? tr('Activar {nombre} en este iPhone', { nombre: tr(nombre) }) : tr('Activar en este dispositivo')}</button>}
      {msg && <p className={msg.startsWith('Listo') ? 'nota' : 'error'} role={msg.startsWith('Listo') ? 'status' : 'alert'}>{tr(msg)}</p>}
    </section>
  );
}
