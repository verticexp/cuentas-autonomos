import { requerirAdmin } from '@/lib/auth';
import Volver from '@/components/Volver';
import CrearAurora from '@/components/CrearAurora';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requerirAdmin();
  return <main className="pagina"><Volver href="/ajustes">Ajustes</Volver><h1>Crear Aurora de pruebas</h1><p>Empresa ficticia con 214 facturas, 370 gastos y 96 nóminas. Tiene datos propios y no envía correos ni registra facturas en la AEAT. Si ya existe, se conserva.</p><CrearAurora /></main>;
}

export const metadata = { title: 'Aurora' };
