import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { puede } from '@/lib/permisos';
import Volver from '@/components/Volver';
import Catalogo from '@/components/Catalogo';
import { fiscalDe } from '@/lib/empresa';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function PaginaCatalogo() {
  const u = await requerir('facturas');
  const productos = ((await leer(u, 'productos')) || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return (
    <main className="pagina mk-look">
      <Volver href="/facturas">Facturas</Volver>
      <h1 className="titulo">Catálogo</h1>
      <Catalogo productos={productos} editar={puede(u, 'facturar')} inventario={Boolean(fiscalDe(u).inventario)} />
    </main>
  );
}
