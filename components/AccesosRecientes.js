// Ajustes › Seguridad › Últimos accesos (lib/accesos.js): las últimas entradas a la cuenta de esta persona, para ver si
// alguien ha entrado sin ella.
const cuando = (f) => new Date(f).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function AccesosRecientes({ lista = [] }) {
  return (
    <section className="tarjeta formulario accesos">
      <h3>Últimos accesos</h3>
      {lista.length ? (
        <ul className="dispositivos">
          {lista.map((a, i) => (
            <li key={`${a.fecha}-${i}`}>
              <span className="txt"><strong>{a.dispositivo}</strong><small>{cuando(a.fecha)} · {a.metodo}{a.ip ? ` · IP ${a.ip}` : ''}</small></span>
            </li>
          ))}
        </ul>
      ) : <p className="nota">Aquí verás cada vez que se entre en tu cuenta: cuándo, desde qué dispositivo y cómo.</p>}
      <p className="nota">¿Ves alguno que no es tuyo? Cambia la contraseña y cierra la sesión en todos los dispositivos.</p>
    </section>
  );
}
