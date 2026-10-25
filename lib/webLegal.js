import { EMPRESA_LEGAL } from '../data/empresa-legal.js';
import { CONTACTO } from '../components/web/datos.js';

// Identidad legal de la web (data/empresa-legal.js). Sin titular, NIF y domicilio no hay identidad: ni aviso legal ni
// línea en el pie. Nada se inventa ni se completa por su cuenta.

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
export const CAMPOS_REGISTRO = [['nombre', 'Registro'], ['tomo', 'Tomo'], ['folio', 'Folio'], ['hoja', 'Hoja'], ['inscripcion', 'Inscripción']];

export function identidadLegal(e = EMPRESA_LEGAL) {
  const titular = texto(e?.titular), nif = texto(e?.nif), domicilio = texto(e?.domicilio);
  if (!titular || !nif || !domicilio) return null;
  const r = e?.registro && typeof e.registro === 'object' ? Object.fromEntries(CAMPOS_REGISTRO.map(([k]) => [k, texto(e.registro[k])]).filter(([, v]) => v)) : {};
  return { titular, nif, domicilio, email: texto(e?.email) || CONTACTO, registro: Object.keys(r).length ? r : null };
}

// Declaración responsable de Verifactu: los cinco datos son obligatorios (apartados 1.h, 1.i, 1.j y 1.l del modelo de la
// AEAT). Si falta cualquiera, null y la página dice que se está completando. Las variables de entorno FISQUO_* (las
// que ya usa el envío a la AEAT) sirven de respaldo para lo que no esté en el archivo de datos.
export function datosDeclaracion(e = EMPRESA_LEGAL, env = {}) {
  const d = {
    razon: texto(e?.titular) || texto(env.FISQUO_RAZON),
    nif: texto(e?.nif) || texto(env.FISQUO_NIF),
    direccion: texto(e?.domicilio) || texto(env.FISQUO_DIRECCION),
    fecha: texto(e?.declaracion?.fecha) || texto(env.FISQUO_DECLARACION_FECHA),
    lugar: texto(e?.declaracion?.lugar) || texto(env.FISQUO_DECLARACION_LUGAR),
  };
  return Object.values(d).every(Boolean) ? { ...d, email: texto(e?.email) || CONTACTO } : null;
}
