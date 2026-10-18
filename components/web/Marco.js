import TransicionPublica from '@/components/web/TransicionPublica';
import Cabecera from '@/components/web/Cabecera';
import Pie from '@/components/web/Pie';
import Interacciones from '@/components/web/Interacciones';
import '@/components/web/web.css';

// Envoltorio de todas las páginas públicas: cabecera, pie y detalles de movimiento.
export default function Marco({ children }) {
  return (
    <div className="web">
      <Cabecera />
      <TransicionPublica><main className="web-main">{children}</main></TransicionPublica>
      <Pie />
      <Interacciones />
    </div>
  );
}
