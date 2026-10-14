// Reduce una foto (máx. 1600 px, JPEG) para que suba rápido y quepa en la petición. Solo en el navegador.
const LADO = 1600;

// Archivo de imagen → «data:image/jpeg;base64,…»
export async function reducir(archivo) {
  const img = await createImageBitmap(archivo);
  const k = Math.min(1, LADO / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

// Fotograma de un <video> (cámara en vivo) → el mismo formato.
export function fotograma(video) {
  const k = Math.min(1, LADO / Math.max(video.videoWidth, video.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
