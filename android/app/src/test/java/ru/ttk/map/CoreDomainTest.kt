package ru.ttk.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.ttk.map.core.domain.CaptureGuideLogic
import ru.ttk.map.core.domain.CoordinateMath
import ru.ttk.map.core.domain.LocalRouteEngine
import ru.ttk.map.core.model.AssetRef
import ru.ttk.map.core.model.CaptureFrame
import ru.ttk.map.core.repository.TtkMapRepository

class CoreDomainTest {

    @Test
    fun normalizeYaw_wraps180_and_bearingsAccurately() {
        assertEquals(0.0, CoordinateMath.normalizeYaw(0.0), 1e-6)
        assertEquals(-180.0, CoordinateMath.normalizeYaw(180.0), 1e-6)
        assertEquals(-180.0, CoordinateMath.normalizeYaw(-180.0), 1e-6)
        assertEquals(-90.0, CoordinateMath.normalizeYaw(270.0), 1e-6)
        assertEquals(90.0, CoordinateMath.normalizeYaw(-270.0), 1e-6)

        // North (-Y) is 0°, East (+X) is 90°, South (+Y) is -180°, West (-X) is -90°
        assertEquals(0.0, CoordinateMath.bearingFromPlan(0.0, -100.0), 1e-6)
        assertEquals(90.0, CoordinateMath.bearingFromPlan(100.0, 0.0), 1e-6)
        assertEquals(-90.0, CoordinateMath.bearingFromPlan(-100.0, 0.0), 1e-6)
    }

    @Test
    fun pitchBounds_respectsMeasuredVerticalSphereCoverage() {
        val partialAsset = AssetRef(
            id = "00000000-0000-4000-8000-000000000301",
            kind = "panorama",
            vaovDeg = 120.0,
            vOffsetDeg = 5.0
        )
        val (minPitch, maxPitch) = CoordinateMath.pitchBounds(partialAsset)
        assertEquals(-55.0, minPitch, 1e-6)
        assertEquals(65.0, maxPitch, 1e-6)

        val fullAsset = partialAsset.copy(vaovDeg = 180.0, vOffsetDeg = 0.0)
        val (fullMin, fullMax) = CoordinateMath.pitchBounds(fullAsset)
        assertEquals(-CoordinateMath.DEFAULT_PITCH_LIMIT, fullMin, 1e-6)
        assertEquals(CoordinateMath.DEFAULT_PITCH_LIMIT, fullMax, 1e-6)
    }

    @Test
    fun captureGuide_calculates22_5degSteps_and_compassAlignment() {
        assertEquals(0.0, CaptureGuideLogic.targetAngleFor(0), 1e-6)
        assertEquals(22.5, CaptureGuideLogic.targetAngleFor(1), 1e-6)
        assertEquals(180.0, CaptureGuideLogic.targetAngleFor(8), 1e-6)
        assertEquals(337.5, CaptureGuideLogic.targetAngleFor(15), 1e-6)

        val aligned = CaptureGuideLogic.compassGuidance(targetDeg = 45.0, headingDeg = 49.0)
        assertTrue(aligned.aligned)
        assertEquals(CaptureGuideLogic.TurnDirection.HOLD, aligned.direction)

        val turnRight = CaptureGuideLogic.compassGuidance(targetDeg = 90.0, headingDeg = 45.0)
        assertFalse(turnRight.aligned)
        assertEquals(CaptureGuideLogic.TurnDirection.RIGHT, turnRight.direction)

        val frames = listOf(
            CaptureFrame(index = 0, sha256 = "a", widthPx = 1280, heightPx = 960),
            CaptureFrame(index = 1, sha256 = "b", widthPx = 1280, heightPx = 960)
        )
        assertEquals(2, CaptureGuideLogic.nextFrameIndex(frames))
    }

    @Test
    fun localRouteEngine_computesShortestPath_and_connected360Walk() {
        val demo = TtkMapRepository.buildOfflineDemoSnapshot()
        assertEquals(TtkMapRepository.DEMO_OFFLINE_SLUG, demo.slug)
        assertEquals(5, demo.document.pois.size)

        val nEntrance = "00000000-0000-4000-8000-000000000101"
        val nConfHall = "00000000-0000-4000-8000-000000000105"
        val nDesk = "00000000-0000-4000-8000-000000000102"

        // Connected 360° route: Entrance -> Hub -> Conference Hall
        val connectedRoute = LocalRouteEngine.computeRoute(demo, nEntrance, nConfHall)
        assertNotNull(connectedRoute)
        assertTrue(connectedRoute!!.walk.available)
        assertEquals(3, connectedRoute.walk.steps.size)
        assertTrue(connectedRoute.walk.gaps.isEmpty())

        // Route involving Desk (no panorama on Desk node) -> 2D route works, reports missing_panorama gap
        val partialRoute = LocalRouteEngine.computeRoute(demo, nEntrance, nDesk)
        assertNotNull(partialRoute)
        assertFalse(partialRoute!!.walk.available)
        assertEquals("missing_panorama", partialRoute.walk.gaps.first().reason)
    }

    @Test
    fun localRouteEngine_disconnectedNodes_returnsNull() {
        val demo = TtkMapRepository.buildOfflineDemoSnapshot()
        val nEntrance = "00000000-0000-4000-8000-000000000101"
        val nonExistent = "00000000-0000-4000-8000-999999999999"

        val invalidRoute = LocalRouteEngine.computeRoute(demo, nEntrance, nonExistent)
        org.junit.Assert.assertNull("Route to non-existent node must be null", invalidRoute)
    }

    @Test
    fun localRouteEngine_sameNode_returnsZeroDistance() {
        val demo = TtkMapRepository.buildOfflineDemoSnapshot()
        val nEntrance = "00000000-0000-4000-8000-000000000101"

        val sameNodeRoute = LocalRouteEngine.computeRoute(demo, nEntrance, nEntrance)
        assertNotNull(sameNodeRoute)
        assertEquals(0.0, sameNodeRoute!!.distanceUnits, 1e-6)
        assertEquals(0.0, sameNodeRoute.distanceM ?: -1.0, 1e-6)
        assertEquals(listOf(nEntrance), sameNodeRoute.nodeIds)
        assertFalse(sameNodeRoute.walk.available)
        assertEquals("same_node", sameNodeRoute.walk.gaps.first().reason)
    }

    @Test
    fun localRouteEngine_metricDistanceScaling_accurate() {
        val demo = TtkMapRepository.buildOfflineDemoSnapshot()
        val nEntrance = "00000000-0000-4000-8000-000000000101"
        val nConfHall = "00000000-0000-4000-8000-000000000105"

        val route = LocalRouteEngine.computeRoute(demo, nEntrance, nConfHall)
        assertNotNull(route)
        val scale = demo.document.scaleMPerUnit ?: 1.0
        val expectedM = kotlin.math.round(route!!.distanceUnits * scale * 10.0) / 10.0
        assertEquals(expectedM, route.distanceM ?: -1.0, 1e-6)
    }

    @Test
    fun noDemoDataInvariants_demoSlugIsNotSpecialCasedInCoreContracts() {
        // Verify that the DEMO slug is just a string constant and does not contaminate public maps
        assertEquals("ttkexpo2026demospace000001", TtkMapRepository.DEMO_OFFLINE_SLUG)
    }
}
