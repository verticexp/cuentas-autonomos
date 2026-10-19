'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import '@/app/ticket.css';

export default function CupoEscaneo({ inicial = null }) {
  const [cupo, setCupo] = useState(inicial);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(!inicial);
  const peticion = useRef({ secuencia: 0, abortar: null });
  const cargar = useCallback(async () => {
    peticion.current.abortar?.abort();
    const secuencia = ++peticion.current.secuencia;
    const abortar = new AbortController(); peticion.current.abortar = abortar;
    const limite = setTimeout(() => abortar.abort(), 5000);
    setCargando(true);
    try {
      const r = await fetch('/api/gastos/ticket', { cache: 'no-store', signal: abortar.signal });
      const d = await r.json();
      if (!r.ok || !d?.cupo) throw new Error('No disponible');
      if (peticion.current.secuencia === secuencia) { setCupo(d.cupo); setError(false); }
    } catch { if (peticion.current.secuencia === secuencia) setError(true); }
    finally { clearTimeout(limite); if (peticion.current.secuencia === secuencia) setCargando(false); }
  }, []);
  useEffect(() => {
    if (!inicial) cargar();
    window.addEventListener('netto:escaneos', cargar);
    return () => { peticion.current.secuencia++; peticion.current.abortar?.abort(); window.removeEventListener('netto:escaneos', cargar); };
  }, [cargar, inicial]);
  if (cargando && !cupo) return <p className="nota" role="status">Consultando páginas disponibles…</p>;
  if (error && !cupo) return <p className="nota" role="status">No se pudo consultar el cupo. <button type="button" className="enlace" disabled={cargando} onClick={cargar}>Reintentar</button></p>;
  if (!cupo) return null;
  const renovacion = cupo.renueva ? new Date(`${cupo.renueva}T12:00:00`).toLocaleDateString('es-ES') : '';
  const urgente = cupo.agotado || cupo.porcentaje >= 80;
  return <div className={`ticket-cupo${urgente ? ' ticket-cupo-aviso' : ''}`} role={urgente ? 'status' : undefined}>
    <p>{cupo.prueba ? <><span className="solo-web">{cupo.usadas} de {cupo.limite} páginas de prueba usadas</span><span className="solo-app">{cupo.usadas} de {cupo.limite} páginas usadas</span></> : `${cupo.usadas} de ${cupo.limite} páginas este mes`}</p>
    <progress max={cupo.limite} value={Math.min(cupo.usadas, cupo.limite)} aria-label="Páginas de lectura IA usadas" />
    <small>{cupo.prueba ? <><span className="solo-web">La prueba incluye estas páginas en total. No se renuevan durante la prueba.</span><span className="solo-app">Estas son las páginas disponibles en tu cuenta.</span></> : `Se renueva el ${renovacion}. Las páginas no utilizadas no se acumulan.`} El cupo se comparte por empresa con todo el equipo y la gestoría.</small>
    {urgente && <small>{cupo.agotado ? 'Has agotado las lecturas disponibles. Puedes seguir añadiendo gastos a mano.' : 'Te quedan pocas páginas de lectura IA.'}<span className="solo-web"> <a href="/contacto?plan=Ampliaci%C3%B3n%20de%20escaneos">Solicitar ampliación</a>, sin cargos automáticos. Si eres miembro, consulta al administrador.</span></small>}
    {error && <small>No se pudo actualizar el cupo. <button type="button" className="enlace" disabled={cargando} onClick={cargar}>Reintentar</button></small>}
  </div>;
}
