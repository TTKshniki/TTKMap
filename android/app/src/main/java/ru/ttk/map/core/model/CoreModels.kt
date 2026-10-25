package ru.ttk.map.core.model

import org.json.JSONArray
import org.json.JSONObject

/**
 * Mirrors CONTRACTS/types.ts and CONTRACTS/openapi.yaml 1:1.
 * All transport fields use snake_case via org.json.
 */

data class Health(
    val status: String = "ok"
) {
    companion object {
        fun fromJson(obj: JSONObject) = Health(status = obj.optString("status", "ok"))
    }
}

data class ValidationIssue(
    val path: String = "",
    val message: String = ""
) {
    companion object {
        fun fromJson(obj: JSONObject) = ValidationIssue(
            path = obj.optString("path", ""),
            message = obj.optString("message", "")
        )
    }
}

data class ApiErrorDetail(
    val code: String,
    val message: String,
    val issues: List<ValidationIssue> = emptyList(),
    val currentRevision: Int? = null
) {
    companion object {
        fun fromJson(obj: JSONObject): ApiErrorDetail {
            val issuesArr = obj.optJSONArray("issues")
            val issuesList = mutableListOf<ValidationIssue>()
            if (issuesArr != null) {
                for (i in 0 until issuesArr.length()) {
                    issuesArr.optJSONObject(i)?.let { issuesList.add(ValidationIssue.fromJson(it)) }
                }
            }
            val rev = if (obj.has("current_revision") && !obj.isNull("current_revision")) {
                obj.optInt("current_revision")
            } else null
            return ApiErrorDetail(
                code = obj.optString("code", "INTERNAL_ERROR"),
                message = obj.optString("message", "Ошибка запроса"),
                issues = issuesList,
                currentRevision = rev
            )
        }
    }
}

data class User(
    val id: String,
    val email: String,
    val role: String = "organizer"
) {
    companion object {
        fun fromJson(obj: JSONObject) = User(
            id = obj.optString("id", ""),
            email = obj.optString("email", ""),
            role = obj.optString("role", "organizer")
        )
    }
}

data class LoginRequest(
    val email: String,
    val password: String
) {
    fun toJson(): JSONObject = JSONObject()
        .put("email", email)
        .put("password", password)
}

data class Session(
    val user: User,
    val csrfToken: String,
    val expiresAt: String
) {
    companion object {
        fun fromJson(obj: JSONObject) = Session(
            user = User.fromJson(obj.optJSONObject("user") ?: JSONObject()),
            csrfToken = obj.optString("csrf_token", ""),
            expiresAt = obj.optString("expires_at", "")
        )
    }
}

data class CreateMapRequest(
    val title: String,
    val description: String = "",
    val widthUnits: Double = 700.0,
    val heightUnits: Double = 500.0,
    val scaleMPerUnit: Double? = null,
    val maxWalkGapUnits: Double = 500.0
) {
    fun toJson(): JSONObject = JSONObject()
        .put("title", title)
        .put("description", description)
        .put("width_units", widthUnits)
        .put("height_units", heightUnits)
        .put("scale_m_per_unit", scaleMPerUnit ?: JSONObject.NULL)
        .put("max_walk_gap_units", maxWalkGapUnits)
}

data class Point(
    val x: Double,
    val y: Double
) {
    fun toJson(): JSONObject = JSONObject().put("x", x).put("y", y)

    companion object {
        fun fromJson(obj: JSONObject) = Point(
            x = obj.optDouble("x", 0.0),
            y = obj.optDouble("y", 0.0)
        )
    }
}

enum class ShapeKind(val raw: String) {
    WALL("wall"),
    ROOM("room"),
    CORRIDOR("corridor");

    companion object {
        fun fromRaw(raw: String): ShapeKind =
            entries.firstOrNull { it.raw == raw } ?: ROOM
    }
}

data class Shape(
    val id: String,
    val kind: ShapeKind = ShapeKind.ROOM,
    val label: String = "",
    val points: List<Point> = emptyList()
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("kind", kind.raw)
        .put("label", label)
        .put("points", JSONArray().apply { points.forEach { put(it.toJson()) } })

    companion object {
        fun fromJson(obj: JSONObject): Shape {
            val ptsArr = obj.optJSONArray("points")
            val pts = mutableListOf<Point>()
            if (ptsArr != null) {
                for (i in 0 until ptsArr.length()) {
                    ptsArr.optJSONObject(i)?.let { pts.add(Point.fromJson(it)) }
                }
            }
            return Shape(
                id = obj.optString("id", ""),
                kind = ShapeKind.fromRaw(obj.optString("kind", "room")),
                label = obj.optString("label", ""),
                points = pts
            )
        }
    }
}

data class NavNode(
    val id: String,
    val x: Double,
    val y: Double
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("x", x)
        .put("y", y)

    companion object {
        fun fromJson(obj: JSONObject) = NavNode(
            id = obj.optString("id", ""),
            x = obj.optDouble("x", 0.0),
            y = obj.optDouble("y", 0.0)
        )
    }
}

data class NavEdge(
    val id: String,
    val a: String,
    val b: String
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("a", a)
        .put("b", b)

    companion object {
        fun fromJson(obj: JSONObject) = NavEdge(
            id = obj.optString("id", ""),
            a = obj.optString("a", ""),
            b = obj.optString("b", "")
        )
    }
}

enum class PoiCategory(val raw: String, val defaultLabelRu: String) {
    BOOTH("booth", "Стенд"),
    HALL("hall", "Зал"),
    ENTRANCE("entrance", "Вход"),
    SERVICE_DESK("service_desk", "Стойка"),
    WIFI("wifi", "Wi-Fi"),
    CUSTOM("custom", "Другое");

    companion object {
        fun fromRaw(raw: String): PoiCategory =
            entries.firstOrNull { it.raw == raw } ?: BOOTH
    }
}

data class Poi(
    val id: String,
    val title: String,
    val category: PoiCategory = PoiCategory.BOOTH,
    val categoryLabel: String? = null,
    val description: String = "",
    val x: Double,
    val y: Double,
    val navNodeId: String? = null
) {
    fun displayCategoryLabel(): String =
        categoryLabel?.trim()?.takeIf { it.isNotEmpty() } ?: category.defaultLabelRu

    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("title", title)
        .put("category", category.raw)
        .put("category_label", categoryLabel ?: JSONObject.NULL)
        .put("description", description)
        .put("x", x)
        .put("y", y)
        .put("nav_node_id", navNodeId ?: JSONObject.NULL)

    companion object {
        fun fromJson(obj: JSONObject) = Poi(
            id = obj.optString("id", ""),
            title = obj.optString("title", ""),
            category = PoiCategory.fromRaw(obj.optString("category", "booth")),
            categoryLabel = obj.optNullableString("category_label"),
            description = obj.optString("description", ""),
            x = obj.optDouble("x", 0.0),
            y = obj.optDouble("y", 0.0),
            navNodeId = obj.optNullableString("nav_node_id")
        )
    }
}

data class Panorama(
    val id: String,
    val assetId: String,
    val title: String,
    val x: Double,
    val y: Double,
    val navNodeId: String? = null,
    val headingOffsetDeg: Double = 0.0
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("asset_id", assetId)
        .put("title", title)
        .put("x", x)
        .put("y", y)
        .put("nav_node_id", navNodeId ?: JSONObject.NULL)
        .put("heading_offset_deg", headingOffsetDeg)

    companion object {
        fun fromJson(obj: JSONObject) = Panorama(
            id = obj.optString("id", ""),
            assetId = obj.optString("asset_id", ""),
            title = obj.optString("title", ""),
            x = obj.optDouble("x", 0.0),
            y = obj.optDouble("y", 0.0),
            navNodeId = obj.optNullableString("nav_node_id"),
            headingOffsetDeg = obj.optDouble("heading_offset_deg", 0.0)
        )
    }
}

enum class HotspotKind(val raw: String) {
    POI("poi"),
    TRANSITION("transition");

    companion object {
        fun fromRaw(raw: String): HotspotKind =
            entries.firstOrNull { it.raw == raw } ?: POI
    }
}

data class Hotspot(
    val id: String,
    val panoramaId: String,
    val kind: HotspotKind,
    val yawDeg: Double,
    val pitchDeg: Double,
    val poiId: String? = null,
    val targetPanoramaId: String? = null
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("panorama_id", panoramaId)
        .put("kind", kind.raw)
        .put("yaw_deg", yawDeg)
        .put("pitch_deg", pitchDeg)
        .put("poi_id", poiId ?: JSONObject.NULL)
        .put("target_panorama_id", targetPanoramaId ?: JSONObject.NULL)

    companion object {
        fun fromJson(obj: JSONObject) = Hotspot(
            id = obj.optString("id", ""),
            panoramaId = obj.optString("panorama_id", ""),
            kind = HotspotKind.fromRaw(obj.optString("kind", "poi")),
            yawDeg = obj.optDouble("yaw_deg", 0.0),
            pitchDeg = obj.optDouble("pitch_deg", 0.0),
            poiId = obj.optNullableString("poi_id"),
            targetPanoramaId = obj.optNullableString("target_panorama_id")
        )
    }
}

data class MapDocument(
    val title: String,
    val description: String = "",
    val isPublished: Boolean = false,
    val scaleMPerUnit: Double? = null,
    val maxWalkGapUnits: Double = 500.0,
    val backgroundAssetId: String? = null,
    val shapes: List<Shape> = emptyList(),
    val nodes: List<NavNode> = emptyList(),
    val edges: List<NavEdge> = emptyList(),
    val pois: List<Poi> = emptyList(),
    val panoramas: List<Panorama> = emptyList(),
    val hotspots: List<Hotspot> = emptyList()
) {
    fun toJson(): JSONObject = JSONObject()
        .put("title", title)
        .put("description", description)
        .put("is_published", isPublished)
        .put("scale_m_per_unit", scaleMPerUnit ?: JSONObject.NULL)
        .put("max_walk_gap_units", maxWalkGapUnits)
        .put("background_asset_id", backgroundAssetId ?: JSONObject.NULL)
        .put("shapes", JSONArray().apply { shapes.forEach { put(it.toJson()) } })
        .put("nodes", JSONArray().apply { nodes.forEach { put(it.toJson()) } })
        .put("edges", JSONArray().apply { edges.forEach { put(it.toJson()) } })
        .put("pois", JSONArray().apply { pois.forEach { put(it.toJson()) } })
        .put("panoramas", JSONArray().apply { panoramas.forEach { put(it.toJson()) } })
        .put("hotspots", JSONArray().apply { hotspots.forEach { put(it.toJson()) } })

    companion object {
        fun fromJson(obj: JSONObject): MapDocument {
            return MapDocument(
                title = obj.optString("title", ""),
                description = obj.optString("description", ""),
                isPublished = obj.optBoolean("is_published", false),
                scaleMPerUnit = obj.optNullableDouble("scale_m_per_unit"),
                maxWalkGapUnits = obj.optDouble("max_walk_gap_units", 500.0),
                backgroundAssetId = obj.optNullableString("background_asset_id"),
                shapes = obj.optJSONArray("shapes").mapObjects { Shape.fromJson(it) },
                nodes = obj.optJSONArray("nodes").mapObjects { NavNode.fromJson(it) },
                edges = obj.optJSONArray("edges").mapObjects { NavEdge.fromJson(it) },
                pois = obj.optJSONArray("pois").mapObjects { Poi.fromJson(it) },
                panoramas = obj.optJSONArray("panoramas").mapObjects { Panorama.fromJson(it) },
                hotspots = obj.optJSONArray("hotspots").mapObjects { Hotspot.fromJson(it) }
            )
        }
    }
}

data class AssetRef(
    val id: String,
    val kind: String,
    val source: String = "upload",
    val widthPx: Int = 0,
    val heightPx: Int = 0,
    val projection: String? = null,
    val haovDeg: Double? = null,
    val vaovDeg: Double? = null,
    val vOffsetDeg: Double? = null,
    val previewUrl: String = "",
    val mobileUrl: String = "",
    val fullUrl: String = "",
    val createdAt: String = ""
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("kind", kind)
        .put("source", source)
        .put("width_px", widthPx)
        .put("height_px", heightPx)
        .put("projection", projection ?: JSONObject.NULL)
        .put("haov_deg", haovDeg ?: JSONObject.NULL)
        .put("vaov_deg", vaovDeg ?: JSONObject.NULL)
        .put("v_offset_deg", vOffsetDeg ?: JSONObject.NULL)
        .put("preview_url", previewUrl)
        .put("mobile_url", mobileUrl)
        .put("full_url", fullUrl)
        .put("created_at", createdAt)

    companion object {
        fun fromJson(obj: JSONObject) = AssetRef(
            id = obj.optString("id", ""),
            kind = obj.optString("kind", "panorama"),
            source = obj.optString("source", "upload"),
            widthPx = obj.optInt("width_px", 0),
            heightPx = obj.optInt("height_px", 0),
            projection = obj.optNullableString("projection"),
            haovDeg = obj.optNullableDouble("haov_deg"),
            vaovDeg = obj.optNullableDouble("vaov_deg"),
            vOffsetDeg = obj.optNullableDouble("v_offset_deg"),
            previewUrl = obj.optString("preview_url", ""),
            mobileUrl = obj.optString("mobile_url", ""),
            fullUrl = obj.optString("full_url", ""),
            createdAt = obj.optString("created_at", "")
        )
    }
}

data class MapSnapshot(
    val id: String,
    val slug: String,
    val revision: Int,
    val widthUnits: Double,
    val heightUnits: Double,
    val updatedAt: String,
    val document: MapDocument,
    val assets: List<AssetRef> = emptyList()
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("slug", slug)
        .put("revision", revision)
        .put("width_units", widthUnits)
        .put("height_units", heightUnits)
        .put("updated_at", updatedAt)
        .put("document", document.toJson())
        .put("assets", JSONArray().apply { assets.forEach { put(it.toJson()) } })

    companion object {
        fun fromJson(obj: JSONObject) = MapSnapshot(
            id = obj.optString("id", ""),
            slug = obj.optString("slug", ""),
            revision = obj.optInt("revision", 1),
            widthUnits = obj.optDouble("width_units", 700.0),
            heightUnits = obj.optDouble("height_units", 500.0),
            updatedAt = obj.optString("updated_at", ""),
            document = MapDocument.fromJson(obj.optJSONObject("document") ?: JSONObject()),
            assets = obj.optJSONArray("assets").mapObjects { AssetRef.fromJson(it) }
        )
    }
}

typealias PublicMap = MapSnapshot

data class OrganizerMap(
    val snapshot: MapSnapshot,
    val ownerId: String,
    val createdAt: String
) {
    companion object {
        fun fromJson(obj: JSONObject) = OrganizerMap(
            snapshot = MapSnapshot.fromJson(obj.optJSONObject("snapshot") ?: JSONObject()),
            ownerId = obj.optString("owner_id", ""),
            createdAt = obj.optString("created_at", "")
        )
    }
}

data class MapSummary(
    val id: String,
    val slug: String,
    val title: String,
    val isPublished: Boolean,
    val revision: Int,
    val updatedAt: String
) {
    companion object {
        fun fromJson(obj: JSONObject) = MapSummary(
            id = obj.optString("id", ""),
            slug = obj.optString("slug", ""),
            title = obj.optString("title", ""),
            isPublished = obj.optBoolean("is_published", false),
            revision = obj.optInt("revision", 1),
            updatedAt = obj.optString("updated_at", "")
        )
    }
}

data class CreateCaptureRequest(
    val title: String,
    val x: Double,
    val y: Double,
    val hfovHintDeg: Double = 65.0
) {
    fun toJson(): JSONObject = JSONObject()
        .put("title", title)
        .put("x", x)
        .put("y", y)
        .put("hfov_hint_deg", hfovHintDeg)
}

data class CaptureFrame(
    val index: Int,
    val sha256: String,
    val widthPx: Int,
    val heightPx: Int
) {
    companion object {
        fun fromJson(obj: JSONObject) = CaptureFrame(
            index = obj.optInt("index", 0),
            sha256 = obj.optString("sha256", ""),
            widthPx = obj.optInt("width_px", 0),
            heightPx = obj.optInt("height_px", 0)
        )
    }
}

enum class CaptureState(val raw: String) {
    COLLECTING("collecting"),
    QUEUED("queued"),
    RUNNING("running"),
    SUCCEEDED("succeeded"),
    FAILED("failed"),
    CANCELLED("cancelled");

    companion object {
        fun fromRaw(raw: String): CaptureState =
            entries.firstOrNull { it.raw == raw } ?: COLLECTING
    }
}

data class Capture(
    val id: String,
    val mapId: String,
    val title: String,
    val x: Double,
    val y: Double,
    val hfovHintDeg: Double,
    val state: CaptureState,
    val progress: Int = 0,
    val attempt: Int = 0,
    val frames: List<CaptureFrame> = emptyList(),
    val resultAssetId: String? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
    val startedAt: String? = null,
    val finishedAt: String? = null
) {
    companion object {
        fun fromJson(obj: JSONObject) = Capture(
            id = obj.optString("id", ""),
            mapId = obj.optString("map_id", ""),
            title = obj.optString("title", ""),
            x = obj.optDouble("x", 0.0),
            y = obj.optDouble("y", 0.0),
            hfovHintDeg = obj.optDouble("hfov_hint_deg", 65.0),
            state = CaptureState.fromRaw(obj.optString("state", "collecting")),
            progress = obj.optInt("progress", 0),
            attempt = obj.optInt("attempt", 0),
            frames = obj.optJSONArray("frames").mapObjects { CaptureFrame.fromJson(it) },
            resultAssetId = obj.optNullableString("result_asset_id"),
            errorCode = obj.optNullableString("error_code"),
            errorMessage = obj.optNullableString("error_message"),
            createdAt = obj.optString("created_at", ""),
            updatedAt = obj.optString("updated_at", ""),
            startedAt = obj.optNullableString("started_at"),
            finishedAt = obj.optNullableString("finished_at")
        )
    }
}

data class RouteRequest(
    val revision: Int,
    val fromNodeId: String,
    val toNodeId: String
) {
    fun toJson(): JSONObject = JSONObject()
        .put("revision", revision)
        .put("from_node_id", fromNodeId)
        .put("to_node_id", toNodeId)
}

data class PanoramaWalkStep(
    val nodeId: String,
    val panoramaId: String,
    val yawDeg: Double,
    val nextHotspotId: String? = null
) {
    companion object {
        fun fromJson(obj: JSONObject) = PanoramaWalkStep(
            nodeId = obj.optString("node_id", ""),
            panoramaId = obj.optString("panorama_id", ""),
            yawDeg = obj.optDouble("yaw_deg", 0.0),
            nextHotspotId = obj.optNullableString("next_hotspot_id")
        )
    }
}

data class PanoramaWalkGap(
    val fromNodeId: String,
    val toNodeId: String,
    val reason: String
) {
    fun localizedReason(): String = when (reason) {
        "same_node" -> "Начальная и конечная точки находятся на одном узле"
        "missing_panorama" -> "На одном из узлов маршрута ещё не снята панорама"
        "missing_transition" -> "Между соседними панорамами не размечен направленный хотспот-переход"
        "gap_too_large" -> "Расстояние между точками съёмки превышает допустимый шаг виртуального прохода"
        else -> "Участок маршрута не покрыт связанными панорамами"
    }

    companion object {
        fun fromJson(obj: JSONObject) = PanoramaWalkGap(
            fromNodeId = obj.optString("from_node_id", ""),
            toNodeId = obj.optString("to_node_id", ""),
            reason = obj.optString("reason", "missing_panorama")
        )
    }
}

data class PanoramaWalk(
    val available: Boolean,
    val steps: List<PanoramaWalkStep> = emptyList(),
    val gaps: List<PanoramaWalkGap> = emptyList()
) {
    companion object {
        fun fromJson(obj: JSONObject) = PanoramaWalk(
            available = obj.optBoolean("available", false),
            steps = obj.optJSONArray("steps").mapObjects { PanoramaWalkStep.fromJson(it) },
            gaps = obj.optJSONArray("gaps").mapObjects { PanoramaWalkGap.fromJson(it) }
        )
    }
}

data class RouteResponse(
    val revision: Int,
    val nodeIds: List<String>,
    val polyline: List<Point>,
    val distanceUnits: Double,
    val distanceM: Double? = null,
    val walk: PanoramaWalk
) {
    companion object {
        fun fromJson(obj: JSONObject): RouteResponse {
            val idsArr = obj.optJSONArray("node_ids")
            val nodeIds = mutableListOf<String>()
            if (idsArr != null) {
                for (i in 0 until idsArr.length()) {
                    nodeIds.add(idsArr.optString(i))
                }
            }
            return RouteResponse(
                revision = obj.optInt("revision", 1),
                nodeIds = nodeIds,
                polyline = obj.optJSONArray("polyline").mapObjects { Point.fromJson(it) },
                distanceUnits = obj.optDouble("distance_units", 0.0),
                distanceM = obj.optNullableDouble("distance_m"),
                walk = PanoramaWalk.fromJson(obj.optJSONObject("walk") ?: JSONObject())
            )
        }
    }
}

private fun JSONObject.optNullableString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).takeIf { it.isNotEmpty() && it != "null" }
}

private fun JSONObject.optNullableDouble(key: String): Double? {
    if (!has(key) || isNull(key)) return null
    val v = optDouble(key)
    return if (v.isFinite()) v else null
}

fun <T> JSONArray?.mapObjects(transform: (JSONObject) -> T): List<T> {
    if (this == null) return emptyList()
    val result = ArrayList<T>(length())
    for (i in 0 until length()) {
        optJSONObject(i)?.let { result.add(transform(it)) }
    }
    return result
}
