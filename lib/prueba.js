import { PLANES } from '../components/web/datos.js';
import { validarNif } from './validacion.js';
import { nifDePersona, nifDeSociedad, normalizarNif, pareceSociedad } from './formaJuridica.js';

// Alta desde la web: cada empresa nueva elige tipo de negocio y plan, y lo prueba gratis PRUEBA_DIAS sin tarjeta.
// En la empresa: plan = { tipo, nombre, periodo: 'mes' | 'anio', hasta: 'AAAA-MM-DD' }.
// Plan Fundador: las empresas de antes del lanzamiento (sin plan) y las que el administrador de Fisquo regala desde
// /admin (plan.fundador). Gratis de por vida: sin prueba, sin límites y sin solo lectura.
export const PRUEBA_DIAS = 30;
export const TIPOS = { aut: 'Autónomo', pym: 'Pyme', gra: 'Business (anterior)' };
export const TIPOS_ALTA = { aut: TIPOS.aut, pym: TIPOS.pym };
export const VERSION_PLAN = 3;
export const PROVINCIAS = ['Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Baleares', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca', 'Jaén', 'La Coruña', 'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza'];
// Provincia por los dos primeros dígitos del código postal (códigos INE), para rellenarla sola en el alta.
const POR_CP = ['Álava', 'Albacete', 'Alicante', 'Almería', 'Ávila', 'Badajoz', 'Baleares', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Castellón', 'Ciudad Real', 'Córdoba', 'La Coruña', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca', 'Jaén', 'León', 'Lleida', 'La Rioja', 'Lugo', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Asturias', 'Palencia', 'Las Palmas', 'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife', 'Cantabria', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza', 'Ceuta', 'Melilla'];
export function provinciaDeCp(cp) {
  const m = /^(\d{2})\d{3}$/.exec(String(cp || '').trim());
  return (m && POR_CP[Number(m[1]) - 1]) || '';
}
const DIA = 86400000;

export const esFundador = (plan) => !plan || Boolean(plan.fundador);

export const planDe = (tipo, nombre) => Array.isArray(PLANES[tipo]) ? PLANES[tipo].find((p) => p.n === nombre) || null : null;

// Plan que se guarda al registrarse; null si el tipo o el plan no existen. Hoy es el día 1.
export function nuevoPlan(tipo, nombre, hoy = new Date(), periodo = 'mes', dias = PRUEBA_DIAS) {
  if (!Object.hasOwn(TIPOS_ALTA, tipo) || !planDe(tipo, nombre)) return null;
  return { tipo, nombre, version: VERSION_PLAN, periodo: periodo === 'anio' ? 'anio' : 'mes', hasta: new Date(hoy.getTime() + (dias - 1) * DIA).toISOString().slice(0, 10) };
}

export const normalizarNifRegistro = normalizarNif;

// Reglas compartidas por el formulario y el servidor; el censo solo se consulta en el servidor.
export function datosFiscalesRegistro(datos) {
  const texto = (campo) => typeof datos[campo] === 'string' ? datos[campo].trim() : '';
  const emisor = Object.fromEntries(['direccion', 'cp', 'ciudad', 'provincia', 'telefono'].map((c) => [c, texto(c)]));
  emisor.nombre = texto('razon');
  emisor.nif = normalizarNifRegistro(texto('nif'));
  const fiscal = validarNif(emisor.nif);
  const fallo = (campo, error) => ({ campo, error });
  if (!emisor.nombre || emisor.nombre.length > 120) return fallo('razon', 'Escribe el nombre fiscal completo (máximo 120 caracteres).');
  if (!fiscal.ok || fiscal.tipo !== 'es') return fallo('nif', 'Escribe un NIF/NIE o CIF español válido, con su carácter de control.');
  if (datos.tipo === 'aut' && !nifDePersona(emisor.nif)) return fallo('nif', 'Para autónomos, escribe un NIF o NIE de persona física. Si eres una sociedad, elige el plan de Pymes.');
  if (datos.tipo !== 'aut' && !nifDeSociedad(emisor.nif)) return fallo('nif', 'Para una sociedad, escribe un CIF de persona jurídica.');
  if (datos.tipo === 'aut' && pareceSociedad(emisor.nombre)) return fallo('razon', 'Ese nombre fiscal es de una sociedad (S.L., S.A., cooperativa…). Para una sociedad, elige el plan de Pymes.');
  if (!emisor.direccion || emisor.direccion.length > 160) return fallo('direccion', 'Escribe la calle y el número de la dirección fiscal (máximo 160 caracteres).');
  if (!/^\d{5}$/.test(emisor.cp)) return fallo('cp', 'El código postal debe tener 5 dígitos.');
  if (!emisor.ciudad || emisor.ciudad.length > 80) return fallo('ciudad', 'Escribe la ciudad de la dirección fiscal (máximo 80 caracteres).');
  if (!PROVINCIAS.includes(emisor.provincia)) return fallo('provincia', 'Elige una provincia de España.');
  if (emisor.telefono.length > 30) return fallo('telefono', 'El teléfono no puede superar los 30 caracteres.');
  return { emisor };
}

// Días de prueba que quedan (el último día cuenta como 1); 0 si ya acabó; null si la empresa no tiene prueba.
export function diasPrueba(plan, hoy = new Date()) {
  if (!plan?.hasta || plan.pagado || plan.fundador) return null;
  const fin = Date.parse(`${plan.hasta}T23:59:59Z`);
  if (!Number.isFinite(fin)) return null;
  return Math.max(0, Math.ceil((fin - hoy.getTime()) / DIA));
}

// Las cuentas nuevas son autónomo o sociedad en el cuestionario: pyme y gran empresa empiezan como sociedad.
export const fiscalDeTipo = (tipo) => (tipo === 'aut' ? 'autonomo' : 'sociedad');
