// Los bancos mandan los conceptos en MAYÚSCULAS («RECIBO COMBUSTIBLE FURGONETA»): en pantalla se leen mejor en
// tipo frase («Recibo combustible furgoneta»), y los nombres de la otra parte con cada palabra en mayúscula
// («Gráficas Álvarez SL»; opción `nombre`). Solo se toca un texto que no tiene ninguna minúscula; las siglas
// conocidas (SL, SEPA, IVA…) y las palabras con cifras (referencias, NIF) se quedan como vienen.
const MENORES = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'por', 'para', 'con']);
const SIGLAS = new Set(['SL', 'SA', 'SLU', 'SAU', 'SLL', 'SC', 'CB', 'SCP', 'SEPA', 'IVA', 'IRPF', 'TPV', 'ATM', 'NIF', 'CIF', 'TGSS', 'AEAT', 'BBVA', 'ING', 'UE', 'EU', 'SS', 'RRHH', 'IBAN', 'BIC', 'SMS', 'PDF', 'AXA', 'DGT', 'ITV', 'IBI', 'ONG', 'TV']);

export function fraseBanco(texto, { nombre = false } = {}) {
  const s = String(texto ?? '');
  if (!/[A-ZÁÉÍÓÚÑÜ]/.test(s) || /[a-záéíóúñü]/.test(s)) return s;
  let primera = true;
  return s.replace(/[A-ZÁÉÍÓÚÑÜ0-9][A-ZÁÉÍÓÚÑÜ0-9.\-/&']*/g, (palabra) => {
    const limpia = palabra.replace(/[.\-/&']/g, '');
    let out;
    if (SIGLAS.has(limpia) || /\d/.test(palabra)) out = palabra;
    else if (nombre && (primera || !MENORES.has(palabra.toLowerCase()))) out = palabra[0] + palabra.slice(1).toLowerCase();
    else out = primera ? palabra[0] + palabra.slice(1).toLowerCase() : palabra.toLowerCase();
    primera = false;
    return out;
  });
}
