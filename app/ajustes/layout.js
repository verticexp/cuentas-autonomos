import { requerir } from '@/lib/auth';
import ListaAjustes from '@/components/ListaAjustes';
import '@/app/mk.css';
import '@/app/mas.css';
import '@/app/empresas.css';
import '@/app/ajustes.css';

// Ajustes y todas sus pantallas. En el móvil, una hoja que sube sobre la app (sin la barra de pestañas): en /ajustes se ve la
// lista y en cada pantalla, solo esa pantalla. En el ordenador, como los Ajustes del Sistema del Mac: la lista a la izquierda
// y la pantalla abierta a la derecha (app/ajustes.css .aj-marco).
export default async function LayoutAjustes({ children }) {
  const u = await requerir();
  return (
    <div className="aj-marco">
      <ListaAjustes u={u} />
      <div className="aj-detalle">{children}</div>
    </div>
  );
}
