'use client';
// Último recurso: falla el propio layout. Sin los estilos de la app, así que lleva los suyos mínimos.
export default function GlobalError({ error, retry }) {
  return (
    <html lang="es">
      <title>Algo ha fallado · Kontix</title>
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, padding: 16, textAlign: 'center' }}>
        <main>
          <h1 style={{ fontSize: 22 }}>Algo ha fallado</h1>
          <p>Kontix no se ha podido cargar. Tus datos están a salvo: vuelve a intentarlo en unos segundos.</p>
          {error?.digest && <p><small>Código: {error.digest}</small></p>}
          <button type="button" onClick={() => retry()} style={{ padding: '10px 18px', fontSize: 16 }}>Reintentar</button>
        </main>
      </body>
    </html>
  );
}
