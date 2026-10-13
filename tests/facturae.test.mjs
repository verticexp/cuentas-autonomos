import test from 'node:test';
import assert from 'node:assert/strict';
import { facturae, ubl, estadoPago, leerFacturaElectronica } from '../lib/facturae.js';
import { importes, numeroFactura, r2 } from '../lib/calculos.js';

const emisor = { nombre: 'Marc Ramírez Delgado', nif: '12345678Z', direccion: 'Calle Mayor 1', ciudad: '28013 Madrid', iban: 'ES91 2100 0418 4502 0005 1332', plazo: 30 };
const cliente = { nombre: 'Diseño & Eventos <SL>', nif: 'B87654321', direccion: 'Carrer Major 10', ciudad: '08001 Barcelona', email: 'info@example.com' };
const f = { id: 'f1', numero: 7, anio: 2026, serie: '', fecha: '2026-10-02', concepto: 'Servicios', base: 250, ivaPct: 21, irpfPct: 15, cliente, cobrada: false,
  lineas: [{ concepto: 'Diseño & web <logo> "A"', cantidad: 2, precio: 100, dto: 10, ivaPct: 21 }, { concepto: 'Material', cantidad: 2, precio: 25, ivaPct: 10 }, { concepto: 'Revisión', cantidad: 1, precio: 20, ivaPct: 21 }] };
const simple = { ...f, lineas: undefined, base: 100, irpfPct: 0 };
const rectificativa = { ...simple, numero: 1, serie: 'R', fecha: '2026-10-03', base: -50, irpfPct: 15, concepto: 'Abono', rectifica: { id: 'f1', numero: '07-2026', fecha: '2026-10-02' } };

// Comprobador independiente: exige un solo elemento raíz y cierres exactamente iguales.
function balanceado(xml) {
  const limpio = xml.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const pila = [];
  let raices = 0;
  let posicion = 0;
  for (const m of limpio.matchAll(/<\/?([\w:.-]+)(?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>/g)) {
    const contenido = limpio.slice(posicion, m.index);
    assert.ok(!contenido.includes('<'), 'No quedan etiquetas sin reconocer');
    if (!pila.length) assert.equal(contenido.trim(), '');
    if (m[0].startsWith('</')) assert.equal(pila.pop(), m[1], 'Cierre de etiqueta');
    else {
      if (!pila.length) raices++;
      if (!m[0].endsWith('/>')) pila.push(m[1]);
    }
    posicion = m.index + m[0].length;
  }
  assert.equal(limpio.slice(posicion).trim(), '');
  assert.equal(pila.length, 0);
  assert.equal(raices, 1);
}

const bloques = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
const valor = (xml, tag) => bloques(xml, tag)[0];
const importe = (xml, tag) => Number(valor(xml, tag));
const sumar = (xs) => r2(xs.reduce((s, x) => s + x, 0));

test('el comprobador detecta XML desbalanceado y raíces múltiples', () => {
  balanceado('<a><b valor="&lt;"/><c>Hola &amp; adiós</c></a>');
  assert.throws(() => balanceado('<a><b></a></b>'));
  assert.throws(() => balanceado('<a/><b/>'));
});

test('Facturae 3.2.2: varias líneas, descuentos, dos IVA e IRPF con totales coherentes', () => {
  const xml = facturae(f, emisor);
  balanceado(xml);
  assert.match(xml, /xmlns:fe="http:\/\/www.facturae.gob.es\/formato\/Versiones\/Facturaev3_2_2.xml"/);
  assert.match(xml, /XAdES/);
  assert.equal(valor(xml, 'SchemaVersion'), '3.2.2');
  assert.equal(valor(xml, 'Modality'), 'I');
  assert.equal(valor(xml, 'InvoiceIssuerType'), 'EM');
  assert.equal(valor(xml, 'InvoicesCount'), '1');
  assert.equal(valor(xml, 'InvoiceNumber'), '07-2026');
  assert.equal(valor(xml, 'InvoiceDocumentType'), 'FC');
  assert.equal(valor(xml, 'InvoiceClass'), 'OO');
  assert.equal(valor(xml, 'InstallmentDueDate'), '2026-11-01');
  assert.equal(valor(xml, 'IBAN'), 'ES9121000418450200051332');
  assert.match(xml, /Diseño &amp; web &lt;logo&gt; &quot;A&quot;/);
  const lineas = bloques(xml, 'InvoiceLine');
  assert.equal(lineas.length, 3);
  assert.equal(valor(lineas[0], 'UnitPriceWithoutTax'), '100.000000');
  assert.equal(importe(lineas[0], 'DiscountAmount'), 20);
  assert.equal(importe(lineas[0], 'TotalCost') - importe(lineas[0], 'DiscountAmount'), importe(lineas[0], 'GrossAmount'));
  assert.equal(sumar(lineas.map((l) => importe(l, 'GrossAmount'))), 250);
  const totales = valor(xml, 'InvoiceTotals');
  assert.equal(importe(totales, 'TotalGrossAmount'), 250);
  assert.equal(importe(totales, 'TotalGrossAmountBeforeTaxes'), 250);
  assert.equal(importe(totales, 'TotalTaxOutputs'), 47);
  assert.equal(importe(totales, 'TotalTaxesWithheld'), 37.5);
  assert.equal(importe(totales, 'InvoiceTotal'), 259.5);
  const outputs = bloques(xml.split('<Items>')[0], 'TaxesOutputs')[0];
  const impuestos = bloques(outputs, 'Tax');
  assert.deepEqual(impuestos.map((t) => [importe(t, 'TaxRate'), importe(valor(t, 'TaxableBase'), 'TotalAmount'), importe(valor(t, 'TaxAmount'), 'TotalAmount')]), [[21, 200, 42], [10, 50, 5]]);
  const retencion = valor(xml, 'TaxesWithheld');
  assert.equal(valor(retencion, 'TaxTypeCode'), '04');
  assert.equal(importe(valor(retencion, 'TaxAmount'), 'TotalAmount'), 37.5);
  const i = importes(f);
  assert.equal(r2(i.base + i.iva - i.irpf), importe(totales, 'InvoiceTotal'));
  for (const tag of ['TotalInvoicesAmount', 'TotalOutstandingAmount', 'TotalExecutableAmount']) assert.equal(importe(valor(valor(xml, 'Batch'), tag), 'TotalAmount'), i.total);
  assert.equal(importe(xml, 'InstallmentAmount'), i.total);
  for (const cantidad of bloques(xml, 'TotalAmount')) assert.match(cantidad, /^-?\d+\.\d{2}$/);
});

test('UBL 2.1: impuestos agrupados y retención informativa sin anticipos ficticios', () => {
  const xml = ubl(f, emisor);
  balanceado(xml);
  assert.match(xml, /xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/);
  assert.equal(valor(xml, 'cbc:CustomizationID'), 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0');
  assert.equal(valor(xml, 'cbc:ProfileID'), 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
  assert.equal(valor(xml, 'cbc:InvoiceTypeCode'), '380');
  assert.equal(valor(xml, 'cbc:DocumentCurrencyCode'), 'EUR');
  assert.equal(valor(xml, 'cbc:DueDate'), '2026-11-01');
  assert.equal(valor(xml, 'cbc:PaymentMeansCode'), '58');
  assert.equal(valor(valor(xml, 'cac:PayeeFinancialAccount'), 'cbc:ID'), 'ES9121000418450200051332');
  assert.match(xml, /Retención IRPF 15 %: 37.50 €/);
  assert.doesNotMatch(xml, /PrepaidAmount|PayableRoundingAmount|WithholdingTaxTotal/);
  // El único AllowanceCharge es el descuento comercial de la línea.
  assert.equal(bloques(xml, 'cac:AllowanceCharge').length, 1);
  const t = valor(xml, 'cac:LegalMonetaryTotal');
  assert.equal(importe(t, 'cbc:LineExtensionAmount'), 250);
  assert.equal(importe(t, 'cbc:TaxExclusiveAmount'), 250);
  assert.equal(importe(t, 'cbc:TaxInclusiveAmount'), 297);
  assert.equal(importe(t, 'cbc:PayableAmount'), 259.5);
  const lineas = bloques(xml, 'cac:InvoiceLine');
  assert.equal(sumar(lineas.map((l) => importe(l, 'cbc:LineExtensionAmount'))), importe(t, 'cbc:TaxExclusiveAmount'));
  for (const l of lineas) assert.equal(r2(importe(l, 'cbc:InvoicedQuantity') * importe(l, 'cbc:PriceAmount') - (importe(valor(l, 'cac:AllowanceCharge') || '', 'cbc:Amount') || 0)), importe(l, 'cbc:LineExtensionAmount'));
  assert.equal(importe(xml, 'cbc:TaxAmount'), 47);
  assert.deepEqual(bloques(xml, 'cac:TaxSubtotal').map((s) => [importe(s, 'cbc:Percent'), importe(s, 'cbc:TaxableAmount'), importe(s, 'cbc:TaxAmount')]), [[21, 200, 42], [10, 50, 5]]);
  assert.match(valor(xml, 'cac:AccountingSupplierParty'), /<cbc:CompanyID>ES12345678Z<\/cbc:CompanyID>/);
  assert.match(valor(xml, 'cac:AccountingCustomerParty'), /<cbc:CompanyID>ESB87654321<\/cbc:CompanyID>/);
});

test('ida y vuelta: número, fecha, identidades, bases, desglose, IRPF, total e IBAN', () => {
  for (const generar of [facturae, ubl]) {
    const leida = leerFacturaElectronica(generar(f, emisor));
    assert.equal(leida.error, undefined);
    assert.equal(leida.formato, generar === facturae ? 'facturae' : 'ubl');
    assert.equal(leida.numero, numeroFactura(f));
    assert.equal(leida.fecha, f.fecha);
    assert.equal(leida.vencimiento, '2026-11-01');
    assert.deepEqual(leida.proveedor, { nombre: emisor.nombre, nif: emisor.nif });
    assert.deepEqual(leida.cliente, { nombre: cliente.nombre, nif: cliente.nif });
    assert.equal(leida.concepto, f.lineas[0].concepto);
    assert.equal(leida.base, 250);
    assert.equal(leida.ivaPct, 21);
    assert.deepEqual(leida.desglose, [{ pct: 21, base: 200, cuota: 42 }, { pct: 10, base: 50, cuota: 5 }]);
    assert.equal(leida.irpfPct, 15);
    assert.equal(leida.irpf, 37.5);
    assert.equal(leida.total, 259.5);
    assert.equal(leida.iban, 'ES9121000418450200051332');
    assert.deepEqual(leida.lineas, f.lineas.map((l) => ({ descripcion: l.concepto, cantidad: l.cantidad, precio: l.precio })));
  }
});

test('rectificativa: Facturae OR negativo y UBL CreditNote 381 positivo', () => {
  const fe = facturae(rectificativa, emisor);
  const ub = ubl(rectificativa, emisor);
  for (const xml of [fe, ub]) balanceado(xml);
  assert.equal(valor(fe, 'InvoiceClass'), 'OR');
  assert.equal(valor(fe, 'InvoiceSeriesCode'), 'R');
  assert.equal(valor(valor(fe, 'Corrective'), 'InvoiceNumber'), '07-2026');
  assert.equal(valor(valor(fe, 'Corrective'), 'InvoiceIssueDate'), '2026-10-02');
  assert.equal(valor(fe, 'CorrectionMethod'), '02');
  assert.equal(importe(fe, 'InvoiceTotal'), -53);
  assert.match(ub, /<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"/);
  assert.equal(valor(ub, 'cbc:CreditNoteTypeCode'), '381');
  assert.doesNotMatch(ub, /cbc:InvoiceTypeCode|cbc:DueDate|cac:InvoiceLine/);
  assert.equal(importe(ub, 'cbc:CreditedQuantity'), 1);
  assert.equal(importe(ub, 'cbc:PriceAmount'), 50);
  assert.equal(importe(ub, 'cbc:PayableAmount'), 53);
  assert.equal(valor(valor(ub, 'cac:BillingReference'), 'cbc:ID'), '07-2026');
  for (const xml of [fe, ub]) {
    const leida = leerFacturaElectronica(xml);
    assert.equal(leida.numero, 'R01-2026');
    assert.equal(leida.base, -50);
    assert.deepEqual(leida.desglose, [{ pct: 21, base: -50, cuota: -10.5 }]);
    assert.equal(leida.irpf, -7.5);
    assert.equal(leida.total, -53);
    assert.equal(leida.vencimiento, '2026-11-02');
    assert.equal(leida.lineas[0].cantidad * leida.lineas[0].precio, -50);
  }
  assert.match(ubl({ ...rectificativa, base: 50 }, emisor), /<cbc:InvoiceTypeCode>380<\/cbc:InvoiceTypeCode>/);
});

test('cliente UE, extranjero y exención doméstica', () => {
  for (const [id, residencia, pais, categoria] of [['FR12345678901', 'U', 'FRA', 'K'], ['EL123456789', 'U', 'GRC', 'K'], ['US123456789', 'E', 'USA', 'E'], ['B87654321', 'R', 'ESP', 'E']]) {
    const factura = { ...simple, ivaPct: 0, cliente: { ...cliente, nif: id, ciudad: '75001 Paris' } };
    const fe = facturae(factura, emisor);
    const ub = ubl(factura, emisor);
    balanceado(fe); balanceado(ub);
    const comprador = valor(fe, 'BuyerParty');
    assert.equal(valor(comprador, 'ResidenceTypeCode'), residencia);
    assert.equal(valor(comprador, 'CountryCode'), pais);
    assert.ok(comprador.includes(residencia === 'R' ? '<AddressInSpain>' : '<OverseasAddress>'));
    const tax = valor(ub, 'cac:TaxCategory');
    assert.equal(valor(tax, 'cbc:ID'), categoria);
    assert.ok(valor(tax, 'cbc:TaxExemptionReason'));
    for (const xml of [fe, ub]) {
      const leida = leerFacturaElectronica(xml);
      assert.equal(leida.cliente.nif, id);
      assert.equal(leida.total, 100);
      assert.deepEqual(leida.desglose, [{ pct: 0, base: 100, cuota: 0 }]);
    }
  }
});

test('identidad, apellidos, CP y provincia; sin CP, sin IBAN y sociedad', () => {
  for (const [id, tipo] of [['ES12345678Z', 'F'], ['X1234567L', 'F'], ['K1234567L', 'F'], ['B12345674', 'J']]) {
    const vendedor = valor(facturae(simple, { ...emisor, nif: id }, { sociedad: true }), 'SellerParty');
    assert.equal(valor(vendedor, 'PersonTypeCode'), tipo);
    assert.equal(valor(vendedor, 'PostCode'), '28013');
    assert.equal(valor(vendedor, 'Town'), 'Madrid');
    assert.equal(valor(vendedor, 'Province'), 'Madrid');
    if (tipo === 'F') {
      assert.equal(valor(vendedor, 'Name'), 'Marc');
      assert.equal(valor(vendedor, 'FirstSurname'), 'Ramírez');
      assert.equal(valor(vendedor, 'SecondSurname'), 'Delgado');
    } else assert.equal(valor(vendedor, 'CorporateName'), emisor.nombre);
  }
  const sinDatos = { ...emisor, nombre: 'Marc', ciudad: 'Madrid', direccion: 'Calle 1', iban: '' };
  const xml = facturae(simple, sinDatos);
  assert.equal(valor(xml, 'PostCode'), '00000');
  assert.equal(valor(xml, 'FirstSurname'), '-');
  assert.doesNotMatch(xml, /<IBAN>/);
  assert.equal(leerFacturaElectronica(xml).proveedor.nombre, 'Marc');
  assert.equal(valor(facturae(simple, { ...sinDatos, direccion: 'Calle 1, 46001' }), 'Province'), 'Valencia');
  assert.throws(() => facturae({ ...simple, cliente: { ...cliente, nif: '12-3456789' } }, emisor), /país/);
  assert.match(facturae({ ...simple, cliente: { ...cliente, nif: '12-3456789', pais: 'US' } }, emisor), /<CountryCode>USA<\/CountryCode>/);
});

test('vencimiento explícito tiene prioridad y suma días sin depender de zona horaria', () => {
  for (const generar of [facturae, ubl]) {
    assert.equal(leerFacturaElectronica(generar({ ...simple, vencimiento: '2026-12-01' }, emisor)).vencimiento, '2026-12-01');
    assert.equal(leerFacturaElectronica(generar({ ...simple, vencimiento: '2026-12-01' }, emisor, { vencimiento: '2026-11-15' })).vencimiento, '2026-11-15');
    assert.equal(leerFacturaElectronica(generar({ ...simple, fecha: '2028-02-28' }, { ...emisor, plazo: 2 })).vencimiento, '2028-03-01');
  }
});

test('estadoPago: pagada, pendiente, vencida, fecha desconocida y día del vencimiento', () => {
  const factura = { ...f, vencimiento: '2026-11-01' };
  assert.deepEqual(estadoPago(factura, '2026-11-01'), { estado: 'pendiente', fecha: '2026-11-01', importe: 259.5 });
  assert.equal(estadoPago(factura, '2026-10-31').estado, 'pendiente');
  assert.deepEqual(estadoPago(factura, '2026-11-02'), { estado: 'vencida', fecha: '2026-11-01', importe: 259.5 });
  assert.deepEqual(estadoPago({ ...factura, cobrada: true, fechaCobro: '2026-11-03' }, '2026-11-04'), { estado: 'pagada', fecha: '2026-11-03', importe: 259.5 });
  assert.deepEqual(estadoPago({ ...f, cobrada: true }, '2026-11-04'), { estado: 'pagada', fecha: null, importe: 259.5 });
  assert.deepEqual(estadoPago(f, '2099-01-01'), { estado: 'pendiente', fecha: null, importe: 259.5 });
});

test('redondeo por tipo: el IVA de las líneas suma el de cabecera y se ignora una base obsoleta', () => {
  const factura = { ...f, base: 999, lineas: [{ concepto: 'A', cantidad: 1, precio: 0.03, ivaPct: 21 }, { concepto: 'B', cantidad: 1, precio: 0.03, ivaPct: 21 }] };
  const fe = facturae(factura, emisor);
  const totalLineas = sumar(bloques(fe, 'InvoiceLine').map((l) => importe(valor(l, 'TaxAmount'), 'TotalAmount')));
  assert.equal(totalLineas, 0.01);
  assert.equal(importe(fe, 'TotalTaxOutputs'), totalLineas);
  for (const generar of [facturae, ubl]) {
    const leida = leerFacturaElectronica(generar(factura, emisor));
    assert.equal(leida.base, 0.06);
    assert.equal(leida.total, 0.06);
    assert.equal(leida.irpf, 0.01);
  }
});

test('Facturae 3.2, 3.2.1 y 3.2.2, con prefijos o namespace por defecto y firma incrustada', () => {
  const original = facturae(f, emisor);
  for (const version of ['3.2', '3.2.1', '3.2.2']) {
    const xml = original.replaceAll('3.2.2', version).replace('Facturaev3_2_2.xml', `Facturaev${version.replaceAll('.', '_')}.xml`);
    const prefijado = xml.replace(/<(\/?)([A-Za-z][\w]*)(?=[\s>])/g, '<$1fe:$2')
      .replace('</fe:Facturae>', '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Object><InvoiceNumber>FALSA</InvoiceNumber><InvoiceTotal>99999</InvoiceTotal><Invoice><InvoiceNumber>OTRA</InvoiceNumber></Invoice></ds:Object></ds:Signature></fe:Facturae>');
    balanceado(prefijado);
    const sinPrefijos = xml.replaceAll('fe:', '').replace('xmlns:fe=', 'xmlns=');
    for (const variante of [xml, prefijado, sinPrefijos]) {
      const leida = leerFacturaElectronica(variante);
      assert.equal(leida.numero, '07-2026');
      assert.equal(leida.total, 259.5);
      assert.equal(leida.lineas.length, 3);
      assert.equal(leida.proveedor.nif, emisor.nif);
    }
  }
});

test('lotes Facturae: sólo la primera factura, con aviso y sin mezclar impuestos', () => {
  const primera = facturae(f, emisor);
  const segunda = valor(facturae(rectificativa, emisor), 'Invoice');
  const lote = primera.replace('</Invoices>', `<Invoice>${segunda}</Invoice></Invoices>`).replace('<InvoicesCount>1</InvoicesCount>', '<InvoicesCount>2</InvoicesCount>');
  const leida = leerFacturaElectronica(lote);
  assert.equal(leida.numero, '07-2026');
  assert.equal(leida.base, 250);
  assert.equal(leida.total, 259.5);
  assert.equal(leida.avisos.length, 1);
  assert.match(leida.avisos[0], /2 facturas.*primera/);
});

// Ejemplo CII con IVA en cabecera y en línea: no se debe sumar dos veces.
const cii = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument><ram:ID>CII-42</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20261002</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:Name><![CDATA[Diseño & web <A>]]></ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>500.00</ram:ChargeAmount><ram:BasisQuantity unitCode="C62">10</ram:BasisQuantity></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">2</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:CalculatedAmount>21.00</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>100.00</ram:BasisAmount><ram:RateApplicablePercent>21</ram:RateApplicablePercent></ram:ApplicableTradeTax></ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>Proveedor &amp; C&#237;a</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">OTRO-ID</ram:ID></ram:SpecifiedTaxRegistration><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">ESB12345674</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>Marc Ramírez Delgado</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">ES12345678Z</ram:ID></ram:SpecifiedTaxRegistration></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:SpecifiedTradeSettlementPaymentMeans><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>ES91 2100 0418 4502 0005 1332</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax><ram:CalculatedAmount>21.00</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>100.00</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>21</ram:RateApplicablePercent></ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261101</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>100.00</ram:LineTotalAmount><ram:TaxBasisTotalAmount>100.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">21.00</ram:TaxTotalAmount><ram:GrandTotalAmount>121.00</ram:GrandTotalAmount><ram:DuePayableAmount>71.00</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

test('CII: identidades, fechas 102, impuestos de cabecera, precio por unidad e IBAN', () => {
  balanceado(cii);
  const leida = leerFacturaElectronica(cii);
  assert.deepEqual(leida, { formato: 'cii', numero: 'CII-42', fecha: '2026-10-02', vencimiento: '2026-11-01', proveedor: { nombre: 'Proveedor & Cía', nif: 'B12345674' },
    cliente: { nombre: 'Marc Ramírez Delgado', nif: '12345678Z' }, concepto: 'Diseño & web <A>', base: 100, ivaPct: 21, desglose: [{ pct: 21, base: 100, cuota: 21 }],
    irpfPct: 0, irpf: 0, total: 121, iban: 'ES9121000418450200051332', lineas: [{ descripcion: 'Diseño & web <A>', cantidad: 2, precio: 50 }] });
  const abono = leerFacturaElectronica(cii.replace('<ram:TypeCode>380</ram:TypeCode>', '<ram:TypeCode>381</ram:TypeCode>'));
  assert.equal(abono.base, -100);
  assert.equal(abono.total, -121);
  assert.equal(abono.lineas[0].cantidad, -2);
});

test('UBL recibido: anticipo real, impuesto en otra moneda, entidades y precio base', () => {
  const xml = `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
    <cbc:ID>EXT-1</cbc:ID><cbc:IssueDate>2026-10-02</cbc:IssueDate><cbc:DueDate>2026-11-01</cbc:DueDate>
    <cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>FR12345678901</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>L&apos;atelier &amp; &#x1F3B5;</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
    <cac:AccountingCustomerParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Cliente</cbc:RegistrationName><cbc:CompanyID>ESB87654321</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
    <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">21</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">100</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">21</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>21</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
    <cac:TaxTotal><cbc:TaxAmount currencyID="GBP">18</cbc:TaxAmount></cac:TaxTotal>
    <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">100</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">121</cbc:TaxInclusiveAmount><cbc:PrepaidAmount currencyID="EUR">50</cbc:PrepaidAmount><cbc:PayableAmount currencyID="EUR">71</cbc:PayableAmount></cac:LegalMonetaryTotal>
    <cac:InvoiceLine><cbc:InvoicedQuantity unitCode="C62">2</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">100</cbc:LineExtensionAmount><cac:Item><cbc:Name>Servicio &amp;lt;literal&amp;gt;</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">500</cbc:PriceAmount><cbc:BaseQuantity unitCode="C62">10</cbc:BaseQuantity></cac:Price></cac:InvoiceLine>
  </Invoice>`;
  balanceado(xml);
  const leida = leerFacturaElectronica(xml);
  assert.equal(leida.total, 121); // El importe de la factura no es el saldo después de anticipos.
  assert.deepEqual(leida.proveedor, { nombre: "L'atelier & 🎵", nif: 'FR12345678901' });
  assert.equal(leida.cliente.nif, 'B87654321');
  assert.deepEqual(leida.desglose, [{ pct: 21, base: 100, cuota: 21 }]);
  assert.deepEqual(leida.lineas, [{ descripcion: 'Servicio &lt;literal&gt;', cantidad: 2, precio: 50 }]);
});

test('XML desconocido, incompleto, roto, entidades externas e importes inválidos devuelven error', () => {
  for (const xml of [null, '', 'hola', '<html/>', '<Invoice/>', '<Facturae/>', '<CrossIndustryInvoice/>', '<Invoice><ID>1</Invoice>', '<Invoice/><Invoice/>', '<!DOCTYPE Invoice [<!ENTITY x SYSTEM "file:///etc/passwd">]><Invoice>&x;</Invoice>', facturae(simple, emisor).replace('<InvoiceTotal>121.00', '<InvoiceTotal>NaN')]) {
    assert.equal(typeof leerFacturaElectronica(xml).error, 'string');
  }
});

test('abonos exentos conservan ceros sin signo y no duplican una retención del neto UBL', () => {
  const abono = { ...rectificativa, ivaPct: 0, irpfPct: 0, cliente: { ...cliente, nif: 'FR12345678901' } };
  for (const generar of [facturae, ubl]) {
    const leida = leerFacturaElectronica(generar(abono, emisor));
    assert.equal(leida.base, -50);
    assert.equal(leida.total, -50);
    assert.equal(leida.irpf, 0);
    assert.deepEqual(leida.desglose, [{ pct: 0, base: -50, cuota: 0 }]);
  }
  const sinBruto = ubl(f, emisor).replace(/<cbc:TaxInclusiveAmount[^>]*>.*?<\/cbc:TaxInclusiveAmount>/, '');
  const leida = leerFacturaElectronica(sinBruto);
  assert.equal(leida.total, 259.5);
  assert.equal(leida.irpf, 37.5);
});

test('funciones puras, serie personalizada, sin líneas y concepto limitado a 140 caracteres', () => {
  const factura = { ...simple, serie: 'V', concepto: 'A'.repeat(200) };
  const original = JSON.stringify({ factura, emisor });
  for (const generar of [facturae, ubl]) {
    const xml = generar(factura, emisor);
    assert.equal(generar(factura, emisor), xml);
    balanceado(xml);
    const leida = leerFacturaElectronica(xml);
    assert.equal(leida.numero, 'V2026-007');
    assert.equal(leida.concepto.length, 140);
    assert.equal(leida.lineas[0].descripcion.length, 200);
    assert.equal(leida.lineas.length, 1);
    assert.equal(leida.total, 121);
  }
  assert.equal(JSON.stringify({ factura, emisor }), original);
});
