package ai.activemirror.chetana

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class NotificationWatcherService : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val pkg = sbn.packageName ?: ""

        val combined = "$title $text".lowercase()
        val risky = listOf("kyc", ".apk", "otp", "upi pin", "anydesk", "screen share", "challan", "refund")
            .any { combined.contains(it) }

        if (risky) {
            Log.w("ChetanaRisk", "Risky notification from $pkg: $combined")
            // V1: write a local event and show a Chetana notification.
            // Do not upload notification contents without explicit consent.
        }
    }
}
