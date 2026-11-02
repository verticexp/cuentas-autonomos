package com.fisquo.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Notificaciones nativas para los avisos de Fisquo (plazos de Hacienda, facturas vencidas, mensajes de la gestoría…) con
 * Firebase Cloud Messaging (lib/fcm.js en el servidor). El mismo contrato que AvisosPlugin.swift, desde
 * window.Capacitor.Plugins.Avisos (lib/avisosNativos.js):
 * estado() → { permiso: concedido | denegado | sin-preguntar | no-disponible } · activar() pide permiso (Android 13 o
 * posterior) y devuelve { token } · token() lo renueva sin preguntar. «no-disponible»: la app se compiló sin
 * google-services.json (sin Firebase no hay avisos). Al tocar un aviso se abre su página (MainActivity, extra «url»).
 */
@CapacitorPlugin(name = "Avisos", permissions = { @Permission(alias = "avisos", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class AvisosPlugin extends Plugin {

    static final String CANAL = "avisos";
    private static final String PREFS = "fisquo-avisos";

    // El canal de los avisos (Android 8 o posterior); lib/fcm.js manda sus avisos a este.
    static void crearCanal(Context contexto) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel canal = new NotificationChannel(CANAL, contexto.getString(R.string.canal_avisos), NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription(contexto.getString(R.string.canal_avisos_desc));
        canal.setShowBadge(true);
        contexto.getSystemService(NotificationManager.class).createNotificationChannel(canal);
    }

    private boolean firebaseListo() {
        return !FirebaseApp.getApps(getContext()).isEmpty();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean permitido() {
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    @PluginMethod
    public void estado(PluginCall call) {
        String permiso;
        if (!firebaseListo()) permiso = "no-disponible";
        else if (permitido()) permiso = "concedido";
        else if (Build.VERSION.SDK_INT >= 33 && !prefs().getBoolean("preguntado", false)) permiso = "sin-preguntar";
        else permiso = "denegado";
        JSObject r = new JSObject();
        r.put("permiso", permiso);
        call.resolve(r);
    }

    @PluginMethod
    public void activar(PluginCall call) {
        if (!firebaseListo()) {
            call.reject("Los avisos no están disponibles en esta versión", "no-disponible");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("avisos") != PermissionState.GRANTED) {
            prefs().edit().putBoolean("preguntado", true).apply();
            requestPermissionForAlias("avisos", call, "trasPermiso");
            return;
        }
        if (!permitido()) {
            call.reject("denegado", "denegado");
            return;
        }
        registrar(call);
    }

    @PermissionCallback
    private void trasPermiso(PluginCall call) {
        if (getPermissionState("avisos") == PermissionState.GRANTED && permitido()) registrar(call);
        else call.reject("denegado", "denegado");
    }

    @PluginMethod
    public void token(PluginCall call) {
        if (!firebaseListo() || !permitido()) {
            call.reject("sin permiso", "denegado");
            return;
        }
        registrar(call);
    }

    private void registrar(PluginCall call) {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener((tarea) -> {
            if (tarea.isSuccessful() && tarea.getResult() != null) {
                JSObject r = new JSObject();
                r.put("token", tarea.getResult());
                call.resolve(r);
            } else {
                call.reject("No se ha podido registrar el móvil para los avisos", "error");
            }
        });
    }
}
