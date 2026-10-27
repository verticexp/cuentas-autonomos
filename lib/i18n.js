// Idioma de la app (no el de las facturas, que es de cada cliente: lib/idiomas.js). Castellano, catalán e inglés.
// El castellano es el propio código: cada texto se traduce buscando el texto en castellano tal cual en el diccionario
// (lib/textos), y si no está, sale en castellano. Así, en castellano todo queda exactamente como estaba, y lo que aún no
// esté traducido no se rompe: se ve en castellano.
// Se traduce al pintar, nunca al guardar ni al comparar: el estado y la lógica siguen con el texto en castellano
// («msg === 'Guardado'»), y solo lo que se enseña pasa por tr().
export const IDIOMAS_APP = [
  { id: 'es', nombre: 'Castellano', locale: 'es-ES' },
  { id: 'ca', nombre: 'Català', locale: 'ca-ES' },
  { id: 'en', nombre: 'English', locale: 'en-GB' },
];
export const idiomaAppValido = (id) => IDIOMAS_APP.some((x) => x.id === id);
export const localeDe = (id) => (IDIOMAS_APP.find((x) => x.id === id) || IDIOMAS_APP[0]).locale;

// El idioma elegido en Ajustes (cookie «idioma»); si no, el del iPhone o el navegador (Accept-Language): el primero de los
// que tiene la app, por orden de preferencia. Con el valenciano («ca-ES-valencia», «va») va el catalán; con cualquier
// otro (gallego, euskera, francés…), el castellano.
export function idiomaDe({ cookie, aceptados } = {}) {
  if (idiomaAppValido(cookie)) return cookie;
  const pedidos = String(aceptados || '').split(',').map((parte, i) => {
    const [etiqueta, ...params] = parte.trim().toLowerCase().split(';');
    const q = Number(params.find((p) => p.trim().startsWith('q='))?.split('=')[1] ?? 1);
    return { etiqueta, q: Number.isFinite(q) ? q : 0, i };
  }).filter((x) => x.etiqueta && x.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { etiqueta } of pedidos) {
    const base = etiqueta.split('-')[0];
    if (base === 'va') return 'ca';
    if (idiomaAppValido(base)) return base;
  }
  return 'es';
}

// {nombre} en el texto: se cambia por su valor.
const rellenar = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Textos que se componen en el código con datos («Prueba: 12 días», «Listo para presentar · hasta el 20 de octubre»):
// en el diccionario van con {huecos} y se reconocen ya compuestos. Lo que va en cada hueco se traduce a su vez (una fecha,
// un estado), y si no está en el diccionario se deja como está (un nombre, una cifra).
// Solo si el texto fijo tiene al menos 6 letras: «{perfil} en {empresa}» reconocería cualquier frase con «en» y la
// estropearía; esos se traducen siempre con tr(texto, vars).
const MIN_LETRAS = 6;
function compilar(dic) {
  const plantillas = [];
  for (const [es, tr] of Object.entries(dic)) {
    if (!/\{\w+\}/.test(es)) continue;
    if ((es.replace(/\{\w+\}/g, '').match(/\p{L}/gu) || []).length < MIN_LETRAS) continue;
    const huecos = [];
    const fuente = es.split(/(\{\w+\})/).map((p) => {
      const m = /^\{(\w+)\}$/.exec(p);
      if (!m) return escapar(p);
      huecos.push(m[1]);
      return '(.+?)';
    }).join('');
    plantillas.push({ re: new RegExp(`^${fuente}$`, 's'), huecos, tr, largo: es.length });
  }
  // Las más largas primero: «{n} días de prueba» antes que «{n} días».
  return plantillas.sort((a, b) => b.largo - a.largo);
}

const cache = new WeakMap();

// tr(texto, vars): el texto en el idioma del diccionario. Sin diccionario (castellano), el mismo texto.
export function traductor(dic) {
  if (!dic || !Object.keys(dic).length) {
    const t = (s, vars) => (typeof s === 'string' ? rellenar(s, vars) : s);
    return t;
  }
  if (!cache.has(dic)) cache.set(dic, compilar(dic));
  const plantillas = cache.get(dic);
  const t = (s, vars, prof = 0) => {
    if (typeof s !== 'string' || !s) return s;
    const directo = dic[s];
    if (directo !== undefined) return rellenar(directo, vars);
    if (vars) return rellenar(s, vars);
    if (prof > 3) return s;
    for (const p of plantillas) {
      const m = p.re.exec(s);
      if (!m) continue;
      const valores = Object.fromEntries(p.huecos.map((h, i) => [h, t(m[i + 1], undefined, prof + 1)]));
      return rellenar(p.tr, valores);
    }
    return s;
  };
  return t;
}
