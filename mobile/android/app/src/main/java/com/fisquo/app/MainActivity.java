package com.fisquo.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * La actividad principal: el WebView de Capacitor que carga www.fisquo.com, con lo que una app de Android necesita además
 * (lo mismo que FisquoViewController.swift en iOS):
 * - enlaces a otras webs en una pestaña de Chrome, descargas guardadas en Descargas y ventanas nuevas en un visor con la
 *   misma sesión (NavegadorPlugin, Descargas, Cromo y VisorWeb);
 * - el escáner de documentos para los tickets (EscanerPlugin), la huella para entrar y desbloquear (BiometriaPlugin), el
 *   acceso con Google y Apple (AccesoPlugin), los avisos (AvisosPlugin) y recibir facturas con «Compartir» (CompartirPlugin);
 * - el botón o el gesto de atrás: primero cierra la hoja o el diálogo abiertos (components/GestoAtras.js, fisquoAtras),
 *   después vuelve en el historial de la web y, al principio, deja la app en segundo plano como cualquier otra;
 * - los accesos directos del icono (res/xml/accesos.xml) y tocar un aviso abren su página (extras «ruta» y «url»).
 */
public class MainActivity extends BridgeActivity {

    private String rutaPendiente;
    private boolean cargada = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NavegadorPlugin.class);
        registerPlugin(EscanerPlugin.class);
        registerPlugin(BiometriaPlugin.class);
        registerPlugin(AccesoPlugin.class);
        registerPlugin(AvisosPlugin.class);
        registerPlugin(CompartirPlugin.class);
        super.onCreate(savedInstanceState);

        WebView web = bridge.getWebView();
        WebSettings ajustes = web.getSettings();
        ajustes.setSupportMultipleWindows(true);
        ajustes.setJavaScriptCanOpenWindowsAutomatically(true);
        web.setWebChromeClient(new Cromo(bridge, this));
        web.setDownloadListener(new Descargas(this, web, null));
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView vista) {
                terminoCarga();
            }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                atras();
            }
        });
        AvisosPlugin.crearCanal(this);
        atender(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        atender(intent);
    }

    private void atras() {
        WebView web = bridge.getWebView();
        web.evaluateJavascript("typeof window.fisquoAtras === 'function' && window.fisquoAtras() === true", (valor) -> {
            if ("true".equals(valor)) return;
            if (web.canGoBack()) web.goBack();
            else moveTaskToBack(true);
        });
    }

    // Lo que trae la app al abrirse: un archivo compartido, un aviso tocado o un acceso directo del icono.
    private void atender(Intent intent) {
        if (intent == null) return;
        if (CompartirPlugin.recibir(this, intent)) {
            abrirCompartidos();
            return;
        }
        String ruta = intent.getStringExtra("ruta");
        if (ruta == null) ruta = intent.getStringExtra("url");
        if (ruta != null) abrir(ruta);
    }

    private void terminoCarga() {
        bridge.getWebView().evaluateJavascript(Descargas.APUNTAR_NOMBRES, null);
        if (!cargada) {
            cargada = true;
            if (rutaPendiente != null) {
                String ruta = rutaPendiente;
                rutaPendiente = null;
                abrir(ruta);
                return;
            }
        }
        // Factura compartida sin sesión o con la app bloqueada: tras entrar o desbloquear, a Por revisar a subirla.
        if (CompartirPlugin.hayPendientes()) abrirCompartidos();
    }

    private void abrirCompartidos() {
        String actual = bridge.getWebView().getUrl();
        String ruta = actual == null ? null : Uri.parse(actual).getPath();
        if (cargada && ruta != null) {
            for (String libre : new String[] { "/login", "/bloqueo", "/registro", "/gastos" }) if (ruta.startsWith(libre)) return;
        }
        abrir("/gastos?ver=revisar&compartido=1");
    }

    // Una ruta de Fisquo (empieza por «/», no por «//»). Si la web aún no ha cargado, espera a que lo haga.
    private void abrir(String ruta) {
        // Nunca una dirección de la API: los extras de la actividad los puede poner cualquier app.
        if (!ruta.startsWith("/") || ruta.startsWith("//") || ruta.startsWith("/api/")) return;
        if (!cargada) {
            rutaPendiente = ruta;
            return;
        }
        Uri base = Uri.parse(bridge.getServerUrl());
        bridge.getWebView().loadUrl(base.buildUpon().encodedPath(null).encodedQuery(null).build().toString().replaceAll("/$", "") + ruta);
    }
}
