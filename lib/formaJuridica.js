import { validarNif } from './validacion.js';

// Una sociedad no puede usar un plan de autónomo (lib/planes.js): el NIF, el nombre y la forma (fiscal.tipo) tienen que
// cuadrar con el tipo de plan. Lo comprueban el registro (lib/prueba.js), los datos de facturación y el cuestionario
// (app/api/cuenta). Solo se frena lo que cambia: una cuenta antigua que ya no cuadre puede seguir editando lo demás.

export const normalizarNif = (nif) => String(nif || '').toUpperCase().replace(/[\s.-]/g, '').replace(/^ES/, '');
export const nifDePersona = (nif) => /^[0-9XYZKLM]/.test(normalizarNif(nif));
export const nifDeSociedad = (nif) => /^[ABCDEFGHJNPQRSUVW]/.test(normalizarNif(nif));

// «Netto, S.L.», «Acme SAU», «Talleres S.Coop.», «X Sociedad Limitada»… al final del nombre, como palabra suelta.
const FORMA = /(?:^|[\s,(])(?:s\.?\s?l\.?(?:\s?(?:l|u|n\.?\s?e)\.?)?|s\.?\s?a\.?(?:\s?u\.?)?|s\.?\s?coop\.?(?:\s?\p{L}+\.?)?|sociedad\s+(?:limitada|an[oó]nima|cooperativa)(?:\s+\p{L}+)?)\)?\s*$/iu;
export const pareceSociedad = (nombre) => FORMA.test(String(nombre || '').trim());

export const MENSAJES = {
  nifSociedad: 'Ese NIF es de una sociedad. Si facturas como sociedad, elige «Sociedad» en Ajustes › Datos de la empresa.',
  nifPersona: 'Para una sociedad, escribe el CIF de la sociedad.',
  nombreSociedad: 'Ese nombre es de una sociedad (S.L., S.A., cooperativa…). Si facturas como sociedad, elige «Sociedad» en Ajustes › Datos de la empresa.',
  planAutonomo: 'Tu plan es de Autónomos. Para pasar a sociedad, cambia antes a un plan de Pymes en Ajustes › Tu plan.',
};

const forma = (t) => (t === 'sociedad' ? 'sociedad' : 'autonomo');
const limpio = (s) => String(s || '').trim().toLowerCase();

// Cambio en los datos de la empresa. antes/despues: { tipo: fiscal.tipo, nif, nombre }; plan: el de la empresa.
// Devuelve { error } o { plan }: el plan que queda. En prueba, el plan pasa al tipo nuevo (autónomo ↔ pyme) con el mismo
// nombre; pagado, una sociedad necesita antes un plan de Pymes, y un autónomo puede quedarse con uno de Pymes.
export function cambioDeForma(plan, antes = {}, despues = {}) {
  const tipo = forma(despues.tipo), nif = normalizarNif(despues.nif);
  const cambiaTipo = tipo !== forma(antes.tipo);
  const cambiaNif = nif !== normalizarNif(antes.nif);
  const cambiaNombre = limpio(despues.nombre) !== limpio(antes.nombre);
  if ((cambiaTipo || cambiaNif) && nif && validarNif(nif).tipo === 'es') {
    if (tipo === 'autonomo' && !nifDePersona(nif)) return { error: MENSAJES.nifSociedad };
    if (tipo === 'sociedad' && !nifDeSociedad(nif)) return { error: MENSAJES.nifPersona };
  }
  if ((cambiaTipo || cambiaNombre) && tipo === 'autonomo' && pareceSociedad(despues.nombre)) return { error: MENSAJES.nombreSociedad };
  if (!cambiaTipo || !plan?.tipo || plan.fundador || !['aut', 'pym'].includes(plan.tipo)) return { plan };
  const nuevo = tipo === 'sociedad' ? 'pym' : 'aut';
  if (plan.tipo === nuevo) return { plan };
  if (plan.pagado) return tipo === 'sociedad' ? { error: MENSAJES.planAutonomo } : { plan };
  return { plan: { ...plan, tipo: nuevo } };
}

// Tipos de plan que puede contratar la empresa según su forma: una sociedad, solo Pymes; un autónomo, los dos.
export const tiposContratables = (fiscalTipo) => (forma(fiscalTipo) === 'sociedad' ? ['pym'] : ['aut', 'pym']);
