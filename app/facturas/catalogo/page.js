import { textos } from '@/lib/idiomaServidor';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { puede } from '@/lib/permisos';
import Volver from '@/components/Volver';
import Catalogo from '@/components/Catalogo';
import { fiscalDe, usaIgic } from '@/lib/empresa';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function PaginaCatalogo() {
  const tr = await textos();
  const u = await requerir('facturas');
  const productos = ((await leer(u, 'productos')) || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return (
    <main className="pagina mk-look">
      <Volver href="/facturas">{tr('Facturas')}</Volver>
      <h1 className="titulo">{tr('Catálogo')}</h1>
      <Catalogo igic={usaIgic(fiscalDe(u))} productos={productos} editar={puede(u, 'facturar')} inventario={Boolean(fiscalDe(u).inventario)} />
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())("Catálogo") }; }
