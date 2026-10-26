import Ir from './Ir';
import Ico from './Ico';
import styles from './Vacio.module.css';

// Los formularios de crear suben como una hoja (lib/transicion.js 'subir'), como el resto de enlaces a ellos; lo demás entra
// de lado. Un tipo propio ({ href, texto, tipo }) manda.
const esFormulario = (href) => /^\/(?:facturas|presupuestos|albaranes)\/nuev[ao](?:[?#]|$)/.test(href);

function Accion({ valor, secundaria = false }) {
  if (!valor) return null;
  if (typeof valor === 'object' && 'href' in valor && 'texto' in valor) {
    return <Ir href={valor.href} tipo={valor.tipo || (esFormulario(valor.href) ? 'subir' : 'adelante')} className={`boton${secundaria ? ' sec' : ''}`}>{valor.texto}</Ir>;
  }
  return valor;
}

// nivel: el nivel del encabezado (h2 por defecto, el que sigue al título de la pantalla; h3 si va dentro de una sección con su h2).
export default function Vacio({ icono = 'datos', titulo, children, accion, secundaria, tipo = 'vacio', compacto = false, nivel = 2 }) {
  const Titulo = `h${nivel}`;
  return <div className={`${styles.vacio}${compacto ? ` ${styles.compacto}` : ''}`} data-tipo={tipo}>
    <span className={styles.icono} aria-hidden="true">{typeof icono === 'string' ? <Ico n={icono} /> : icono}</span>
    <div className={styles.contenido}>
      <Titulo className={styles.titulo}>{titulo}</Titulo>
      {children && <div className={styles.texto}>{children}</div>}
      {(accion || secundaria) && <div className={styles.acciones}><Accion valor={accion} /><Accion valor={secundaria} secundaria /></div>}
    </div>
  </div>;
}
