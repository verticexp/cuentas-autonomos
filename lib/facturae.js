// Facturae sin firma y UBL; importación de Facturae, UBL y CII. Sin efectos externos.
import { baseLinea, desglose, importes, nifUE, numeroFactura, r2 } from './calculos.js';
import { NIF_ES } from './verifactuXml.js';

const NS_FE = 'http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const e = (tag, valor, attrs = '') => `<${tag}${attrs}>${esc(valor)}</${tag}>`;
const g = (tag, ...hijos) => `<${tag}>${hijos.filter(Boolean).join('')}</${tag}>`;
const num = (n) => r2(Number(n)).toFixed(2);
const nif = (n) => String(n || '').toUpperCase().replace(/[\s.-]/g, '').replace(/^ES(?=[0-9A-Z]{9}$)/, '');
const iban = (n) => String(n || '').replace(/\s/g, '').toUpperCase();
const declaracion = '<?xml version="1.0" encoding="UTF-8"?>';
const provincias = ['Álava', 'Albacete', 'Alicante', 'Almería', 'Ávila', 'Badajoz', 'Illes Balears', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Castellón', 'Ciudad Real', 'Córdoba', 'A Coruña', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa', 'Huelva', 'Huesca', 'Jaén', 'León', 'Lleida', 'La Rioja', 'Lugo', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Asturias', 'Palencia', 'Las Palmas', 'Pontevedra', 'Salamanca', 'Santa Cruz Tenerife', 'Cantabria', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Bizkaia', 'Zamora', 'Zaragoza', 'Ceuta', 'Melilla'];
const paises = Object.fromEntries(('AT AUT BE BEL BG BGR CY CYP CZ CZE DE DEU DK DNK EE EST ES ESP FI FIN FR FRA GR GRC HR HRV HU HUN IE IRL IT ITA LT LTU LU LUX LV LVA MT MLT NL NLD PL POL PT PRT RO ROU SE SWE SI SVN SK SVK GB GBR US USA CA CAN CH CHE NO NOR IS ISL LI LIE AD AND AU AUS NZ NZL MX MEX AR ARG BR BRA CL CHL CO COL PE PER UY URY CN CHN JP JPN IN IND MA MAR TR TUR UA UKR IL ISR AE ARE ZA ZAF').split(' ').reduce((a, v, i, xs) => i % 2 ? a : [...a, [v, xs[i + 1]]], []));

function domicilio(p = {}) {
  const id = nif(p.nif);
  const esp = !id || NIF_ES.test(id);
  const prefijo = String(p.pais || id.slice(0, 2)).toUpperCase();
  const pais = esp ? 'ES' : ({ EL: 'GR', XI: 'GB' }[prefijo] || prefijo);
  // El modelo no incluye país: un identificador extranjero sin prefijo no permite deducirlo.
  if (!paises[pais]) throw new Error('No se puede deducir el país del NIF; indica pais con su código ISO de dos letras.');
  const cp = /\b\d{5}\b/.exec(`${p.ciudad || ''} ${p.direccion || ''}`)?.[0] || '00000';
  return { id, esp, pais, cp, ciudad: String(p.ciudad || '').replace(/\b\d{5}\b/g, '').trim(), provincia: esp ? provincias[Number(cp.slice(0, 2)) - 1] || '' : '' };
}

function datos(f) {
  const lineas = (f.lineas?.length ? f.lineas : [{ concepto: f.concepto, cantidad: 1, precio: f.base, ivaPct: f.ivaPct }]).map((l) => ({
    concepto: String(l.concepto || f.concepto || 'Servicios'), cantidad: Number(l.cantidad) || 0,
    precio: Number(l.precio) || 0, dto: Number(l.dto) || 0, ivaPct: Number(l.ivaPct ?? f.ivaPct) || 0,
  }));
  // La base guardada puede estar desactualizada: mandan las líneas y el redondeo de la app.
  const base = r2(lineas.reduce((s, l) => s + baseLinea(l), 0));
  const factura = { ...f, base, lineas };
  return { lineas, impuestos: desglose(factura), ...importes(factura) };
}

function fechaVencimiento(f, emisor, explicita) {
  return explicita || f.vencimiento || new Date(Date.parse(`${f.fecha}T12:00:00Z`) + (Number(emisor.plazo) || 0) * 864e5).toISOString().slice(0, 10);
}

function parteFacturae(tag, p = {}, sociedad = false) {
  const d = domicilio(p);
  const juridica = d.esp ? (d.id ? /^[ABCDEFGHJNPQRSUVW]/.test(d.id) : sociedad) : true;
  const direccion = d.esp
    ? g('AddressInSpain', e('Address', p.direccion), e('PostCode', d.cp), e('Town', d.ciudad), e('Province', d.provincia), e('CountryCode', 'ESP'))
    : g('OverseasAddress', e('Address', p.direccion), e('PostCodeAndTown', p.ciudad), e('Province', d.provincia), e('CountryCode', paises[d.pais]));
  const contacto = p.email && g('ContactDetails', e('ElectronicMail', p.email));
  const palabras = String(p.nombre || '').trim().split(/\s+/);
  // Sin apellidos en origen, el guion señala el dato ausente sin inventar uno.
  const nombre = palabras.length > 2 ? palabras.slice(0, -2).join(' ') : palabras[0];
  const primero = palabras.length > 2 ? palabras.at(-2) : palabras[1] || '-';
  const persona = juridica ? g('LegalEntity', e('CorporateName', p.nombre), direccion, contacto)
    : g('Individual', e('Name', nombre), e('FirstSurname', primero), palabras.length > 2 && e('SecondSurname', palabras.at(-1)), direccion, contacto);
  return g(tag, g('TaxIdentification', e('PersonTypeCode', juridica ? 'J' : 'F'), e('ResidenceTypeCode', d.esp ? 'R' : nifUE(d.id) ? 'U' : 'E'), e('TaxIdentificationNumber', d.id)), persona);
}

const importeFe = (tag, valor) => g(tag, e('TotalAmount', num(valor)));
const impuestoFe = (codigo, pct, base, cuota) => g('Tax', e('TaxTypeCode', codigo), e('TaxRate', num(pct)), importeFe('TaxableBase', base), importeFe('TaxAmount', cuota));

function correctivaFe(f) {
  if (!f.rectifica && f.serie !== 'R') return '';
  const fecha = f.rectifica?.fecha || f.fecha;
  // El modelo sólo conserva la referencia: rectificación de base por diferencias (02).
  return g('Corrective', f.rectifica?.numero != null && e('InvoiceNumber', f.rectifica.numero), e('ReasonCode', '10'), e('ReasonDescription', 'Base imponible'),
    g('TaxPeriod', e('StartDate', fecha), e('EndDate', fecha)), e('CorrectionMethod', '02'), e('CorrectionMethodDescription', 'Rectificación modelo por diferencias'), e('InvoiceIssueDate', fecha));
}

export function facturae(f, emisor, { sociedad = false, vencimiento } = {}) {
  const d = datos(f);
  const numero = numeroFactura(f);
  const correctiva = correctivaFe(f);
  // El XML representa la factura emitida; los cobros posteriores se informan con estadoPago.
  const cabecera = g('FileHeader', e('SchemaVersion', '3.2.2'), e('Modality', 'I'), e('InvoiceIssuerType', 'EM'),
    g('Batch', e('BatchIdentifier', `${nif(emisor.nif)}-${numero}`), e('InvoicesCount', 1), importeFe('TotalInvoicesAmount', d.total), importeFe('TotalOutstandingAmount', d.total), importeFe('TotalExecutableAmount', d.total), e('InvoiceCurrencyCode', 'EUR')));
  // Reparte sólo el céntimo de redondeo entre líneas del mismo tipo de IVA.
  const acumulados = new Map();
  const ultimas = new Map(d.lineas.map((l, i) => [l.ivaPct, i]));
  const items = d.lineas.map((l, i) => {
    const base = baseLinea(l);
    const coste = r2(l.cantidad * l.precio);
    const anterior = acumulados.get(l.ivaPct) || 0;
    const cuota = ultimas.get(l.ivaPct) === i ? r2(d.impuestos.find((t) => t.pct === l.ivaPct).iva - anterior) : r2(base * l.ivaPct / 100);
    acumulados.set(l.ivaPct, r2(anterior + cuota));
    return g('InvoiceLine', e('ItemDescription', l.concepto), e('Quantity', l.cantidad), e('UnitOfMeasure', '01'), e('UnitPriceWithoutTax', l.precio.toFixed(6)), e('TotalCost', num(coste)),
      l.dto && g('DiscountsAndRebates', g('Discount', e('DiscountReason', 'Descuento de línea'), e('DiscountRate', num(l.dto)), e('DiscountAmount', num(coste - base)))),
      e('GrossAmount', num(base)), g('TaxesOutputs', impuestoFe('01', l.ivaPct, base, cuota)));
  });
  const factura = g('Invoice',
    g('InvoiceHeader', e('InvoiceNumber', numero), f.serie && e('InvoiceSeriesCode', f.serie), e('InvoiceDocumentType', 'FC'), e('InvoiceClass', correctiva ? 'OR' : 'OO'), correctiva),
    g('InvoiceIssueData', e('IssueDate', f.fecha), e('InvoiceCurrencyCode', 'EUR'), e('TaxCurrencyCode', 'EUR'), e('LanguageName', 'es')),
    g('TaxesOutputs', ...d.impuestos.map((t) => impuestoFe('01', t.pct, t.base, t.iva))),
    Number(f.irpfPct) > 0 && g('TaxesWithheld', impuestoFe('04', f.irpfPct, d.base, d.irpf)),
    g('InvoiceTotals', e('TotalGrossAmount', num(d.base)), e('TotalGeneralDiscounts', '0.00'), e('TotalGeneralSurcharges', '0.00'), e('TotalGrossAmountBeforeTaxes', num(d.base)),
      e('TotalTaxOutputs', num(d.iva)), e('TotalTaxesWithheld', num(d.irpf)), e('InvoiceTotal', num(d.total)), e('TotalOutstandingAmount', num(d.total)), e('TotalPaymentsOnAccount', '0.00'), e('TotalExecutableAmount', num(d.total))),
    g('Items', ...items), g('PaymentDetails', g('Installment', e('InstallmentDueDate', fechaVencimiento(f, emisor, vencimiento)), e('InstallmentAmount', num(d.total)), e('PaymentMeans', '04'),
      emisor.iban && g('AccountToBeCredited', e('IBAN', iban(emisor.iban))))));
  // FACe/B2G exige firma XAdES; este módulo no firma ni envía documentos.
  return `${declaracion}<fe:Facturae xmlns:fe="${NS_FE}"><!-- Sin firmar: para FACe/B2G hace falta firma XAdES. -->${cabecera}${g('Parties', parteFacturae('SellerParty', emisor, sociedad), parteFacturae('BuyerParty', f.cliente))}${g('Invoices', factura)}</fe:Facturae>`;
}

const c = (tag, valor, attrs = '') => e(`cbc:${tag}`, valor, attrs);
const a = (tag, ...hijos) => g(`cac:${tag}`, ...hijos);
const dinero = (tag, valor) => c(tag, num(valor), ' currencyID="EUR"');
const esquemaIva = () => a('TaxScheme', c('ID', 'VAT'));

function parteUbl(tag, p = {}) {
  const d = domicilio(p);
  const fiscal = d.esp && d.id ? `ES${d.id}` : d.id;
  return a(tag, a('Party', a('PartyName', c('Name', p.nombre)),
    a('PostalAddress', c('StreetName', p.direccion), c('CityName', d.ciudad), c('PostalZone', d.esp ? d.cp : /\b\d{4,6}\b/.exec(p.ciudad || '')?.[0] || ''),
      d.provincia && c('CountrySubentity', d.provincia), a('Country', c('IdentificationCode', d.pais))),
    fiscal && a('PartyTaxScheme', c('CompanyID', fiscal), esquemaIva()), a('PartyLegalEntity', c('RegistrationName', p.nombre), d.id && c('CompanyID', d.id)),
    p.email && a('Contact', c('ElectronicMail', p.email))));
}

function categoriaUbl(pct, cliente, linea = false) {
  const categoria = pct > 0 ? 'S' : nifUE(cliente?.nif) ? 'K' : 'E';
  return a(linea ? 'ClassifiedTaxCategory' : 'TaxCategory', c('ID', categoria), c('Percent', num(pct)),
    !linea && pct === 0 && c('TaxExemptionReason', categoria === 'K' ? 'Entrega intracomunitaria exenta de IVA' : 'Operación exenta de IVA'), esquemaIva());
}

export function ubl(f, emisor, { vencimiento } = {}) {
  const d = datos(f);
  const credito = Boolean(f.rectifica || f.serie === 'R') && d.total < 0;
  const signo = credito ? -1 : 1;
  const raiz = credito ? 'CreditNote' : 'Invoice';
  const vence = fechaVencimiento(f, emisor, vencimiento);
  const cabecera = c('CustomizationID', 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0')
    + c('ProfileID', 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0') + c('ID', numeroFactura(f)) + c('IssueDate', f.fecha)
    + (credito ? '' : c('DueDate', vence)) + c(credito ? 'CreditNoteTypeCode' : 'InvoiceTypeCode', credito ? '381' : '380')
    + (Number(f.irpfPct) > 0 ? c('Note', `Retención IRPF ${Number(f.irpfPct)} %: ${num(signo * d.irpf)} €`) : '') + c('DocumentCurrencyCode', 'EUR');
  const referencia = f.rectifica && a('BillingReference', a('InvoiceDocumentReference', c('ID', f.rectifica.numero), f.rectifica.fecha && c('IssueDate', f.rectifica.fecha)));
  const impuestos = a('TaxTotal', dinero('TaxAmount', signo * d.iva), ...d.impuestos.map((t) => a('TaxSubtotal', dinero('TaxableAmount', signo * t.base), dinero('TaxAmount', signo * t.iva), categoriaUbl(t.pct, f.cliente))));
  // EN 16931 no modela IRPF. Conservamos el neto y una Note, sin fingir anticipos,
  // descuentos ni redondeos: con retención NO cumple BR-CO-16 de Peppol estricto.
  // El modelo tampoco aporta EndpointID ni BuyerReference: deben completarse antes de enviar a Peppol.
  const totales = a('LegalMonetaryTotal', dinero('LineExtensionAmount', signo * d.base), dinero('TaxExclusiveAmount', signo * d.base), dinero('TaxInclusiveAmount', signo * r2(d.base + d.iva)), dinero('PayableAmount', signo * d.total));
  const lineas = d.lineas.map((l, i) => {
    // UBL prohíbe precios negativos: el signo se expresa en la cantidad.
    const cantidad = signo * l.cantidad * (l.precio < 0 ? -1 : 1);
    const coste = r2(cantidad * Math.abs(l.precio));
    const base = signo * baseLinea(l);
    return a(credito ? 'CreditNoteLine' : 'InvoiceLine', c('ID', i + 1), c(credito ? 'CreditedQuantity' : 'InvoicedQuantity', cantidad, ' unitCode="C62"'), dinero('LineExtensionAmount', base),
      l.dto && a('AllowanceCharge', c('ChargeIndicator', 'false'), c('AllowanceChargeReason', 'Descuento de línea'), dinero('Amount', coste - base)),
      a('Item', c('Description', l.concepto), c('Name', l.concepto), categoriaUbl(l.ivaPct, f.cliente, true)), a('Price', c('PriceAmount', Math.abs(l.precio).toFixed(6), ' currencyID="EUR"')));
  });
  return `${declaracion}<${raiz} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${raiz}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">${cabecera}${referencia || ''}${parteUbl('AccountingSupplierParty', emisor)}${parteUbl('AccountingCustomerParty', f.cliente)}${a('PaymentMeans', c('PaymentMeansCode', '58'), credito && c('PaymentDueDate', vence), emisor.iban && a('PayeeFinancialAccount', c('ID', iban(emisor.iban))))}${impuestos}${totales}${lineas.join('')}</${raiz}>`;
}

export function estadoPago(f, hoy) {
  const importe = datos(f).total;
  if (f.cobrada) return { estado: 'pagada', fecha: f.fechaCobro || null, importe };
  // Sin fecha explícita no se puede deducir el plazo del emisor.
  return { estado: f.vencimiento && hoy > f.vencimiento ? 'vencida' : 'pendiente', fecha: f.vencimiento || null, importe };
}

// Parser pequeño por árbol: las búsquedas se limitan a su padre, nunca a una firma ni a otra factura.
const local = (nombre) => nombre.split(':').at(-1);
function decodificar(s) {
  return s.replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);|&/g, (entidad, clave) => {
    if (!clave) throw new Error('Entidad XML no reconocida.');
    if (clave[0] !== '#') return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[clave];
    const codigo = clave[1].toLowerCase() === 'x' ? parseInt(clave.slice(2), 16) : Number(clave.slice(1));
    if (!(codigo === 9 || codigo === 10 || codigo === 13 || codigo >= 32 && codigo <= 0x10ffff && !(codigo >= 0xd800 && codigo <= 0xdfff))) throw new Error('Entidad XML inválida.');
    return String.fromCodePoint(codigo);
  });
}

function parsear(xml) {
  if (typeof xml !== 'string' || !xml.trim() || xml.length > 10e6) throw new Error('XML vacío o demasiado grande.');
  const raiz = { nombre: '', hijos: [], texto: '' };
  const pila = [raiz];
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/[A-Za-z_][\w.:-]*\s*>|<[A-Za-z_][\w.:-]*(?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>|[^<]+/g;
  let fin = 0;
  for (const match of xml.matchAll(tokens)) {
    if (match.index !== fin) throw new Error('XML mal formado o declaración DTD no admitida.');
    const t = match[0];
    fin += t.length;
    const padre = pila.at(-1);
    if (t.startsWith('<!--') || t.startsWith('<?')) continue;
    if (t.startsWith('<![CDATA[')) { padre.texto += t.slice(9, -3); continue; }
    if (t.startsWith('</')) {
      if (pila.length === 1 || padre.etiqueta !== t.slice(2, -1).trim()) throw new Error('Etiquetas XML desbalanceadas.');
      pila.pop();
    } else if (t.startsWith('<')) {
      const etiqueta = /^<([^\s/>]+)/.exec(t)[1];
      const attrs = {};
      for (const m of t.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[local(m[1])] = decodificar(m[2] ?? m[3]);
      const nodo = { etiqueta, nombre: local(etiqueta), attrs, hijos: [], texto: '' };
      padre.hijos.push(nodo);
      if (!t.endsWith('/>')) pila.push(nodo);
      if (pila.length > 128) throw new Error('XML demasiado profundo.');
    } else padre.texto += decodificar(t);
  }
  if (fin !== xml.length || pila.length !== 1 || raiz.hijos.length !== 1 || raiz.texto.trim()) throw new Error('XML mal formado.');
  return raiz.hijos[0];
}

const hijos = (n, nombre) => n?.hijos.filter((h) => h.nombre === nombre) || [];
const ruta = (n, path) => path.split('/').reduce((p, k) => hijos(p, k)[0], n);
const texto = (n, path) => (path ? ruta(n, path) : n)?.texto.trim() || '';
function numero(n, path, defecto = 0) {
  const s = texto(n, path);
  if (!s) return defecto;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) || !Number.isFinite(Number(s))) throw new Error(`Importe inválido: ${path}.`);
  return Number(s);
}
const fechaXml = (s) => /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s.slice(0, 10);

function agrupar(impuestos) {
  const grupos = new Map();
  for (const t of impuestos) {
    const previo = grupos.get(t.pct) || { pct: t.pct, base: 0, cuota: 0 };
    grupos.set(t.pct, { pct: t.pct, base: r2(previo.base + t.base), cuota: r2(previo.cuota + t.cuota) });
  }
  return [...grupos.values()].sort((a, b) => Math.abs(b.base) - Math.abs(a.base));
}

function resultado(datos, signo = 1) {
  if (!datos.numero || !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) || !Number.isFinite(datos.base) || !Number.isFinite(datos.total)) throw new Error('Factura sin número, fecha o totales reconocibles.');
  const importe = (valor) => r2(signo * valor) || 0;
  const impuestos = agrupar(datos.desglose).map((t) => ({ pct: t.pct, base: importe(t.base), cuota: importe(t.cuota) }));
  return { ...datos, concepto: String(datos.lineas[0]?.descripcion || datos.concepto || '').slice(0, 140), base: importe(datos.base),
    ivaPct: impuestos[0]?.pct || 0, desglose: impuestos, irpfPct: datos.irpfPct || 0, irpf: importe(datos.irpf || 0), total: importe(datos.total),
    lineas: datos.lineas.map((l) => ({ ...l, cantidad: signo * l.cantidad || 0 })) };
}

function personaFe(p) {
  const individual = ruta(p, 'Individual');
  return { nombre: texto(p, 'LegalEntity/CorporateName') || ['Name', 'FirstSurname', 'SecondSurname'].map((k) => texto(individual, k)).filter((v) => v && v !== '-').join(' '), nif: nif(texto(p, 'TaxIdentification/TaxIdentificationNumber')) };
}

function leerFe(raiz) {
  const facturas = hijos(ruta(raiz, 'Invoices'), 'Invoice');
  const f = facturas[0];
  const totales = ruta(f, 'InvoiceTotals');
  const retenciones = hijos(ruta(f, 'TaxesWithheld'), 'Tax').filter((t) => texto(t, 'TaxTypeCode') === '04');
  const retencion = retenciones.reduce((s, t) => s + numero(t, 'TaxAmount/TotalAmount'), 0);
  const base = numero(totales, 'TotalGrossAmountBeforeTaxes', NaN);
  const impuestos = hijos(ruta(f, 'TaxesOutputs'), 'Tax').filter((t) => texto(t, 'TaxTypeCode') === '01').map((t) => ({ pct: numero(t, 'TaxRate'), base: numero(t, 'TaxableBase/TotalAmount'), cuota: numero(t, 'TaxAmount/TotalAmount') }));
  const pago = ruta(f, 'PaymentDetails/Installment');
  return resultado({ formato: 'facturae', numero: texto(f, 'InvoiceHeader/InvoiceNumber'), fecha: texto(f, 'InvoiceIssueData/IssueDate'), vencimiento: texto(pago, 'InstallmentDueDate'),
    proveedor: personaFe(ruta(raiz, 'Parties/SellerParty')), cliente: personaFe(ruta(raiz, 'Parties/BuyerParty')), base, desglose: impuestos,
    irpfPct: retenciones.length === 1 ? numero(retenciones[0], 'TaxRate') : base ? r2(retencion / base * 100) : 0, irpf: r2(retencion), total: numero(totales, 'InvoiceTotal', NaN),
    iban: iban(texto(pago, 'AccountToBeCredited/IBAN')), lineas: hijos(ruta(f, 'Items'), 'InvoiceLine').map((l) => ({ descripcion: texto(l, 'ItemDescription'), cantidad: numero(l, 'Quantity'), precio: numero(l, 'UnitPriceWithoutTax') })),
    ...(facturas.length > 1 ? { avisos: [`El lote contiene ${facturas.length} facturas; se ha importado sólo la primera.`] } : {}) });
}

function personaUbl(p) {
  const parte = ruta(p, 'Party');
  const fiscal = hijos(parte, 'PartyTaxScheme').find((t) => texto(t, 'TaxScheme/ID') === 'VAT');
  return { nombre: texto(parte, 'PartyLegalEntity/RegistrationName') || texto(parte, 'PartyName/Name'), nif: nif(texto(fiscal, 'CompanyID') || texto(parte, 'PartyLegalEntity/CompanyID') || texto(parte, 'PartyIdentification/ID')) };
}

function leerUbl(f) {
  const credito = f.nombre === 'CreditNote';
  const monetario = ruta(f, 'LegalMonetaryTotal');
  const lineas = hijos(f, credito ? 'CreditNoteLine' : 'InvoiceLine');
  const impuestos = hijos(f, 'TaxTotal').flatMap((t) => hijos(t, 'TaxSubtotal')).filter((t) => !texto(t, 'TaxCategory/TaxScheme/ID') || texto(t, 'TaxCategory/TaxScheme/ID') === 'VAT')
    .map((t) => ({ pct: numero(t, 'TaxCategory/Percent'), base: numero(t, 'TaxableAmount'), cuota: numero(t, 'TaxAmount') }));
  if (!impuestos.length) {
    const bases = agrupar(lineas.map((l) => ({ pct: numero(l, 'Item/ClassifiedTaxCategory/Percent'), base: numero(l, 'LineExtensionAmount'), cuota: 0 })));
    impuestos.push(...bases.map((t) => ({ ...t, cuota: r2(t.base * t.pct / 100) })));
  }
  const nota = hijos(f, 'Note').map((n) => texto(n)).join('\n');
  const retencion = /Retenci[oó]n IRPF\s+([\d.,]+)\s*%\s*:\s*([+-]?[\d.,]+)\s*€/i.exec(nota);
  const irpf = retencion ? Number(retencion[2].replace(',', '.')) : 0;
  const total = texto(monetario, 'TaxInclusiveAmount') ? numero(monetario, 'TaxInclusiveAmount') - irpf
    : numero(monetario, 'PayableAmount', NaN) + numero(monetario, 'PrepaidAmount') - numero(monetario, 'PayableRoundingAmount');
  return resultado({ formato: 'ubl', numero: texto(f, 'ID'), fecha: texto(f, 'IssueDate'), vencimiento: texto(f, 'DueDate') || texto(f, 'PaymentMeans/PaymentDueDate') || texto(f, 'PaymentTerms/PaymentDueDate'),
    proveedor: personaUbl(ruta(f, 'AccountingSupplierParty')), cliente: personaUbl(ruta(f, 'AccountingCustomerParty')),
    base: numero(monetario, 'TaxExclusiveAmount', NaN), desglose: impuestos, irpfPct: retencion ? Number(retencion[1].replace(',', '.')) : 0, irpf, total,
    iban: iban(texto(f, 'PaymentMeans/PayeeFinancialAccount/ID')), lineas: lineas.map((l) => ({ descripcion: texto(l, 'Item/Description') || texto(l, 'Item/Name'),
      cantidad: numero(l, credito ? 'CreditedQuantity' : 'InvoicedQuantity'), precio: numero(l, 'Price/PriceAmount') / (numero(l, 'Price/BaseQuantity', 1) || 1) })) }, credito ? -1 : 1);
}

function personaCii(p) {
  const registros = hijos(p, 'SpecifiedTaxRegistration');
  const registro = registros.find((r) => ruta(r, 'ID')?.attrs.schemeID === 'VA') || registros[0];
  return { nombre: texto(p, 'Name'), nif: nif(texto(registro, 'ID') || texto(p, 'SpecifiedLegalOrganization/ID')) };
}

function leerCii(f) {
  const documento = ruta(f, 'ExchangedDocument');
  const transaccion = ruta(f, 'SupplyChainTradeTransaction');
  const acuerdo = ruta(transaccion, 'ApplicableHeaderTradeAgreement');
  const liquidacion = ruta(transaccion, 'ApplicableHeaderTradeSettlement');
  const totales = ruta(liquidacion, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  const impuestos = hijos(liquidacion, 'ApplicableTradeTax').filter((t) => texto(t, 'TypeCode') === 'VAT').map((t) => ({ pct: numero(t, 'RateApplicablePercent'), base: numero(t, 'BasisAmount'), cuota: numero(t, 'CalculatedAmount') }));
  return resultado({ formato: 'cii', numero: texto(documento, 'ID'), fecha: fechaXml(texto(documento, 'IssueDateTime/DateTimeString')),
    vencimiento: fechaXml(texto(liquidacion, 'SpecifiedTradePaymentTerms/DueDateDateTime/DateTimeString')),
    proveedor: personaCii(ruta(acuerdo, 'SellerTradeParty')), cliente: personaCii(ruta(acuerdo, 'BuyerTradeParty')),
    base: numero(totales, 'TaxBasisTotalAmount', NaN), desglose: impuestos, irpfPct: 0, irpf: 0, total: numero(totales, 'GrandTotalAmount', NaN),
    iban: iban(texto(liquidacion, 'SpecifiedTradeSettlementPaymentMeans/PayeePartyCreditorFinancialAccount/IBANID')),
    lineas: hijos(transaccion, 'IncludedSupplyChainTradeLineItem').map((l) => {
      const precio = ruta(l, 'SpecifiedLineTradeAgreement/NetPriceProductTradePrice') || ruta(l, 'SpecifiedLineTradeAgreement/GrossPriceProductTradePrice');
      return { descripcion: texto(l, 'SpecifiedTradeProduct/Name') || texto(l, 'SpecifiedTradeProduct/Description'), cantidad: numero(l, 'SpecifiedLineTradeDelivery/BilledQuantity'), precio: numero(precio, 'ChargeAmount') / (numero(precio, 'BasisQuantity', 1) || 1) };
    }) }, texto(documento, 'TypeCode') === '381' ? -1 : 1);
}

export function leerFacturaElectronica(xml) {
  try {
    const raiz = parsear(xml);
    if (raiz.nombre === 'Facturae') return leerFe(raiz);
    if (raiz.nombre === 'Invoice' || raiz.nombre === 'CreditNote') return leerUbl(raiz);
    if (raiz.nombre === 'CrossIndustryInvoice') return leerCii(raiz);
    return { error: 'El XML no es una factura Facturae, UBL o CII reconocible.' };
  } catch (err) {
    return { error: err.message || 'No se ha podido leer la factura electrónica.' };
  }
}
