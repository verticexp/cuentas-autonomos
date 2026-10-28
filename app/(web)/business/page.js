import Solucion from '@/components/web/Solucion';
import { textos } from '@/lib/idiomaServidor';

export async function generateMetadata() {
  const tr = await textos();
  return { title: tr('Business: varias sociedades y equipos · Fisquo'), description: tr('Una propuesta para varias sociedades o equipos, con alcance, servicios y precio cerrado acordados por contacto.') };
}

export default function Pagina() {
  return <Solucion id="business" />;
}
