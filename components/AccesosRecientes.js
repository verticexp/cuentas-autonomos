// Ajustes › Seguridad › Últimos accesos (lib/accesos.js): las últimas entradas a la cuenta de esta persona, para ver si
// alguien ha entrado sin ella.
import { fechaHora } from '@/lib/formato';
import { textos } from '@/lib/idiomaServidor';

const cuando = fechaHora;

export default async function AccesosRecientes({ lista = [] }) {
  const tr = await textos();
  return (
    <section className="tarjeta formulario ultimos-accesos">
      <h3>{tr('Últimos accesos')}</h3>
      {lista.length ? (
        <ul className="dispositivos">
          {lista.map((a, i) => (
            <li key={`${a.fecha}-${i}`}>
              <span className="txt"><strong>{String(a.dispositivo).split(' · ').map((x) => tr(x)).join(' · ')}</strong><small>{cuando(a.fecha)} · {tr(a.metodo)}{a.ip ? ` · IP ${a.ip}` : ''}</small></span>
            </li>
          ))}
        </ul>
      ) : <p className="nota">{tr('Aquí verás cada vez que se entre en tu cuenta: cuándo, desde qué dispositivo y cómo.')}</p>}
      <p className="nota">{tr('¿Ves alguno que no es tuyo? Cambia la contraseña y cierra la sesión en todos los dispositivos.')}</p>
    </section>
  );
}
