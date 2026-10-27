import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/auth';
import ProgresoAlta from '@/components/ProgresoAlta';
import { textos } from '@/lib/idiomaServidor';

export const dynamic = 'force-dynamic';

// Sin el email confirmado (VERIFICAR_EMAIL=activo) la app manda aquí: sin datos, solo reenviar el enlace o salir.
export default async function ConfirmarEmail({ searchParams }) {
  const tr = await textos();
  const u = await usuarioActual();
  if (!u) redirect('/login');
  if (u.emailVerificado !== false) redirect('/');
  const { enviado, caducado } = await searchParams;
  return (
    <main className="login">
      <form method="post" action="/api/confirmar">
        {u.pendiente && <ProgresoAlta paso={4} total={4} etiqueta={tr('Confirma tu email')} />}
        <h1>{tr('Confirma tu email')}</h1>
        <p className="nota">{tr('Te hemos enviado un enlace a {email}. Ábrelo para seguir usando Fisquo.', { email: u.email })}</p>
        {u.pendiente && <p className="nota">{tr('Tu cuenta ya está creada. Después de confirmar el email, prepararemos las actividades e impuestos de tu negocio.')}</p>}
        {caducado && <p className="error" role="alert">{tr('Ese enlace ya no vale. Pide otro.')}</p>}
        {enviado && <p className="nota">{tr('Enviado. Mira también en la carpeta de spam.')}</p>}
        <button type="submit">{tr('Reenviar el enlace')}</button>
        <button type="submit" formAction="/api/logout" className="boton-llave">{tr('Cerrar sesión')}</button>
      </form>
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())('Confirma tu email') }; }
