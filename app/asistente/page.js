import { requerir } from '@/lib/auth';
import { herramientasPara } from '@/lib/asistente';
import { iaLista } from '@/lib/ticket';
import Volver from '@/components/Volver';
import Asistente from '@/components/Asistente';
import '@/app/asistente.css';

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

export default async function PaginaAsistente() {
  const u = await requerir();
  const h = herramientasPara(u).map((x) => x.name);
  return (
    <main className="pagina asistente">
      <Volver href="/">Resumen</Volver>
      <h1 className="titulo">Pregunta a Netto</h1>
      <p className="asi-sub">Responde con las cifras que calcula la app, solo de {u.empresaNombre || 'tu empresa'} y de lo que tú puedes ver.</p>
      <Asistente listo={iaLista()} ejemplos={Object.keys(EJEMPLOS).filter((k) => h.includes(k)).map((k) => EJEMPLOS[k])} />
    </main>
  );
}
