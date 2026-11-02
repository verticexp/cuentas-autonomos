package com.fisquo.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

/**
 * Descargas de la web (<a download>, ficheros adjuntos, exportaciones, los PDF que el WebView de Android no sabe enseñar):
 * se bajan con la sesión de la app (sus cookies), se guardan en Descargas y se abren con la app que los enseñe. Sin esto el
 * botón no hacía nada. Lo de un blob: (un PDF o un ZIP hechos en el navegador) solo lo puede leer la página: se le pide que
 * lo mande en base64 a NavegadorPlugin.guardarDescarga.
 */
final class Descargas implements DownloadListener {

    private static final int MAXIMO = 60 * 1024 * 1024;

    // El nombre de un <a download> con un blob: no llega al DownloadListener (y el enlace suele quitarse justo después de
    // pulsarlo): la página apunta aquí cada nombre al pulsar, también con a.click() desde el código. MainActivity lo pone en
    // cada página cargada.
    static final String APUNTAR_NOMBRES =
        "(() => { if (window.__fisquoNombres) return; const n = window.__fisquoNombres = {};" +
        " const apuntar = (a) => { if (a && a.download && a.href) n[a.href] = a.download; };" +
        " const click = HTMLAnchorElement.prototype.click;" +
        " HTMLAnchorElement.prototype.click = function () { apuntar(this); return click.call(this); };" +
        " document.addEventListener('click', (e) => apuntar(e.target.closest && e.target.closest('a[download]')), true); })();";
    private final Activity actividad;
    private final WebView web;
    private final Runnable alTerminar;

    // alTerminar: lo que hacer después (el visor de ventanas nuevas se cierra si no llegó a enseñar nada).
    Descargas(Activity actividad, WebView web, Runnable alTerminar) {
        this.actividad = actividad;
        this.web = web;
        this.alTerminar = alTerminar;
    }

    @Override
    public void onDownloadStart(String url, String agente, String disposicion, String tipo, long longitud) {
        String nombre = URLUtil.guessFileName(url, disposicion, tipo);
        if (url.startsWith("blob:")) {
            String js =
                "(async () => { try { const r = await fetch(" + JSONObject.quote(url) + "); const b = await r.blob();" +
                " const d = await new Promise((ok, mal) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(',')[1] || '');" +
                " f.onerror = mal; f.readAsDataURL(b); });" +
                 " const nombre = (window.__fisquoNombres || {})[" + JSONObject.quote(url) + "] || " + JSONObject.quote(nombre) + ";" +
                " await window.Capacitor.Plugins.Navegador.guardarDescarga({ nombre, tipo: b.type || " +
                JSONObject.quote(tipo == null ? "" : tipo) + ", datos: d });" +
                " } catch (e) { alert(" + JSONObject.quote(actividad.getString(R.string.descarga_fallida)) + "); } })();";
            web.evaluateJavascript(js, null);
            terminar();
            return;
        }
        if (url.startsWith("data:")) {
            int coma = url.indexOf(',');
            if (coma > 0 && url.substring(0, coma).endsWith(";base64")) {
                guardar(actividad, android.util.Base64.decode(url.substring(coma + 1), android.util.Base64.DEFAULT), nombre, tipo);
            }
            terminar();
            return;
        }
        Toast.makeText(actividad, R.string.descargando, Toast.LENGTH_SHORT).show();
        String cookies = CookieManager.getInstance().getCookie(url);
        new Thread(() -> {
            HttpURLConnection conexion = null;
            try {
                conexion = (HttpURLConnection) new URL(url).openConnection();
                conexion.setConnectTimeout(15000);
                conexion.setReadTimeout(60000);
                if (cookies != null) conexion.setRequestProperty("Cookie", cookies);
                if (agente != null) conexion.setRequestProperty("User-Agent", agente);
                if (conexion.getResponseCode() / 100 != 2) throw new IllegalStateException("HTTP " + conexion.getResponseCode());
                String tipoReal = conexion.getContentType() != null ? conexion.getContentType().split(";")[0].trim() : tipo;
                String disposicionReal = conexion.getHeaderField("Content-Disposition");
                String nombreReal = URLUtil.guessFileName(url, disposicionReal != null ? disposicionReal : disposicion, tipoReal);
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream in = conexion.getInputStream()) {
                    byte[] trozo = new byte[16384];
                    int n;
                    while ((n = in.read(trozo)) > 0) {
                        bytes.write(trozo, 0, n);
                        if (bytes.size() > MAXIMO) throw new IllegalStateException("Demasiado grande");
                    }
                }
                guardar(actividad, bytes.toByteArray(), nombreReal, tipoReal);
            } catch (Exception e) {
                actividad.runOnUiThread(() -> Toast.makeText(actividad, R.string.descarga_fallida, Toast.LENGTH_LONG).show());
            } finally {
                if (conexion != null) conexion.disconnect();
                actividad.runOnUiThread(this::terminar);
            }
        }).start();
    }

    private void terminar() {
        if (alTerminar != null) alTerminar.run();
    }

    // Lo deja en Descargas (en Android 9 o anterior, en la carpeta de la app) y lo abre con la app que lo enseñe.
    static void guardar(Activity actividad, byte[] datos, String nombre, String tipo) {
        if (actividad == null) return;
        String mime = tipo == null || tipo.isEmpty() ? "application/octet-stream" : tipo;
        Uri uri;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver cr = actividad.getContentResolver();
                ContentValues valores = new ContentValues();
                valores.put(MediaStore.Downloads.DISPLAY_NAME, nombre);
                valores.put(MediaStore.Downloads.MIME_TYPE, mime);
                valores.put(MediaStore.Downloads.IS_PENDING, 1);
                uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores);
                if (uri == null) throw new IllegalStateException("Sin destino");
                try (OutputStream out = cr.openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("Sin destino");
                    out.write(datos);
                }
                valores.clear();
                valores.put(MediaStore.Downloads.IS_PENDING, 0);
                cr.update(uri, valores, null, null);
            } else {
                File carpeta = actividad.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                File archivo = new File(carpeta, nombre);
                try (OutputStream out = new FileOutputStream(archivo)) {
                    out.write(datos);
                }
                uri = FileProvider.getUriForFile(actividad, actividad.getPackageName() + ".fileprovider", archivo);
            }
        } catch (Exception e) {
            actividad.runOnUiThread(() -> Toast.makeText(actividad, R.string.descarga_fallida, Toast.LENGTH_LONG).show());
            return;
        }
        Uri destino = uri;
        actividad.runOnUiThread(() -> {
            Toast.makeText(actividad, actividad.getString(R.string.descargado, nombre), Toast.LENGTH_SHORT).show();
            Intent abrir = new Intent(Intent.ACTION_VIEW).setDataAndType(destino, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                actividad.startActivity(abrir);
            } catch (ActivityNotFoundException ignorada) {
                // Sin una app que lo abra, se queda en Descargas.
            }
        });
    }
}
