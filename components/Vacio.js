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

export default function Vacio({ icono = 'datos', titulo, children, accion, secundaria, tipo = 'vacio', compacto = false }) {
  return <div className={`${styles.vacio}${compacto ? ` ${styles.compacto}` : ''}`} data-tipo={tipo}>
    <span className={styles.icono} aria-hidden="true">{typeof icono === 'string' ? <Ico n={icono} /> : icono}</span>
    <div className={styles.contenido}>
      <h3 className={styles.titulo}>{titulo}</h3>
      {children && <div className={styles.texto}>{children}</div>}
      {(accion || secundaria) && <div className={styles.acciones}><Accion valor={accion} /><Accion valor={secundaria} secundaria /></div>}
    </div>
  </div>;
}
