'use client';

import Vacio from '@/components/Vacio';
import { useEffect, useMemo, useState } from 'react';
import Ir from '@/components/Ir';
import { buscar } from '@/lib/navegacion';

// Lo que más abre cada persona, contado en este dispositivo (solo para ordenar los favoritos; nunca sale del navegador).
const CLAVE = 'fisquo-mas-usos';
const leerUsos = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; } };
const contar = (href) => { try { const u = leerUsos(); u[href] = (u[href] || 0) + 1; localStorage.setItem(CLAVE, JSON.stringify(u)); } catch { /* sin almacenamiento: favoritos por defecto */ } };
const FAVORITOS = 4;
// Los favoritos de quien aún no ha usado nada (los que estén entre sus pantallas, en este orden).
const POR_DEFECTO = ['/banco', '/clientes', '/modelos', '/presupuestos', '/tesoreria', '/facturas/recurrentes', '/contabilidad', '/nominas'];

const Icono = ({ e, tono }) => <span className="mas-ico" data-tono={tono}><svg viewBox="0 0 24 24" aria-hidden>{e.icono}</svg></span>;

// Una línea, como en los Ajustes del iPhone: el nombre y, a la derecha, el aviso en gris (en rojo si apremia).
function Fila({ e, tono }) {
  return (
    <Ir href={e.href} className="celda ir mas-fila" onClick={() => contar(e.href)}>
      <Icono e={e} tono={tono} />
      <span className="txt">{e.nombre}</span>
      {e.aviso && <span className="mas-valor" data-tono={e.aviso.tono}>{e.aviso.texto}</span>}
      {e.plan && !e.aviso && <span className="plan-chip" title={`Incluido en el plan ${e.plan}`}>{e.plan}</span>}
    </Ir>
  );
}

// grupos: los de components/secciones.js que esta persona puede ver, con el aviso de cada pantalla si lo hay.
export default function MasLista({ grupos, asistente = true }) {
  const [q, setQ] = useState('');
  const [usos, setUsos] = useState(null);
  useEffect(() => { setUsos(leerUsos()); }, []);
  const todas = useMemo(() => grupos.flatMap((g) => g.enlaces.map((e) => ({ ...e, tono: g.tono }))), [grupos]);
  // Favoritos: las más abiertas (al menos 2 veces) y, hasta llegar a 4, las de siempre. Hasta leer el dispositivo, las de siempre.
  const favoritos = useMemo(() => {
    const usadas = usos ? todas.filter((e) => usos[e.href] >= 2).sort((a, b) => usos[b.href] - usos[a.href]) : [];
    const resto = [...POR_DEFECTO.map((h) => todas.find((e) => e.href === h)).filter(Boolean), ...todas];
    return [...new Set([...usadas, ...resto])].slice(0, FAVORITOS);
  }, [todas, usos]);
  const hallados = q.trim() ? buscar(todas, q) : null;

  return (
    <>
      <form className="mas-buscar" role="search" action="/asistente" onSubmit={(ev) => { if (!asistente || !q.trim() || hallados?.length) ev.preventDefault(); }}>
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input type="search" name="pregunta" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Buscar" aria-label="Buscar pantallas" autoComplete="off" enterKeyHint="search" maxLength={500} />
      </form>

      {hallados ? (
        <section className="grupo" aria-label="Resultados">
          <div className="grupo-c">
            {hallados.map((e) => <Fila key={e.href} e={e} tono={e.tono} />)}
            {asistente && (
              <Ir href={`/asistente?pregunta=${encodeURIComponent(q.trim())}`} className="celda ir mas-fila">
                <span className="mas-ico" data-tono="verde"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 5h16v11H9l-5 4zM8 10h8M8 13h5" /></svg></span>
                <span className="txt">Preguntar a Fisquo</span>
                <span className="mas-valor">«{q.trim()}»</span>
              </Ir>
            )}
          </div>
          {!hallados.length && !asistente && <Vacio compacto tipo="resultados" titulo="Ninguna pantalla con ese nombre" accion={<button type="button" className="boton sec" onClick={() => setQ('')}>Borrar búsqueda</button>} />}
        </section>
      ) : (
        <>
          {favoritos.length === FAVORITOS && (
            <nav className="mas-favoritos" aria-label="Favoritos">
              {favoritos.map((e) => (
                <Ir key={e.href} href={e.href} className="mas-tile" onClick={() => contar(e.href)}>
                  <Icono e={e} tono={e.tono} />
                  <span className="mas-nombre">{e.nombre}</span>
                  {e.aviso && <span className="mas-punto" data-tono={e.aviso.tono} aria-label={e.aviso.texto} />}
                </Ir>
              ))}
            </nav>
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
