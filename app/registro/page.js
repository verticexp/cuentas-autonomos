import TransicionPublica from '@/components/web/TransicionPublica';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/auth';
import { redis } from '@/lib/redis';
import SinBD from '@/components/SinBD';
import PanelRegistro from '@/components/PanelRegistro';
import FormRegistro from '@/components/FormRegistro';
import { planDe, TIPOS_ALTA } from '@/lib/prueba';
import { empresaPorCodigo, normalizarRef } from '@/lib/recomendaciones';
import { socialListo } from '@/lib/social';
import { esApp } from '@/lib/app';
import { leerAlta } from '@/lib/socialServidor';
import { textos } from '@/lib/idiomaServidor';
import '@/app/legal.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Crear cuenta') }; }

// El plan y el periodo elegidos en Precios se conservan durante el alta. Con sesión, solo ?nueva=1: otra empresa
// para la misma cuenta (Ajustes › Tus empresas), sin el paso de la cuenta.
export default async function Registro({ searchParams }) {
  const seleccion = await searchParams;
  if (seleccion.tipo === 'gra' || seleccion.tipo === 'business') redirect('/business');
  if (!redis) return <SinBD />;
  const tr = await textos();
  const u = await usuarioActual();
  if (u && !seleccion.nueva) redirect('/');
  const { tipo, plan, periodo } = seleccion;
  // Enlace de recomendación: solo si sigue valiendo; se enseña quién lo manda (Ajustes › Recomienda Fisquo).
  const recomienda = typeof seleccion.ref === 'string' ? await empresaPorCodigo(seleccion.ref) : null;
  const ref = recomienda ? { codigo: normalizarRef(seleccion.ref), nombre: recomienda.nombre } : null;
  // Viene de «Continuar con Google / Apple» sin cuenta (app/api/login/social/vuelta): la identidad, para no pedir contraseña.
  const alta = !u && seleccion.social ? await leerAlta((await cookies()).get('alta-social')?.value) : null;
  const social = alta ? { proveedor: alta.proveedor, nombre: alta.nombre || '', email: alta.email || '' } : null;
  const elegido = Object.hasOwn(TIPOS_ALTA, tipo) && planDe(tipo, plan) ? { tipo, plan } : { tipo: planDe(tipo, 'Pro') ? tipo : '', plan: '' };
  return (
    <TransicionPublica acceso><main className="login">
      <PanelRegistro />
      <div className="form-entrar">
        <FormRegistro inicial={{ ...elegido, periodo: periodo === 'anio' ? 'anio' : 'mes', codigo: [seleccion.codigo, seleccion.gestoria].find((c) => typeof c === 'string') || '' }} recomendacion={ref} sesion={u ? { nombre: u.nombre, email: u.email } : null} social={social} listos={{ ...socialListo(), app: esApp((await headers()).get('user-agent')) }} />
        <p className="nota login-legal"><a href="/privacidad">{tr('Privacidad')}</a> · <a href="/condiciones">{tr('Condiciones')}</a></p>
      </div>
    </main></TransicionPublica>
  );
}
