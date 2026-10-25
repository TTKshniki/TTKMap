package ru.ttk.map.core.domain

import ru.ttk.map.core.model.AssetRef
import ru.ttk.map.core.model.Hotspot
import ru.ttk.map.core.model.HotspotKind
import ru.ttk.map.core.model.Panorama
import ru.ttk.map.core.model.Point
import ru.ttk.map.core.model.Poi
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Coordinate & spherical panorama math matching frontend/src/shared/coordinates.ts
 * and frontend/src/features/panorama/hotspots.ts.
 *
 * Contract rules:
 * - Plan coordinates: local units, (0,0) at upper-left, X right, Y down.
 * - Panorama yaw in [-180, 180), pitch in [-90, 90].
 * - heading_offset_deg maps yaw=0 to plan bearing from -Y (north/up).
 */
object CoordinateMath {

    const val DEFAULT_PITCH_LIMIT = 85.0
    const val MIN_HFOV_DEG = 40.0
    const val MAX_HFOV_DEG = 130.0

    fun normalizeYaw(value: Double): Double {
        if (!value.isFinite()) return 0.0
        val wrapped = (((value + 180.0) % 360.0) + 360.0) % 360.0 - 180.0
        return if (wrapped == 180.0) -180.0 else wrapped
    }

    fun bearingFromPlan(dx: Double, dy: Double): Double {
        return normalizeYaw(atan2(dx, -dy) * 180.0 / Math.PI)
    }

    fun yawToTarget(dx: Double, dy: Double, headingOffsetDeg: Double): Double {
        return normalizeYaw(bearingFromPlan(dx, dy) - headingOffsetDeg)
    }

    fun angleDelta(fromDeg: Double, toDeg: Double): Double {
        return normalizeYaw(toDeg - fromDeg)
    }

    fun clampHotspotAngles(yawDeg: Double, pitchDeg: Double): Pair<Double, Double> {
        val pitch = if (pitchDeg.isFinite()) max(-89.0, min(89.0, pitchDeg)) else 0.0
        val yaw = if (yawDeg.isFinite()) {
            normalizeYaw((normalizeYaw(yawDeg) * 10.0).roundToInt() / 10.0)
        } else {
            0.0
        }
        val roundedPitch = (pitch * 10.0).roundToInt() / 10.0
        return yaw to roundedPitch
    }

    /**
     * Vertical look-around limits derived from measured sphere coverage (vaov_deg & v_offset_deg).
     * Prevents pitching into empty black space on partial vertical coverage panoramas.
     */
    fun pitchBounds(asset: AssetRef?): Pair<Double, Double> {
        val vaov = asset?.vaovDeg
        if (vaov == null || !vaov.isFinite() || vaov >= 179.0) {
            return -DEFAULT_PITCH_LIMIT to DEFAULT_PITCH_LIMIT
        }
        val offset = asset.vOffsetDeg ?: 0.0
        val half = max(10.0, min(90.0, vaov / 2.0))
        val minP = max(-89.0, ((offset - half) * 10.0).roundToInt() / 10.0)
        val maxP = min(89.0, ((offset + half) * 10.0).roundToInt() / 10.0)
        return minP to maxP
    }

    fun clampHfov(value: Double): Double {
        if (!value.isFinite()) return 95.0
        return value.coerceIn(MIN_HFOV_DEG, MAX_HFOV_DEG)
    }

    fun hotspotLabel(hotspot: Hotspot, pois: List<Poi>, panoramas: List<Panorama>): String {
        return if (hotspot.kind == HotspotKind.POI) {
            pois.firstOrNull { it.id == hotspot.poiId }?.title?.takeIf { it.isNotBlank() }
                ?: "Точка интереса"
        } else {
            val targetTitle = panoramas.firstOrNull { it.id == hotspot.targetPanoramaId }?.title
            if (!targetTitle.isNullOrBlank()) "Переход: $targetTitle" else "Переход к панораме"
        }
    }

    fun distance(a: Point, b: Point): Double = hypot(b.x - a.x, b.y - a.y)

    fun formatDistance(distanceUnits: Double, scaleMPerUnit: Double?): String {
        return if (scaleMPerUnit != null && scaleMPerUnit > 0.0) {
            val meters = distanceUnits * scaleMPerUnit
            String.format("%.1f м", meters)
        } else {
            "${distanceUnits.roundToInt()} ед."
        }
    }
}
