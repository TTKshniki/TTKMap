package ru.ttk.map.core.network

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import ru.ttk.map.core.model.ApiErrorDetail
import java.io.BufferedInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class TtkApiException(
    val statusCode: Int,
    val detail: ApiErrorDetail?
) : Exception(detail?.message ?: "Ошибка запроса (HTTP $statusCode)") {
    val errorCode: String? get() = detail?.code
    val isVersionConflict: Boolean get() = statusCode == 412 || detail?.code == "VERSION_CONFLICT"
    val isUnauthorized: Boolean get() = statusCode == 401 || detail?.code == "AUTH_REQUIRED"
}

data class HttpResult(
    val statusCode: Int,
    val body: String,
    val etag: String?
)

/**
 * Manages:
 * - Dynamic Server Base URL (default http://10.0.2.2:8000 for Android emulator -> host FastAPI)
 * - Origin header matching backend APP_ORIGIN (default http://127.0.0.1:8000)
 * - Session cookie (`ttk_session`) persistence
 * - CSRF token (`X-CSRF-Token`) matching frontend/src/shared/api.ts
 * - Per-map strong ETag validator store (`"map-{uuid}-v{revision}"`)
 * - 120 MB Disk + Memory LruCache for authorized & public media (`/api/v1/media/{id}/{variant}`)
 */
class TtkNetworkEnvironment(context: Context) {

    companion object {
        const val DEFAULT_SERVER_URL = "https://vibehubik.mooo.com"
        const val DEFAULT_ORIGIN = "https://vibehubik.mooo.com"
    }

    private val prefs = context.getSharedPreferences("ttk_network_prefs", Context.MODE_PRIVATE)
    private val mediaCacheDir = File(context.cacheDir, "ttkmap_media_cache").apply { mkdirs() }

    private val memoryBitmapCache = object : LruCache<String, Bitmap>(24 * 1024) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount / 1024
    }

    private val _serverUrl = MutableStateFlow(
        prefs.getString("server_url", null)?.takeIf { it.isNotBlank() && it != "http://10.0.2.2:8000" } ?: DEFAULT_SERVER_URL
    )
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _originHeader = MutableStateFlow(
        prefs.getString("origin_header", null)?.takeIf { it.isNotBlank() && it != "http://127.0.0.1:8000" } ?: DEFAULT_ORIGIN
    )
    val originHeader: StateFlow<String> = _originHeader.asStateFlow()

    @Volatile
    private var csrfToken: String? = prefs.getString("csrf_token", null)

    @Volatile
    private var sessionCookieValue: String? = prefs.getString("session_cookie", null)

    private val mapEtags = ConcurrentHashMap<String, String>()

    fun setCsrfToken(token: String?) {
        csrfToken = token
        prefs.edit().apply {
            if (token != null) putString("csrf_token", token) else remove("csrf_token")
        }.apply()
    }

    fun clearSession() {
        csrfToken = null
        sessionCookieValue = null
        prefs.edit()
            .remove("csrf_token")
            .remove("session_cookie")
            .apply()
    }

    fun getMapEtag(mapId: String): String? = mapEtags[mapId]

    fun setMapEtag(mapId: String, etag: String?) {
        if (!etag.isNullOrBlank()) {
            mapEtags[mapId] = etag
        }
    }

    fun setServerUrl(url: String) {
        val normalized = url.trim().trimEnd('/').ifEmpty { DEFAULT_SERVER_URL }
        updateConnectionConfig(normalized, normalized)
    }

    fun updateConnectionConfig(newServerUrl: String, newOrigin: String) {
        val normalizedServer = newServerUrl.trim().trimEnd('/').ifEmpty { DEFAULT_SERVER_URL }
        val normalizedOrigin = newOrigin.trim().trimEnd('/').ifEmpty { DEFAULT_ORIGIN }
        _serverUrl.value = normalizedServer
        _originHeader.value = normalizedOrigin
        prefs.edit()
            .putString("server_url", normalizedServer)
            .putString("origin_header", normalizedOrigin)
            .apply()
    }

    fun resolveMediaUrl(relativeOrAbsoluteUrl: String?): String? {
        if (relativeOrAbsoluteUrl.isNullOrBlank()) return null
        if (relativeOrAbsoluteUrl.startsWith("http://") || relativeOrAbsoluteUrl.startsWith("https://")) {
            return relativeOrAbsoluteUrl
        }
        val base = _serverUrl.value.trimEnd('/')
        val path = if (relativeOrAbsoluteUrl.startsWith("/")) relativeOrAbsoluteUrl else "/$relativeOrAbsoluteUrl"
        return "$base$path"
    }

    suspend fun requestJson(
        method: String,
        path: String,
        jsonBody: JSONObject? = null,
        extraHeaders: Map<String, String> = emptyMap()
    ): HttpResult = withContext(Dispatchers.IO) {
        val cleanPath = if (path.startsWith("/")) path else "/$path"
        val url = URL("${_serverUrl.value.trimEnd('/')}$cleanPath")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 12_000
            readTimeout = 25_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Origin", _originHeader.value)

            sessionCookieValue?.takeIf { it.isNotBlank() }?.let { cookie ->
                setRequestProperty("Cookie", "ttk_session=$cookie")
            }

            if (method in listOf("POST", "PUT", "DELETE", "PATCH")) {
                csrfToken?.takeIf { it.isNotBlank() }?.let { token ->
                    setRequestProperty("X-CSRF-Token", token)
                }
            }

            for ((k, v) in extraHeaders) {
                setRequestProperty(k, v)
            }
        }

        try {
            if (jsonBody != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                val bytes = jsonBody.toString().toByteArray(Charsets.UTF_8)
                conn.outputStream.use { it.write(bytes) }
            }

            val code = conn.responseCode
            captureCookies(conn)
            val etag = conn.getHeaderField("ETag")

            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val bodyText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()

            if (code == 204 || code == 304) {
                return@withContext HttpResult(statusCode = code, body = "", etag = etag)
            }
            if (code !in 200..299) {
                throw parseError(code, bodyText)
            }
            HttpResult(statusCode = code, body = bodyText, etag = etag)
        } finally {
            conn.disconnect()
        }
    }

    suspend fun uploadMultipart(
        method: String,
        path: String,
        formFields: Map<String, String> = emptyMap(),
        fileFieldName: String = "file",
        file: File,
        mimeType: String = "image/jpeg"
    ): HttpResult = withContext(Dispatchers.IO) {
        val boundary = "----TTKMapBoundary${UUID.randomUUID().toString().replace("-", "")}"
        val lineEnd = "\r\n"
        val twoHyphens = "--"

        val cleanPath = if (path.startsWith("/")) path else "/$path"
        val url = URL("${_serverUrl.value.trimEnd('/')}$cleanPath")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            doInput = true
            doOutput = true
            useCaches = false
            connectTimeout = 15_000
            readTimeout = 60_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Origin", _originHeader.value)
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")

            sessionCookieValue?.takeIf { it.isNotBlank() }?.let { cookie ->
                setRequestProperty("Cookie", "ttk_session=$cookie")
            }
            csrfToken?.takeIf { it.isNotBlank() }?.let { token ->
                setRequestProperty("X-CSRF-Token", token)
            }
        }

        try {
            DataOutputStream(conn.outputStream).use { dos ->
                for ((name, value) in formFields) {
                    dos.writeBytes(twoHyphens + boundary + lineEnd)
                    dos.writeBytes("Content-Disposition: form-data; name=\"$name\"$lineEnd$lineEnd")
                    dos.write(value.toByteArray(Charsets.UTF_8))
                    dos.writeBytes(lineEnd)
                }

                dos.writeBytes(twoHyphens + boundary + lineEnd)
                dos.writeBytes(
                    "Content-Disposition: form-data; name=\"$fileFieldName\"; filename=\"${file.name}\"$lineEnd"
                )
                dos.writeBytes("Content-Type: $mimeType$lineEnd$lineEnd")

                file.inputStream().use { fis ->
                    val buffer = ByteArray(8192)
                    var read: Int
                    while (fis.read(buffer).also { read = it } != -1) {
                        dos.write(buffer, 0, read)
                    }
                }
                dos.writeBytes(lineEnd)
                dos.writeBytes(twoHyphens + boundary + twoHyphens + lineEnd)
                dos.flush()
            }

            val code = conn.responseCode
            captureCookies(conn)
            val etag = conn.getHeaderField("ETag")
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val bodyText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()

            if (code !in 200..299) {
                throw parseError(code, bodyText)
            }
            HttpResult(statusCode = code, body = bodyText, etag = etag)
        } finally {
            conn.disconnect()
        }
    }

    /**
     * Loads a Bitmap from memory LruCache, 120 MB disk cache, or authenticated HTTP stream.
     */
    suspend fun loadBitmap(urlOrPath: String?): Bitmap? = withContext(Dispatchers.IO) {
        val fullUrl = resolveMediaUrl(urlOrPath) ?: return@withContext null
        memoryBitmapCache.get(fullUrl)?.let { return@withContext it }

        val cacheKey = sha256Hex(fullUrl)
        val cachedFile = File(mediaCacheDir, "$cacheKey.img")
        if (cachedFile.exists() && cachedFile.length() > 0) {
            BitmapFactory.decodeFile(cachedFile.absolutePath)?.let { bmp ->
                memoryBitmapCache.put(fullUrl, bmp)
                return@withContext bmp
            }
        }

        runCatching {
            val conn = (URL(fullUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 10_000
                readTimeout = 20_000
                setRequestProperty("Origin", _originHeader.value)
                sessionCookieValue?.takeIf { it.isNotBlank() }?.let { cookie ->
                    setRequestProperty("Cookie", "ttk_session=$cookie")
                }
            }
            try {
                if (conn.responseCode in 200..299) {
                    BufferedInputStream(conn.inputStream).use { input ->
                        FileOutputStream(cachedFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    BitmapFactory.decodeFile(cachedFile.absolutePath)?.also { bmp ->
                        memoryBitmapCache.put(fullUrl, bmp)
                    }
                } else null
            } finally {
                conn.disconnect()
            }
        }.getOrNull()
    }

    private fun captureCookies(conn: HttpURLConnection) {
        val headers = conn.headerFields
        val cookieHeaders = headers["Set-Cookie"] ?: headers["set-cookie"] ?: return
        for (header in cookieHeaders) {
            val parts = header.split(";")
            val nameValue = parts.firstOrNull()?.trim() ?: continue
            if (nameValue.startsWith("ttk_session=")) {
                val value = nameValue.removePrefix("ttk_session=").trim()
                sessionCookieValue = value.ifEmpty { null }
                prefs.edit().apply {
                    if (value.isNotEmpty()) putString("session_cookie", value) else remove("session_cookie")
                }.apply()
            }
        }
    }

    fun parseError(statusCode: Int, errorBodyString: String?): TtkApiException {
        val detail = if (!errorBodyString.isNullOrBlank()) {
            runCatching {
                val root = JSONObject(errorBodyString)
                val errObj = root.optJSONObject("error") ?: root
                ApiErrorDetail.fromJson(errObj)
            }.getOrNull()
        } else null
        return TtkApiException(statusCode, detail)
    }

    private fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
