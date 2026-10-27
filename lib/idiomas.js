// La factura en otro idioma y en otra moneda (decisión de la auditoría de octubre de 2026). Las facturas se pueden
// expedir en cualquier lengua (art. 11 del Reglamento de facturación) y en cualquier moneda, siempre que la cuota del IVA
// se exprese también en euros (art. 10) con el tipo de cambio vendedor del Banco de España vigente al devengar (art.
// 79.Once de la Ley del IVA; el Banco de España publica como oficiales los del Banco Central Europeo). Todo lo fiscal se
// guarda en euros (precio, base, IVA): la moneda es la de los importes que ve el cliente (precioDivisa, baseDivisa).
import { eur, eurSin, fechaCorta, pct, pctCorto } from './formato.js';
import { baseLinea, desglose, importes, r2 } from './calculos.js';
import { operacionDe } from './operaciones.js';
import { esSimplificada } from './validacion.js';

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
  es: { factura: 'Factura', rectificativa: 'Factura rectificativa', simplificada: 'Factura simplificada', rectificativaSimplificada: 'Factura rectificativa simplificada', presupuesto: 'Presupuesto', numero: 'Número', nro: 'Nº', fecha: 'Fecha', vencimiento: 'Vencimiento', validoHasta: 'Válido hasta', de: 'De', para: 'Para', nif: 'NIF', concepto: 'Concepto', cant: 'Cant.', precio: 'Precio', dto: 'Dto.', iva: 'IVA', importe: 'Importe', base: 'Base imponible', sobre: 'de', recargo: 'Recargo de equivalencia', retencion: 'Retención IRPF', total: 'Total', notas: 'Notas', rectifica: (n, f) => `Rectifica la factura nº ${n} de fecha ${f}.`, pago: 'Forma de pago', transferencia: 'Transferencia bancaria', continuacion: 'continuación', fechaOperacion: 'Fecha de la operación', lugar: 'Lugar', contravalor: 'Contravalor en euros', cambio: 'Tipo de cambio', fuente: 'BCE', recc: 'Régimen especial del criterio de caja', oss: (p) => `IVA de ${p} aplicado por el régimen de ventanilla única (OSS).`, rebu: 'Régimen especial de los bienes usados', reav: 'Régimen especial de las agencias de viajes', cuotasIncluidas: 'Cuotas de IVA incluidas en el precio', compensacion: 'Compensación REAGP', motivo: 'Motivo', motivos: { devolucion: 'devolución, descuento, anulación o cambio de precio de la operación (art. 80 de la Ley 37/1992)', error: 'modificación de la base imponible o error (art. 80 de la Ley 37/1992)', errorFactura: 'error en la factura rectificada (importe, tipo impositivo u otro dato)', errorDerecho: 'error fundado de derecho', concurso: 'concurso del destinatario (art. 80.Tres de la Ley 37/1992)', incobrable: 'crédito incobrable (art. 80.Cuatro de la Ley 37/1992)', otros: 'otras causas' } },
  en: { factura: 'Invoice', rectificativa: 'Corrective invoice', simplificada: 'Simplified invoice', rectificativaSimplificada: 'Simplified corrective invoice', presupuesto: 'Quote', numero: 'Number', nro: 'No.', fecha: 'Date', vencimiento: 'Due date', validoHasta: 'Valid until', de: 'From', para: 'To', nif: 'Tax ID', concepto: 'Description', cant: 'Qty', precio: 'Price', dto: 'Disc.', iva: 'VAT', importe: 'Amount', base: 'Taxable base', sobre: 'on', recargo: 'Equivalence surcharge', retencion: 'Withholding tax (IRPF)', total: 'Total', notas: 'Notes', rectifica: (n, f) => `Corrects invoice no. ${n} dated ${f}.`, pago: 'Payment method', transferencia: 'Bank transfer', continuacion: 'continued', fechaOperacion: 'Date of supply', lugar: 'Place', contravalor: 'Equivalent in euros', cambio: 'Exchange rate', fuente: 'ECB', recc: 'Régimen especial del criterio de caja (cash accounting scheme)', oss: (p) => `${p} VAT charged under the One-Stop Shop (OSS) scheme.`, rebu: 'Régimen especial de los bienes usados (margin scheme for second-hand goods)', reav: 'Régimen especial de las agencias de viajes (margin scheme for travel agents)', cuotasIncluidas: 'VAT included in the price', compensacion: 'Flat-rate compensation (REAGP)', motivo: 'Reason', motivos: { devolucion: 'return, discount, cancellation or price change (art. 80, Spanish VAT Law 37/1992)', error: 'change in the taxable amount or error (art. 80, Spanish VAT Law 37/1992)', errorFactura: 'error in the corrected invoice (amount, tax rate or other details)', errorDerecho: 'error in law', concurso: 'insolvency proceedings of the customer (art. 80.Three, Spanish VAT Law 37/1992)', incobrable: 'bad debt (art. 80.Four, Spanish VAT Law 37/1992)', otros: 'other reasons' } },
  ca: { factura: 'Factura', rectificativa: 'Factura rectificativa', simplificada: 'Factura simplificada', rectificativaSimplificada: 'Factura rectificativa simplificada', presupuesto: 'Pressupost', numero: 'Número', nro: 'Núm.', fecha: 'Data', vencimiento: 'Venciment', validoHasta: 'Vàlid fins a', de: 'De', para: 'Per a', nif: 'NIF', concepto: 'Concepte', cant: 'Quant.', precio: 'Preu', dto: 'Dte.', iva: 'IVA', importe: 'Import', base: 'Base imposable', sobre: 'de', recargo: "Recàrrec d'equivalència", retencion: 'Retenció IRPF', total: 'Total', notas: 'Notes', rectifica: (n, f) => `Rectifica la factura núm. ${n} de data ${f}.`, pago: 'Forma de pagament', transferencia: 'Transferència bancària', continuacion: 'continuació', fechaOperacion: "Data de l'operació", lugar: 'Lloc', contravalor: 'Contravalor en euros', cambio: 'Tipus de canvi', fuente: 'BCE', recc: 'Règim especial del criteri de caixa', oss: (p) => `IVA de ${p} aplicat pel règim de finestreta única (OSS).`, rebu: 'Règim especial dels béns usats', reav: 'Règim especial de les agències de viatges', cuotasIncluidas: "Quotes d'IVA incloses en el preu", compensacion: 'Compensació REAGP', motivo: 'Motiu', motivos: { devolucion: "devolució, descompte, anul·lació o canvi de preu de l'operació (art. 80 de la Llei 37/1992)", error: 'modificació de la base imposable o error (art. 80 de la Llei 37/1992)', errorFactura: 'error en la factura rectificada (import, tipus impositiu o una altra dada)', errorDerecho: 'error fonamentat en dret', concurso: 'concurs del destinatari (art. 80.Tres de la Llei 37/1992)', incobrable: 'crèdit incobrable (art. 80.Quatre de la Llei 37/1992)', otros: 'altres causes' } },
  fr: { factura: 'Facture', rectificativa: 'Facture rectificative', simplificada: 'Facture simplifiée', rectificativaSimplificada: 'Facture rectificative simplifiée', presupuesto: 'Devis', numero: 'Numéro', nro: 'N°', fecha: 'Date', vencimiento: 'Échéance', validoHasta: "Valable jusqu'au", de: 'De', para: 'À', nif: 'N° fiscal', concepto: 'Désignation', cant: 'Qté', precio: 'Prix', dto: 'Remise', iva: 'TVA', importe: 'Montant', base: 'Base HT', sobre: 'sur', recargo: "Surtaxe d'équivalence", retencion: 'Retenue IRPF', total: 'Total', notas: 'Notes', rectifica: (n, f) => `Rectifie la facture n° ${n} du ${f}.`, pago: 'Mode de paiement', transferencia: 'Virement bancaire', continuacion: 'suite', fechaOperacion: "Date de l'opération", lugar: 'Lieu', contravalor: 'Contre-valeur en euros', cambio: 'Taux de change', fuente: 'BCE', recc: 'Régimen especial del criterio de caja (TVA sur les encaissements)', oss: (p) => `TVA ${p} appliquée selon le régime du guichet unique (OSS).`, rebu: 'Régimen especial de los bienes usados (régime de la marge, biens d’occasion)', reav: 'Régimen especial de las agencias de viajes (régime de la marge, agences de voyages)', cuotasIncluidas: 'TVA incluse dans le prix', compensacion: 'Compensation forfaitaire (REAGP)', motivo: 'Motif', motivos: { devolucion: 'retour, remise, annulation ou modification du prix (art. 80 de la loi espagnole 37/1992)', error: 'modification de la base imposable ou erreur (art. 80 de la loi espagnole 37/1992)', errorFactura: 'erreur dans la facture rectifiée (montant, taux ou autre donnée)', errorDerecho: 'erreur de droit', concurso: 'procédure collective du client (art. 80.3 de la loi espagnole 37/1992)', incobrable: 'créance irrécouvrable (art. 80.4 de la loi espagnole 37/1992)', otros: 'autres motifs' } },
  de: { factura: 'Rechnung', rectificativa: 'Korrekturrechnung', simplificada: 'Vereinfachte Rechnung', rectificativaSimplificada: 'Vereinfachte Korrekturrechnung', presupuesto: 'Angebot', numero: 'Nummer', nro: 'Nr.', fecha: 'Datum', vencimiento: 'Fällig am', validoHasta: 'Gültig bis', de: 'Von', para: 'An', nif: 'Steuer-Nr.', concepto: 'Beschreibung', cant: 'Menge', precio: 'Preis', dto: 'Rabatt', iva: 'MwSt.', importe: 'Betrag', base: 'Nettobetrag', sobre: 'auf', recargo: 'Ausgleichszuschlag', retencion: 'Einbehalt IRPF', total: 'Gesamt', notas: 'Hinweise', rectifica: (n, f) => `Korrigiert die Rechnung Nr. ${n} vom ${f}.`, pago: 'Zahlungsart', transferencia: 'Banküberweisung', continuacion: 'Fortsetzung', fechaOperacion: 'Leistungsdatum', lugar: 'Ort', contravalor: 'Gegenwert in Euro', cambio: 'Wechselkurs', fuente: 'EZB', recc: 'Régimen especial del criterio de caja (Ist-Versteuerung)', oss: (p) => `MwSt. ${p} im Verfahren der einzigen Anlaufstelle (OSS) berechnet.`, rebu: 'Régimen especial de los bienes usados (Differenzbesteuerung)', reav: 'Régimen especial de las agencias de viajes (Margenbesteuerung für Reiseleistungen)', cuotasIncluidas: 'Im Preis enthaltene MwSt.', compensacion: 'Pauschalausgleich (REAGP)', motivo: 'Grund', motivos: { devolucion: 'Rücksendung, Rabatt, Stornierung oder Preisänderung (Art. 80 des spanischen Gesetzes 37/1992)', error: 'Änderung der Bemessungsgrundlage oder Fehler (Art. 80 des spanischen Gesetzes 37/1992)', errorFactura: 'Fehler in der berichtigten Rechnung (Betrag, Steuersatz oder andere Angabe)', errorDerecho: 'Rechtsirrtum', concurso: 'Insolvenzverfahren des Kunden (Art. 80.3 des spanischen Gesetzes 37/1992)', incobrable: 'uneinbringliche Forderung (Art. 80.4 des spanischen Gesetzes 37/1992)', otros: 'sonstige Gründe' } },
  it: { factura: 'Fattura', rectificativa: 'Fattura rettificativa', simplificada: 'Fattura semplificata', rectificativaSimplificada: 'Fattura rettificativa semplificata', presupuesto: 'Preventivo', numero: 'Numero', nro: 'N.', fecha: 'Data', vencimiento: 'Scadenza', validoHasta: 'Valido fino al', de: 'Da', para: 'A', nif: 'Cod. fiscale', concepto: 'Descrizione', cant: 'Q.tà', precio: 'Prezzo', dto: 'Sconto', iva: 'IVA', importe: 'Importo', base: 'Imponibile', sobre: 'su', recargo: 'Sovrapprezzo di equivalenza', retencion: 'Ritenuta IRPF', total: 'Totale', notas: 'Note', rectifica: (n, f) => `Rettifica la fattura n. ${n} del ${f}.`, pago: 'Modalità di pagamento', transferencia: 'Bonifico bancario', continuacion: 'continua', fechaOperacion: "Data dell'operazione", lugar: 'Luogo', contravalor: 'Controvalore in euro', cambio: 'Tasso di cambio', fuente: 'BCE', recc: 'Régimen especial del criterio de caja (IVA per cassa)', oss: (p) => `IVA ${p} applicata con il regime dello sportello unico (OSS).`, rebu: 'Régimen especial de los bienes usados (regime del margine, beni usati)', reav: 'Régimen especial de las agencias de viajes (regime del margine, agenzie di viaggio)', cuotasIncluidas: 'IVA inclusa nel prezzo', compensacion: 'Compensazione forfettaria (REAGP)', motivo: 'Motivo', motivos: { devolucion: 'reso, sconto, annullamento o variazione del prezzo (art. 80 della legge spagnola 37/1992)', error: "variazione dell'imponibile o errore (art. 80 della legge spagnola 37/1992)", errorFactura: 'errore nella fattura rettificata (importo, aliquota o altro dato)', errorDerecho: 'errore di diritto', concurso: 'procedura concorsuale del cliente (art. 80.3 della legge spagnola 37/1992)', incobrable: 'credito inesigibile (art. 80.4 della legge spagnola 37/1992)', otros: 'altri motivi' } },
  pt: { factura: 'Fatura', rectificativa: 'Fatura retificativa', simplificada: 'Fatura simplificada', rectificativaSimplificada: 'Fatura retificativa simplificada', presupuesto: 'Orçamento', numero: 'Número', nro: 'N.º', fecha: 'Data', vencimiento: 'Vencimento', validoHasta: 'Válido até', de: 'De', para: 'Para', nif: 'NIF', concepto: 'Descrição', cant: 'Qtd.', precio: 'Preço', dto: 'Desc.', iva: 'IVA', importe: 'Montante', base: 'Base tributável', sobre: 'sobre', recargo: 'Sobretaxa de equivalência', retencion: 'Retenção IRPF', total: 'Total', notas: 'Notas', rectifica: (n, f) => `Retifica a fatura n.º ${n} de ${f}.`, pago: 'Forma de pagamento', transferencia: 'Transferência bancária', continuacion: 'continuação', fechaOperacion: 'Data da operação', lugar: 'Local', contravalor: 'Contravalor em euros', cambio: 'Taxa de câmbio', fuente: 'BCE', recc: 'Régimen especial del criterio de caja (IVA de caixa)', oss: (p) => `IVA ${p} aplicado no regime do balcão único (OSS).`, rebu: 'Régimen especial de los bienes usados (regime da margem, bens em segunda mão)', reav: 'Régimen especial de las agencias de viajes (regime da margem, agências de viagens)', cuotasIncluidas: 'IVA incluído no preço', compensacion: 'Compensação forfetária (REAGP)', motivo: 'Motivo', motivos: { devolucion: 'devolução, desconto, anulação ou alteração do preço (art. 80 da Lei espanhola 37/1992)', error: 'alteração da base tributável ou erro (art. 80 da Lei espanhola 37/1992)', errorFactura: 'erro na fatura retificada (montante, taxa ou outro dado)', errorDerecho: 'erro de direito', concurso: 'processo de insolvência do cliente (art. 80.3 da Lei espanhola 37/1992)', incobrable: 'crédito incobrável (art. 80.4 da Lei espanhola 37/1992)', otros: 'outros motivos' } },
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
  const t = f.impuesto === 'igic' ? { ...textosFactura(idioma), iva: 'IGIC' } : textosFactura(idioma);
  const comoSiempre = idioma === 'es' && moneda === 'EUR';
  const numero = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const enMoneda = (m) => new Intl.NumberFormat(locale, { style: 'currency', currency: m, currencyDisplay: m === 'EUR' ? 'symbol' : 'code' });
  const fmt = enMoneda(moneda), fmtEur = enMoneda('EUR');
  const espacio = PEGADO.includes(idioma) ? '' : ' ';
  const cifra = (n, max = 2) => new Intl.NumberFormat(locale, { maximumFractionDigits: max }).format(n);
  const fecha = (s) => (idioma === 'es' || !s ? fechaCorta(s || '') : new Date(`${s}T12:00:00Z`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }));
  return {
    idioma, moneda, locale, t, comoSiempre,
    dinero: (v) => (comoSiempre ? eur(v) : fmt.format(v)),
    euros: (v) => (idioma === 'es' ? eur(v) : fmtEur.format(v)),
    cantidad: (v) => (idioma === 'es' ? eurSin(v) : numero.format(v)),
    pct: (v) => (idioma === 'es' ? pct(v) : `${numero.format(v)}${espacio}%`),
    pctCorto: (v) => (idioma === 'es' ? pctCorto(v) : `${cifra(v)}${espacio}%`),
    fecha,
    mayus: (s) => String(s).toLocaleUpperCase(locale),
    // Fecha de la operación (art. 6.1.f del Reglamento de facturación), si no es la de la factura, y el lugar del
    // servicio: «Fecha de la operación: 12/03/2026 · Lugar: Madrid». Se guardan en «evento» (el campo de siempre).
    evento: (x) => [x.evento?.fecha && x.evento.fecha !== x.fecha && `${t.fechaOperacion}: ${fecha(x.evento.fecha)}`, x.evento?.lugar && `${t.lugar}: ${x.evento.lugar}`].filter(Boolean).join(' · '),
    // «1 € = 1,0812 USD (BCE, 21/10/2026)»
    cambio: (d) => `${t.cambio}: 1 € = ${cifra(d.cambio, 6)} ${d.moneda}${d.fecha ? ` (${t.fuente}, ${idioma === 'es' ? fechaCorta(d.fecha) : new Date(`${d.fecha}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' })})` : ''}`,
  };
}

// La factura con los importes de su moneda (lo que ve el cliente) para calcular con las mismas funciones que en euros:
// importes(enDivisa(f)) da base, IVA y total en esa moneda. Sin moneda propia, la misma factura.
// Menciones de la parte sin IVA español, según su operación (lib/operaciones.js): la causa de la exención (art. 6.1.j del
// Reglamento de facturación) o «inversión del sujeto pasivo» cuando el impuesto lo declara el cliente (art. 6.1.m; en la UE,
// art. 226 de la Directiva 2006/112/CE, con su fórmula en cada idioma). Auditoría 23-10-2026 (F1-09).
const MENCIONES_OPERACION = {
  es: { exenta: 'Operación exenta de IVA (art. 20 de la Ley 37/1992).', intracomunitaria: 'Entrega intracomunitaria exenta de IVA (art. 25 de la Ley 37/1992).', exportacion: 'Exportación exenta de IVA (art. 21 de la Ley 37/1992).', 'servicios-ue': 'Inversión del sujeto pasivo.', 'servicios-fuera': 'Operación no sujeta al IVA español (reglas de localización).', isp: 'Inversión del sujeto pasivo (art. 84.Uno.2.º de la Ley 37/1992).' },
  en: { exenta: 'VAT-exempt supply (art. 20, Spanish VAT Law 37/1992).', intracomunitaria: 'Exempt intra-Community supply of goods (art. 138, Directive 2006/112/EC).', exportacion: 'Exempt export (art. 21, Spanish VAT Law 37/1992).', 'servicios-ue': 'Reverse charge.', 'servicios-fuera': 'Not subject to Spanish VAT (place-of-supply rules).', isp: 'Reverse charge (art. 84.One.2, Spanish VAT Law 37/1992).' },
  ca: { exenta: "Operació exempta d'IVA (art. 20 de la Llei 37/1992).", intracomunitaria: "Lliurament intracomunitari exempt d'IVA (art. 25 de la Llei 37/1992).", exportacion: "Exportació exempta d'IVA (art. 21 de la Llei 37/1992).", 'servicios-ue': 'Inversió del subjecte passiu.', 'servicios-fuera': "Operació no subjecta a l'IVA espanyol (regles de localització).", isp: 'Inversió del subjecte passiu (art. 84.U.2n de la Llei 37/1992).' },
  fr: { exenta: 'Opération exonérée de TVA (art. 20 de la loi espagnole 37/1992).', intracomunitaria: 'Livraison intracommunautaire exonérée (art. 138 de la directive 2006/112/CE).', exportacion: 'Exportation exonérée de TVA (art. 21 de la loi espagnole 37/1992).', 'servicios-ue': 'Autoliquidation.', 'servicios-fuera': 'Opération non soumise à la TVA espagnole (règles de territorialité).', isp: 'Autoliquidation (art. 84.1.2 de la loi espagnole 37/1992).' },
  de: { exenta: 'Umsatzsteuerfreie Leistung (Art. 20 des spanischen Gesetzes 37/1992).', intracomunitaria: 'Steuerfreie innergemeinschaftliche Lieferung (Art. 138 MwSt-Richtlinie 2006/112/EG).', exportacion: 'Steuerfreie Ausfuhr (Art. 21 des spanischen Gesetzes 37/1992).', 'servicios-ue': 'Steuerschuldnerschaft des Leistungsempfängers.', 'servicios-fuera': 'Nicht der spanischen Umsatzsteuer unterliegend (Ort der Leistung).', isp: 'Steuerschuldnerschaft des Leistungsempfängers (Art. 84.1.2 des spanischen Gesetzes 37/1992).' },
  it: { exenta: 'Operazione esente IVA (art. 20 della legge spagnola 37/1992).', intracomunitaria: 'Cessione intracomunitaria esente (art. 138 della direttiva 2006/112/CE).', exportacion: 'Esportazione esente IVA (art. 21 della legge spagnola 37/1992).', 'servicios-ue': 'Inversione contabile.', 'servicios-fuera': "Operazione non soggetta all'IVA spagnola (regole di territorialità).", isp: 'Inversione contabile (art. 84.1.2 della legge spagnola 37/1992).' },
  pt: { exenta: 'Operação isenta de IVA (art. 20 da Lei espanhola 37/1992).', intracomunitaria: 'Entrega intracomunitária isenta (art. 138 da Diretiva 2006/112/CE).', exportacion: 'Exportação isenta de IVA (art. 21 da Lei espanhola 37/1992).', 'servicios-ue': 'Autoliquidação.', 'servicios-fuera': 'Operação não sujeita a IVA espanhol (regras de localização).', isp: 'Autoliquidação (art. 84.1.2 da Lei espanhola 37/1992).' },
};

// Menciones que pide la ley según el régimen de la factura: criterio de caja (art. 6.1.p del Reglamento de facturación),
// IVA de otro país de la UE por la ventanilla única y la de su parte sin IVA (arriba). Con IGIC, las suyas no van aquí.
export function menciones(f, L) {
  const op = f.impuesto === 'igic' || f.margen || f.oss?.pais ? 'nacional' : operacionDe(f);
  // Si ya lo escribió a mano en la nota (lo que había que hacer antes), no se repite.
  const yaEnNota = /sujeto pasivo|exent|reverse charge|autoliquida/i.test(f.nota || '');
  const operacion = op !== 'nacional' && !yaEnNota ? (MENCIONES_OPERACION[L.idioma] || MENCIONES_OPERACION.es)[op] : null;
  return [f.margen && L.t[f.margen], f.recc && L.t.recc, f.oss?.pais && L.t.oss(f.oss.pais), operacion].filter(Boolean);
}

// Título del documento (t: sus textos, L.t). Sin ningún NIF del cliente en una venta en España, la factura es simplificada
// (arts. 4 y 7 del Reglamento de facturación; el mismo criterio que la validación, lib/validacion.js esSimplificada), y
// también la rectificativa de una simplificada, que copia su cliente.
export function tituloDoc(f, t, presupuesto = false) {
  if (presupuesto) return t.presupuesto;
  const simplificada = esSimplificada(f);
  if (f.serie === 'R') return simplificada ? t.rectificativaSimplificada : t.rectificativa;
  return simplificada ? t.simplificada : t.factura;
}

// Factura rectificativa (art. 15 del Reglamento de facturación): la factura que rectifica (número y fecha) y la causa de
// la rectificación, según el motivo elegido (lib/verifactu.js TIPOS_RECTIFICATIVA). Sin un motivo concreto («otras
// causas»), la nota de la factura es la causa: va aquí y no se repite en las notas (notaAparte).
const MOTIVOS_CONCRETOS = ['devolucion', 'error', 'errorFactura', 'errorDerecho', 'concurso', 'incobrable'];
const causaEnNota = (f) => Boolean(f.rectifica && !MOTIVOS_CONCRETOS.includes(f.rectifica.motivo) && String(f.nota || '').trim());
export function textoRectifica(f, L) {
  if (!f.rectifica) return '';
  const causa = causaEnNota(f) ? String(f.nota).trim() : L.t.motivos[MOTIVOS_CONCRETOS.includes(f.rectifica.motivo) ? f.rectifica.motivo : 'otros'];
  return `${L.t.rectifica(f.rectifica.numero, L.fecha(f.rectifica.fecha))} ${L.t.motivo}: ${causa}${/[.!?]$/.test(causa) ? '' : '.'}`;
}
export const notaAparte = (f) => (causaEnNota(f) ? '' : f.nota || '');

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
