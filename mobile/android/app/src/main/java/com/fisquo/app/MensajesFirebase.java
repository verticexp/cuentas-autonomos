package com.fisquo.app;

import android.app.PendingIntent;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Avisos que llegan con la app abierta: Firebase solo los enseña solo cuando la app está cerrada o en segundo plano, y
 * en iOS salen arriba igualmente (AvisosPlugin.swift). Mismo canal, misma etiqueta (la conversación: un aviso nuevo de la
 * gestoría sustituye al anterior) y, al tocarlo, su página.
 * El token nuevo no se manda desde aquí: la web lo vuelve a guardar al activar los avisos (lib/avisosNativos.js).
 */
public class MensajesFirebase extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(RemoteMessage mensaje) {
        RemoteMessage.Notification aviso = mensaje.getNotification();
        if (aviso == null || !NotificationManagerCompat.from(this).areNotificationsEnabled()) return;
        Intent abrir = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String url = mensaje.getData().get("url");
        if (url != null) abrir.putExtra("url", url);
        int id = (int) (System.currentTimeMillis() & 0x7fffffff);
        PendingIntent alTocar = PendingIntent.getActivity(this, id, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder n = new NotificationCompat.Builder(this, AvisosPlugin.CANAL)
            .setSmallIcon(R.drawable.ic_aviso)
            .setColor(NavegadorPlugin.VERDE)
            .setContentTitle(aviso.getTitle())
            .setContentText(aviso.getBody())
            .setStyle(new NotificationCompat.BigTextStyle().bigText(aviso.getBody()))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(alTocar);
        if (aviso.getNotificationCount() != null) n.setNumber(aviso.getNotificationCount());
        try {
            NotificationManagerCompat.from(this).notify(aviso.getTag(), aviso.getTag() != null ? 1 : id, n.build());
        } catch (SecurityException ignorada) {
            // Sin permiso de notificaciones no se enseña.
        }
    }
}
