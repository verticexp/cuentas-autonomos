import Ir from './Ir';
import { textos } from '@/lib/idiomaServidor';

// Para quien entra en una pantalla que no le toca: se le dice, en lugar de un «no existe».
export default async function SinAcceso({ texto = 'Esta pantalla es solo para el administrador de la empresa. Si la necesitas, pídele acceso.' }) {
  const tr = await textos();
  return (
    <main className="pagina">
      <div className="vacio">
        <p>{tr('No tienes acceso')}</p>
        <p>{tr(texto)}</p>
        <Ir href="/" className="boton">{tr('Ir al Resumen')}</Ir>
      </div>
    </main>
  );
}
