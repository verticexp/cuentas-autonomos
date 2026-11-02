package com.fisquo.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/**
 * Escáner de documentos de Android (ML Kit Document Scanner, de Google Play Services) para tickets y facturas: detecta
 * los bordes, endereza y limpia la imagen, mejor que una foto suelta para que la IA lea los importes. Es el equivalente de
 * EscanerPlugin.swift. Desde la web: window.Capacitor.Plugins.Escaner (lib/escanerNativo.js).
 *
 * disponible() → { disponible }  (hace falta Google Play Services)
 * escanear() → { paginas: [JPEG en base64] }  (hasta 10 páginas; falla con «cancelado», «no-disponible» o «error»)
 */
@CapacitorPlugin(name = "Escaner")
public class EscanerPlugin extends Plugin {
    private static final int MAX_PAGINAS = 10;
    // Como mucho 2.000 px de lado y calidad 80: se lee bien y no pasa de unos cientos de KB.
    private static final int LADO_MAXIMO = 2000;
    private static final int CALIDAD_JPEG = 80;

    private ActivityResultLauncher<IntentSenderRequest> lanzador;
    private PluginCall llamada;

    @Override
    public void load() {
        // El lanzador se registra al cargar el complemento (antes de que la actividad arranque), como exige Android.
        lanzador = bridge.registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), this::alTerminar);
    }

    @PluginMethod
    public void disponible(PluginCall call) {
        JSObject r = new JSObject();
        r.put("disponible", hayPlayServices());
        call.resolve(r);
    }

    @PluginMethod
    public void escanear(PluginCall call) {
        if (!hayPlayServices()) {
            call.reject("El escáner no está disponible en este dispositivo", "no-disponible");
            return;
        }
        synchronized (this) {
            if (llamada != null) {
                call.reject("Ya hay un escaneo en curso", "error");
                return;
            }
            llamada = call;
        }
        Activity actividad = getActivity();
        GmsDocumentScannerOptions opciones = new GmsDocumentScannerOptions.Builder()
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .setGalleryImportAllowed(true)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setPageLimit(MAX_PAGINAS)
            .build();
        GmsDocumentScanner escaner = GmsDocumentScanning.getClient(opciones);
        escaner
            .getStartScanIntent(actividad)
            .addOnSuccessListener(intent -> lanzador.launch(new IntentSenderRequest.Builder(intent).build()))
            .addOnFailureListener(e -> terminar(null, "No se ha podido abrir el escáner: " + e.getLocalizedMessage(), "error"));
    }

    private boolean hayPlayServices() {
        return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext()) == ConnectionResult.SUCCESS;
    }

    // Vuelve del escáner: cancelar o cerrar sin páginas es «cancelado»; si hay páginas, se reducen fuera del hilo principal.
    private void alTerminar(ActivityResult resultado) {
        if (resultado.getResultCode() != Activity.RESULT_OK) {
            terminar(null, "cancelado", "cancelado");
            return;
        }
        GmsDocumentScanningResult scan = GmsDocumentScanningResult.fromActivityResultIntent(resultado.getData());
        List<GmsDocumentScanningResult.Page> paginas = scan == null ? null : scan.getPages();
        if (paginas == null || paginas.isEmpty()) {
            terminar(null, "cancelado", "cancelado");
            return;
        }
        execute(() -> {
            try {
                JSArray salida = new JSArray();
                for (GmsDocumentScanningResult.Page pagina : paginas) {
                    salida.put(Base64.encodeToString(jpeg(pagina.getImageUri()), Base64.NO_WRAP));
                }
                JSObject r = new JSObject();
                r.put("paginas", salida);
                terminar(r, null, null);
            } catch (Exception e) {
                terminar(null, "No se ha podido leer el documento escaneado", "error");
            }
        });
    }

    // Resuelve (si hay datos) o rechaza la llamada pendiente y la libera, para admitir otro escaneo.
    private void terminar(JSObject datos, String mensaje, String codigo) {
        PluginCall pendiente;
        synchronized (this) {
            pendiente = llamada;
            llamada = null;
        }
        if (pendiente == null) return;
        if (datos != null) pendiente.resolve(datos);
        else pendiente.reject(mensaje, codigo);
    }

    // Lee la imagen, la endereza según su EXIF, la reduce a LADO_MAXIMO y la codifica en JPEG.
    private byte[] jpeg(Uri uri) throws IOException {
        ContentResolver cr = getContext().getContentResolver();
        BitmapFactory.Options medidas = new BitmapFactory.Options();
        medidas.inJustDecodeBounds = true;
        try (InputStream in = cr.openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, medidas);
        }
        int lado = Math.max(medidas.outWidth, medidas.outHeight);
        if (lado <= 0) throw new IOException("Imagen no válida");
        // Se decodifica ya a media resolución cuantas veces haga falta sin quedarse por debajo del máximo.
        BitmapFactory.Options opciones = new BitmapFactory.Options();
        opciones.inSampleSize = 1;
        while (lado / (opciones.inSampleSize * 2) >= LADO_MAXIMO) opciones.inSampleSize *= 2;
        Bitmap imagen;
        try (InputStream in = cr.openInputStream(uri)) {
            imagen = BitmapFactory.decodeStream(in, null, opciones);
        }
        if (imagen == null) throw new IOException("No se pudo decodificar la imagen");

        Matrix matriz = new Matrix();
        int ladoActual = Math.max(imagen.getWidth(), imagen.getHeight());
        if (ladoActual > LADO_MAXIMO) {
            float escala = (float) LADO_MAXIMO / ladoActual;
            matriz.postScale(escala, escala);
        }
        matriz.postRotate(giroExif(uri));
        Bitmap redimensionada = Bitmap.createBitmap(imagen, 0, 0, imagen.getWidth(), imagen.getHeight(), matriz, true);
        if (redimensionada != imagen) imagen.recycle();

        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        redimensionada.compress(Bitmap.CompressFormat.JPEG, CALIDAD_JPEG, salida);
        redimensionada.recycle();
        return salida.toByteArray();
    }

    // Grados que hay que girar la imagen según su orientación EXIF (0 si no la tiene).
    private int giroExif(Uri uri) {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) return 0;
            int orientacion = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            switch (orientacion) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    return 90;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    return 180;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    return 270;
                default:
                    return 0;
            }
        } catch (IOException e) {
            return 0;
        }
    }
}
