import TransicionPublica from '@/components/web/TransicionPublica';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/auth';
import { redis } from '@/lib/redis';
import SinBD from '@/components/SinBD';
import PanelRegistro from '@/components/PanelRegistro';
import FormRegistro from '@/components/FormRegistro';
import { planDe, TIPOS_ALTA } from '@/lib/prueba';
import '@/app/legal.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Crear cuenta · Netto' };

// El plan y el periodo elegidos en Precios se conservan durante el alta. Con sesión, solo ?nueva=1: otra empresa
// para la misma cuenta (Ajustes › Tus empresas), sin el paso de la cuenta.
export default async function Registro({ searchParams }) {
  const seleccion = await searchParams;
  if (seleccion.tipo === 'gra' || seleccion.tipo === 'business') redirect('/business');
  if (!redis) return <SinBD />;
  const u = await usuarioActual();
  if (u && !seleccion.nueva) redirect('/');
  const { tipo, plan, periodo } = seleccion;
  const elegido = Object.hasOwn(TIPOS_ALTA, tipo) && planDe(tipo, plan) ? { tipo, plan } : { tipo: planDe(tipo, 'Pro') ? tipo : '', plan: '' };
  return (
    <TransicionPublica acceso><main className="login">
      <PanelRegistro />
      <div className="form-entrar">
        <FormRegistro inicial={{ ...elegido, periodo: periodo === 'anio' ? 'anio' : 'mes', gestoria: typeof seleccion.gestoria === 'string' ? seleccion.gestoria : '' }} sesion={u ? { nombre: u.nombre, email: u.email } : null} />
        <p className="nota login-legal"><a href="/privacidad">Privacidad</a> · <a href="/condiciones">Condiciones</a></p>
      </div>
    </main></TransicionPublica>
  );
}
