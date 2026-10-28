import Ir from './Ir';
import { headers } from 'next/headers';
import { esApp } from '@/lib/app';
import { textos } from '@/lib/idiomaServidor';
import styles from './SinPlan.module.css';

const MENSAJES = {
  proyectos: ['Rentabilidad por proyecto', 'Consulta los ingresos, los gastos y el margen de cada proyecto con Pro.'],
  analisis: ['Análisis financiero', 'Consulta la evolución de tu negocio y compara sus resultados con Pro.'],
  inventario: ['Inventario', 'Controla las existencias y los movimientos de tus productos con Pro.'],
  tesoreria: ['Previsión de caja', 'Anticipa tus cobros y pagos para conocer el dinero disponible con Pro.'],
  asistente: ['Pregunta a Fisquo', 'Resuelve dudas sobre tus cuentas con el asistente IA incluido en Pro.'],
  albaranes: ['Pedidos y albaranes', 'Prepara tus pedidos y albaranes y conviértelos en facturas con Pro.'],
  cartera: ['Cartera de cobros', 'Organiza tus vencimientos y haz seguimiento de los cobros pendientes con Pro.'],
  remesas: ['Remesas SEPA', 'Agrupa tus recibos en remesas para enviarlas al banco con Pro.'],
};

export default async function SinPlan({ usuario, funcion }) {
  const tr = await textos();
  const app = esApp((await headers()).get('user-agent'));
  const [titulo, descripcion] = (MENSAJES[funcion] || ['Más herramientas para tu negocio', 'Esta herramienta está disponible a partir del plan Pro.']).map((x) => tr(x));
  const [antesPlan, despuesPlan = ''] = tr('Tu plan actual: {plan}.', { plan: '\u0001' }).split('\u0001');
  return <main className="pagina mk-look"><section className={styles.aviso} aria-labelledby="sin-plan-titulo">
    {!app && <p className={styles.etiqueta}>{tr('Incluido en Pro')}</p>}
    <h1 id="sin-plan-titulo" className={styles.titulo}>{titulo}</h1>
    <p className={styles.descripcion}>{app ? tr('Esta herramienta no está disponible en tu cuenta.') : descripcion}</p>
    {!app && <p className={styles.plan}>{antesPlan}<strong>{usuario.plan?.nombre || 'Esencial'}</strong>{despuesPlan}</p>}
    {!app && usuario.rol !== 'admin' && <p className={styles.descripcion}>{tr('Para activar esta herramienta, consulta al administrador de tu empresa.')}</p>}
    <div className={styles.acciones}>
      {!app && usuario.rol === 'admin' && <Ir href="/ajustes/plan" className="boton">{tr('Ver planes')}</Ir>}
      <Ir href="/" className={styles.volver}>{tr('Volver al resumen')}</Ir>
    </div>
  </section></main>;
}
