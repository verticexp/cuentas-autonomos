// La factura en otro idioma y en otra moneda (decisión de la auditoría de octubre de 2026). Las facturas se pueden
// expedir en cualquier lengua (art. 11 del Reglamento de facturación) y en cualquier moneda, siempre que la cuota del IVA
// se exprese también en euros (art. 10) con el tipo de cambio vendedor del Banco de España vigente al devengar (art.
// 79.Once de la Ley del IVA; el Banco de España publica como oficiales los del Banco Central Europeo). Todo lo fiscal se
// guarda en euros (precio, base, IVA): la moneda es la de los importes que ve el cliente (precioDivisa, baseDivisa).
import { eur, eurSin, fechaCorta, pct, pctCorto } from './formato.js';
import { baseLinea, desglose, importes, r2 } from './calculos.js';

export const IDIOMAS_FACTURA = [
  { id: 'es', nombre: 'Español', locale: 'es-ES' },
  { id: 'en', nombre: 'Inglés', locale: 'en-GB' },
  { id: 'ca', nombre: 'Catalán', locale: 'ca-ES' },
  { id: 'fr', nombre: 'Francés', locale: 'fr-FR' },
  { id: 'de', nombre: 'Alemán', locale: 'de-DE' },
  { id: 'it', nombre: 'Italiano', locale: 'it-IT' },
  { id: 'pt', nombre: 'Portugués', locale: 'pt-PT' },
];
export const idiomaValido = (id) => IDIOMAS_FACTURA.some((x) => x.id === id);

// Monedas con tipo de referencia diario del BCE (las que se pueden convertir con un tipo oficial).
export const MONEDAS = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'MXN', 'BRL', 'CNY', 'HKD', 'SGD', 'KRW', 'INR', 'IDR', 'MYR', 'PHP', 'THB', 'ZAR', 'TRY', 'ILS', 'SEK', 'NOK', 'DKK', 'ISK', 'PLN', 'CZK', 'HUF', 'RON'];
export const monedaValida = (m) => MONEDAS.includes(m);

const T = {
  es: { factura: 'Factura', rectificativa: 'Factura rectificativa', presupuesto: 'Presupuesto', numero: 'Número', nro: 'Nº', fecha: 'Fecha', vencimiento: 'Vencimiento', validoHasta: 'Válido hasta', de: 'De', para: 'Para', nif: 'NIF', concepto: 'Concepto', cant: 'Cant.', precio: 'Precio', dto: 'Dto.', iva: 'IVA', importe: 'Importe', base: 'Base imponible', sobre: 'de', recargo: 'Recargo de equivalencia', retencion: 'Retención IRPF', total: 'Total', notas: 'Notas', rectifica: (n, f) => `Rectifica la factura nº ${n} de fecha ${f}.`, pago: 'Forma de pago', transferencia: 'Transferencia bancaria', continuacion: 'continuación', evento: 'Evento', eventoDel: 'del', eventoEn: 'en', contravalor: 'Contravalor en euros', cambio: 'Tipo de cambio', fuente: 'BCE', recc: 'Régimen especial del criterio de caja', oss: (p) => `IVA de ${p} aplicado por el régimen de ventanilla única (OSS).`, rebu: 'Régimen especial de los bienes usados', reav: 'Régimen especial de las agencias de viajes', cuotasIncluidas: 'Cuotas de IVA incluidas en el precio', compensacion: 'Compensación REAGP' },
  en: { factura: 'Invoice', rectificativa: 'Corrective invoice', presupuesto: 'Quote', numero: 'Number', nro: 'No.', fecha: 'Date', vencimiento: 'Due date', validoHasta: 'Valid until', de: 'From', para: 'To', nif: 'Tax ID', concepto: 'Description', cant: 'Qty', precio: 'Price', dto: 'Disc.', iva: 'VAT', importe: 'Amount', base: 'Taxable base', sobre: 'on', recargo: 'Equivalence surcharge', retencion: 'Withholding tax (IRPF)', total: 'Total', notas: 'Notes', rectifica: (n, f) => `Corrects invoice no. ${n} dated ${f}.`, pago: 'Payment method', transferencia: 'Bank transfer', continuacion: 'continued', evento: 'Event', eventoDel: 'on', eventoEn: 'at', contravalor: 'Equivalent in euros', cambio: 'Exchange rate', fuente: 'ECB', recc: 'Régimen especial del criterio de caja (cash accounting scheme)', oss: (p) => `${p} VAT charged under the One-Stop Shop (OSS) scheme.`, rebu: 'Régimen especial de los bienes usados (margin scheme for second-hand goods)', reav: 'Régimen especial de las agencias de viajes (margin scheme for travel agents)', cuotasIncluidas: 'VAT included in the price', compensacion: 'Flat-rate compensation (REAGP)' },
  ca: { factura: 'Factura', rectificativa: 'Factura rectificativa', presupuesto: 'Pressupost', numero: 'Número', nro: 'Núm.', fecha: 'Data', vencimiento: 'Venciment', validoHasta: 'Vàlid fins a', de: 'De', para: 'Per a', nif: 'NIF', concepto: 'Concepte', cant: 'Quant.', precio: 'Preu', dto: 'Dte.', iva: 'IVA', importe: 'Import', base: 'Base imposable', sobre: 'de', recargo: "Recàrrec d'equivalència", retencion: 'Retenció IRPF', total: 'Total', notas: 'Notes', rectifica: (n, f) => `Rectifica la factura núm. ${n} de data ${f}.`, pago: 'Forma de pagament', transferencia: 'Transferència bancària', continuacion: 'continuació', evento: 'Esdeveniment', eventoDel: 'del', eventoEn: 'a', contravalor: 'Contravalor en euros', cambio: 'Tipus de canvi', fuente: 'BCE', recc: 'Règim especial del criteri de caixa', oss: (p) => `IVA de ${p} aplicat pel règim de finestreta única (OSS).`, rebu: 'Règim especial dels béns usats', reav: 'Règim especial de les agències de viatges', cuotasIncluidas: "Quotes d'IVA incloses en el preu", compensacion: 'Compensació REAGP' },
  fr: { factura: 'Facture', rectificativa: 'Facture rectificative', presupuesto: 'Devis', numero: 'Numéro', nro: 'N°', fecha: 'Date', vencimiento: 'Échéance', validoHasta: "Valable jusqu'au", de: 'De', para: 'À', nif: 'N° fiscal', concepto: 'Désignation', cant: 'Qté', precio: 'Prix', dto: 'Remise', iva: 'TVA', importe: 'Montant', base: 'Base HT', sobre: 'sur', recargo: "Surtaxe d'équivalence", retencion: 'Retenue IRPF', total: 'Total', notas: 'Notes', rectifica: (n, f) => `Rectifie la facture n° ${n} du ${f}.`, pago: 'Mode de paiement', transferencia: 'Virement bancaire', continuacion: 'suite', evento: 'Événement', eventoDel: 'du', eventoEn: 'à', contravalor: 'Contre-valeur en euros', cambio: 'Taux de change', fuente: 'BCE', recc: 'Régimen especial del criterio de caja (TVA sur les encaissements)', oss: (p) => `TVA ${p} appliquée selon le régime du guichet unique (OSS).`, rebu: 'Régimen especial de los bienes usados (régime de la marge, biens d’occasion)', reav: 'Régimen especial de las agencias de viajes (régime de la marge, agences de voyages)', cuotasIncluidas: 'TVA incluse dans le prix', compensacion: 'Compensation forfaitaire (REAGP)' },
  de: { factura: 'Rechnung', rectificativa: 'Korrekturrechnung', presupuesto: 'Angebot', numero: 'Nummer', nro: 'Nr.', fecha: 'Datum', vencimiento: 'Fällig am', validoHasta: 'Gültig bis', de: 'Von', para: 'An', nif: 'Steuer-Nr.', concepto: 'Beschreibung', cant: 'Menge', precio: 'Preis', dto: 'Rabatt', iva: 'MwSt.', importe: 'Betrag', base: 'Nettobetrag', sobre: 'auf', recargo: 'Ausgleichszuschlag', retencion: 'Einbehalt IRPF', total: 'Gesamt', notas: 'Hinweise', rectifica: (n, f) => `Korrigiert die Rechnung Nr. ${n} vom ${f}.`, pago: 'Zahlungsart', transferencia: 'Banküberweisung', continuacion: 'Fortsetzung', evento: 'Veranstaltung', eventoDel: 'am', eventoEn: 'in', contravalor: 'Gegenwert in Euro', cambio: 'Wechselkurs', fuente: 'EZB', recc: 'Régimen especial del criterio de caja (Ist-Versteuerung)', oss: (p) => `MwSt. ${p} im Verfahren der einzigen Anlaufstelle (OSS) berechnet.`, rebu: 'Régimen especial de los bienes usados (Differenzbesteuerung)', reav: 'Régimen especial de las agencias de viajes (Margenbesteuerung für Reiseleistungen)', cuotasIncluidas: 'Im Preis enthaltene MwSt.', compensacion: 'Pauschalausgleich (REAGP)' },
  it: { factura: 'Fattura', rectificativa: 'Fattura rettificativa', presupuesto: 'Preventivo', numero: 'Numero', nro: 'N.', fecha: 'Data', vencimiento: 'Scadenza', validoHasta: 'Valido fino al', de: 'Da', para: 'A', nif: 'Cod. fiscale', concepto: 'Descrizione', cant: 'Q.tà', precio: 'Prezzo', dto: 'Sconto', iva: 'IVA', importe: 'Importo', base: 'Imponibile', sobre: 'su', recargo: 'Sovrapprezzo di equivalenza', retencion: 'Ritenuta IRPF', total: 'Totale', notas: 'Note', rectifica: (n, f) => `Rettifica la fattura n. ${n} del ${f}.`, pago: 'Modalità di pagamento', transferencia: 'Bonifico bancario', continuacion: 'continua', evento: 'Evento', eventoDel: 'del', eventoEn: 'a', contravalor: 'Controvalore in euro', cambio: 'Tasso di cambio', fuente: 'BCE', recc: 'Régimen especial del criterio de caja (IVA per cassa)', oss: (p) => `IVA ${p} applicata con il regime dello sportello unico (OSS).`, rebu: 'Régimen especial de los bienes usados (regime del margine, beni usati)', reav: 'Régimen especial de las agencias de viajes (regime del margine, agenzie di viaggio)', cuotasIncluidas: 'IVA inclusa nel prezzo', compensacion: 'Compensazione forfettaria (REAGP)' },
  pt: { factura: 'Fatura', rectificativa: 'Fatura retificativa', presupuesto: 'Orçamento', numero: 'Número', nro: 'N.º', fecha: 'Data', vencimiento: 'Vencimento', validoHasta: 'Válido até', de: 'De', para: 'Para', nif: 'NIF', concepto: 'Descrição', cant: 'Qtd.', precio: 'Preço', dto: 'Desc.', iva: 'IVA', importe: 'Montante', base: 'Base tributável', sobre: 'sobre', recargo: 'Sobretaxa de equivalência', retencion: 'Retenção IRPF', total: 'Total', notas: 'Notas', rectifica: (n, f) => `Retifica a fatura n.º ${n} de ${f}.`, pago: 'Forma de pagamento', transferencia: 'Transferência bancária', continuacion: 'continuação', evento: 'Evento', eventoDel: 'de', eventoEn: 'em', contravalor: 'Contravalor em euros', cambio: 'Taxa de câmbio', fuente: 'BCE', recc: 'Régimen especial del criterio de caja (IVA de caixa)', oss: (p) => `IVA ${p} aplicado no regime do balcão único (OSS).`, rebu: 'Régimen especial de los bienes usados (regime da margem, bens em segunda mão)', reav: 'Régimen especial de las agencias de viajes (regime da margem, agências de viagens)', cuotasIncluidas: 'IVA incluído no preço', compensacion: 'Compensação forfetária (REAGP)' },
};
export const textosFactura = (idioma) => T[idioma] || T.es;

// El % pegado a la cifra en inglés, italiano y portugués; separado con espacio no separable en el resto, como en España.
const PEGADO = ['en', 'it', 'pt'];

// Cómo se escribe cada cosa en el documento: textos, importes en su moneda (y en euros), fechas y porcentajes.
// En español y en euros, exactamente como siempre (eur, pct, fechaCorta): las facturas de antes no cambian.
export function formatoDoc(f = {}) {
  const idioma = idiomaValido(f.idioma) ? f.idioma : 'es';
  const moneda = monedaValida(f.divisa?.moneda) ? f.divisa.moneda : 'EUR';
  const { locale } = IDIOMAS_FACTURA.find((x) => x.id === idioma);
  const t = textosFactura(idioma);
  const comoSiempre = idioma === 'es' && moneda === 'EUR';
  const numero = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const enMoneda = (m) => new Intl.NumberFormat(locale, { style: 'currency', currency: m, currencyDisplay: m === 'EUR' ? 'symbol' : 'code' });
  const fmt = enMoneda(moneda), fmtEur = enMoneda('EUR');
  const espacio = PEGADO.includes(idioma) ? '' : ' ';
  const cifra = (n, max = 2) => new Intl.NumberFormat(locale, { maximumFractionDigits: max }).format(n);
  return {
    idioma, moneda, locale, t, comoSiempre,
    dinero: (v) => (comoSiempre ? eur(v) : fmt.format(v)),
    euros: (v) => (idioma === 'es' ? eur(v) : fmtEur.format(v)),
    cantidad: (v) => (idioma === 'es' ? eurSin(v) : numero.format(v)),
    pct: (v) => (idioma === 'es' ? pct(v) : `${numero.format(v)}${espacio}%`),
    pctCorto: (v) => (idioma === 'es' ? pctCorto(v) : `${cifra(v)}${espacio}%`),
    fecha: (s) => (idioma === 'es' || !s ? fechaCorta(s || '') : new Date(`${s}T12:00:00Z`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })),
    mayus: (s) => String(s).toLocaleUpperCase(locale),
    evento: (x) => (x.evento?.fecha || x.evento?.lugar ? `${t.evento}${x.evento.fecha ? ` ${t.eventoDel} ${idioma === 'es' ? fechaCorta(x.evento.fecha) : new Date(`${x.evento.fecha}T12:00:00Z`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}` : ''}${x.evento.lugar ? ` ${t.eventoEn} ${x.evento.lugar}` : ''}` : ''),
    // «1 € = 1,0812 USD (BCE, 21/10/2026)»
    cambio: (d) => `${t.cambio}: 1 € = ${cifra(d.cambio, 6)} ${d.moneda}${d.fecha ? ` (${t.fuente}, ${idioma === 'es' ? fechaCorta(d.fecha) : new Date(`${d.fecha}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' })})` : ''}`,
  };
}

// La factura con los importes de su moneda (lo que ve el cliente) para calcular con las mismas funciones que en euros:
// importes(enDivisa(f)) da base, IVA y total en esa moneda. Sin moneda propia, la misma factura.
// Menciones que pide la ley según el régimen de la factura: criterio de caja (art. 6.1.o del Reglamento de facturación) e
// IVA de otro país de la UE por la ventanilla única.
export const menciones = (f, L) => [f.margen && L.t[f.margen], f.recc && L.t.recc, f.oss?.pais && L.t.oss(f.oss.pais)].filter(Boolean);

// Filas del resumen de la factura antes del total (base, IVA de cada tipo, recargo, compensación del REAGP y retención),
// ya escritas. En los regímenes de margen el IVA va dentro del precio y no se desglosa; si lo pide una empresa, en el de
// las agencias de viajes se indican las «cuotas de IVA incluidas en el precio»: el 6 % del total (art. 142 de la Ley).
export function filasTotales(f, L, t = importes(f)) {
  const irpf = f.irpfPct > 0 ? [[`${L.t.retencion} ${L.pct(f.irpfPct)}`, L.dinero(t.irpf ? -t.irpf : 0)]] : [];
  if (f.margen) return [...(f.cuotasIncluidas ? [[L.t.cuotasIncluidas, L.dinero(Math.round(t.total * 6) / 100)]] : []), ...irpf];
  const ds = desglose(f);
  const ivas = t.compensacion ? [] : ds.flatMap((d) => [[`${L.t.iva} ${L.pct(d.pct)}${ds.length > 1 ? ` ${L.t.sobre} ${L.dinero(d.base)}` : ''}`, L.dinero(d.iva)], ...(d.re ? [[`${L.t.recargo} ${L.pct(d.re)}`, L.dinero(d.recargo)]] : [])]);
  return [[L.t.base, L.dinero(t.base)], ...ivas, ...(t.compensacion ? [[`${L.t.compensacion} ${L.pctCorto(f.compensacion)}`, L.dinero(t.compensacion)]] : []), ...irpf];
}

export function enDivisa(f) {
  if (!f?.divisa || !monedaValida(f.divisa.moneda) || f.divisa.moneda === 'EUR') return f;
  if (f.lineas?.length) {
    const lineas = f.lineas.map((l) => ({ ...l, precio: l.precioDivisa ?? l.precio }));
    return { ...f, lineas, base: r2(lineas.reduce((s, l) => s + baseLinea(l), 0)) };
  }
  return { ...f, ...(f.baseDivisa !== undefined ? { base: f.baseDivisa } : {}) };
}

// Precio en euros de un precio en otra moneda: con seis decimales, para que la base en euros de muchas unidades no
// se aleje por redondear cada precio a céntimos (la base de cada línea sí va a céntimos, en lib/calculos.js).
export const aEuros = (v, cambio) => Math.round((Number(v) / Number(cambio)) * 1e6) / 1e6;
