import { notFound } from 'next/navigation';
import Guia from '@/components/web/Guia';
import { GUIAS, guia } from '@/data/web-guias';
import { metaPagina } from '@/lib/webMeta';

export const dynamicParams = false;
export const generateStaticParams = () => GUIAS.map((g) => ({ slug: g.slug }));

export async function generateMetadata({ params }) {
  const g = guia((await params).slug);
  return g ? metaPagina({ titulo: g.titulo, descripcion: g.descripcion, ruta: `/guias/${g.slug}` }) : {};
}

export default async function PaginaGuia({ params }) {
  const g = guia((await params).slug);
  if (!g) notFound();
  return <Guia g={g} />;
}
