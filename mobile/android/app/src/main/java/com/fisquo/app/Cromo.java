package com.fisquo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Message;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebView;
import android.widget.EditText;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * El WebChromeClient de Capacitor (cámara y archivos del <input type="file">, permisos…) con dos cambios:
 * - alert, confirm y prompt en el idioma del móvil: los de Capacitor dicen «OK» y «Cancel»;
 * - las ventanas nuevas (target="_blank", window.open) en un visor dentro de la app (VisorWeb.java), como en iOS.
 */
final class Cromo extends BridgeWebChromeClient {

    private final Bridge bridge;
    private final Activity actividad;

    Cromo(Bridge bridge, Activity actividad) {
        super(bridge);
        this.bridge = bridge;
        this.actividad = actividad;
    }

    @Override
    public boolean onCreateWindow(WebView vista, boolean dialogo, boolean gesto, Message resultado) {
        VisorWeb visor = new VisorWeb(actividad, bridge);
        ((WebView.WebViewTransport) resultado.obj).setWebView(visor.web);
        resultado.sendToTarget();
        return true;
    }

    @Override
    public boolean onJsAlert(WebView vista, String url, String mensaje, JsResult resultado) {
        if (actividad.isFinishing()) return true;
        new AlertDialog.Builder(vista.getContext())
            .setMessage(mensaje)
            .setPositiveButton(R.string.aceptar, (d, i) -> resultado.confirm())
            .setOnCancelListener((d) -> resultado.cancel())
            .show();
        return true;
    }

    @Override
    public boolean onJsConfirm(WebView vista, String url, String mensaje, JsResult resultado) {
        if (actividad.isFinishing()) return true;
        new AlertDialog.Builder(vista.getContext())
            .setMessage(mensaje)
            .setNegativeButton(R.string.cancelar, (d, i) -> resultado.cancel())
            .setPositiveButton(R.string.aceptar, (d, i) -> resultado.confirm())
            .setOnCancelListener((d) -> resultado.cancel())
            .show();
        return true;
    }

    @Override
    public boolean onJsPrompt(WebView vista, String url, String mensaje, String porDefecto, JsPromptResult resultado) {
        if (actividad.isFinishing()) return true;
        EditText campo = new EditText(vista.getContext());
        if (porDefecto != null) campo.setText(porDefecto);
        new AlertDialog.Builder(vista.getContext())
            .setMessage(mensaje)
            .setView(campo)
            .setNegativeButton(R.string.cancelar, (d, i) -> resultado.cancel())
            .setPositiveButton(R.string.aceptar, (d, i) -> resultado.confirm(campo.getText().toString()))
            .setOnCancelListener((d) -> resultado.cancel())
            .show();
        return true;
    }
}
