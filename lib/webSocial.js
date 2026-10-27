import * as datos from '../data/web-social.js';

// Prueba social de la web pública (data/web-social.js). Una entrada incompleta no se muestra: nunca sale un nombre sin
// su texto ni un caso sin su resultado. Las rutas de fotos y logos deben ser locales (public/) o https.

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const ruta = (v) => { const r = texto(v); return /^(\/(?!\/)|https:\/\/)/.test(r) ? r : ''; };

export const opinionesValidas = (lista = datos.opiniones) => (Array.isArray(lista) ? lista : [])
  .map((o) => ({ nombre: texto(o?.nombre), negocio: texto(o?.negocio), ciudad: texto(o?.ciudad), texto: texto(o?.texto), foto: ruta(o?.foto) }))
  .filter((o) => o.nombre && o.texto);

export const casosValidos = (lista = datos.casos) => (Array.isArray(lista) ? lista : [])
  .map((c) => ({ empresa: texto(c?.empresa), sector: texto(c?.sector), problema: texto(c?.problema), resultado: texto(c?.resultado) }))
  .filter((c) => c.empresa && c.problema && c.resultado);

export const gestoriasValidas = (lista = datos.gestorias) => (Array.isArray(lista) ? lista : [])
  .map((g) => ({ nombre: texto(g?.nombre), logo: ruta(g?.logo) }))
  .filter((g) => g.nombre);

export const notaValida = (nota = datos.notaFundador) => {
  const n = nota && typeof nota === 'object' ? { nombre: texto(nota.nombre), cargo: texto(nota.cargo), texto: texto(nota.texto), foto: ruta(nota.foto) } : null;
  return n && n.nombre && n.texto ? n : null;
};

// Lo que hay que pintar ahora mismo (todo vacío = nada).
export function pruebaSocial(origen = datos) {
  const r = {
    opiniones: opinionesValidas(origen.opiniones),
    casos: casosValidos(origen.casos),
    gestorias: gestoriasValidas(origen.gestorias),
    nota: notaValida(origen.notaFundador),
  };
  return { ...r, hay: r.opiniones.length > 0 || r.casos.length > 0 || r.gestorias.length > 0 || r.nota !== null };
}
