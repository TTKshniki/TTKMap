package ru.ttk.map.core.repository

import kotlinx.coroutines.flow.Flow
import org.json.JSONArray
import org.json.JSONObject
import ru.ttk.map.core.database.ActiveCaptureSessionEntity
import ru.ttk.map.core.database.CachedPublicMapEntity
import ru.ttk.map.core.database.PendingCaptureFrameEntity
import ru.ttk.map.core.database.TtkDatabase
import ru.ttk.map.core.domain.LocalRouteEngine
import ru.ttk.map.core.model.ApiErrorDetail
import ru.ttk.map.core.model.AssetRef
import ru.ttk.map.core.model.Capture
import ru.ttk.map.core.model.CreateCaptureRequest
import ru.ttk.map.core.model.CreateMapRequest
import ru.ttk.map.core.model.Hotspot
import ru.ttk.map.core.model.HotspotKind
import ru.ttk.map.core.model.LoginRequest
import ru.ttk.map.core.model.MapDocument
import ru.ttk.map.core.model.MapSnapshot
import ru.ttk.map.core.model.MapSummary
import ru.ttk.map.core.model.NavEdge
import ru.ttk.map.core.model.NavNode
import ru.ttk.map.core.model.OrganizerMap
import ru.ttk.map.core.model.Panorama
import ru.ttk.map.core.model.Point
import ru.ttk.map.core.model.Poi
import ru.ttk.map.core.model.PoiCategory
import ru.ttk.map.core.model.PublicMap
import ru.ttk.map.core.model.RouteRequest
import ru.ttk.map.core.model.RouteResponse
import ru.ttk.map.core.model.Session
import ru.ttk.map.core.model.Shape
import ru.ttk.map.core.model.ShapeKind
import ru.ttk.map.core.model.mapObjects
import ru.ttk.map.core.network.TtkApiException
import ru.ttk.map.core.network.TtkNetworkEnvironment
import ru.ttk.map.core.model.AnalyticsEvent
import ru.ttk.map.core.model.AnalyticsEventType
import ru.ttk.map.core.model.DailyActivityStat
import ru.ttk.map.core.model.HourlyActivityStat
import ru.ttk.map.core.model.MapAnalyticsSummary
import ru.ttk.map.core.model.PoiClickStat
import java.io.File
import java.util.UUID

sealed interface PublicMapFetchResult {
    data class Updated(
        val map: PublicMap,
        val etag: String,
        val isFromOfflineCache: Boolean = false
    ) : PublicMapFetchResult

    data class NotModified(
        val map: PublicMap,
        val etag: String
    ) : PublicMapFetchResult
}

class TtkMapRepository(
    val network: TtkNetworkEnvironment,
    private val db: TtkDatabase
) {

    fun observeCachedMaps(): Flow<List<CachedPublicMapEntity>> = db.observeCachedMaps()

    suspend fun clearAllCachedMaps() {
        db.clearAllCachedMaps()
    }

    suspend fun checkHealth(): Result<Boolean> = runCatching {
        val res = network.requestJson("GET", "/healthz")
        res.statusCode in 200..299 && JSONObject(res.body).optString("status") == "ok"
    }

    // -------------------- Organizer Auth --------------------

    suspend fun login(email: String, password: String): Session {
        val res = network.requestJson(
            method = "POST",
            path = "/api/v1/auth/login",
            jsonBody = LoginRequest(email = email.trim(), password = password).toJson()
        )
        val session = Session.fromJson(JSONObject(res.body))
        network.setCsrfToken(session.csrfToken)
        return session
    }

    suspend fun currentSession(): Session {
        val res = network.requestJson("GET", "/api/v1/auth/session")
        val session = Session.fromJson(JSONObject(res.body))
        network.setCsrfToken(session.csrfToken)
        return session
    }

    suspend fun logout() {
        runCatching { network.requestJson("POST", "/api/v1/auth/logout") }
        network.clearSession()
    }

    // -------------------- Organizer Maps --------------------

    suspend fun listAllMaps(): List<MapSummary> {
        val all = mutableListOf<MapSummary>()
        var offset = 0
        while (true) {
            val res = network.requestJson("GET", "/api/v1/maps?offset=$offset&limit=100")
            val page = JSONArray(res.body).mapObjects { MapSummary.fromJson(it) }
            all.addAll(page)
            if (page.size < 100) break
            offset += 100
        }
        return all
    }

    suspend fun createMap(request: CreateMapRequest): Pair<OrganizerMap, String> {
        val res = network.requestJson("POST", "/api/v1/maps", jsonBody = request.toJson())
        val map = OrganizerMap.fromJson(JSONObject(res.body))
        val etag = res.etag ?: "\"map-${map.snapshot.id}-v${map.snapshot.revision}\""
        network.setMapEtag(map.snapshot.id, etag)
        return map to etag
    }

    suspend fun getOrganizerMap(mapId: String): Pair<OrganizerMap, String> {
        val res = network.requestJson("GET", "/api/v1/maps/$mapId")
        val map = OrganizerMap.fromJson(JSONObject(res.body))
        val etag = res.etag ?: "\"map-${map.snapshot.id}-v${map.snapshot.revision}\""
        network.setMapEtag(map.snapshot.id, etag)
        if (map.snapshot.document.isPublished) {
            cachePublicSnapshot(map.snapshot, etag)
        }
        return map to etag
    }

    suspend fun replaceMapDocument(
        mapId: String,
        document: MapDocument,
        ifMatchOverride: String? = null
    ): Pair<OrganizerMap, String> {
        val ifMatch = ifMatchOverride ?: network.getMapEtag(mapId) ?: "\"map-$mapId-v1\""
        val res = network.requestJson(
            method = "PUT",
            path = "/api/v1/maps/$mapId/document",
            jsonBody = document.toJson(),
            extraHeaders = mapOf("If-Match" to ifMatch)
        )
        val map = OrganizerMap.fromJson(JSONObject(res.body))
        val nextEtag = res.etag ?: "\"map-${map.snapshot.id}-v${map.snapshot.revision}\""
        network.setMapEtag(map.snapshot.id, nextEtag)
        if (map.snapshot.document.isPublished) {
            cachePublicSnapshot(map.snapshot, nextEtag)
        } else {
            db.deleteCachedMap(map.snapshot.slug)
        }
        return map to nextEtag
    }

    suspend fun publishMap(mapId: String): OrganizerMap {
        val (current, _) = getOrganizerMap(mapId)
        val doc = current.snapshot.document
        val docToPublish = if (doc.pois.isEmpty()) {
            val autoPoi = Poi(
                id = UUID.randomUUID().toString(),
                title = "Главный вход",
                category = PoiCategory.ENTRANCE,
                x = current.snapshot.widthUnits / 2.0,
                y = current.snapshot.heightUnits / 2.0
            )
            doc.copy(isPublished = true, pois = listOf(autoPoi))
        } else {
            doc.copy(isPublished = true)
        }
        val (saved, _) = replaceMapDocument(mapId, docToPublish)
        return saved
    }

    suspend fun unpublishMap(mapId: String): OrganizerMap {
        val (current, _) = getOrganizerMap(mapId)
        val doc = current.snapshot.document.copy(isPublished = false)
        val (saved, _) = replaceMapDocument(mapId, doc)
        return saved
    }

    suspend fun deleteMap(mapId: String, ifMatchOverride: String? = null) {
        val ifMatch = ifMatchOverride ?: network.getMapEtag(mapId) ?: "\"map-$mapId-v1\""
        network.requestJson(
            method = "DELETE",
            path = "/api/v1/maps/$mapId",
            extraHeaders = mapOf("If-Match" to ifMatch)
        )
    }

    // -------------------- Media Assets --------------------

    suspend fun listAssets(mapId: String): List<AssetRef> {
        val res = network.requestJson("GET", "/api/v1/maps/$mapId/assets")
        return JSONArray(res.body).mapObjects { AssetRef.fromJson(it) }
    }

    suspend fun uploadAsset(mapId: String, kind: String, file: File, mimeType: String = "image/jpeg"): AssetRef {
        val res = network.uploadMultipart(
            method = "POST",
            path = "/api/v1/maps/$mapId/assets",
            formFields = mapOf("kind" to kind),
            fileFieldName = "file",
            file = file,
            mimeType = mimeType
        )
        return AssetRef.fromJson(JSONObject(res.body))
    }

    // -------------------- Guided 16-Frame Captures --------------------

    suspend fun listCaptures(mapId: String): List<Capture> {
        val res = network.requestJson("GET", "/api/v1/maps/$mapId/captures")
        return JSONArray(res.body).mapObjects { Capture.fromJson(it) }
    }

    suspend fun createCapture(mapId: String, request: CreateCaptureRequest): Capture {
        val res = network.requestJson("POST", "/api/v1/maps/$mapId/captures", jsonBody = request.toJson())
        val capture = Capture.fromJson(JSONObject(res.body))
        db.saveActiveCaptureSession(
            ActiveCaptureSessionEntity(
                mapId = mapId,
                captureId = capture.id,
                updatedAtEpochMs = System.currentTimeMillis()
            )
        )
        return capture
    }

    suspend fun getCapture(mapId: String, captureId: String): Capture {
        val res = network.requestJson("GET", "/api/v1/maps/$mapId/captures/$captureId")
        return Capture.fromJson(JSONObject(res.body))
    }

    suspend fun uploadCaptureFrame(mapId: String, captureId: String, index: Int, file: File): Capture {
        val res = network.uploadMultipart(
            method = "PUT",
            path = "/api/v1/maps/$mapId/captures/$captureId/frames/$index",
            fileFieldName = "file",
            file = file,
            mimeType = "image/jpeg"
        )
        val updated = Capture.fromJson(JSONObject(res.body))
        db.deletePendingFrame(mapId, captureId, index)
        return updated
    }

    suspend fun startStitch(mapId: String, captureId: String): Capture {
        val res = network.requestJson("POST", "/api/v1/maps/$mapId/captures/$captureId/stitch")
        return Capture.fromJson(JSONObject(res.body))
    }

    suspend fun cancelCapture(mapId: String, captureId: String): Capture {
        val res = network.requestJson("POST", "/api/v1/maps/$mapId/captures/$captureId/cancel")
        val cancelled = Capture.fromJson(JSONObject(res.body))
        db.clearActiveCaptureSession(mapId)
        db.clearPendingFramesForMap(mapId)
        return cancelled
    }

    suspend fun storePendingFrame(mapId: String, captureId: String, index: Int, filePath: String) {
        db.savePendingFrame(
            PendingCaptureFrameEntity(
                mapId = mapId,
                captureId = captureId,
                frameIndex = index,
                localFilePath = filePath,
                createdAtEpochMs = System.currentTimeMillis()
            )
        )
    }

    suspend fun getPendingFrames(mapId: String, captureId: String): List<PendingCaptureFrameEntity> {
        return db.getPendingFrames(mapId, captureId)
    }

    suspend fun getSavedCaptureSessionId(mapId: String): String? {
        return db.getActiveCaptureSession(mapId)?.captureId
    }

    suspend fun clearSavedCaptureSession(mapId: String) {
        db.clearActiveCaptureSession(mapId)
    }

    // -------------------- Public Visitor & Offline-First Routing --------------------

    suspend fun fetchPublicMap(slug: String, currentEtag: String? = null): PublicMapFetchResult {
        val cleanSlug = slug.trim()
        val cached = db.getCachedMap(cleanSlug)
        val ifNoneMatch = currentEtag ?: cached?.etag

        return try {
            val headers = if (!ifNoneMatch.isNullOrBlank()) mapOf("If-None-Match" to ifNoneMatch) else emptyMap()
            val res = network.requestJson(
                method = "GET",
                path = "/api/v1/public/maps/$cleanSlug",
                extraHeaders = headers
            )
            when {
                res.statusCode == 304 && cached != null -> {
                    val decoded = MapSnapshot.fromJson(JSONObject(cached.snapshotJson))
                    PublicMapFetchResult.NotModified(map = decoded, etag = cached.etag)
                }
                res.statusCode in 200..299 && res.body.isNotBlank() -> {
                    val map = MapSnapshot.fromJson(JSONObject(res.body))
                    val etag = res.etag ?: "\"map-${map.id}-v${map.revision}\""
                    cachePublicSnapshot(map, etag)
                    PublicMapFetchResult.Updated(map = map, etag = etag, isFromOfflineCache = false)
                }
                else -> throw network.parseError(res.statusCode, res.body)
            }
        } catch (e: TtkApiException) {
            if (cached != null) {
                val decoded = MapSnapshot.fromJson(JSONObject(cached.snapshotJson))
                return PublicMapFetchResult.Updated(map = decoded, etag = cached.etag, isFromOfflineCache = true)
            }
            if (cleanSlug == DEMO_OFFLINE_SLUG || cleanSlug == SHOWCASE_SLUG) {
                val demo = buildOfflineDemoSnapshot().copy(slug = cleanSlug)
                val etag = "\"demo-offline-v4\""
                cachePublicSnapshot(demo, etag)
                return PublicMapFetchResult.Updated(map = demo, etag = etag, isFromOfflineCache = true)
            }
            if (e.statusCode == 404) {
                db.deleteCachedMap(cleanSlug)
            }
            throw e
        } catch (e: Exception) {
            if (cached != null) {
                val decoded = MapSnapshot.fromJson(JSONObject(cached.snapshotJson))
                return PublicMapFetchResult.Updated(map = decoded, etag = cached.etag, isFromOfflineCache = true)
            }
            if (cleanSlug == DEMO_OFFLINE_SLUG || cleanSlug == SHOWCASE_SLUG) {
                val demo = buildOfflineDemoSnapshot().copy(slug = cleanSlug)
                val etag = "\"demo-offline-v4\""
                cachePublicSnapshot(demo, etag)
                return PublicMapFetchResult.Updated(map = demo, etag = etag, isFromOfflineCache = true)
            }
            throw e
        }
    }

    suspend fun buildRoute(
        snapshot: PublicMap,
        fromNodeId: String,
        toNodeId: String
    ): RouteResponse {
        try {
            val res = network.requestJson(
                method = "POST",
                path = "/api/v1/public/maps/${snapshot.slug}/route",
                jsonBody = RouteRequest(
                    revision = snapshot.revision,
                    fromNodeId = fromNodeId,
                    toNodeId = toNodeId
                ).toJson()
            )
            return RouteResponse.fromJson(JSONObject(res.body))
        } catch (e: TtkApiException) {
            if (e.statusCode == 409 || e.statusCode == 422) throw e
        } catch (_: Exception) {
            // Offline fallback to LocalRouteEngine
        }

        return LocalRouteEngine.computeRoute(
            snapshot = snapshot,
            fromNodeId = fromNodeId,
            toNodeId = toNodeId
        ) ?: throw TtkApiException(
            statusCode = 422,
            detail = ApiErrorDetail(
                code = "ROUTE_NOT_FOUND",
                message = "Между этими точками нет связанного прохода"
            )
        )
    }

    suspend fun cachePublicSnapshot(map: PublicMap, etag: String) {
        val serialized = map.toJson().toString()
        db.upsertCachedMap(
            CachedPublicMapEntity(
                slug = map.slug,
                mapId = map.id,
                title = map.document.title,
                description = map.document.description,
                revision = map.revision,
                etag = etag,
                snapshotJson = serialized,
                poiCount = map.document.pois.size,
                panoramaCount = map.document.panoramas.size,
                updatedAt = map.updatedAt,
                cachedAtEpochMs = System.currentTimeMillis()
            )
        )
    }

    suspend fun deleteCachedMap(slug: String) {
        db.deleteCachedMap(slug.trim())
    }

    suspend fun downloadMap(slug: String): PublicMap {
        val result = fetchPublicMap(slug)
        val map = when (result) {
            is PublicMapFetchResult.Updated -> result.map
            is PublicMapFetchResult.NotModified -> result.map
        }
        for (asset in map.assets) {
            network.loadBitmap(asset.mobileUrl)
            network.loadBitmap(asset.previewUrl)
        }
        return map
    }

    suspend fun logAnalyticsEvent(
        mapId: String,
        eventType: AnalyticsEventType,
        poiId: String? = null,
        metadata: String? = null
    ) {
        db.saveAnalyticsEvent(
            AnalyticsEvent(
                id = UUID.randomUUID().toString(),
                mapId = mapId,
                poiId = poiId,
                eventType = eventType,
                meta = metadata
            )
        )
    }

    suspend fun getAnalyticsSummary(mapIdFilter: String? = null): MapAnalyticsSummary {
        if (!mapIdFilter.isNullOrBlank()) {
            runCatching {
                val res = network.requestJson("GET", "/api/v1/maps/$mapIdFilter/analytics")
                val json = JSONObject(res.body)
                val totals = json.optJSONObject("totals")
                val topPoisArray = json.optJSONArray("top_pois")
                val byDayArray = json.optJSONArray("by_day")

                val views = totals?.optInt("map_view", 0) ?: 0
                val poiClicks = totals?.optInt("poi_click", 0) ?: 0
                val routes = totals?.optInt("route_built", 0) ?: 0

                val topPois = mutableListOf<PoiClickStat>()
                if (topPoisArray != null && topPoisArray.length() > 0) {
                    val totalClicks = (0 until topPoisArray.length()).map { i ->
                        topPoisArray.optJSONObject(i)?.optInt("clicks", 0) ?: 0
                    }.sum().coerceAtLeast(1)

                    for (i in 0 until topPoisArray.length()) {
                        val item = topPoisArray.optJSONObject(i) ?: continue
                        val pId = item.optString("poi_id")
                        val pTitle = item.optString("title").ifBlank { "Объект" }
                        val clicks = item.optInt("clicks", 0)
                        topPois.add(
                            PoiClickStat(
                                poiId = pId,
                                title = pTitle,
                                category = PoiCategory.CUSTOM,
                                clickCount = clicks,
                                percentage = ((clicks.toFloat() / totalClicks) * 100f)
                            )
                        )
                    }
                }

                val dayLabels = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")
                val dailyStats = dayLabels.mapIndexed { index: Int, label: String ->
                    val dayItem = if (byDayArray != null && index < byDayArray.length()) {
                        byDayArray.optJSONObject(index)
                    } else null
                    val dayViews = (dayItem?.optInt("map_view", 0) ?: 0) + (dayItem?.optInt("poi_click", 0) ?: 0)
                    DailyActivityStat(dateLabel = label, eventCount = dayViews)
                }

                return MapAnalyticsSummary(
                    mapId = mapIdFilter,
                    totalViews = views,
                    totalPoiClicks = poiClicks,
                    totalRoutesBuilt = routes,
                    totalPanoramaViews = 0,
                    topPois = topPois,
                    categoryDistribution = emptyMap(),
                    hourlyActivity = (0..23).map { HourlyActivityStat(hourOfDay = it, eventCount = 0) },
                    dailyActivity = dailyStats
                )
            }
        }
        return db.getAnalyticsSummary(mapIdFilter)
    }

    companion object {
        const val DEMO_OFFLINE_SLUG = "ttkexpo2026demospace000001"
        const val SHOWCASE_SLUG = "ttkshowcampusmapdemoaaaaaa"

        fun buildOfflineDemoSnapshot(): PublicMap {
            val nEntrance = "00000000-0000-4000-8000-000000000101"
            val nDesk = "00000000-0000-4000-8000-000000000102"
            val nHub = "00000000-0000-4000-8000-000000000103"
            val nBoothTtk = "00000000-0000-4000-8000-000000000104"
            val nConfHall = "00000000-0000-4000-8000-000000000105"
            val nWifiZone = "00000000-0000-4000-8000-000000000106"

            val panoEntranceId = "00000000-0000-4000-8000-000000000201"
            val panoHubId = "00000000-0000-4000-8000-000000000202"
            val panoBoothId = "00000000-0000-4000-8000-000000000203"
            val panoHallId = "00000000-0000-4000-8000-000000000204"

            val assetPano1 = "00000000-0000-4000-8000-000000000301"
            val assetPano2 = "00000000-0000-4000-8000-000000000302"
            val assetPano3 = "00000000-0000-4000-8000-000000000303"
            val assetPano4 = "00000000-0000-4000-8000-000000000304"

            val poiEntrance = "00000000-0000-4000-8000-000000000401"
            val poiDesk = "00000000-0000-4000-8000-000000000402"
            val poiBooth = "00000000-0000-4000-8000-000000000403"
            val poiHall = "00000000-0000-4000-8000-000000000404"
            val poiWifi = "00000000-0000-4000-8000-000000000405"

            return MapSnapshot(
                id = "00000000-0000-4000-8000-000000000001",
                slug = DEMO_OFFLINE_SLUG,
                revision = 4,
                widthUnits = 700.0,
                heightUnits = 500.0,
                updatedAt = "2026-10-24T19:00:00Z",
                document = MapDocument(
                    title = "ТТК Экспо · Цифровой кампус",
                    description = "Интерактивная карта павильона ТТК с 2D-навигацией, точками интереса и связанным 360° виртуальным туром.",
                    isPublished = true,
                    scaleMPerUnit = 0.12,
                    maxWalkGapUnits = 450.0,
                    backgroundAssetId = null,
                    shapes = listOf(
                        Shape(
                            id = "00000000-0000-4000-8000-000000000501",
                            kind = ShapeKind.CORRIDOR,
                            label = "Центральная галерея",
                            points = listOf(Point(90.0, 210.0), Point(620.0, 210.0), Point(620.0, 290.0), Point(90.0, 290.0))
                        ),
                        Shape(
                            id = "00000000-0000-4000-8000-000000000502",
                            kind = ShapeKind.ROOM,
                            label = "Зона регистрации и ресепшн",
                            points = listOf(Point(70.0, 300.0), Point(250.0, 300.0), Point(250.0, 440.0), Point(70.0, 440.0))
                        ),
                        Shape(
                            id = "00000000-0000-4000-8000-000000000503",
                            kind = ShapeKind.ROOM,
                            label = "Стенд ТТК Cloud & Telecom",
                            points = listOf(Point(230.0, 60.0), Point(450.0, 60.0), Point(450.0, 200.0), Point(230.0, 200.0))
                        ),
                        Shape(
                            id = "00000000-0000-4000-8000-000000000504",
                            kind = ShapeKind.ROOM,
                            label = "Большой конференц-зал «Магистраль»",
                            points = listOf(Point(470.0, 70.0), Point(640.0, 70.0), Point(640.0, 420.0), Point(470.0, 420.0))
                        ),
                        Shape(
                            id = "00000000-0000-4000-8000-000000000505",
                            kind = ShapeKind.ROOM,
                            label = "Лаунж и гигабитный Wi-Fi ТТК",
                            points = listOf(Point(270.0, 300.0), Point(450.0, 300.0), Point(450.0, 440.0), Point(270.0, 440.0))
                        ),
                        Shape(
                            id = "00000000-0000-4000-8000-000000000506",
                            kind = ShapeKind.WALL,
                            label = "Внешний периметр павильона",
                            points = listOf(
                                Point(50.0, 45.0),
                                Point(655.0, 45.0),
                                Point(655.0, 455.0),
                                Point(50.0, 455.0),
                                Point(50.0, 45.0)
                            )
                        )
                    ),
                    nodes = listOf(
                        NavNode(id = nEntrance, x = 115.0, y = 250.0),
                        NavNode(id = nDesk, x = 165.0, y = 365.0),
                        NavNode(id = nHub, x = 340.0, y = 250.0),
                        NavNode(id = nBoothTtk, x = 340.0, y = 135.0),
                        NavNode(id = nConfHall, x = 550.0, y = 250.0),
                        NavNode(id = nWifiZone, x = 360.0, y = 365.0)
                    ),
                    edges = listOf(
                        NavEdge(id = "00000000-0000-4000-8000-000000000601", a = nEntrance, b = nDesk),
                        NavEdge(id = "00000000-0000-4000-8000-000000000602", a = nEntrance, b = nHub),
                        NavEdge(id = "00000000-0000-4000-8000-000000000603", a = nHub, b = nBoothTtk),
                        NavEdge(id = "00000000-0000-4000-8000-000000000604", a = nHub, b = nConfHall),
                        NavEdge(id = "00000000-0000-4000-8000-000000000605", a = nHub, b = nWifiZone),
                        NavEdge(id = "00000000-0000-4000-8000-000000000606", a = nDesk, b = nWifiZone)
                    ),
                    pois = listOf(
                        Poi(
                            id = poiEntrance,
                            title = "Главный вход А1",
                            category = PoiCategory.ENTRANCE,
                            description = "Центральный вход для гостей форума, рамки контроля и гардероб.",
                            x = 115.0,
                            y = 250.0,
                            navNodeId = nEntrance
                        ),
                        Poi(
                            id = poiDesk,
                            title = "Стойка аккредитации ТТК",
                            category = PoiCategory.SERVICE_DESK,
                            description = "Выдача бейджей участников, информационная поддержка и навигационные буклеты.",
                            x = 165.0,
                            y = 365.0,
                            navNodeId = nDesk
                        ),
                        Poi(
                            id = poiBooth,
                            title = "Стенд ТТК «Цифровые пространства»",
                            category = PoiCategory.BOOTH,
                            description = "Демонстрация платформы интерактивных карт, 360°-панорам и магистральных решений ТТК.",
                            x = 340.0,
                            y = 135.0,
                            navNodeId = nBoothTtk
                        ),
                        Poi(
                            id = poiHall,
                            title = "Зал «Магистраль» (Keynote)",
                            category = PoiCategory.HALL,
                            description = "Главная сцена защиты кейсов, пленарные сессии и награждение победителей.",
                            x = 550.0,
                            y = 250.0,
                            navNodeId = nConfHall
                        ),
                        Poi(
                            id = poiWifi,
                            title = "Коворкинг & Wi-Fi 6E ТТК",
                            category = PoiCategory.WIFI,
                            description = "Скоростная сеть TTK-Expo-5G, розетки для ноутбуков и кофе-пойнт.",
                            x = 360.0,
                            y = 365.0,
                            navNodeId = nWifiZone
                        )
                    ),
                    panoramas = listOf(
                        Panorama(
                            id = panoEntranceId,
                            assetId = assetPano1,
                            title = "Панорама: Главный вход",
                            x = 115.0,
                            y = 250.0,
                            navNodeId = nEntrance,
                            headingOffsetDeg = 0.0
                        ),
                        Panorama(
                            id = panoHubId,
                            assetId = assetPano2,
                            title = "Панорама: Центральный атриум",
                            x = 340.0,
                            y = 250.0,
                            navNodeId = nHub,
                            headingOffsetDeg = 0.0
                        ),
                        Panorama(
                            id = panoBoothId,
                            assetId = assetPano3,
                            title = "Панорама: Стенд ТТК",
                            x = 340.0,
                            y = 135.0,
                            navNodeId = nBoothTtk,
                            headingOffsetDeg = 0.0
                        ),
                        Panorama(
                            id = panoHallId,
                            assetId = assetPano4,
                            title = "Панорама: Зал «Магистраль»",
                            x = 550.0,
                            y = 250.0,
                            navNodeId = nConfHall,
                            headingOffsetDeg = 0.0
                        )
                    ),
                    hotspots = listOf(
                        Hotspot(
                            id = "00000000-0000-4000-8000-000000000701",
                            panoramaId = panoEntranceId,
                            kind = HotspotKind.POI,
                            yawDeg = -15.0,
                            pitchDeg = 4.0,
                            poiId = poiEntrance
                        ),
                        Hotspot(
                            id = "00000000-0000-4000-8000-000000000702",
                            panoramaId = panoEntranceId,
                            kind = HotspotKind.TRANSITION,
                            yawDeg = 90.0,
                            pitchDeg = -6.0,
                            targetPanoramaId = panoHubId
                        ),
                        Hotspot(
                            id = "00000000-0000-4000-8000-000000000703",
                            panoramaId = panoHubId,
                            kind = HotspotKind.TRANSITION,
                            yawDeg = -90.0,
                            pitchDeg = -6.0,
                            targetPanoramaId = panoEntranceId
                        ),
                        Hotspot(
                            id = "00000000-0000-4000-8000-000000000704",
                            panoramaId = panoHubId,
                            kind = HotspotKind.TRANSITION,
                            yawDeg = 0.0,
                            pitchDeg = -4.0,
                            targetPanoramaId = panoBoothId
                        ),
                        Hotspot(
                            id = "00000000-0000-4000-8000-000000000705",
                            panoramaId = panoHubId,
                            kind = HotspotKind.TRANSITION,
                            yawDeg = 90.0,
                            pitchDeg = -5.0,
                            targetPanoramaId = panoHallId
                        ),
                        Hotspot(
                            id = "00000000-0000-4000-8000-000000000706",
                            panoramaId = panoBoothId,
                            kind = HotspotKind.POI,
                            yawDeg = 10.0,
                            pitchDeg = 6.0,
                            poiId = poiBooth
                        ),
                        Hotspot(
                            id = "00000000-0000-4000-8000-000000000707",
                            panoramaId = panoBoothId,
                            kind = HotspotKind.TRANSITION,
                            yawDeg = 180.0,
                            pitchDeg = -6.0,
                            targetPanoramaId = panoHubId
                        ),
                        Hotspot(
                            id = "00000000-0000-4000-8000-000000000708",
                            panoramaId = panoHallId,
                            kind = HotspotKind.POI,
                            yawDeg = 0.0,
                            pitchDeg = 8.0,
                            poiId = poiHall
                        ),
                        Hotspot(
                            id = "00000000-0000-4000-8000-000000000709",
                            panoramaId = panoHallId,
                            kind = HotspotKind.TRANSITION,
                            yawDeg = -90.0,
                            pitchDeg = -6.0,
                            targetPanoramaId = panoHubId
                        )
                    )
                ),
                assets = listOf(
                    AssetRef(
                        id = assetPano1,
                        kind = "panorama",
                        source = "stitch",
                        widthPx = 4096,
                        heightPx = 2048,
                        projection = "equirectangular",
                        haovDeg = 360.0,
                        vaovDeg = 140.0,
                        vOffsetDeg = 0.0
                    ),
                    AssetRef(
                        id = assetPano2,
                        kind = "panorama",
                        source = "stitch",
                        widthPx = 4096,
                        heightPx = 2048,
                        projection = "equirectangular",
                        haovDeg = 360.0,
                        vaovDeg = 150.0,
                        vOffsetDeg = 0.0
                    ),
                    AssetRef(
                        id = assetPano3,
                        kind = "panorama",
                        source = "stitch",
                        widthPx = 4096,
                        heightPx = 2048,
                        projection = "equirectangular",
                        haovDeg = 360.0,
                        vaovDeg = 145.0,
                        vOffsetDeg = 0.0
                    ),
                    AssetRef(
                        id = assetPano4,
                        kind = "panorama",
                        source = "upload",
                        widthPx = 4096,
                        heightPx = 2048,
                        projection = "equirectangular",
                        haovDeg = 360.0,
                        vaovDeg = 180.0,
                        vOffsetDeg = 0.0
                    )
                )
            )
        }
    }
}


