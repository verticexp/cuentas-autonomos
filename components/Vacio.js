import Link from 'next/link';
import Ico from './Ico';
import styles from './Vacio.module.css';

function Accion({ valor, secundaria = false }) {
  if (!valor) return null;
  if (typeof valor === 'object' && 'href' in valor && 'texto' in valor) {
    return <Link href={valor.href} className={`boton${secundaria ? ' sec' : ''}`}>{valor.texto}</Link>;
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
