import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/auth';
import ProgresoAlta from '@/components/ProgresoAlta';

export const dynamic = 'force-dynamic';

// Sin el email confirmado (VERIFICAR_EMAIL=activo) la app manda aquí: sin datos, solo reenviar el enlace o salir.
export default async function ConfirmarEmail({ searchParams }) {
  const u = await usuarioActual();
  if (!u) redirect('/login');
  if (u.emailVerificado !== false) redirect('/');
  const { enviado, caducado } = await searchParams;
  return (
    <main className="login">
      <form method="post" action="/api/confirmar">
        {u.pendiente && <ProgresoAlta paso={4} total={4} etiqueta="Confirma tu email" />}
        <h1>Confirma tu email</h1>
        <p className="nota">Te hemos enviado un enlace a {u.email}. Ábrelo para seguir usando Fisquo.</p>
        {u.pendiente && <p className="nota">Tu cuenta ya está creada. Después de confirmar el email, prepararemos las actividades e impuestos de tu negocio.</p>}
        {caducado && <p className="error">Ese enlace ya no vale. Pide otro.</p>}
        {enviado && <p className="nota">Enviado. Mira también en la carpeta de spam.</p>}
        <button type="submit">Reenviar el enlace</button>
        <button type="submit" formAction="/api/logout" className="boton-llave">Salir</button>
      </form>
    </main>
  );
}
