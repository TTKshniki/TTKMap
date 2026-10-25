package ru.ttk.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.ttk.map.core.domain.AiPlanGenerator
import ru.ttk.map.core.model.AnalyticsEvent
import ru.ttk.map.core.model.AnalyticsEventType
import ru.ttk.map.core.model.MultiFloorHelper
import ru.ttk.map.core.model.PoiCategory
import ru.ttk.map.core.repository.TtkMapRepository

class AppFeaturesTest {

    @Test
    fun multiFloorHelper_extractsFloorsCorrectly() {
        assertEquals(1, MultiFloorHelper.extractFloorLevel("poi-1", "Кафетерий", "1 этаж"))
        assertEquals(2, MultiFloorHelper.extractFloorLevel("node_f2_101", "Конференц-зал 2F"))
        assertEquals(3, MultiFloorHelper.extractFloorLevel("shape_f3_hall", "VIP Зона (3 Этаж)"))
        assertEquals(0, MultiFloorHelper.extractFloorLevel("node-underground", "Паркинг", "Цокольный этаж"))
    }

    @Test
    fun multiFloorHelper_availableFloors_and_filtering() {
        val demo = TtkMapRepository.buildOfflineDemoSnapshot()
        val floors = MultiFloorHelper.getAvailableFloors(demo.document)
        assertTrue(floors.isNotEmpty())
        assertTrue(floors.any { it.levelNumber == 1 })

        val floor1Doc = MultiFloorHelper.filterDocumentByFloor(demo.document, 1)
        assertNotNull(floor1Doc)
        assertTrue(floor1Doc.pois.isNotEmpty())
    }

    @Test
    fun aiPlanGenerator_synthesizesValidLayout() {
        val generated = AiPlanGenerator.generatePlanFromSketch(
            bitmap = null,
            widthUnits = 800.0,
            heightUnits = 600.0,
            spaceNameHint = "Павильон ТТК Тест"
        )
        assertNotNull(generated)
        assertTrue(generated.shapes.isNotEmpty())
        assertTrue(generated.pois.isNotEmpty())
        assertTrue(generated.nodes.isNotEmpty())
        assertTrue(generated.edges.isNotEmpty())
        assertTrue(generated.confidencePercent in 50..100)

        // All edges must connect existing nodes
        val nodeIds = generated.nodes.map { it.id }.toSet()
        for (edge in generated.edges) {
            assertTrue("Edge source must exist in nodes", nodeIds.contains(edge.a))
            assertTrue("Edge target must exist in nodes", nodeIds.contains(edge.b))
        }

        // Must have essential POIs
        val categories = generated.pois.map { it.category }.toSet()
        assertTrue(categories.contains(PoiCategory.ENTRANCE))
        assertTrue(categories.contains(PoiCategory.SERVICE_DESK))
    }

    @Test
    fun analyticsEvent_modelProperties_and_enumMappings() {
        val event = AnalyticsEvent(
            id = "evt-test-01",
            mapId = "map-test-01",
            poiId = "poi-42",
            eventType = AnalyticsEventType.POI_CLICK,
            meta = "category=booth"
        )

        assertEquals("evt-test-01", event.id)
        assertEquals("map-test-01", event.mapId)
        assertEquals("poi-42", event.poiId)
        assertEquals(AnalyticsEventType.POI_CLICK, event.eventType)
        assertEquals("poi_click", event.eventType.raw)
        assertEquals("category=booth", event.meta)

        assertEquals(AnalyticsEventType.MAP_VIEW, AnalyticsEventType.fromRaw("map_view"))
        assertEquals(AnalyticsEventType.ROUTE_BUILT, AnalyticsEventType.fromRaw("route_built"))
        assertEquals(AnalyticsEventType.PANORAMA_VIEW, AnalyticsEventType.fromRaw("panorama_view"))
    }

    @Test
    fun multiFloorHelper_campusBuildings_valid() {
        val campus = MultiFloorHelper.getDefaultCampusBuildings()
        assertEquals(3, campus.size)
        assertTrue(campus.any { it.name.contains("Главный корпус") })
        assertTrue(campus.any { it.name.contains("Экспо-павильон") })
        assertTrue(campus.any { it.name.contains("Открытая площадка") })
    }
}
