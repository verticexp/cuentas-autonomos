import TransicionPublica from '@/components/web/TransicionPublica';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { redis } from '@/lib/redis';
import SinBD from '@/components/SinBD';
import FormCodigo from '@/components/FormCodigo';
import PanelMarca from '@/components/PanelMarca';
import '@/app/legal.css';

export const dynamic = 'force-dynamic';
const ERRORES = { 1: 'El código no es correcto. Escribe el que se ve ahora en la app (cambia cada 30 segundos).', bloqueado: 'Demasiados intentos. Espera 15 minutos.' };

// El segundo paso en su propia página: sin JavaScript (el formulario de /login redirige aquí) o desde la pantalla de
// bloqueo con otra cuenta (?bloqueo=1). Sin el reto de /api/login no hay nada que hacer aquí.
export default async function DosPasos({ searchParams }) {
  if (!redis) return <SinBD />;
  if (!(await cookies()).get('reto')?.value) redirect('/login');
  const { error, bloqueo } = await searchParams;
  return (
    <TransicionPublica acceso><main className="login">
      <PanelMarca />
      <div className="form-entrar">
        <FormCodigo errorInicial={ERRORES[error] || ''} inicio={bloqueo !== '1'} />
        <p className="nota login-legal"><a href="/privacidad">Privacidad</a> · <a href="/condiciones">Condiciones</a></p>
      </div>
    </main></TransicionPublica>
  );
}

export const metadata = { title: 'Verificación en dos pasos' };
