import { hayUsuarios } from '@/lib/auth';
import { redis } from '@/lib/redis';
import SinBD from '@/components/SinBD';
import Logo from '@/components/Logo';
import FormEntrar from '@/components/FormEntrar';
import PanelMarca from '@/components/PanelMarca';
import { TrasArranque } from '@/lib/arranque';
import '@/app/legal.css';

export const dynamic = 'force-dynamic';
const ERRORES = { 1: 'Email o contraseña incorrectos.', bloqueado: 'Demasiados intentos. Espera 15 minutos.' };

export default async function Login({ searchParams }) {
  if (!redis) return <SinBD />;
  const { error } = await searchParams;
  const primera = !(await hayUsuarios());
  // Sin cuentas todavía: alta del administrador (formulario normal). Con cuentas: components/FormEntrar.js.
  return (
    <main className="login">
      <PanelMarca />
      <div className="form-entrar">
        {primera ? (
        <TrasArranque>
          <form method="post" action="/api/registro">
            <h1><Logo className="logo-login" /></h1>
            <p className="nota">Crea la cuenta de administrador.</p>
            {error && <p className="error">{ERRORES[error] || error}</p>}
            <label htmlFor="nombre">Nombre</label><input id="nombre" name="nombre" required />
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required />
            <label htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            <button type="submit">Crear cuenta</button>
          </form>
        </TrasArranque>
        ) : <FormEntrar errorInicial={error ? ERRORES[error] || error : ''} />}
        {/* Fuera del formulario: los enlaces legales salen siempre, también sin JavaScript. */}
        <p className="nota login-legal"><a href="/privacidad">Privacidad</a> · <a href="/condiciones">Condiciones</a></p>
      </div>
    </main>
  );
}
