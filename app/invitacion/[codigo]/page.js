import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export default async function Invitacion({ params, searchParams }) {
  const { codigo } = await params;
  const { error } = await searchParams;
  const id = redis && (await redis.hget('invitaciones', codigo));
  const u = id && (await redis.hget('usuarios', id));
  if (!u) return <main className="aviso"><h1>Invitación no válida</h1><p>Ya se ha usado o ha caducado. Pide otra al administrador.</p></main>;
  return (
    <main className="login">
      <form method="post" action="/api/invitacion">
        <h1>Hola, {u.nombre}</h1>
        <p className="nota">Elige una contraseña para entrar con {u.email}.</p>
        {error && <p className="error">{error}</p>}
        <input type="hidden" name="codigo" value={codigo} />
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <button type="submit">Crear contraseña y entrar</button>
      </form>
    </main>
  );
}
