import Link from 'next/link';
import { diasPrueba } from '@/lib/prueba';

// «Te quedan N días de prueba · Elegir plan» en Resumen (lib/prueba.js), la última semana. Sin plan o ya pagado no sale;
// los días que quedan se ven siempre en Ajustes › Tu plan.
export default function AvisoPrueba({ plan, enlace = true, app = false }) {
  const dias = diasPrueba(plan);
  // Los primeros días de la prueba no se agobia con elegir plan: el aviso sale la última semana (y al acabar).
  if (dias === null || dias > 7) return null;
  if (app) return dias === 0 ? <p className="aviso-prueba pronto"><span>Tu periodo de prueba ha terminado. Puedes consultar y exportar todos tus datos.</span></p> : null;
  const texto = dias === 0 ? 'Tu mes de prueba ha terminado: tus datos siguen aquí para verlos y exportarlos. Para crear y editar, elige un plan.' : dias === 1 ? 'Hoy es tu último día de prueba.' : `Te quedan ${dias} días de prueba del plan ${plan.nombre}.`;
  return (
    <p className={`aviso-prueba${dias <= 7 ? ' pronto' : ''}`}>
      <span>{texto}</span>
      {enlace && <Link href="/ajustes/plan">Elegir plan</Link>}
    </p>
  );
}
