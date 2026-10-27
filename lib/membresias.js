// Varias empresas en la misma cuenta: cada usuario tiene sus empresas con su rol y permisos en cada una
// (u.empresas = { id: { rol, permisos } }). Las cuentas de antes no lo tienen: su única empresa es u.empresa (o su id),
// con u.rol y u.permisos. u.empresa sigue siendo la principal. Solo depende de lib/permisos.js (también sin dependencias).
import { VERSION_PERMISOS } from './permisos.js';

export function membresias(u) {
  if (u?.empresas && Object.keys(u.empresas).length) return u.empresas;
  const id = u?.empresa || u?.id;
  return id ? { [id]: { rol: u?.rol || 'admin', ...(u?.rol && u.rol !== 'admin' ? { permisos: u.permisos || [], ...(u.pv ? { pv: u.pv } : {}) } : {}) } } : {};
}

export const enEmpresa = (u, empresa) => Boolean(empresa && membresias(u)[empresa]);

// La empresa con la que trabaja ahora: la pedida (cookie) si es suya; si no, la principal.
export function activaDe(u, pedida) {
  const m = membresias(u);
  const principal = u?.empresa || u?.id;
  if (pedida && m[pedida]) return pedida;
  return m[principal] ? principal : Object.keys(m)[0];
}

// Añade, cambia (m) o quita (null) su papel en una empresa. Lo de arriba (rol, permisos, empresa) sigue a la principal,
// así lo que aún lee esos campos (avisos del móvil) no cambia.
export function conMembresia(u, empresa, m) {
  const todas = { ...membresias(u) };
  // pv: versión de los permisos (lib/permisos.js): los que se guardan ahora ya la llevan.
  if (m) todas[empresa] = m.rol === 'admin' ? { rol: 'admin' } : { rol: 'miembro', permisos: m.permisos || [], pv: VERSION_PERMISOS };
  else delete todas[empresa];
  const out = { ...u, empresas: todas };
  const principal = u.empresa || u.id;
  out.empresa = todas[principal] ? principal : Object.keys(todas)[0];
  const p = todas[out.empresa];
  if (p) {
    out.rol = p.rol;
    if (p.rol === 'admin') { delete out.permisos; delete out.pv; } else { out.permisos = p.permisos; if (p.pv) out.pv = p.pv; else delete out.pv; }
  }
  return out;
}
