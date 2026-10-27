import { redis } from '@/lib/redis';
import { mensajeSeguro } from '@/lib/mensajes';
import { INVITACION_DIAS } from '@/lib/auth';
import { AYUDA_CONTRASENA } from '@/lib/contrasena';
import { textos } from '@/lib/idiomaServidor';

export const dynamic = 'force-dynamic';

export default async function Invitacion({ params, searchParams }) {
  const tr = await textos();
  const { codigo } = await params;
  const { error, v } = await searchParams;
  const id = redis && (await redis.hget('invitaciones', codigo));
  const u = id && (await redis.hget('usuarios', id));
  if (!u) return <main className="aviso"><h1>{tr('Invitación no válida')}</h1><p>{tr('Ya se ha usado o ha caducado. Pide otra al administrador.')}</p></main>;
  // Caducada (lib/auth.js la rechaza igual al enviarla): mejor decirlo antes de pedir la contraseña.
  if (Date.now() - Date.parse(u.creado) > INVITACION_DIAS * 864e5) return <main className="aviso"><h1>{tr('Invitación caducada')}</h1><p>{tr('Las invitaciones valen {dias} días. Pide otra al administrador de tu empresa.', { dias: INVITACION_DIAS })}</p></main>;
  return (
    <main className="login">
      <form method="post" action="/api/invitacion">
        <h1>{tr('Hola, {nombre}', { nombre: u.nombre })}</h1>
        <p className="nota">{tr('Elige una contraseña para entrar con {email}.', { email: u.email })}</p>
        {error && <p className="error" role="alert">{tr(mensajeSeguro(error))}</p>}
        <input type="hidden" name="codigo" value={codigo} />
        {v && <input type="hidden" name="v" value={String(v)} />}
        <label htmlFor="password">{tr('Contraseña')}</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} aria-describedby="password-ayuda" required />
        <p className="nota" id="password-ayuda">{tr(AYUDA_CONTRASENA)}</p>
        <button type="submit">{tr('Crear contraseña y entrar')}</button>
      </form>
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())('Aceptar invitación') }; }
