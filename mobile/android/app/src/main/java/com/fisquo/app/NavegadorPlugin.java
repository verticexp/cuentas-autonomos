package com.fisquo.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.util.Base64;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.Bridge;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * Enlaces y descargas de la web dentro de la app, lo que en iOS hace DelegadoWeb.swift:
 * - Los enlaces a otras webs (la sede de la AEAT, la de la AEPD) se abren en una pestaña de Chrome dentro de la app,
 *   no en la vista de Fisquo ni fuera de la app. Mailto, tel, WhatsApp… siguen yendo a su app (lo hace Capacitor).
 * - barras({ color }): el color de arriba que ya calcula la web para la barra de estado (components/BarraEstado.js). Con él
 *   la hora y la batería van en blanco o en negro, y es el fondo de las barras del sistema en los WebView anteriores a la
 *   versión 140 (en esos, Capacitor deja la página entre las barras en lugar de debajo).
 * - guardarDescarga({ nombre, tipo, datos }) recibe en base64 lo que la web descarga desde un blob: (Descargas.java lo
 *   pide así porque el DownloadListener de Android no puede leer un blob:).
 */
@CapacitorPlugin(name = "Navegador")
public class NavegadorPlugin extends Plugin {

    static final int VERDE = Color.rgb(0x0F, 0x1F, 0x1B);

    // Los dominios de Fisquo y el del servidor configurado (en local, el ordenador desde el emulador).
    static boolean esFisquo(Bridge bridge, Uri url) {
        String host = url == null ? null : url.getHost();
        if (host == null) return false;
        host = host.toLowerCase(Locale.ROOT);
        if (host.equals("fisquo.com") || host.endsWith(".fisquo.com")) return true;
        Uri servidor = bridge == null ? null : Uri.parse(bridge.getServerUrl() == null ? "" : bridge.getServerUrl());
        return servidor != null && host.equalsIgnoreCase(servidor.getHost());
    }

    static boolean esWeb(Uri url) {
        String esquema = url == null ? null : url.getScheme();
        return "http".equalsIgnoreCase(esquema) || "https".equalsIgnoreCase(esquema);
    }

    // Pestaña de Chrome con el verde de Fisquo; si el móvil no tiene ningún navegador que la dé, el navegador normal.
    static void abrirFuera(Activity actividad, Uri url) {
        if (actividad == null) return;
        try {
            CustomTabColorSchemeParams colores = new CustomTabColorSchemeParams.Builder().setToolbarColor(VERDE).build();
            new CustomTabsIntent.Builder().setDefaultColorSchemeParams(colores).setShowTitle(true).build().launchUrl(actividad, url);
        } catch (ActivityNotFoundException e) {
            try {
                actividad.startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException ignorada) {
                // Sin navegador no hay dónde abrirlo.
            }
        }
    }

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (esWeb(url) && !esFisquo(bridge, url)) {
            abrirFuera(getActivity(), url);
            return true;
        }
        return null;
    }

    @PluginMethod
    public void barras(PluginCall call) {
        int color;
        try {
            color = Color.parseColor(call.getString("color", "#0F1F1B"));
        } catch (IllegalArgumentException e) {
            call.reject("Color no válido", "error");
            return;
        }
        boolean claro = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) > 150;
        getActivity().runOnUiThread(() -> {
            Window ventana = getActivity().getWindow();
            ventana.getDecorView().setBackgroundColor(color);
            WindowInsetsControllerCompat barras = WindowCompat.getInsetsController(ventana, ventana.getDecorView());
            barras.setAppearanceLightStatusBars(claro);
            barras.setAppearanceLightNavigationBars(claro);
            call.resolve();
        });
    }

    @PluginMethod
    public void guardarDescarga(PluginCall call) {
        String datos = call.getString("datos");
        if (datos == null) {
            call.reject("Faltan los datos", "error");
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(datos, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Datos no válidos", "error");
            return;
        }
        Descargas.guardar(getActivity(), bytes, call.getString("nombre", "fisquo"), call.getString("tipo", "application/octet-stream"));
        call.resolve();
    }
}
