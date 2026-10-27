'use client';

import { useId, useState } from 'react';
import { CATEGORIAS } from '@/lib/categorias';
import { ACCIONES, SIGNOS, limpiarRegla, permisosDeRegla } from '@/lib/reglasBanco';
import { useT } from '@/components/Idioma';

const VACIA = { contiene: '', signo: 'cargo', accion: 'gasto', proveedor: '', categoria: '', min: '', max: '' };
const dinero = (n) => String(n ?? '').replace('.', ',');

// Quién puede con una regla: los permisos de lo que cubre (lib/reglasBanco.js permisosDeRegla).
export const puedeConRegla = (r, permisos) => permisosDeRegla(r).every((p) => permisos[p]);

// Crear o editar una regla. inicial: los valores de partida (o los de la regla que se edita, con su id). contar: cuántos
// movimientos por revisar encajarían con ella ahora. importeMov: el del movimiento desde el que se crea, para «Solo este importe».
export function FormRegla({ inicial, id, permisos, importeMov, contar, guardar, cancelar }) {
  const tr = useT();
  const uid = useId();
  const [v, setV] = useState({ ...VACIA, ...inicial, min: dinero(inicial?.min), max: dinero(inicial?.max) });
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k, x) => { setV((a) => ({ ...a, [k]: x })); setAviso(''); };
  // Solo lo que esta persona podría hacer a mano: cargos con «gastar», abonos con «facturar».
  const acciones = Object.keys(ACCIONES).filter((a) => a !== 'gasto' || permisos.gastar);
  const signos = Object.keys(SIGNOS).filter((s) => (s === 'cargo' ? permisos.gastar : s === 'abono' ? permisos.facturar : permisos.gastar && permisos.facturar));
  const accion = acciones.includes(v.accion) ? v.accion : acciones[0];
  const signo = accion === 'gasto' ? 'cargo' : signos.includes(v.signo) ? v.signo : signos[0];
  const { regla, error } = limpiarRegla({ ...v, accion, signo });
  const n = regla && contar ? contar(regla) : null;
  const enviar = async (e) => {
    e.preventDefault();
    if (error) { setAviso(error); return; }
    setEnviando(true);
    try { await guardar(regla, id); } catch (err) { setAviso(err.message); } finally { setEnviando(false); }
  };
  return (
    <form className="bco-form-regla" onSubmit={enviar} noValidate>
      <label>{tr('Si el concepto contiene')}
        <input className="campo" value={v.contiene} maxLength={80} placeholder={tr('Por ejemplo: Iberdrola')} onChange={(e) => poner('contiene', e.target.value)} />
      </label>
      <p className="bco-nota">{tr('Escribe una o varias palabras: el movimiento tiene que llevarlas todas, sin importar mayúsculas ni tildes.')}</p>
      <div className="bco-form-importes">
        <label>{tr('Importe desde (€)')}
          <input className="campo" inputMode="decimal" placeholder={tr('Cualquiera')} value={v.min} onChange={(e) => poner('min', e.target.value.replace(/[^\d.,\s]/g, ''))} />
        </label>
        <label>{tr('hasta (€)')}
          <input className="campo" inputMode="decimal" placeholder={tr('Cualquiera')} value={v.max} onChange={(e) => poner('max', e.target.value.replace(/[^\d.,\s]/g, ''))} />
        </label>
      </div>
      {importeMov > 0 && <button type="button" className="bco-deshacer" onClick={() => { const t = dinero(importeMov.toFixed(2)); setV((a) => ({ ...a, min: t, max: t })); }}>{tr('Solo este importe ({importe} €)', { importe: dinero(importeMov.toFixed(2)) })}</button>}
      <label>{tr('Entonces')}
        <select className="campo" value={accion} onChange={(e) => poner('accion', e.target.value)}>
          {acciones.map((a) => <option key={a} value={a}>{tr(ACCIONES[a])}</option>)}
        </select>
      </label>
      {accion === 'ignorar' && signos.length > 1 && (
        <div role="group" aria-labelledby={`${uid}-signo`}>
          <span id={`${uid}-signo`} className="bco-form-t">{tr('Para')}</span>
          <div className="segmentado bco-tipo">
            {signos.map((s) => <button key={s} type="button" aria-pressed={signo === s} className={signo === s ? 'activo' : ''} onClick={() => poner('signo', s)}>{tr(SIGNOS[s])}</button>)}
          </div>
        </div>
      )}
      {accion === 'gasto' && (
        <>
          <label>{tr('Proveedor')}
            <input className="campo" value={v.proveedor} maxLength={80} placeholder={tr('Como lo tienes en tus gastos')} onChange={(e) => poner('proveedor', e.target.value)} />
          </label>
          <label>{tr('Categoría')}
            <select className="campo" value={v.categoria} onChange={(e) => poner('categoria', e.target.value)}>
              <option value="">{tr('La que ya tenga el gasto')}</option>
              {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{tr(c.nombre)}</option>)}
            </select>
          </label>
          <p className="bco-nota">{tr('Fisquo busca entre tus gastos uno de ese proveedor con el mismo importe y lo empareja si es claro. Si no hay ninguno, el movimiento sigue por revisar. La categoría solo se pone a un gasto que no tenga una.')}</p>
        </>
      )}
      {aviso && <p className="rojo bco-nota" role="alert">{tr(aviso)}</p>}
      {!aviso && n !== null && <p className="bco-nota" role="status">{n ? tr(n === 1 ? 'Ahora encaja con {n} movimiento por revisar.' : 'Ahora encaja con {n} movimientos por revisar.', { n }) : tr('Ahora no encaja con ningún movimiento por revisar.')}</p>}
      <div className="bco-botones">
        <button type="submit" className="boton pequeno" disabled={enviando}>{tr(id ? 'Guardar cambios' : 'Guardar regla')}</button>
        <button type="button" className="boton pequeno sec" onClick={cancelar}>{tr('Cancelar')}</button>
      </div>
    </form>
  );
}

// Reglas de la empresa: lista, y crear, editar o borrar. Cada regla se ve con su frase («Si un cargo contiene… → es un gasto de…»).
export default function BancoReglas({ reglas, permisos, contar, guardar, quitar }) {
  const tr = useT();
  const [nueva, setNueva] = useState(false);
  const [editando, setEditando] = useState(null);
  const gestiona = permisos.gastar || permisos.facturar;
  if (!reglas.length && !gestiona) return null;
  return (
    <details className="grupo bco-ignorados bco-reglas" id="banco-reglas">
      <summary className="grupo-t">{tr('Reglas automáticas')} <span>{reglas.length}</span></summary>
      <p className="bco-nota">{tr('Una regla dice qué hacer con los movimientos que llevan cierto texto: apuntarlos como gasto de un proveedor o ignorarlos (traspasos entre tus cuentas, comisiones que ya has apuntado). Se aplican al subir un extracto o actualizar el banco, y nunca tocan lo que ya está emparejado o ignorado. Si dos reglas encajan, gana la más concreta.')}</p>
      {reglas.length > 0 && (
        <ul className="bco-lista">
          {reglas.map((r) => (
            <li key={r.id} className={`bco-mov hecho bco-regla${editando === r.id ? ' editando' : ''}`}>
              {editando === r.id
                ? <FormRegla inicial={r} id={r.id} permisos={permisos} contar={contar} guardar={async (x, id) => { await guardar(x, id); setEditando(null); }} cancelar={() => setEditando(null)} />
                : (
                  <>
                    <span className="bco-txt"><strong>{r.cuando}</strong><small>→ {r.entonces}{r.usos ? ` · ${tr(r.usos === 1 ? '{n} movimiento' : '{n} movimientos', { n: r.usos })}` : ''}</small></span>
                    {puedeConRegla(r, permisos) && (
                      <span className="bco-regla-botones">
                        <button className="bco-deshacer" onClick={() => { setNueva(false); setEditando(r.id); }} aria-label={tr('Editar la regla: {regla}', { regla: r.cuando })}>{tr('Editar')}</button>
                        <button className="bco-deshacer" onClick={() => quitar(r)} aria-label={tr('Borrar la regla: {regla}', { regla: r.cuando })}>{tr('Borrar')}</button>
                      </span>
                    )}
                  </>
                )}
            </li>
          ))}
        </ul>
      )}
      {gestiona && (nueva
        ? <FormRegla permisos={permisos} contar={contar} guardar={async (x) => { await guardar(x); setNueva(false); }} cancelar={() => setNueva(false)} />
        : <div className="bco-botones"><button className="boton pequeno" onClick={() => { setEditando(null); setNueva(true); }}>{tr('Nueva regla')}</button></div>)}
    </details>
  );
}
