import Solucion from '@/components/web/Solucion';
import { textos } from '@/lib/idiomaServidor';

export async function generateMetadata() {
  const tr = await textos();
  return { title: tr('Facturación y contabilidad para pymes · Fisquo'), description: tr('Facturas, contabilidad y cuentas anuales, equipo, nóminas y caja de tu pyme en un solo sitio desde 25 € al mes sin IVA por empresa.') };
}

export default function Pagina() {
  return <Solucion id="pym" />;
}
