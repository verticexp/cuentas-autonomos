import { requerirAdmin } from '@/lib/auth';
import { GRUPOS, catalogo } from '@/lib/correos';
import { emailListo } from '@/lib/email';
import Volver from '@/components/Volver';
import AdminCorreoPrueba from '@/components/AdminCorreoPrueba';
import '@/app/admin/admin.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Correos de Kontix' };

export default async function CorreosAdmin() {
  await requerirAdmin();
  const correos = catalogo();

  return <main className="pagina mk-look adm adm-correo-panel">
    <Volver href="/admin">Volver</Volver>
    <h1 className="titulo">Correos de Kontix</h1>
    <p className="adm-intro">{emailListo() ? 'El envío de emails está configurado.' : 'El envío de emails no está configurado (falta RESEND_API_KEY).'} Remitente: {process.env.RESEND_FROM || 'Kontix <onboarding@resend.dev> (falta RESEND_FROM)'}.</p>
    {GRUPOS.map((grupo) => <section className="adm-correo-grupo" key={grupo}>
      <h2>{grupo}</h2>
      {correos.filter((c) => c.grupo === grupo).map((c) => <article className="adm-caja adm-correo" key={c.id}>
        <h3>{c.nombre}</h3>
        <p><strong>Asunto:</strong> {c.asunto}</p>
        <dl>
          <dt>Cuándo se envía</dt><dd>{c.cuando}</dd>
          <dt>A quién</dt><dd>{c.para}</dd>
        </dl>
        <details>
          <summary>Vista previa del correo</summary>
          <iframe srcDoc={c.html} sandbox="" title={`Vista previa: ${c.nombre}`} />
        </details>
        <details>
          <summary>Versión en texto plano</summary>
          <pre>{c.texto}</pre>
        </details>
        <AdminCorreoPrueba id={c.id} />
      </article>)}
    </section>)}
  </main>;
}
