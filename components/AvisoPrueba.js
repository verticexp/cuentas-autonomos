import Link from 'next/link';
import { diasPrueba } from '@/lib/prueba';

// «Te quedan N días de prueba · Elegir plan» en Resumen (lib/prueba.js). Sin plan o ya pagado no sale.
export default function AvisoPrueba({ plan, enlace = true }) {
  const dias = diasPrueba(plan);
  if (dias === null) return null;
  const texto = dias === 0 ? 'Tu mes de prueba ha terminado: tus datos siguen aquí para verlos y exportarlos. Para crear y editar, elige un plan.' : dias === 1 ? 'Hoy es tu último día de prueba.' : `Te quedan ${dias} días de prueba del plan ${plan.nombre}.`;
  return (
    <p className={`aviso-prueba${dias <= 7 ? ' pronto' : ''}`}>
      <span>{texto}</span>
      {enlace && <Link href="/ajustes/plan">Elegir plan</Link>}
    </p>
  );
}
