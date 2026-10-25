import Logo from '@/components/Logo';
import { Reintentar } from '@/components/SinRed';

export const dynamic = 'force-static';
export const metadata = { title: 'Sin conexión', robots: { index: false } };

// Lo que enseña el service worker (app/sw) si se navega sin red: sin datos de la cuenta, para poder guardarla en el
// dispositivo. El botón vuelve a intentar la página en la que se estaba.
export default function SinConexion() {
  return (
    <main className="pagina sin-conexion">
      <Logo />
      <h1>No hay conexión</h1>
      <p>Fisquo necesita internet para enseñarte tus datos al día y guardar los cambios. Revisa el wifi o los datos móviles.</p>
      <Reintentar />
    </main>
  );
}
