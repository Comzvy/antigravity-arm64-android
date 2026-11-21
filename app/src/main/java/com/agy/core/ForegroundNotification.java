package com.agy.core;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.os.Build;

/**
 * Builds, pins, and updates the persistent foreground service notification
 * with a direct Stop action and non-dismissible flags while active.
 */
public final class ForegroundNotification {

    public static final int NOTIFICATION_ID = 1001;
    public static final String CHANNEL_ID = "core_channel";
    private static final int REQ_OPEN_APP = 1001;
    private static final int REQ_STOP_APP = 1002;
    private static final int REQ_REPOST = 1003;

    private static volatile String currentStatus = "Core running";

    private ForegroundNotification() {
    }

    public static void start(Service service) {
        start(service, currentStatus);
    }

    public static void start(Service service, String status) {
        currentStatus = (status == null || status.isEmpty()) ? "Core running" : status;
        NotificationManager manager =
                (NotificationManager) service.getSystemService(Service.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Core", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }
        Notification notification = build(service, currentStatus);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            service.startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            service.startForeground(NOTIFICATION_ID, notification);
        }
    }

    public static void update(Service service, String status) {
        currentStatus = (status == null || status.isEmpty()) ? "Core running" : status;
        NotificationManager manager =
                (NotificationManager) service.getSystemService(Service.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, build(service, currentStatus));
        }
    }

    public static void repostIfActive(Service service) {
        start(service, currentStatus);
    }

    public static void cancel(Service service) {
        try {
            service.stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) {
        }
        try {
            NotificationManager manager =
                    (NotificationManager) service.getSystemService(Service.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.cancel(NOTIFICATION_ID);
            }
        } catch (Exception ignored) {
        }
    }

    private static Notification build(Service service, String status) {
        int icon = service.getResources().getIdentifier(
                "ic_notification", "drawable", service.getPackageName());
        if (icon == 0) {
            icon = android.R.drawable.stat_notify_sync;
        }

        Intent launchIntent = service.getPackageManager().getLaunchIntentForPackage(service.getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent(service, com.agy.ui.MainActivity.class);
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
                service,
                REQ_OPEN_APP,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent stopIntent = new Intent(service, CoreServerService.class);
        stopIntent.setAction(CoreServerService.ACTION_STOP_APP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
                service,
                REQ_STOP_APP,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        int stopIconRes = service.getResources().getIdentifier(
                "ic_notification_stop", "drawable", service.getPackageName());
        Icon stopIcon = stopIconRes != 0
                ? Icon.createWithResource(service, stopIconRes)
                : Icon.createWithResource("android", android.R.drawable.ic_menu_close_clear_cancel);
        Notification.Action stopAction = new Notification.Action.Builder(
                stopIcon, "Stop", stopPendingIntent).build();

        Intent repostIntent = new Intent(service, CoreServerService.class);
        repostIntent.setAction(CoreServerService.ACTION_REPOST_NOTIFICATION);
        PendingIntent repostPendingIntent = PendingIntent.getService(
                service,
                REQ_REPOST,
                repostIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(service, CHANNEL_ID)
                : new Notification.Builder(service);
        builder.setContentTitle(com.agy.BuildConfig.APP_NAME)
                .setContentText(status)
                .setSmallIcon(icon)
                .setContentIntent(contentPendingIntent)
                .setDeleteIntent(repostPendingIntent)
                .addAction(stopAction)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setVisibility(Notification.VISIBILITY_PUBLIC);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        }

        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_ONGOING_EVENT | Notification.FLAG_NO_CLEAR;
        return notification;
    }
}
