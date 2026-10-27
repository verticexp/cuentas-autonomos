'use client';
import { useT } from '@/components/Idioma';
// Un fallo inesperado al pintar una página de la app: se puede reintentar sin perder la sesión. El detalle ya queda en
// los registros del servidor (instrumentation.js); aquí solo el código para buscarlo.
export default function Error({ error, retry }) {
  const tr = useT();
  return (
    <main className="pagina">
      <div className="vacio">
        <h1>{tr('Algo ha fallado')}</h1>
        <p>{tr('No se ha podido cargar esta pantalla. Tus datos están a salvo: vuelve a intentarlo en unos segundos.')}</p>
        {error?.digest && <p><small>{tr('Código: {codigo}', { codigo: error.digest })}</small></p>}
        <button type="button" className="boton" onClick={() => retry()}>{tr('Reintentar')}</button>
      </div>
    </main>
  );
}
