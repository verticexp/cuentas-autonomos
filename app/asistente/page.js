import { sinFuncion } from '@/lib/planes';
import SinPlan from '@/components/SinPlan';
import { requerir } from '@/lib/auth';
import { herramientasPara } from '@/lib/asistente';
import { iaLista } from '@/lib/ticket';
import Volver from '@/components/Volver';
import Asistente from '@/components/Asistente';
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
  if (u.plan?.version === 2 && sinFuncion(u.plan, 'asistente')) return <SinPlan usuario={u} funcion="asistente" />;
  const h = herramientasPara(u).map((x) => x.name);
  // ?pregunta=…: llega desde el buscador de «Más» y se envía sola al abrir.
  const { pregunta } = await searchParams;
  const inicial = typeof pregunta === 'string' ? pregunta.trim().slice(0, 500) : '';
  return (
    <main className="pagina mk-look asistente">
      <Volver href="/">Resumen</Volver>
      <h1 className="titulo">Pregunta a Fisquo</h1>
      <p className="asi-sub">Responde con las cifras que calcula la app, solo de {u.empresaNombre || 'tu empresa'} y de lo que tú puedes ver.</p>
      <Asistente listo={iaLista()} inicial={inicial} ejemplos={Object.keys(EJEMPLOS).filter((k) => h.includes(k)).map((k) => EJEMPLOS[k])} />
    </main>
  );
}
