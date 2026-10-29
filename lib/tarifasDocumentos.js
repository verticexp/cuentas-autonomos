// Céntimos al mes por despacho, sin IVA.
export const TRAMOS = [{ hasta: 25, cent: 3900 }, { hasta: 75, cent: 6900 }, { hasta: Infinity, cent: 9900 }];
export const PRUEBA_DIAS = 30; // Una vez por despacho.
export const PAGINAS_MES = 60; // Páginas de IA por cliente solo documentos.
// Clientes solo documentos gratis, sin suscripción: los GRATIS primeros que dio de alta el despacho. Desde el siguiente
// hace falta la suscripción, y entonces el tramo cuenta a todos (también a estos).
export const GRATIS = 3;

export const tramoDe = (n) => n <= 0 ? 0 : TRAMOS.findIndex((t) => n <= t.hasta);
export const textoTramo = (i) => TRAMOS[i].hasta === Infinity ? 'Sin límite' : `Hasta ${TRAMOS[i].hasta} clientes`;
export const cabe = (i, n) => n <= TRAMOS[i].hasta;
