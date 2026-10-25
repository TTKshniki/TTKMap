package ru.ttk.map.core.model

import org.json.JSONObject

enum class AnalyticsEventType(val raw: String) {
    MAP_VIEW("map_view"),
    POI_CLICK("poi_click"),
    ROUTE_BUILT("route_built"),
    PANORAMA_VIEW("panorama_view");

    companion object {
        fun fromRaw(raw: String): AnalyticsEventType =
            entries.firstOrNull { it.raw == raw } ?: MAP_VIEW
    }
}

data class AnalyticsEvent(
    val id: String,
    val mapId: String,
    val poiId: String? = null,
    val eventType: AnalyticsEventType,
    val timestampEpochMs: Long = System.currentTimeMillis(),
    val meta: String? = null
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("map_id", mapId)
        put("poi_id", poiId ?: JSONObject.NULL)
        put("event_type", eventType.raw)
        put("timestamp_epoch_ms", timestampEpochMs)
        put("meta", meta ?: JSONObject.NULL)
    }

    companion object {
        fun fromJson(obj: JSONObject) = AnalyticsEvent(
            id = obj.optString("id", ""),
            mapId = obj.optString("map_id", ""),
            poiId = obj.optString("poi_id").takeIf { it.isNotBlank() && it != "null" },
            eventType = AnalyticsEventType.fromRaw(obj.optString("event_type", "map_view")),
            timestampEpochMs = obj.optLong("timestamp_epoch_ms", System.currentTimeMillis()),
            meta = obj.optString("meta").takeIf { it.isNotBlank() && it != "null" }
        )
    }
}

data class PoiClickStat(
    val poiId: String,
    val title: String,
    val category: PoiCategory,
    val clickCount: Int,
    val percentage: Float
)

data class HourlyActivityStat(
    val hourOfDay: Int, // 0..23
    val eventCount: Int
)

data class DailyActivityStat(
    val dateLabel: String,
    val eventCount: Int
)

data class MapAnalyticsSummary(
    val mapId: String?,
    val totalViews: Int,
    val totalPoiClicks: Int,
    val totalRoutesBuilt: Int,
    val totalPanoramaViews: Int,
    val topPois: List<PoiClickStat>,
    val categoryDistribution: Map<PoiCategory, Int>,
    val hourlyActivity: List<HourlyActivityStat>,
    val dailyActivity: List<DailyActivityStat>
)
