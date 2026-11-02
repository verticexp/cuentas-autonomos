package com.fisquo.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.net.Uri;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.Bridge;

/**
 * Lo que Fisquo abre en una ventana nueva (target="_blank": un justificante, una factura) en una hoja a pantalla completa
 * con «Cerrar», con la misma sesión (las cookies son las mismas en todos los WebView de la app). Como VisorWeb.swift.
 * Si lo que se abre es de otra web, va a una pestaña de Chrome; si es una descarga (un PDF), la baja Descargas.java y la
 * hoja se cierra sola.
 */
final class VisorWeb extends Dialog {

    final WebView web;
    private boolean mostrada = false;

    @SuppressLint("SetJavaScriptEnabled")
    VisorWeb(Activity actividad, Bridge bridge) {
        super(actividad, android.R.style.Theme_DeviceDefault_Light_NoActionBar);
        web = new WebView(actividad);
        WebSettings ajustes = web.getSettings();
        WebSettings principal = bridge.getWebView().getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);
        // El mismo user agent: el servidor sigue sabiendo que es la app (lib/app.js).
        ajustes.setUserAgentString(principal.getUserAgentString());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView vista, WebResourceRequest peticion) {
                Uri url = peticion.getUrl();
                if (NavegadorPlugin.esWeb(url) && NavegadorPlugin.esFisquo(bridge, url)) return false;
                if (NavegadorPlugin.esWeb(url)) NavegadorPlugin.abrirFuera(actividad, url);
                else bridge.launchIntent(url);
                if (vista.getUrl() == null || "about:blank".equals(vista.getUrl())) cerrar();
                return true;
            }

            @Override
            public void onPageCommitVisible(WebView vista, String url) {
                if (!mostrada && !isShowing() && !actividad.isFinishing()) {
                    mostrada = true;
                    show();
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView vista) {
                cerrar();
            }
        });
        web.setDownloadListener(new Descargas(actividad, web, () -> {
            if (!mostrada) cerrar();
        }));

        LinearLayout raiz = new LinearLayout(actividad);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setBackgroundColor(Color.WHITE);
        TextView cerrar = new TextView(actividad);
        cerrar.setText(R.string.cerrar);
        cerrar.setTextColor(NavegadorPlugin.VERDE);
        cerrar.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        cerrar.setGravity(Gravity.CENTER_VERTICAL);
        int margen = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 16, actividad.getResources().getDisplayMetrics());
        int alto = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 52, actividad.getResources().getDisplayMetrics());
        cerrar.setPadding(margen, 0, margen, 0);
        cerrar.setOnClickListener((v) -> cerrar());
        raiz.addView(cerrar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, alto));
        raiz.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        // Por debajo de la barra de estado y por encima de la de navegación.
        ViewCompat.setOnApplyWindowInsetsListener(raiz, (v, insets) -> {
            Insets barras = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(barras.left, barras.top, barras.right, barras.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        setContentView(raiz);
        Window ventana = getWindow();
        if (ventana != null) {
            ventana.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            WindowCompat.setDecorFitsSystemWindows(ventana, false);
            WindowCompat.getInsetsController(ventana, ventana.getDecorView()).setAppearanceLightStatusBars(true);
        }
        setOnDismissListener((d) -> web.destroy());
    }

    void cerrar() {
        if (isShowing()) dismiss();
        else web.destroy();
    }
}
