package com.fisquo.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Huella o cara nativa en la app de Android, como en la app de un banco. Es el equivalente de BiometriaPlugin.swift:
 * al activarlo, el servidor da una credencial de este móvil (app/api/dispositivo) que se guarda cifrada con una clave
 * AES-256 GCM del Android Keystore que solo se puede usar tras una huella o cara (BIOMETRIC_STRONG, una autenticación
 * por cada uso) y que deja de valer si cambian las huellas o caras registradas. Para entrar, leerla muestra el
 * BiometricPrompt del sistema, sin la hoja de las llaves de acceso de la web.
 * Desde la web: window.Capacitor.Plugins.Biometria (lib/faceidNativo.js).
 *
 * disponible() → { disponible, tipo: 'huella' | 'cara' | 'biometria' | 'ninguno' }
 * tiene() → { tiene }  (sin pedir nada: hay credencial guardada y su clave sigue en el Keystore)
 * guardar({ valor })   (pide la huella o cara para cifrar; falla con «cancelado» o «error»)
 * leer({ motivo }) → { valor }  (falla con «cancelado», «sin-credencial» o «error»)
 * borrar()
 *
 * El texto cifrado y el IV van en SharedPreferences privadas ("fisquo-biometria"), que no deben entrar en la copia de
 * seguridad: la clave del Keystore no sale del móvil y, en otro, el texto no serviría de nada (res/xml/copia_*.xml).
 */
@CapacitorPlugin(name = "Biometria")
public class BiometriaPlugin extends Plugin {
    private static final String ALMACEN = "AndroidKeyStore";
    private static final String ALIAS = "fisquo-biometria";
    private static final String PREFS = "fisquo-biometria";
    private static final String PREF_CIFRADO = "cifrado";
    private static final String PREF_IV = "iv";
    private static final String TRANSFORMACION = "AES/GCM/NoPadding";
    private static final int ETIQUETA_BITS = 128;
    private static final int AUTENTICADORES = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    // Solo un aviso del sistema a la vez; se libera en cuanto el aviso termina de un modo u otro.
    private boolean enCurso = false;

    /** Qué hacer cuando el aviso del sistema termina. */
    private interface Resultado {
        void exito(Cipher cifrador);

        void fallo(boolean cancelado, String mensaje);
    }

    @PluginMethod
    public void disponible(PluginCall call) {
        boolean ok = BiometricManager.from(getContext()).canAuthenticate(AUTENTICADORES) == BiometricManager.BIOMETRIC_SUCCESS;
        PackageManager pm = getContext().getPackageManager();
        String tipo = "ninguno";
        if (ok) {
            if (pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT)) tipo = "huella";
            else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm.hasSystemFeature(PackageManager.FEATURE_FACE)) tipo = "cara";
            else tipo = "biometria";
        }
        JSObject r = new JSObject();
        r.put("disponible", ok);
        r.put("tipo", tipo);
        call.resolve(r);
    }

    // Sin pedir nada: existe el texto cifrado guardado y la clave del Keystore.
    @PluginMethod
    public void tiene(PluginCall call) {
        boolean tiene = false;
        try {
            SharedPreferences p = prefs();
            tiene = p.contains(PREF_CIFRADO) && p.contains(PREF_IV) && almacen().containsAlias(ALIAS);
        } catch (Exception ignorada) {
            // Si el Keystore falla, es como si no hubiera nada.
        }
        JSObject r = new JSObject();
        r.put("tiene", tiene);
        call.resolve(r);
    }

    @PluginMethod
    public void guardar(PluginCall call) {
        String valor = call.getString("valor");
        if (valor == null || valor.isEmpty()) {
            call.reject("Falta la credencial", "error");
            return;
        }
        if (!ocupar(call)) return;
        Cipher cifrador;
        try {
            borrarTodo();
            cifrador = cifradorNuevo();
        } catch (Exception e) {
            // Sin bloqueo de pantalla o sin huellas registradas el Keystore no deja crear la clave.
            borrarTodo();
            liberar();
            call.reject("Este móvil no permite guardar con huella o cara", "error", e);
            return;
        }
        pedir("Activar el desbloqueo", cifrador, new Resultado() {
            @Override
            public void exito(Cipher c) {
                try {
                    byte[] cifrado = c.doFinal(valor.getBytes(StandardCharsets.UTF_8));
                    boolean guardado = prefs()
                        .edit()
                        .putString(PREF_CIFRADO, Base64.encodeToString(cifrado, Base64.NO_WRAP))
                        .putString(PREF_IV, Base64.encodeToString(c.getIV(), Base64.NO_WRAP))
                        .commit();
                    if (!guardado) throw new IllegalStateException("No se pudo escribir");
                    liberar();
                    call.resolve();
                } catch (Exception e) {
                    borrarTodo();
                    liberar();
                    call.reject("No se ha podido guardar la credencial", "error", e);
                }
            }

            @Override
            public void fallo(boolean cancelado, String mensaje) {
                // Si no se completa, no se deja a medias una clave sin credencial.
                borrarTodo();
                liberar();
                if (cancelado) call.reject("cancelado", "cancelado");
                else call.reject(mensaje, "error");
            }
        });
    }

    @PluginMethod
    public void leer(PluginCall call) {
        String motivo = call.getString("motivo", "Entrar en Fisquo");
        if (!ocupar(call)) return;
        SharedPreferences p = prefs();
        String cifradoB64 = p.getString(PREF_CIFRADO, null);
        String ivB64 = p.getString(PREF_IV, null);
        if (cifradoB64 == null || ivB64 == null) {
            liberar();
            call.reject("No hay desbloqueo con huella o cara activado en este móvil", "sin-credencial");
            return;
        }
        Cipher cifrador;
        try {
            Key clave = almacen().getKey(ALIAS, null);
            if (clave == null) {
                // Por ejemplo, tras restaurar los datos en otro móvil: el texto está pero la clave no.
                borrarTodo();
                liberar();
                call.reject("No hay desbloqueo con huella o cara activado en este móvil", "sin-credencial");
                return;
            }
            cifrador = Cipher.getInstance(TRANSFORMACION);
            cifrador.init(Cipher.DECRYPT_MODE, clave, new GCMParameterSpec(ETIQUETA_BITS, Base64.decode(ivB64, Base64.NO_WRAP)));
        } catch (KeyPermanentlyInvalidatedException e) {
            // Cambiaron las huellas o caras registradas: la credencial ya no vale.
            borrarTodo();
            liberar();
            call.reject("Las huellas o caras del móvil han cambiado", "sin-credencial");
            return;
        } catch (Exception e) {
            liberar();
            call.reject("No se ha podido usar la huella o cara", "error", e);
            return;
        }
        pedir(motivo, cifrador, new Resultado() {
            @Override
            public void exito(Cipher c) {
                try {
                    byte[] plano = c.doFinal(Base64.decode(cifradoB64, Base64.NO_WRAP));
                    JSObject r = new JSObject();
                    r.put("valor", new String(plano, StandardCharsets.UTF_8));
                    liberar();
                    call.resolve(r);
                } catch (Exception e) {
                    liberar();
                    call.reject("Credencial no válida", "error", e);
                }
            }

            @Override
            public void fallo(boolean cancelado, String mensaje) {
                liberar();
                if (cancelado) call.reject("cancelado", "cancelado");
                else call.reject(mensaje, "error");
            }
        });
    }

    @PluginMethod
    public void borrar(PluginCall call) {
        borrarTodo();
        call.resolve();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private KeyStore almacen() throws Exception {
        KeyStore ks = KeyStore.getInstance(ALMACEN);
        ks.load(null);
        return ks;
    }

    // Quita la clave y el texto cifrado. Nunca falla: lo que no se pueda borrar ya no existe.
    private void borrarTodo() {
        try {
            KeyStore ks = almacen();
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
        } catch (Exception ignorada) {
            // Sin Keystore no hay clave que borrar.
        }
        prefs().edit().clear().commit();
    }

    // Clave nueva (AES-256 GCM, solo tras huella o cara) y el cifrador listo para el CryptoObject. El IV lo pone el Keystore.
    private Cipher cifradorNuevo() throws Exception {
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
            ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        // Desde Android 11, autenticación en cada uso y solo con biometría fuerte. Antes, "cada uso" ya es el valor por defecto.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }
        KeyGenerator generador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ALMACEN);
        generador.init(spec.build());
        Key clave = generador.generateKey();
        Cipher cifrador = Cipher.getInstance(TRANSFORMACION);
        cifrador.init(Cipher.ENCRYPT_MODE, clave);
        return cifrador;
    }

    // Reserva el único aviso posible; si ya hay uno, rechaza la llamada.
    private synchronized boolean ocupar(PluginCall call) {
        if (enCurso) {
            call.reject("Ya hay una verificación en curso", "error");
            return false;
        }
        enCurso = true;
        return true;
    }

    private synchronized void liberar() {
        enCurso = false;
    }

    // Enseña el BiometricPrompt del sistema (en el hilo principal) atado al cifrador: solo tras la huella o cara se puede usar.
    private void pedir(String titulo, Cipher cifrador, Resultado resultado) {
        FragmentActivity actividad = getActivity();
        if (actividad == null) {
            resultado.fallo(false, "No hay pantalla para pedir la huella o cara");
            return;
        }
        actividad.runOnUiThread(() -> {
            try {
                BiometricPrompt.AuthenticationCallback respuesta = new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                        BiometricPrompt.CryptoObject objeto = r.getCryptoObject();
                        if (objeto == null || objeto.getCipher() == null) resultado.fallo(false, "No se ha podido usar la huella o cara");
                        else resultado.exito(objeto.getCipher());
                    }

                    @Override
                    public void onAuthenticationError(int codigo, CharSequence mensaje) {
                        boolean cancelado =
                            codigo == BiometricPrompt.ERROR_USER_CANCELED ||
                            codigo == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                            codigo == BiometricPrompt.ERROR_CANCELED;
                        resultado.fallo(cancelado, mensaje == null ? "No se ha podido usar la huella o cara" : mensaje.toString());
                    }
                    // onAuthenticationFailed (huella no reconocida) no se trata: el sistema deja reintentar.
                };
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(titulo)
                    .setNegativeButtonText("Cancelar")
                    .setAllowedAuthenticators(AUTENTICADORES)
                    .build();
                new BiometricPrompt(actividad, ContextCompat.getMainExecutor(actividad), respuesta)
                    .authenticate(info, new BiometricPrompt.CryptoObject(cifrador));
            } catch (Exception e) {
                resultado.fallo(false, "No se ha podido mostrar la huella o cara");
            }
        });
    }
}
