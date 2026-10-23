'use client';
// Un fallo inesperado al pintar una página de la app: se puede reintentar sin perder la sesión. El detalle ya queda en
// los registros del servidor (instrumentation.js); aquí solo el código para buscarlo.
export default function Error({ error, retry }) {
  return (
    <main className="pagina">
      <div className="vacio">
        <h1>Algo ha fallado</h1>
        <p>No se ha podido cargar esta pantalla. Tus datos están a salvo: vuelve a intentarlo en unos segundos.</p>
        {error?.digest && <p><small>Código: {error.digest}</small></p>}
        <button type="button" className="boton" onClick={() => retry()}>Reintentar</button>
      </div>
    </main>
  );
}
