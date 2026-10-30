import TransicionPublica from '@/components/web/TransicionPublica';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hayUsuarios, usuarioActual } from '@/lib/auth';
import { redis } from '@/lib/redis';
import SinBD from '@/components/SinBD';
import Logo from '@/components/Logo';
import FormEntrar from '@/components/FormEntrar';
import PanelMarca from '@/components/PanelMarca';
import { TrasArranque } from '@/lib/arranque';
import { mensajeSeguro } from '@/lib/mensajes';
import { AYUDA_CONTRASENA } from '@/lib/contrasena';
import { socialListo } from '@/lib/social';
import { esApp } from '@/lib/app';
import { esOrdenador } from '@/lib/biometria';
import { textos } from '@/lib/idiomaServidor';
import '@/app/legal.css';

export const dynamic = 'force-dynamic';
const ERRORES = { 1: 'Email o contraseña incorrectos.', bloqueado: 'Demasiados intentos. Espera 15 minutos.', caducado: 'Ha pasado demasiado tiempo. Vuelve a escribir tu email y contraseña.', social: 'No se ha podido entrar con esa cuenta. Vuelve a intentarlo o entra con tu email.', cancelado: 'Has cancelado el inicio de sesión.', 'sin-confirmar': 'Ese email tiene una cuenta de Fisquo sin confirmar. Entra con tu email y contraseña, o confírmalo desde el correo que te enviamos.' };

export default async function Login({ searchParams }) {
  if (!redis) return <SinBD />;
  const tr = await textos();
  const { error } = await searchParams;
  // Con sesión, el login no tiene nada que enseñar (al volver atrás hasta aquí, se sigue a la app): «/» resuelve bloqueo, email y estado.
  if (await usuarioActual()) redirect('/');
  const primera = !(await hayUsuarios());
  const ua = (await headers()).get('user-agent');
  // Sin cuentas todavía: alta del administrador (formulario normal). Con cuentas: components/FormEntrar.js.
  return (
    <TransicionPublica acceso><main className="login">
      <PanelMarca />
      <div className="form-entrar">
        {primera ? (
        <TrasArranque>
          <form method="post" action="/api/registro">
            <h1><Logo className="logo-login" /></h1>
            <p className="nota">{tr('Crea la cuenta de administrador.')}</p>
            {error && <p className="error" role="alert">{tr(ERRORES[error] || mensajeSeguro(error))}</p>}
            <label htmlFor="nombre">{tr('Nombre')}</label><input id="nombre" name="nombre" required />
            <label htmlFor="email">{tr('Email')}</label>
            <input id="email" name="email" type="email" autoComplete="username" required />
            <label htmlFor="password">{tr('Contraseña')}</label>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} aria-describedby="password-ayuda" required />
            <p className="nota" id="password-ayuda">{tr(AYUDA_CONTRASENA)}</p>
            <button type="submit">{tr('Crear cuenta')}</button>
          </form>
        </TrasArranque>
        ) : <FormEntrar errorInicial={error ? ERRORES[error] || mensajeSeguro(error) : ''} listos={{ ...socialListo(), app: esApp(ua) }} ordenador={esOrdenador(ua)} />}
        {/* Fuera del formulario: los enlaces legales salen siempre, también sin JavaScript. */}
        <p className="nota login-legal"><a href="/privacidad">{tr('Privacidad')}</a> · <a href="/condiciones">{tr('Condiciones')}</a></p>
      </div>
    </main></TransicionPublica>
  );
}

export async function generateMetadata() { return { title: (await textos())('Iniciar sesión') }; }
