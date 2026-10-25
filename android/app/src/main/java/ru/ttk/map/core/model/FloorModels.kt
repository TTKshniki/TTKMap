package ru.ttk.map.core.model

/**
 * Multi-floor & Multi-building domain models supporting Section 6 of Specification.
 */

enum class InterFloorTransitionType(val labelRu: String, val iconName: String) {
    STAIRS("Лестница", "stairs"),
    ELEVATOR("Лифт", "elevator"),
    ESCALATOR("Эскалатор", "escalator");

    companion object {
        fun fromRaw(raw: String): InterFloorTransitionType =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: STAIRS
    }
}

data class FloorLevel(
    val levelNumber: Int,
    val name: String,
    val shortCode: String = "${levelNumber}F",
    val heightOffsetM: Double = (levelNumber - 1) * 3.8
) {
    companion object {
        val DEFAULT_LEVEL_1 = FloorLevel(1, "1 Этаж", "1F", 0.0)
        val DEFAULT_LEVEL_2 = FloorLevel(2, "2 Этаж", "2F", 3.8)
        val DEFAULT_LEVEL_3 = FloorLevel(3, "3 Этаж", "3F", 7.6)
    }
}

data class InterFloorTransition(
    val id: String,
    val title: String,
    val type: InterFloorTransitionType,
    val fromFloor: Int,
    val toFloor: Int,
    val fromNodeId: String,
    val toNodeId: String,
    val x: Double,
    val y: Double
)

data class CampusBuilding(
    val id: String,
    val name: String,
    val shortName: String,
    val description: String,
    val iconCategory: String, // "main", "expo", "hall", "outdoor"
    val floors: List<FloorLevel>,
    val mapIds: List<String> = emptyList()
)

object MultiFloorHelper {

    fun extractFloorLevel(id: String, label: String = "", description: String = ""): Int {
        val combined = "$id $label $description".lowercase()
        return when {
            combined.contains("этаж 3") || combined.contains("3 этаж") || combined.contains("floor 3") || combined.contains("_f3_") || combined.contains("3f") -> 3
            combined.contains("этаж 2") || combined.contains("2 этаж") || combined.contains("floor 2") || combined.contains("_f2_") || combined.contains("2f") -> 2
            combined.contains("цокол") || combined.contains("этаж 0") || combined.contains("0 этаж") || combined.contains("этаж -1") || combined.contains("-1 этаж") || combined.contains("_f0_") || combined.contains("_f-1_") -> 0
            else -> 1 // Default to Floor 1
        }
    }

    fun getAvailableFloors(doc: MapDocument): List<FloorLevel> {
        val levels = mutableSetOf(1)
        for (poi in doc.pois) {
            levels.add(extractFloorLevel(poi.id, poi.title, poi.description))
        }
        for (shape in doc.shapes) {
            levels.add(extractFloorLevel(shape.id, shape.label))
        }
        for (node in doc.nodes) {
            levels.add(extractFloorLevel(node.id))
        }
        if (levels.size == 1) {
            levels.add(2) // Offer 2nd floor by default for easy expansion
        }
        return levels.sorted().map { lvl ->
            when (lvl) {
                0 -> FloorLevel(0, "Цокольный этаж", "0F", -3.5)
                1 -> FloorLevel(1, "1 Этаж (Основной)", "1F", 0.0)
                2 -> FloorLevel(2, "2 Этаж (Мезонин / Залы)", "2F", 3.8)
                3 -> FloorLevel(3, "3 Этаж (Конференц-зона)", "3F", 7.6)
                else -> FloorLevel(lvl, "$lvl Этаж", "${lvl}F", (lvl - 1) * 3.8)
            }
        }
    }

    /**
     * Filters items belonging to the selected floor.
     * Items marked as transition (e.g. stairs, elevators) are visible on both connected floors.
     */
    fun filterDocumentByFloor(doc: MapDocument, floorLevel: Int): MapDocument {
        val isItemOnFloor: (String, String, String) -> Boolean = { id, label, desc ->
            val itemLevel = extractFloorLevel(id, label, desc)
            val isTransition = label.contains("лестниц", ignoreCase = true) ||
                    label.contains("лифт", ignoreCase = true) ||
                    desc.contains("лестниц", ignoreCase = true) ||
                    desc.contains("лифт", ignoreCase = true) ||
                    id.contains("stairs", ignoreCase = true) ||
                    id.contains("elevator", ignoreCase = true)
            itemLevel == floorLevel || (isTransition && (itemLevel == floorLevel || itemLevel == floorLevel - 1 || itemLevel == floorLevel + 1))
        }

        val filteredShapes = doc.shapes.filter { isItemOnFloor(it.id, it.label, "") }
        val filteredNodes = doc.nodes.filter { isItemOnFloor(it.id, "", "") }
        val nodeIds = filteredNodes.map { it.id }.toSet()
        val filteredEdges = doc.edges.filter { it.a in nodeIds && it.b in nodeIds }
        val filteredPois = doc.pois.filter { isItemOnFloor(it.id, it.title, it.description) }
        val filteredPanoramas = doc.panoramas.filter { isItemOnFloor(it.id, it.title, "") }
        val panoIds = filteredPanoramas.map { it.id }.toSet()
        val filteredHotspots = doc.hotspots.filter { it.panoramaId in panoIds }

        return doc.copy(
            shapes = if (filteredShapes.isNotEmpty()) filteredShapes else doc.shapes,
            nodes = if (filteredNodes.isNotEmpty()) filteredNodes else doc.nodes,
            edges = if (filteredEdges.isNotEmpty()) filteredEdges else doc.edges,
            pois = if (filteredPois.isNotEmpty()) filteredPois else doc.pois,
            panoramas = if (filteredPanoramas.isNotEmpty()) filteredPanoramas else doc.panoramas,
            hotspots = if (filteredHotspots.isNotEmpty()) filteredHotspots else doc.hotspots
        )
    }

    /**
     * Pre-defined Campus structure for TTK Map showcase.
     */
    fun getDefaultCampusBuildings(): List<CampusBuilding> {
        return listOf(
            CampusBuilding(
                id = "bld_main",
                name = "Главный корпус ТТК",
                shortName = "Корпус 1",
                description = "Центральный вход, регистрация, главный конференц-зал и витрина цифровых решений.",
                iconCategory = "main",
                floors = listOf(
                    FloorLevel(1, "1 Этаж · Экспозиция", "1F", 0.0),
                    FloorLevel(2, "2 Этаж · Конференц-залы", "2F", 3.8)
                )
            ),
            CampusBuilding(
                id = "bld_expo",
                name = "Экспо-павильон «Инновации»",
                shortName = "Павильон А",
                description = "Выставочная площадка телеком-оборудования, демо-зоны партнерских решений и лекторий.",
                iconCategory = "expo",
                floors = listOf(
                    FloorLevel(1, "1 Этаж · Главная арена", "1F", 0.0),
                    FloorLevel(2, "2 Этаж · VIP-переговорные", "2F", 3.8)
                )
            ),
            CampusBuilding(
                id = "bld_outdoor",
                name = "Открытая площадка & Парк ТТК",
                shortName = "Территория",
                description = "Навигация по открытой территории между корпусами, зонам отдыха и летним шатрам.",
                iconCategory = "outdoor",
                floors = listOf(
                    FloorLevel(1, "Наземный уровень", "0F", 0.0)
                )
            )
        )
    }
}
