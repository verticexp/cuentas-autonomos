import Recuperar from '@/components/Recuperar';
import PanelMarca from '@/components/PanelMarca';
import { textos } from '@/lib/idiomaServidor';
import '@/app/legal.css';

export const dynamic = 'force-dynamic';

export default async function PaginaRecuperar({ searchParams }) {
  const { t } = await searchParams;
  const tr = await textos();
  return (
    <main className="login">
      <PanelMarca />
      <div className="form-entrar">
        <Recuperar token={typeof t === 'string' ? t : ''} />
        <p className="nota login-legal"><a href="/privacidad">{tr('Privacidad')}</a> · <a href="/condiciones">{tr('Condiciones')}</a></p>
      </div>
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())('Recuperar contraseña') }; }
