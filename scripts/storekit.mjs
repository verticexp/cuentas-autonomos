// Productos de la suscripción para el App Store (lib/compraApple.js): genera mobile/ios/App/App/Fisquo.storekit (StoreKit
// Testing de Xcode, para probar las compras en el simulador sin App Store Connect) e imprime la tabla para dar de alta los
// productos en App Store Connect (mobile/app-store/compras.md).
// Precio en el App Store: el de la web con el 21 % de IVA (Apple cobra con los impuestos incluidos), subido al ,99.
//   node scripts/storekit.mjs            → escribe el .storekit e imprime la tabla
import { writeFileSync } from 'node:fs';
import { PLANES } from '../components/web/datos.js';
import { importe } from '../lib/planes.js';
import { PRODUCTOS } from '../lib/compraApple.js';
import { TIPOS } from '../lib/prueba.js';

export const precioAppStore = (tipo, nombre, periodo) => Math.ceil(importe(tipo, nombre, periodo) * 1.21 / 100) - 0.01;
const ids = Object.keys(PRODUCTOS);
// Nivel dentro del grupo (1 = el más alto): de más caro a más barato en mensual; el anual, con el mismo nivel que su mensual.
const mensuales = ids.filter((id) => PRODUCTOS[id].periodo === 'mes').sort((a, b) => precioAppStore(PRODUCTOS[b].tipo, PRODUCTOS[b].nombre, 'mes') - precioAppStore(PRODUCTOS[a].tipo, PRODUCTOS[a].nombre, 'mes'));
const nivel = (id) => 1 + mensuales.findIndex((m) => PRODUCTOS[m].tipo === PRODUCTOS[id].tipo && PRODUCTOS[m].nombre === PRODUCTOS[id].nombre);
const para = (tipo, nombre) => PLANES[tipo].find((p) => p.n === nombre).para;
const GRUPO = '21590001';

const suscripciones = ids.map((id, i) => {
  const { tipo, nombre, periodo } = PRODUCTOS[id];
  return {
    adHocOffers: [], codeOffers: [], displayPrice: precioAppStore(tipo, nombre, periodo).toFixed(2), familyShareable: false,
    groupNumber: nivel(id), internalID: String(6590000001 + i), introductoryOffer: null,
    localizations: [
      { description: para(tipo, nombre), displayName: `${TIPOS[tipo]} ${nombre}`, locale: 'es_ES' },
      { description: para(tipo, nombre), displayName: `${tipo === 'aut' ? 'Freelancer' : 'SME'} ${nombre}`, locale: 'en_US' },
    ],
    productID: id, recurringSubscriptionPeriod: periodo === 'anio' ? 'P1Y' : 'P1M',
    referenceName: `${TIPOS[tipo]} ${nombre} ${periodo === 'anio' ? 'anual' : 'mensual'}`, subscriptionGroupID: GRUPO, type: 'RecurringSubscription', winbackOffers: [],
  };
});

const storekit = {
  appPolicies: { eula: '', policies: [{ locale: 'es_ES', policyText: '', policyURL: 'https://www.fisquo.com/privacidad' }] },
  identifier: 'F15C0001',
  nonRenewingSubscriptions: [], products: [],
  settings: { _developerTeamID: 'M8D85NH9U7', _failTransactionsEnabled: false, _locale: 'es_ES', _storefront: 'ESP', _storeKitErrors: [] },
  subscriptionGroups: [{ id: GRUPO, localizations: [{ customAppName: 'Fisquo', displayName: 'Fisquo', locale: 'es_ES' }], name: 'Fisquo', subscriptions: suscripciones }],
  version: { major: 4, minor: 0 },
};
writeFileSync(new URL('../mobile/ios/App/App/Fisquo.storekit', import.meta.url), `${JSON.stringify(storekit, null, 2)}\n`);

console.log('| ID del producto | Nombre de referencia | Duración | Nivel | Precio (España, IVA incl.) | Web (sin IVA) |');
console.log('|---|---|---|---|---|---|');
for (const s of suscripciones) {
  const { tipo, nombre, periodo } = PRODUCTOS[s.productID];
  console.log(`| \`${s.productID}\` | ${s.referenceName} | ${periodo === 'anio' ? '1 año' : '1 mes'} | ${s.groupNumber} | ${s.displayPrice.replace('.', ',')} € | ${(importe(tipo, nombre, periodo) / 100).toFixed(2).replace('.', ',')} € |`);
}
