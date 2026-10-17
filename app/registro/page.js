import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/auth';
import { redis } from '@/lib/redis';
import SinBD from '@/components/SinBD';
import PanelMarca from '@/components/PanelMarca';
import FormRegistro from '@/components/FormRegistro';
import { planDe } from '@/lib/prueba';
import '@/app/legal.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Crear cuenta · Netto' };

// Crear cuenta desde la web: datos, tipo de negocio y plan (components/FormRegistro.js). ?tipo=&plan= llegan de la
// página de precios con el plan ya elegido.
export default async function Registro({ searchParams }) {
  if (!redis) return <SinBD />;
  if (await usuarioActual()) redirect('/');
  const { tipo, plan } = await searchParams;
  const elegido = planDe(tipo, plan) ? { tipo, plan } : { tipo: planDe(tipo, 'Pro') ? tipo : '', plan: '' };
  return (
    <main className="login">
      <PanelMarca />
      <div className="form-entrar">
        <FormRegistro inicial={elegido} />
        <p className="nota login-legal"><a href="/privacidad">Privacidad</a> · <a href="/condiciones">Condiciones</a></p>
      </div>
    </main>
  );
}
