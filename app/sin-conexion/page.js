import Logo from '@/components/Logo';
import { Reintentar } from '@/components/SinRed';
import { textos } from '@/lib/idiomaServidor';

// Dinámica, no estática: así sus scripts llevan el nonce de la CSP (proxy.js). El service worker la guarda al instalarse
// con sus cabeceras, y sin red la sirve tal cual.
export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Sin conexión'), robots: { index: false } }; }

// Lo que enseña el service worker (app/sw) si se navega sin red: sin datos de la cuenta, para poder guardarla en el
// dispositivo. El botón vuelve a intentar la página en la que se estaba.
export default async function SinConexion() {
  const tr = await textos();
  return (
    <main className="pagina sin-conexion">
      <Logo />
      <h1>{tr('No hay conexión')}</h1>
      <p>{tr('Fisquo necesita internet para enseñarte tus datos al día y guardar los cambios. Revisa el wifi o los datos móviles.')}</p>
      <Reintentar />
    </main>
  );
}
