'use client';

import { useEffect, useMemo, useState } from 'react';
import Ir from '@/components/Ir';
import { buscar } from '@/lib/navegacion';

// Lo que más abre cada persona, contado en este dispositivo (solo para ordenar los atajos; nunca sale del navegador).
const CLAVE = 'netto-mas-usos';
const leerUsos = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; } };
const contar = (href) => { try { const u = leerUsos(); u[href] = (u[href] || 0) + 1; localStorage.setItem(CLAVE, JSON.stringify(u)); } catch { /* sin almacenamiento: sin atajos */ } };
const ATAJOS = 4;

const Icono = ({ e, tono }) => <span className="mas-ico" data-tono={tono}><svg viewBox="0 0 24 24" aria-hidden>{e.icono}</svg></span>;

function Fila({ e, tono }) {
  return (
    <Ir href={e.href} prefetch={false} className="celda ir mas-fila" onClick={() => contar(e.href)}>
      <Icono e={e} tono={tono} />
      <span className="txt">{e.nombre}{e.detalle && <small>{e.detalle}</small>}</span>
      {e.aviso && <span className="mas-aviso" data-tono={e.aviso.tono}>{e.aviso.texto}</span>}
      {e.plan && !e.aviso && <span className="plan-chip" title={`Incluido en el plan ${e.plan}`}>{e.plan}</span>}
    </Ir>
  );
}

// grupos: los de components/secciones.js que esta persona puede ver, con el aviso de cada pantalla si lo hay.
export default function MasLista({ grupos, asistente = true }) {
  const [q, setQ] = useState('');
  const [usos, setUsos] = useState({});
  useEffect(() => { setUsos(leerUsos()); }, []);
  const todas = useMemo(() => grupos.flatMap((g) => g.enlaces.map((e) => ({ ...e, tono: g.tono }))), [grupos]);
  // Atajos: las 4 más abiertas (al menos 2 veces), en cuanto haya 4.
  const atajos = todas.filter((e) => usos[e.href] >= 2).sort((a, b) => usos[b.href] - usos[a.href]).slice(0, ATAJOS);
  const hallados = q.trim() ? buscar(todas, q) : null;

  return (
    <>
      <form className="mas-buscar" role="search" action="/asistente" onSubmit={(ev) => { if (!asistente || !q.trim() || hallados?.length) ev.preventDefault(); }}>
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input type="search" name="pregunta" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder={asistente ? 'Busca o pregunta a Fisquo' : 'Busca una pantalla'} aria-label="Buscar pantallas" autoComplete="off" enterKeyHint="search" maxLength={500} />
      </form>

      {hallados ? (
        <section className="grupo" aria-label="Resultados">
          <div className="grupo-c">
            {hallados.map((e) => <Fila key={e.href} e={e} tono={e.tono} />)}
            {asistente && (
              <Ir href={`/asistente?pregunta=${encodeURIComponent(q.trim())}`} prefetch={false} className="celda ir mas-fila">
                <span className="mas-ico" data-tono="verde"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 5h16v11H9l-5 4zM8 10h8M8 13h5" /></svg></span>
                <span className="txt">Preguntar a Fisquo<small>«{q.trim()}»</small></span>
              </Ir>
            )}
          </div>
          {!hallados.length && !asistente && <p className="grupo-pie">No hay ninguna pantalla con ese nombre.</p>}
        </section>
      ) : (
        <>
          {atajos.length === ATAJOS && (
            <section className="mas-atajos" aria-label="Lo que más usas">
              <h2 className="grupo-t">Lo que más usas</h2>
              <div className="mas-rejilla">
                {atajos.map((e) => (
                  <Ir key={e.href} href={e.href} className="mas-tile" onClick={() => contar(e.href)}>
                    <Icono e={e} tono={e.tono} />
                    <span className="mas-nombre">{e.nombre}</span>
                  </Ir>
                ))}
              </div>
            </section>
          )}
          {grupos.map((g) => (
            <section key={g.titulo} className="grupo" aria-label={g.titulo}>
              <h2 className="grupo-t">{g.titulo}</h2>
              <div className="grupo-c">{g.enlaces.map((e) => <Fila key={e.href} e={e} tono={g.tono} />)}</div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
