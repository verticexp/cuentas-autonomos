import { sinFuncion } from '@/lib/planes';
import SinPlan from '@/components/SinPlan';
import { requerir } from '@/lib/auth';
import { herramientasPara } from '@/lib/asistente';
import { iaLista } from '@/lib/ticket';
import Volver from '@/components/Volver';
import Asistente from '@/components/Asistente';
import { textos } from '@/lib/idiomaServidor';
import '@/app/asistente.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

// Preguntas de ejemplo según lo que puede ver cada persona.
const EJEMPLOS = {
  impuestos: '¿Cuánto IVA llevo este trimestre?',
  facturas: '¿Quién me debe dinero?',
  gastos: '¿Cuánto he gastado este mes?',
  tesoreria: '¿Cuánto tendré en el banco dentro de 3 meses?',
  resumen_anio: '¿Cuánto llevo ganado este año?',
  nominas: '¿Cuánto me cuestan las nóminas este año?',
};

export default async function PaginaAsistente({ searchParams }) {
  const u = await requerir();
  const tr = await textos();
  if (u.plan?.version >= 2 && sinFuncion(u.plan, 'asistente')) return <SinPlan usuario={u} funcion="asistente" />;
  const h = herramientasPara(u).map((x) => x.name);
  // ?pregunta=…: llega desde el buscador de «Más» y se envía sola al abrir.
  const { pregunta } = await searchParams;
  const inicial = typeof pregunta === 'string' ? pregunta.trim().slice(0, 500) : '';
  return (
    <main className="pagina mk-look asistente">
      <Volver href="/">Resumen</Volver>
      <h1 className="titulo">{tr('Pregunta a Fisquo')}</h1>
      <p className="asi-sub">{tr('Responde con las cifras que calcula la app, solo de {empresa} y de lo que tú puedes ver.', { empresa: u.empresaNombre || tr('tu empresa') })}</p>
      <Asistente listo={iaLista()} inicial={inicial} ejemplos={Object.keys(EJEMPLOS).filter((k) => h.includes(k)).map((k) => EJEMPLOS[k])} />
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())('Pregunta a Fisquo') }; }
