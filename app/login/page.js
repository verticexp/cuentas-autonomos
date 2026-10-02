import { hayUsuarios } from '@/lib/auth';
import { redis } from '@/lib/redis';
import SinBD from '@/components/SinBD';
import EntrarFaceId from '@/components/EntrarFaceId';
import Logo from '@/components/Logo';

export const dynamic = 'force-dynamic';
const ERRORES = { 1: 'Email o contraseña incorrectos.', bloqueado: 'Demasiados intentos. Espera 15 minutos.' };

export default async function Login({ searchParams }) {
  if (!redis) return <SinBD />;
  const { error } = await searchParams;
  const primera = !(await hayUsuarios());
  return (
    <main className="login">
      <form method="post" action={primera ? '/api/registro' : '/api/login'}>
        <h1><Logo className="logo-login" /></h1>
        {primera && <p className="nota">Crea la cuenta de administrador.</p>}
        {error && <p className="error">{ERRORES[error] || error}</p>}
        {!primera && <EntrarFaceId />}
        {primera && <><label htmlFor="nombre">Nombre</label><input id="nombre" name="nombre" required /></>}
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete={primera ? 'new-password' : 'current-password'} minLength={primera ? 8 : undefined} required />
        <button type="submit">{primera ? 'Crear cuenta' : 'Entrar'}</button>
        {!primera && <p className="nota">¿No tienes cuenta? Pide una invitación al administrador.</p>}
      </form>
    </main>
  );
}
