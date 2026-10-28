'use client';
import { useEffect, useState } from 'react';
import { idiomaDe, traductor } from '@/lib/i18n';

// Sus pocos textos van aquí mismo (los mismos que lib/textos/comunes.js): importar los diccionarios metería todos en el
// código que se descarga con cada página.
const DIC = {
  ca: {"Error de carga · Fisquo": "Error de càrrega · Fisquo", "No se ha podido cargar Fisquo": "No s'ha pogut carregar Fisquo", "Fisquo no se ha podido cargar. Tus datos están a salvo: vuelve a intentarlo en unos segundos.": "Fisquo no s'ha pogut carregar. Les teves dades estan segures: torna-ho a provar d'aquí a uns segons.", "Código: {codigo}": "Codi: {codigo}", "Reintentar": "Torna-ho a provar"},
  en: {"Error de carga · Fisquo": "Loading error · Fisquo", "No se ha podido cargar Fisquo": "Fisquo couldn't be loaded", "Fisquo no se ha podido cargar. Tus datos están a salvo: vuelve a intentarlo en unos segundos.": "Fisquo couldn't be loaded. Your data is safe: please try again in a few seconds.", "Código: {codigo}": "Code: {codigo}", "Reintentar": "Try again"},
};

// Último recurso: falla el propio layout. Sin los estilos de la app, así que lleva los suyos mínimos. Tampoco hay proveedor de
// idioma: se lee de la cookie de Ajustes o del navegador (como lib/idiomaServidor.js) al llegar al navegador; hasta entonces,
// y en el servidor, castellano.
export default function GlobalError({ error, retry }) {
  const [idioma, setIdioma] = useState('es');
  useEffect(() => {
    const cookie = document.cookie.match(/(?:^|; )idioma=(\w+)/)?.[1];
    setIdioma(idiomaDe({ cookie, aceptados: (navigator.languages?.length ? navigator.languages : [navigator.language]).join(',') }));
  }, []);
  const tr = traductor(DIC[idioma] || null, idioma);
  return (
    <html lang={idioma}>
      <title>{tr('Error de carga · Fisquo')}</title>
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, padding: 16, textAlign: 'center' }}>
        <main>
          <h1 style={{ fontSize: 22 }}>{tr('No se ha podido cargar Fisquo')}</h1>
          <p>{tr('Fisquo no se ha podido cargar. Tus datos están a salvo: vuelve a intentarlo en unos segundos.')}</p>
          {error?.digest && <p><small>{tr('Código: {codigo}', { codigo: error.digest })}</small></p>}
          <button type="button" onClick={() => retry()} style={{ padding: '10px 18px', fontSize: 16 }}>{tr('Reintentar')}</button>
        </main>
      </body>
    </html>
  );
}
