package ai.activemirror.chetana

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_PACKAGE_ADDED) {
            val packageName = intent.data?.schemeSpecificPart ?: return
            Log.i("ChetanaInstall", "Package installed: $packageName")
            // V1: notify user to review newly installed app if install source was suspicious.
            // Hard blocking requires device-owner/enterprise policy, not normal consumer mode.
        }
    }
}
