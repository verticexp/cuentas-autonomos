package com.fisquo.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * «Continuar con Google / Apple» en la app de Android, desde window.Capacitor.Plugins.Acceso (lib/accesoNativo.js).
 * Google no deja entrar desde un WebView incrustado: sesionWeb({ url, esquema }) abre la página en una pestaña de Chrome
 * dentro de la app y, al terminar, el servidor vuelve a fisquo://acceso?… (app/api/login/social/vuelta), que Android
 * entrega a MainActivity (AndroidManifest.xml) y llega aquí con handleOnNewIntent → { url }. Si la persona cierra la
 * pestaña sin terminar, la app vuelve a primer plano sin esa dirección y la llamada falla con «cancelado».
 * Apple no tiene hoja nativa en Android: la web usa también sesionWeb (conApple es solo de iOS).
 */
@CapacitorPlugin(name = "Acceso")
public class AccesoPlugin extends Plugin {

    private PluginCall pendiente;
    private String esquema;
    private boolean fuera = false;
    private final Handler hilo = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void sesionWeb(PluginCall call) {
        String texto = call.getString("url");
        String esquemaVuelta = call.getString("esquema");
        Uri url = texto == null ? null : Uri.parse(texto);
        if (url == null || !"https".equalsIgnoreCase(url.getScheme()) || url.getHost() == null || esquemaVuelta == null || esquemaVuelta.isEmpty()) {
            call.reject("Se necesita una URL https y un esquema de retorno", "error");
            return;
        }
        if (pendiente != null) {
            call.reject("Ya hay un acceso en curso", "error");
            return;
        }
        pendiente = call;
        esquema = esquemaVuelta;
        fuera = false;
        getActivity().runOnUiThread(() -> NavegadorPlugin.abrirFuera(getActivity(), url));
    }

    @PluginMethod
    public void conApple(PluginCall call) {
        call.reject("En Android, Apple va por sesionWeb", "no-disponible");
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        Uri datos = intent == null ? null : intent.getData();
        if (pendiente == null || datos == null || !esquema.equalsIgnoreCase(datos.getScheme())) return;
        JSObject r = new JSObject();
        r.put("url", datos.toString());
        PluginCall call = pendiente;
        pendiente = null;
        call.resolve(r);
    }

    @Override
    protected void handleOnPause() {
        if (pendiente != null) fuera = true;
    }

    // De vuelta sin la dirección de retorno: cerró la pestaña. Un momento de margen, por si la dirección llega justo detrás.
    @Override
    protected void handleOnResume() {
        if (pendiente == null || !fuera) return;
        PluginCall esta = pendiente;
        hilo.postDelayed(() -> {
            if (pendiente != esta) return;
            pendiente = null;
            esta.reject("cancelado", "cancelado");
        }, 600);
    }
}
