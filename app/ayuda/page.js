import { requerir } from '@/lib/auth';
import Volver from '@/components/Volver';
import AyudaChat from '@/components/AyudaChat';
import { textos } from '@/lib/idiomaServidor';
import '@/app/mk.css';
import '@/app/chat.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Chat de ayuda') }; }

// Chat de ayuda (components/AyudaChat.js), como la conversación con la gestoría (app/tu-gestoria): en el móvil, a pantalla
// completa, con el cuadro de escribir pegado al teclado. Se entra desde Ajustes › Ayuda y desde el aviso de una respuesta.
export default async function PaginaAyuda() {
  await requerir();
  const tr = await textos();
  return <main className="pagina mk-look desp-chat-pagina ayuda-chat-pagina">
    <header className="chat-cabecera">
      <Volver href="/ajustes/ayuda">Ayuda</Volver>
      <span className="chat-quien">
        <span className="ayuda-chat-ico" aria-hidden><svg viewBox="0 0 24 24"><path d="M5 5h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V7a2 2 0 012-2z" /></svg></span>
        <span><h1 className="chat-nombre">{tr('Chat de ayuda')}</h1><small>{tr('Equipo de Fisquo')}</small></span>
      </span>
    </header>
    <AyudaChat />
  </main>;
}
