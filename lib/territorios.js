// Dónde presenta sus impuestos la empresa (fiscal.territorio en lib/empresa.js). En territorio común, todo va a la
// Agencia Tributaria. En Canarias, el IGIC va a la Agencia Tributaria Canaria (lib/igic.js) y el IRPF y Sociedades a la
// AEAT. Navarra, Álava, Bizkaia y Gipuzkoa tienen Hacienda propia (Convenio y Concierto Económico): el IVA, el IRPF, las
// retenciones y Sociedades se presentan allí, con sus modelos, sus casillas y sus plazos. El IVA se calcula igual (mismos
// tipos y reglas); lo que cambia es dónde, con qué modelo y hasta cuándo. Sin dependencias, para el servidor y el navegador.

export const TERRITORIOS = {
  comun: { nombre: 'Territorio común', hacienda: 'Agencia Tributaria', sede: 'https://sede.agenciatributaria.gob.es' },
  canarias: { nombre: 'Canarias', hacienda: 'Agencia Tributaria Canaria', sede: 'https://sede.gobiernodecanarias.org/tributos/' },
  navarra: { nombre: 'Navarra', hacienda: 'Hacienda Foral de Navarra', sede: 'https://www.navarra.es/es/hacienda', foral: true },
  alava: { nombre: 'Álava', hacienda: 'Hacienda Foral de Álava', sede: 'https://web.araba.eus/es/hacienda', foral: true, ticketbai: true },
  bizkaia: { nombre: 'Bizkaia', hacienda: 'Hacienda Foral de Bizkaia', sede: 'https://www.bizkaia.eus/es/hacienda', foral: true, ticketbai: true },
  gipuzkoa: { nombre: 'Gipuzkoa', hacienda: 'Hacienda Foral de Gipuzkoa', sede: 'https://www.gipuzkoa.eus/es/web/ogasuna', foral: true, ticketbai: true },
};
// Para el cuestionario, en este orden.
export const OPCIONES_TERRITORIO = [
  ['comun', 'Agencia Tributaria (resto de España)'],
  ['canarias', 'Canarias (IGIC)'],
  ['navarra', 'Navarra (Hacienda Foral)'],
  ['alava', 'Álava (Hacienda Foral)'],
  ['bizkaia', 'Bizkaia (Hacienda Foral)'],
  ['gipuzkoa', 'Gipuzkoa (Hacienda Foral)'],
];

export const territorioDe = (fiscal) => (TERRITORIOS[fiscal?.territorio] ? fiscal.territorio : 'comun');
export const datosTerritorio = (fiscal) => TERRITORIOS[territorioDe(fiscal)];
// Navarra y el País Vasco: su Hacienda cobra el IVA, el IRPF y Sociedades.
export const esForal = (fiscal) => Boolean(datosTerritorio(fiscal).foral);
// País Vasco: las facturas se emiten con un programa TicketBAI dado de alta en su Hacienda (Batuz en Bizkaia).
export const conTicketBai = (fiscal) => Boolean(datosTerritorio(fiscal).ticketbai);
