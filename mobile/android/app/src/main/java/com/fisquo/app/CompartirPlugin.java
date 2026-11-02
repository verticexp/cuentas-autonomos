package com.fisquo.app;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.core.content.IntentCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * «Compartir» → Fisquo desde otras apps (Gmail, Archivos, la galería…): AndroidManifest.xml declara los PDF, fotos y XML,
 * Android abre la app con el archivo y MainActivity lo deja aquí. La app va a Por revisar con ?compartido=1 y la web lo
 * recoge con pendientes() (lib/compartidoCliente.js), que lo sube con la sesión normal. Como CompartirPlugin.swift:
 * pendientes() → { archivos: [{ nombre, tipo, datos (base64) }] }; subidos() vacía la lista cuando la web los ha subido
 * (si estaba bloqueada, siguen aquí y se suben tras desbloquear).
 */
@CapacitorPlugin(name = "Compartir")
public class CompartirPlugin extends Plugin {

    private static final int MAXIMO = 5 * 1024 * 1024;
    private static final List<JSObject> cola = new ArrayList<>();

    static synchronized boolean hayPendientes() {
        return !cola.isEmpty();
    }

    // Archivos de un «Compartir» o un «Abrir con» → true si alguno se puede subir. Solo content:// (nunca un file:// que
    // apunte a los archivos de la propia app); los que pasan de 5 MB o no se leen se quedan fuera.
    static boolean recibir(Context contexto, Intent intent) {
        String accion = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_SEND.equals(accion) && !Intent.ACTION_SEND_MULTIPLE.equals(accion) && !Intent.ACTION_VIEW.equals(accion)) return false;
        Set<Uri> uris = new LinkedHashSet<>();
        if (Intent.ACTION_VIEW.equals(accion) && intent.getData() != null) uris.add(intent.getData());
        Uri uno = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
        if (uno != null) uris.add(uno);
        ArrayList<Uri> varios = Intent.ACTION_SEND_MULTIPLE.equals(accion) ? IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri.class) : null;
        if (varios != null) uris.addAll(varios);
        ClipData clip = intent.getClipData();
        if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) if (clip.getItemAt(i).getUri() != null) uris.add(clip.getItemAt(i).getUri());
        boolean alguno = false;
        ContentResolver cr = contexto.getContentResolver();
        for (Uri uri : uris) {
            if (!ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) continue;
            if (uri.getAuthority() != null && uri.getAuthority().startsWith(contexto.getPackageName())) continue; // los de la propia app, no
            try {
                byte[] datos = leer(cr, uri);
                if (datos == null || datos.length == 0) continue;
                String tipo = cr.getType(uri);
                JSObject archivo = new JSObject();
                archivo.put("nombre", nombre(cr, uri));
                archivo.put("tipo", tipo != null ? tipo : intent.getType() != null ? intent.getType() : "application/octet-stream");
                archivo.put("datos", Base64.encodeToString(datos, Base64.NO_WRAP));
                synchronized (CompartirPlugin.class) {
                    cola.add(archivo);
                }
                alguno = true;
            } catch (Exception ignorada) {
                // Uno que no se puede leer no impide los demás.
            }
        }
        return alguno;
    }

    private static byte[] leer(ContentResolver cr, Uri uri) throws Exception {
        try (InputStream in = cr.openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream salida = new ByteArrayOutputStream();
            byte[] trozo = new byte[16384];
            int n;
            while ((n = in.read(trozo)) > 0) {
                salida.write(trozo, 0, n);
                if (salida.size() > MAXIMO) return null;
            }
            return salida.toByteArray();
        }
    }

    private static String nombre(ContentResolver cr, Uri uri) {
        try (Cursor c = cr.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        } catch (Exception ignorada) {
            // Sin nombre, el de la ruta.
        }
        String ultimo = uri.getLastPathSegment();
        return ultimo != null ? ultimo : "archivo";
    }

    @PluginMethod
    public void pendientes(PluginCall call) {
        JSArray archivos = new JSArray();
        synchronized (CompartirPlugin.class) {
            for (JSObject a : cola) archivos.put(a);
        }
        JSObject r = new JSObject();
        r.put("archivos", archivos);
        call.resolve(r);
    }

    @PluginMethod
    public void subidos(PluginCall call) {
        synchronized (CompartirPlugin.class) {
            cola.clear();
        }
        call.resolve();
    }
}
