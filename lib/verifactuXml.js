// XML de los registros de Verifactu para el servicio web de la AEAT (esquemas SuministroLR.xsd y
// SuministroInformacion.xsd, versión 1.0). Sin dependencias: se prueba contra los esquemas oficiales.
import { desglose, nifUE } from './calculos.js';

const NS_LR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
const NS_SI = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';
export const NIF_ES = /^([0-9]{8}[A-Z]|[XYZKLM][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const e = (tag, v) => `<sum1:${tag}>${esc(v)}</sum1:${tag}>`;
const g = (tag, ...hijos) => `<sum1:${tag}>${hijos.filter(Boolean).join('')}</sum1:${tag}>`;
const num = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);
const pct = (n) => String(Number(n));
const limpioNif = (n) => String(n || '').toUpperCase().replace(/[\s.-]/g, '').replace(/^ES(?=[0-9A-Z]{9}$)/, '');
// País del NIF-IVA (Grecia usa EL e Irlanda del Norte XI en el NIF-IVA; el código de país es GR y GB).
const paisNifUE = (nif) => ({ EL: 'GR', XI: 'GB' }[nif.slice(0, 2)] || nif.slice(0, 2));

// Cliente: NIF español, NIF-IVA de la UE (IDOtro 02) u otro documento de fuera (IDOtro 04).
export function destinatario(cliente = {}) {
  const nif = limpioNif(cliente.nif);
  if (!nif) return null;
  const nombre = e('NombreRazon', String(cliente.nombre || '').slice(0, 120));
  if (NIF_ES.test(nif)) return g('IDDestinatario', nombre, e('NIF', nif));
  const ue = nifUE(nif);
  if (ue) return g('IDDestinatario', nombre, g('IDOtro', e('CodigoPais', paisNifUE(ue)), e('IDType', '02'), e('ID', ue)));
  return g('IDDestinatario', nombre, g('IDOtro', e('IDType', '04'), e('ID', nif.slice(0, 20))));
}

// Una línea del desglose por tipo de IVA. Al 0 %: exenta (E1) si la actividad lo es o el cliente es de España;
// no sujeta por reglas de localización (N2) si el cliente es de fuera de España.
function detalle(d, { fiscal = {}, cliente = {} }) {
  const regimen = e('ClaveRegimen', fiscal.iva === 'recargo' ? '18' : '01');
  if (d.pct > 0) return g('DetalleDesglose', e('Impuesto', '01'), regimen, e('CalificacionOperacion', 'S1'), e('TipoImpositivo', pct(d.pct)), e('BaseImponibleOimporteNoSujeto', num(d.base)), e('CuotaRepercutida', num(d.iva)));
  const nif = limpioNif(cliente.nif);
  const extranjero = nif && !NIF_ES.test(nif);
  const clave = fiscal.iva !== 'exento' && extranjero ? e('CalificacionOperacion', 'N2') : e('OperacionExenta', 'E1');
  return g('DetalleDesglose', e('Impuesto', '01'), regimen, clave, e('BaseImponibleOimporteNoSujeto', num(d.base)));
}

// Registro de alta. r: el registro guardado al crear la factura (lib/verifactu.js registroAlta), con los mismos valores
// que la huella. anterior: el registro anterior de la cadena (o null si es el primero).
export function xmlAlta(r, { factura, emisorNombre, anterior, sistema, fiscal }) {
  const f = factura;
  const rectificativa = r.TipoFactura.startsWith('R') && f.rectifica
    ? e('TipoRectificativa', 'I') + g('FacturasRectificadas', g('IDFacturaRectificada', e('IDEmisorFactura', r.IDEmisorFactura), e('NumSerieFactura', f.rectifica.numero), e('FechaExpedicionFactura', f.rectifica.fecha.split('-').reverse().join('-'))))
    : '';
  const dest = destinatario(f.cliente);
  const cadena = anterior
    ? g('RegistroAnterior', e('IDEmisorFactura', anterior.IDEmisorFactura), e('NumSerieFactura', anterior.NumSerieFactura), e('FechaExpedicionFactura', anterior.FechaExpedicionFactura), e('Huella', anterior.Huella))
    : e('PrimerRegistro', 'S');
  return g('RegistroAlta',
    e('IDVersion', '1.0'),
    g('IDFactura', e('IDEmisorFactura', r.IDEmisorFactura), e('NumSerieFactura', r.NumSerieFactura), e('FechaExpedicionFactura', r.FechaExpedicionFactura)),
    e('NombreRazonEmisor', String(emisorNombre || '').slice(0, 120)),
    e('TipoFactura', r.TipoFactura),
    rectificativa,
    e('DescripcionOperacion', String(f.concepto || f.lineas?.[0]?.concepto || 'Servicios').slice(0, 500)),
    dest && g('Destinatarios', dest),
    g('Desglose', ...desglose(f).map((d) => detalle(d, { fiscal, cliente: f.cliente }))),
    e('CuotaTotal', r.CuotaTotal),
    e('ImporteTotal', r.ImporteTotal),
    g('Encadenamiento', cadena),
    g('SistemaInformatico', e('NombreRazon', sistema.nombre), e('NIF', sistema.nif), e('NombreSistemaInformatico', 'Netto'), e('IdSistemaInformatico', 'NT'),
      e('Version', sistema.version), e('NumeroInstalacion', sistema.instalacion), e('TipoUsoPosibleSoloVerifactu', 'S'), e('TipoUsoPosibleMultiOT', 'S'), e('IndicadorMultiplesOT', 'S')),
    e('FechaHoraHusoGenRegistro', r.FechaHoraHusoGenRegistro),
    e('TipoHuella', '01'),
    e('Huella', r.Huella),
  );
}

// Sobre SOAP con la cabecera (quien emite) y hasta 1000 registros.
export function sobre({ nombre, nif }, registros) {
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="${NS_LR}" xmlns:sum1="${NS_SI}"><soapenv:Header/><soapenv:Body><sum:RegFactuSistemaFacturacion><sum:Cabecera>${g('ObligadoEmision', e('NombreRazon', String(nombre).slice(0, 120)), e('NIF', limpioNif(nif)))}</sum:Cabecera>${registros.map((x) => `<sum:RegistroFactura>${x}</sum:RegistroFactura>`).join('')}</sum:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>`;
}
