import Recuperar from '@/components/Recuperar';
import PanelMarca from '@/components/PanelMarca';
import '@/app/legal.css';

export const dynamic = 'force-dynamic';

export default async function PaginaRecuperar({ searchParams }) {
  const { t } = await searchParams;
  return (
    <main className="login">
      <PanelMarca />
      <div className="form-entrar">
        <Recuperar token={typeof t === 'string' ? t : ''} />
        <p className="nota login-legal"><a href="/privacidad">Privacidad</a> · <a href="/condiciones">Condiciones</a></p>
      </div>
    </main>
  );
}
