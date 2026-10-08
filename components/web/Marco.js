import Cabecera from '@/components/web/Cabecera';
import Pie from '@/components/web/Pie';
import Interacciones from '@/components/web/Interacciones';
import '@/components/web/web.css';

// Fija «arranque visto» (la pantalla de inicio es de la app, no de la web) y activa las apariciones al hacer scroll.
const PRE = "document.documentElement.dataset.arranque='visto';document.documentElement.classList.add('web-js')";

// Envoltorio de todas las páginas públicas: cabecera, pie y detalles de movimiento.
export default function Marco({ children }) {
  return (
    <div className="web">
      <script dangerouslySetInnerHTML={{ __html: PRE }} />
      <Cabecera />
      <main className="web-main">{children}</main>
      <Pie />
      <Interacciones />
    </div>
  );
}
