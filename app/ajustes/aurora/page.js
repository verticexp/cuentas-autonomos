import { requerirAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requerirAdmin();
  return <main className="pagina"><h1>Crear Aurora de pruebas</h1><p>Empresa ficticia con 214 facturas, 370 gastos y 96 nóminas. Tiene datos propios y no envía correos ni registra facturas en la AEAT. Si ya existe, se conserva.</p><form method="post" action="/api/aurora"><button type="submit">Crear Aurora y mostrar su acceso</button></form></main>;
}
