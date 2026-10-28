import Solucion from '@/components/web/Solucion';
import { textos } from '@/lib/idiomaServidor';

export async function generateMetadata() {
  const tr = await textos();
  return { title: tr('Facturación e impuestos para autónomos · Fisquo'), description: tr('Facturación, gastos con IA, impuestos y amortizaciones para autónomos desde 9 € al mes sin IVA por empresa.') };
}

export default function Pagina() {
  return <Solucion id="aut" />;
}
