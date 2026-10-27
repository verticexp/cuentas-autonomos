import { requerir } from '@/lib/auth';
import ListaAjustes from '@/components/ListaAjustes';
import ArrastrarAjustes from '@/components/ArrastrarAjustes';
import HojaAjustes from '@/components/HojaAjustes';
import '@/app/mk.css';
import '@/app/mas.css';
import '@/app/empresas.css';
import '@/app/ajustes.css';

// Ajustes y todas sus pantallas. En el móvil, una hoja que sube sobre la app (sin la barra de pestañas): en /ajustes se ve la
// lista y en cada pantalla, solo esa pantalla. En el ordenador, como los Ajustes del Sistema del Mac: la lista a la izquierda
// y la pantalla abierta a la derecha (app/ajustes.css .aj-marco). En el móvil se desplaza por dentro, deja detrás la
// pantalla de la que se vino (components/HojaAjustes.js) y se cierra arrastrándola hacia abajo.
export default async function LayoutAjustes({ children }) {
  const u = await requerir();
  return (
    <>
      <div className="aj-marco">
        {/* En el móvil se desplaza esto y no el marco: WebKit capturaba mal, para las transiciones, un marco desplazado. */}
        <div className="aj-desliza">
          <ListaAjustes u={u} />
          <div className="aj-detalle">{children}</div>
        </div>
        <ArrastrarAjustes />
      </div>
      <HojaAjustes />
    </>
  );
}
