import { redirect } from 'next/navigation';

// «Por revisar» es ahora una pestaña de Gastos (app/gastos/page.js, ?ver=revisar). Aquí llegan los enlaces de antes y lo
// compartido desde el móvil (app/sw: ?compartido=N), con lo que traigan.
export default async function BandejaPagina({ searchParams }) {
  const q = new URLSearchParams(Object.entries((await searchParams) || {}).filter(([, v]) => typeof v === 'string'));
  q.set('ver', 'revisar');
  redirect(`/gastos?${q}`);
}
