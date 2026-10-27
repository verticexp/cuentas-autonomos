import { textos } from '@/lib/idiomaServidor';

export default async function SinBD() {
  const tr = await textos();
  return (
    <main className="aviso">
      <h1>{tr('Falta conectar la base de datos')}</h1>
      <p>{tr("En Vercel, abre el proyecto, ve a Storage y conecta la base de datos Upstash Redis de Controla'T. Después vuelve a desplegar.")}</p>
    </main>
  );
}
