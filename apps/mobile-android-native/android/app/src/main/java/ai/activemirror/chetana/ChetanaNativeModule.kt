package ai.activemirror.chetana

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import java.io.InputStream
import java.security.MessageDigest

class ChetanaNativeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ChetanaNative"

    @ReactMethod
    fun openNotificationListenerSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("OPEN_SETTINGS_FAILED", e)
        }
    }

    @ReactMethod
    fun getApkInfoFromUri(uriString: String, promise: Promise) {
        try {
            val uri = Uri.parse(uriString)
            val tempFile = kotlin.io.path.createTempFile("chetana-", ".apk").toFile()

            reactContext.contentResolver.openInputStream(uri).use { input ->
                if (input == null) throw IllegalArgumentException("Cannot open URI")
                tempFile.outputStream().use { output -> input.copyTo(output) }
            }

            val pm = reactContext.packageManager
            val pkgInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageArchiveInfo(
                    tempFile.absolutePath,
                    PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong())
                )
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageArchiveInfo(tempFile.absolutePath, PackageManager.GET_PERMISSIONS)
            }

            val map = Arguments.createMap()
            map.putString("sha256", sha256(tempFile.inputStream()))

            if (pkgInfo != null) {
                map.putString("packageName", pkgInfo.packageName)
                map.putString("versionName", pkgInfo.versionName)
                val arr = Arguments.createArray()
                pkgInfo.requestedPermissions?.forEach { arr.pushString(it) }
                map.putArray("permissions", arr)
            } else {
                map.putString("error", "Package metadata unavailable. APK may be malformed or unsupported.")
            }

            tempFile.delete()
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("APK_INFO_FAILED", e)
        }
    }

    private fun sha256(input: InputStream): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(8192)
        var read: Int
        while (input.read(buffer).also { read = it } > 0) {
            digest.update(buffer, 0, read)
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
