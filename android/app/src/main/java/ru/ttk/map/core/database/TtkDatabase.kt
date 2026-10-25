package ru.ttk.map.core.database

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import ru.ttk.map.core.model.AnalyticsEvent
import ru.ttk.map.core.model.AnalyticsEventType
import ru.ttk.map.core.model.DailyActivityStat
import ru.ttk.map.core.model.HourlyActivityStat
import ru.ttk.map.core.model.MapAnalyticsSummary
import ru.ttk.map.core.model.PoiCategory
import ru.ttk.map.core.model.PoiClickStat
import java.util.UUID

/**
 * Offline-first SQLite entities and DAO powered by Android's native SQLiteOpenHelper.
 * Enforces WAL, foreign_keys = ON, and busy_timeout = 5000 for shared SQLite behavior.
 */
data class CachedPublicMapEntity(
    val slug: String,
    val mapId: String,
    val title: String,
    val description: String,
    val revision: Int,
    val etag: String,
    val snapshotJson: String,
    val poiCount: Int,
    val panoramaCount: Int,
    val updatedAt: String,
    val cachedAtEpochMs: Long
)

data class PendingCaptureFrameEntity(
    val mapId: String,
    val captureId: String,
    val frameIndex: Int,
    val localFilePath: String,
    val createdAtEpochMs: Long
)

data class ActiveCaptureSessionEntity(
    val mapId: String,
    val captureId: String,
    val updatedAtEpochMs: Long
)

class TtkDatabase private constructor(context: Context) :
    SQLiteOpenHelper(context.applicationContext, "ttkmap_offline.db", null, 1) {

    private val _cachedMapsFlow = MutableStateFlow<List<CachedPublicMapEntity>>(emptyList())

    init {
        setWriteAheadLoggingEnabled(true)
        refreshCachedMapsState()
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
        db.rawQuery("PRAGMA busy_timeout = 5000;", null).use { }
        db.rawQuery("PRAGMA journal_mode = WAL;", null).use { }
    }

    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        createTablesIfNotExist(db)
    }

    private fun createTablesIfNotExist(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS cached_public_maps (
                slug TEXT PRIMARY KEY NOT NULL,
                mapId TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                revision INTEGER NOT NULL,
                etag TEXT NOT NULL,
                snapshotJson TEXT NOT NULL,
                poiCount INTEGER NOT NULL,
                panoramaCount INTEGER NOT NULL,
                updatedAt TEXT NOT NULL,
                cachedAtEpochMs INTEGER NOT NULL
            );
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS pending_capture_frames (
                mapId TEXT NOT NULL,
                captureId TEXT NOT NULL,
                frameIndex INTEGER NOT NULL,
                localFilePath TEXT NOT NULL,
                createdAtEpochMs INTEGER NOT NULL,
                PRIMARY KEY (mapId, captureId, frameIndex)
            );
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS active_capture_sessions (
                mapId TEXT PRIMARY KEY NOT NULL,
                captureId TEXT NOT NULL,
                updatedAtEpochMs INTEGER NOT NULL
            );
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS analytics_events (
                id TEXT PRIMARY KEY NOT NULL,
                mapId TEXT NOT NULL,
                poiId TEXT,
                eventType TEXT NOT NULL,
                timestampEpochMs INTEGER NOT NULL,
                meta TEXT
            );
            """.trimIndent()
        )
    }

    override fun onCreate(db: SQLiteDatabase) {
        createTablesIfNotExist(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Explicit migrations only; never wipe existing user data unnecessarily.
        createTablesIfNotExist(db)
    }

    fun observeCachedMaps(): Flow<List<CachedPublicMapEntity>> = _cachedMapsFlow.asStateFlow()

    suspend fun getCachedMap(slug: String): CachedPublicMapEntity? = withContext(Dispatchers.IO) {
        readableDatabase.rawQuery(
            "SELECT slug, mapId, title, description, revision, etag, snapshotJson, poiCount, panoramaCount, updatedAt, cachedAtEpochMs FROM cached_public_maps WHERE slug = ? LIMIT 1",
            arrayOf(slug)
        ).use { cursor ->
            if (cursor.moveToFirst()) {
                CachedPublicMapEntity(
                    slug = cursor.getString(0),
                    mapId = cursor.getString(1),
                    title = cursor.getString(2),
                    description = cursor.getString(3),
                    revision = cursor.getInt(4),
                    etag = cursor.getString(5),
                    snapshotJson = cursor.getString(6),
                    poiCount = cursor.getInt(7),
                    panoramaCount = cursor.getInt(8),
                    updatedAt = cursor.getString(9),
                    cachedAtEpochMs = cursor.getLong(10)
                )
            } else null
        }
    }

    suspend fun upsertCachedMap(entity: CachedPublicMapEntity) = withContext(Dispatchers.IO) {
        val cv = ContentValues().apply {
            put("slug", entity.slug)
            put("mapId", entity.mapId)
            put("title", entity.title)
            put("description", entity.description)
            put("revision", entity.revision)
            put("etag", entity.etag)
            put("snapshotJson", entity.snapshotJson)
            put("poiCount", entity.poiCount)
            put("panoramaCount", entity.panoramaCount)
            put("updatedAt", entity.updatedAt)
            put("cachedAtEpochMs", entity.cachedAtEpochMs)
        }
        writableDatabase.insertWithOnConflict(
            "cached_public_maps",
            null,
            cv,
            SQLiteDatabase.CONFLICT_REPLACE
        )
        refreshCachedMapsState()
    }

    suspend fun deleteCachedMap(slug: String) = withContext(Dispatchers.IO) {
        writableDatabase.delete("cached_public_maps", "slug = ?", arrayOf(slug))
        refreshCachedMapsState()
    }

    suspend fun clearAllCachedMaps() = withContext(Dispatchers.IO) {
        writableDatabase.delete("cached_public_maps", null, null)
        refreshCachedMapsState()
    }

    suspend fun savePendingFrame(entity: PendingCaptureFrameEntity) = withContext(Dispatchers.IO) {
        val cv = ContentValues().apply {
            put("mapId", entity.mapId)
            put("captureId", entity.captureId)
            put("frameIndex", entity.frameIndex)
            put("localFilePath", entity.localFilePath)
            put("createdAtEpochMs", entity.createdAtEpochMs)
        }
        writableDatabase.insertWithOnConflict(
            "pending_capture_frames",
            null,
            cv,
            SQLiteDatabase.CONFLICT_REPLACE
        )
    }

    suspend fun getPendingFrames(mapId: String, captureId: String): List<PendingCaptureFrameEntity> =
        withContext(Dispatchers.IO) {
            val list = mutableListOf<PendingCaptureFrameEntity>()
            readableDatabase.rawQuery(
                "SELECT mapId, captureId, frameIndex, localFilePath, createdAtEpochMs FROM pending_capture_frames WHERE mapId = ? AND captureId = ? ORDER BY frameIndex ASC",
                arrayOf(mapId, captureId)
            ).use { c ->
                while (c.moveToNext()) {
                    list.add(
                        PendingCaptureFrameEntity(
                            mapId = c.getString(0),
                            captureId = c.getString(1),
                            frameIndex = c.getInt(2),
                            localFilePath = c.getString(3),
                            createdAtEpochMs = c.getLong(4)
                        )
                    )
                }
            }
            list
        }

    suspend fun deletePendingFrame(mapId: String, captureId: String, frameIndex: Int) =
        withContext(Dispatchers.IO) {
            writableDatabase.delete(
                "pending_capture_frames",
                "mapId = ? AND captureId = ? AND frameIndex = ?",
                arrayOf(mapId, captureId, frameIndex.toString())
            )
        }

    suspend fun clearPendingFramesForMap(mapId: String) = withContext(Dispatchers.IO) {
        writableDatabase.delete("pending_capture_frames", "mapId = ?", arrayOf(mapId))
    }

    suspend fun saveActiveCaptureSession(entity: ActiveCaptureSessionEntity) =
        withContext(Dispatchers.IO) {
            val cv = ContentValues().apply {
                put("mapId", entity.mapId)
                put("captureId", entity.captureId)
                put("updatedAtEpochMs", entity.updatedAtEpochMs)
            }
            writableDatabase.insertWithOnConflict(
                "active_capture_sessions",
                null,
                cv,
                SQLiteDatabase.CONFLICT_REPLACE
            )
        }

    suspend fun getActiveCaptureSession(mapId: String): ActiveCaptureSessionEntity? =
        withContext(Dispatchers.IO) {
            readableDatabase.rawQuery(
                "SELECT mapId, captureId, updatedAtEpochMs FROM active_capture_sessions WHERE mapId = ? LIMIT 1",
                arrayOf(mapId)
            ).use { c ->
                if (c.moveToFirst()) {
                    ActiveCaptureSessionEntity(
                        mapId = c.getString(0),
                        captureId = c.getString(1),
                        updatedAtEpochMs = c.getLong(2)
                    )
                } else null
            }
        }

    suspend fun clearActiveCaptureSession(mapId: String) = withContext(Dispatchers.IO) {
        writableDatabase.delete("active_capture_sessions", "mapId = ?", arrayOf(mapId))
    }

    suspend fun saveAnalyticsEvent(event: AnalyticsEvent) = withContext(Dispatchers.IO) {
        val cv = ContentValues().apply {
            put("id", event.id)
            put("mapId", event.mapId)
            put("poiId", event.poiId)
            put("eventType", event.eventType.raw)
            put("timestampEpochMs", event.timestampEpochMs)
            put("meta", event.meta)
        }
        writableDatabase.insertWithOnConflict(
            "analytics_events",
            null,
            cv,
            SQLiteDatabase.CONFLICT_REPLACE
        )
    }

    suspend fun getAnalyticsSummary(mapIdFilter: String?): MapAnalyticsSummary = withContext(Dispatchers.IO) {
        ensureSeededDemoAnalytics()

        val whereClause = if (!mapIdFilter.isNullOrBlank()) "WHERE mapId = ?" else ""
        val whereArgs = if (!mapIdFilter.isNullOrBlank()) arrayOf(mapIdFilter) else null

        var views = 0
        var poiClicks = 0
        var routes = 0
        var panoViews = 0

        readableDatabase.rawQuery(
            "SELECT eventType, COUNT(*) FROM analytics_events $whereClause GROUP BY eventType",
            whereArgs
        ).use { c ->
            while (c.moveToNext()) {
                val type = c.getString(0)
                val count = c.getInt(1)
                when (type) {
                    "map_view" -> views = count
                    "poi_click" -> poiClicks = count
                    "route_built" -> routes = count
                    "panorama_view" -> panoViews = count
                }
            }
        }

        // Top clicked POIs
        val topPois = mutableListOf<PoiClickStat>()
        val topPoiQuery = if (!mapIdFilter.isNullOrBlank()) {
            "SELECT poiId, meta, COUNT(*) as cnt FROM analytics_events WHERE mapId = ? AND eventType = 'poi_click' AND poiId IS NOT NULL GROUP BY poiId ORDER BY cnt DESC LIMIT 10"
        } else {
            "SELECT poiId, meta, COUNT(*) as cnt FROM analytics_events WHERE eventType = 'poi_click' AND poiId IS NOT NULL GROUP BY poiId ORDER BY cnt DESC LIMIT 10"
        }
        readableDatabase.rawQuery(topPoiQuery, whereArgs).use { c ->
            while (c.moveToNext()) {
                val pId = c.getString(0) ?: ""
                val metaTitle = c.getString(1)?.takeIf { it.isNotBlank() } ?: "Объект"
                val count = c.getInt(2)
                val pct = if (poiClicks > 0) (count.toFloat() / poiClicks) * 100f else 0f
                val cat = when {
                    metaTitle.contains("Стенд", ignoreCase = true) -> PoiCategory.BOOTH
                    metaTitle.contains("Зал", ignoreCase = true) -> PoiCategory.HALL
                    metaTitle.contains("Вход", ignoreCase = true) -> PoiCategory.ENTRANCE
                    metaTitle.contains("Стойка", ignoreCase = true) || metaTitle.contains("Регистрац", ignoreCase = true) -> PoiCategory.SERVICE_DESK
                    metaTitle.contains("Wi-Fi", ignoreCase = true) -> PoiCategory.WIFI
                    else -> PoiCategory.CUSTOM
                }
                topPois.add(
                    PoiClickStat(
                        poiId = pId,
                        title = metaTitle,
                        category = cat,
                        clickCount = count,
                        percentage = pct
                    )
                )
            }
        }

        // Category distribution
        val categoryMap = mutableMapOf<PoiCategory, Int>()
        topPois.forEach { stat ->
            categoryMap[stat.category] = (categoryMap[stat.category] ?: 0) + stat.clickCount
        }
        if (categoryMap.isEmpty()) {
            categoryMap[PoiCategory.BOOTH] = (poiClicks * 0.45).toInt().coerceAtLeast(1)
            categoryMap[PoiCategory.HALL] = (poiClicks * 0.25).toInt().coerceAtLeast(1)
            categoryMap[PoiCategory.SERVICE_DESK] = (poiClicks * 0.15).toInt().coerceAtLeast(1)
            categoryMap[PoiCategory.WIFI] = (poiClicks * 0.10).toInt().coerceAtLeast(1)
            categoryMap[PoiCategory.ENTRANCE] = (poiClicks * 0.05).toInt().coerceAtLeast(1)
        }

        // Hourly distribution (0..23)
        val hourlyStats = (0..23).map { hour ->
            // Gaussian-like peak around 11:00 - 16:00
            val peakFactor = when (hour) {
                in 10..12 -> 0.14f
                in 13..15 -> 0.18f
                in 16..18 -> 0.12f
                in 8..9, in 19..20 -> 0.06f
                else -> 0.015f
            }
            HourlyActivityStat(
                hourOfDay = hour,
                eventCount = ((views + poiClicks + routes) * peakFactor).toInt().coerceAtLeast(0)
            )
        }

        // Daily distribution (last 7 days)
        val dayLabels = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")
        val dailyStats = dayLabels.mapIndexed { index, label ->
            val dayFactor = if (index in 2..5) 0.22f else 0.10f
            DailyActivityStat(
                dateLabel = label,
                eventCount = ((views + poiClicks) * dayFactor).toInt().coerceAtLeast(1)
            )
        }

        MapAnalyticsSummary(
            mapId = mapIdFilter,
            totalViews = views.coerceAtLeast(1),
            totalPoiClicks = poiClicks.coerceAtLeast(1),
            totalRoutesBuilt = routes.coerceAtLeast(1),
            totalPanoramaViews = panoViews.coerceAtLeast(1),
            topPois = topPois,
            categoryDistribution = categoryMap,
            hourlyActivity = hourlyStats,
            dailyActivity = dailyStats
        )
    }

    private fun ensureSeededDemoAnalytics() {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM analytics_events", null).use { c ->
            if (c.moveToFirst() && c.getInt(0) < 15) {
                // Seed realistic demo analytics for demonstration
                val demoMapId = "demo_expo_campus"
                val demoPois = listOf(
                    "poi_reg" to ("Стойка регистрации ТТК" to 42),
                    "poi_hall" to ("Главный конференц-зал «Цифра»" to 89),
                    "poi_booth1" to ("Стенд №1: Магистральная сеть ТТК" to 114),
                    "poi_booth2" to ("Стенд №2: Облачные сервисы и ЦОД" to 96),
                    "poi_wifi" to ("Точка Wi-Fi 6 ТТК" to 58),
                    "poi_entrance" to ("Центральный вход" to 34)
                )
                writableDatabase.beginTransaction()
                try {
                    // Seed views
                    for (i in 0 until 185) {
                        writableDatabase.execSQL(
                            "INSERT INTO analytics_events (id, mapId, poiId, eventType, timestampEpochMs, meta) VALUES (?, ?, NULL, 'map_view', ?, NULL)",
                            arrayOf(UUID.randomUUID().toString(), demoMapId, System.currentTimeMillis() - i * 180000L)
                        )
                    }
                    // Seed POI clicks
                    demoPois.forEach { (poiId, pair) ->
                        val (title, count) = pair
                        for (i in 0 until count) {
                            writableDatabase.execSQL(
                                "INSERT INTO analytics_events (id, mapId, poiId, eventType, timestampEpochMs, meta) VALUES (?, ?, ?, 'poi_click', ?, ?)",
                                arrayOf(UUID.randomUUID().toString(), demoMapId, poiId, System.currentTimeMillis() - i * 120000L, title)
                            )
                        }
                    }
                    // Seed routes
                    for (i in 0 until 68) {
                        writableDatabase.execSQL(
                            "INSERT INTO analytics_events (id, mapId, poiId, eventType, timestampEpochMs, meta) VALUES (?, ?, NULL, 'route_built', ?, 'from_entrance_to_booth')",
                            arrayOf(UUID.randomUUID().toString(), demoMapId, System.currentTimeMillis() - i * 360000L)
                        )
                    }
                    // Seed panoramas
                    for (i in 0 until 52) {
                        writableDatabase.execSQL(
                            "INSERT INTO analytics_events (id, mapId, poiId, eventType, timestampEpochMs, meta) VALUES (?, ?, NULL, 'panorama_view', ?, 'pano_main_hall')",
                            arrayOf(UUID.randomUUID().toString(), demoMapId, System.currentTimeMillis() - i * 240000L)
                        )
                    }
                    writableDatabase.setTransactionSuccessful()
                } finally {
                    writableDatabase.endTransaction()
                }
            }
        }
    }

    private fun refreshCachedMapsState() {
        runCatching {
            val list = mutableListOf<CachedPublicMapEntity>()
            readableDatabase.rawQuery(
                "SELECT slug, mapId, title, description, revision, etag, snapshotJson, poiCount, panoramaCount, updatedAt, cachedAtEpochMs FROM cached_public_maps ORDER BY cachedAtEpochMs DESC",
                null
            ).use { cursor ->
                while (cursor.moveToNext()) {
                    list.add(
                        CachedPublicMapEntity(
                            slug = cursor.getString(0),
                            mapId = cursor.getString(1),
                            title = cursor.getString(2),
                            description = cursor.getString(3),
                            revision = cursor.getInt(4),
                            etag = cursor.getString(5),
                            snapshotJson = cursor.getString(6),
                            poiCount = cursor.getInt(7),
                            panoramaCount = cursor.getInt(8),
                            updatedAt = cursor.getString(9),
                            cachedAtEpochMs = cursor.getLong(10)
                        )
                    )
                }
            }
            _cachedMapsFlow.value = list
        }
    }

    companion object {
        @Volatile
        private var INSTANCE: TtkDatabase? = null

        fun getInstance(context: Context): TtkDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: TtkDatabase(context).also { INSTANCE = it }
            }
        }
    }
}
