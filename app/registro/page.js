import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/auth';
import { redis } from '@/lib/redis';
import SinBD from '@/components/SinBD';
import PanelRegistro from '@/components/PanelRegistro';
import FormRegistro from '@/components/FormRegistro';
import { planDe } from '@/lib/prueba';
import '@/app/legal.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Crear cuenta · Netto' };

// El plan y el periodo elegidos en Precios se conservan durante el alta.
export default async function Registro({ searchParams }) {
  if (!redis) return <SinBD />;
  if (await usuarioActual()) redirect('/');
  const { tipo, plan, periodo } = await searchParams;
  const elegido = planDe(tipo, plan) ? { tipo, plan } : { tipo: planDe(tipo, 'Pro') ? tipo : '', plan: '' };
  return (
    <main className="login">
      <PanelRegistro />
      <div className="form-entrar">
        <FormRegistro inicial={{ ...elegido, periodo: periodo === 'anio' ? 'anio' : 'mes' }} />
        <p className="nota login-legal"><a href="/privacidad">Privacidad</a> · <a href="/condiciones">Condiciones</a></p>
      </div>
    </main>
  );
}
