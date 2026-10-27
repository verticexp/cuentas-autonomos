import { redis } from '@/lib/redis';
import { mensajeSeguro } from '@/lib/mensajes';
import { INVITACION_DIAS } from '@/lib/auth';
import { AYUDA_CONTRASENA } from '@/lib/contrasena';

export const dynamic = 'force-dynamic';

export default async function Invitacion({ params, searchParams }) {
  const { codigo } = await params;
  const { error, v } = await searchParams;
  const id = redis && (await redis.hget('invitaciones', codigo));
  const u = id && (await redis.hget('usuarios', id));
  if (!u) return <main className="aviso"><h1>Invitación no válida</h1><p>Ya se ha usado o ha caducado. Pide otra al administrador.</p></main>;
  // Caducada (lib/auth.js la rechaza igual al enviarla): mejor decirlo antes de pedir la contraseña.
  if (Date.now() - Date.parse(u.creado) > INVITACION_DIAS * 864e5) return <main className="aviso"><h1>Invitación caducada</h1><p>Las invitaciones valen {INVITACION_DIAS} días. Pide otra al administrador de tu empresa.</p></main>;
  return (
    <main className="login">
      <form method="post" action="/api/invitacion">
        <h1>Hola, {u.nombre}</h1>
        <p className="nota">Elige una contraseña para entrar con {u.email}.</p>
        {error && <p className="error" role="alert">{mensajeSeguro(error)}</p>}
        <input type="hidden" name="codigo" value={codigo} />
        {v && <input type="hidden" name="v" value={String(v)} />}
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} aria-describedby="password-ayuda" required />
        <p className="nota" id="password-ayuda">{AYUDA_CONTRASENA}</p>
        <button type="submit">Crear contraseña y entrar</button>
      </form>
    </main>
  );
}

export const metadata = { title: 'Aceptar invitación' };
