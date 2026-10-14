// Errores de servidor en una línea JSON (informe de capacidad E11): ruta, método y tipo, sin cuerpo ni cabeceras.
export async function register() {}

export async function onRequestError(error, request, context) {
  const { metrica } = await import('./lib/metricas.js');
  metrica('error-peticion', { ruta: context?.routePath || request?.path, metodo: request?.method, tipo: context?.routeType, error: String(error?.name || 'Error'), digest: error?.digest });
}
