import Link from 'next/link';
import { diasPrueba, planDe } from '@/lib/prueba';

// «Te quedan N días de prueba · Elegir plan» en Resumen (lib/prueba.js), la última semana. Sin plan o ya pagado no sale;
// los días que quedan se ven siempre en Ajustes › Tu plan.
export default function AvisoPrueba({ plan, enlace = true, app = false }) {
  const dias = diasPrueba(plan);
  // Los primeros días de la prueba no se agobia con elegir plan: el aviso sale la última semana (y al acabar).
  if (dias === null || dias > 7) return null;
  if (app) return dias === 0 ? <p className="aviso-prueba pronto"><span>Tu periodo de prueba ha terminado. Puedes consultar y exportar todos tus datos.</span></p> : null;
  const precio = planDe(plan.tipo, plan.nombre)?.p;
  const cuota = precio ? ` El plan ${plan.nombre} cuesta ${precio.toLocaleString('es-ES')} € al mes, sin IVA y sin permanencia.` : '';
  // Antes de que ocurra: sin tarjeta no se cobra nada, y qué pasa si no se elige plan.
  const texto = dias === 0 ? 'Tu prueba ha terminado. No se ha cobrado nada. Tus datos siguen aquí para verlos y exportarlos; para crear y editar, elige un plan.'
    : dias === 1 ? `Hoy es tu último día de prueba. Mañana tu cuenta pasa a solo lectura: verás y exportarás todo, pero no podrás crear ni editar hasta elegir plan.${cuota}`
    : `Te quedan ${dias} días de prueba. No te hemos pedido tarjeta, así que no se cobra nada solo por terminar. Si no eliges plan, tu cuenta pasará a solo lectura: verás y exportarás todo, pero no podrás crear ni editar.${cuota}`;
  return (
    <p className={`aviso-prueba${dias <= 7 ? ' pronto' : ''}`}>
      <span>{texto}</span>
      {enlace && <Link href="/ajustes/plan">Ver planes y precios</Link>}
    </p>
  );
}
