package ru.ttk.map.core.domain

import ru.ttk.map.core.model.HotspotKind
import ru.ttk.map.core.model.MapSnapshot
import ru.ttk.map.core.model.NavNode
import ru.ttk.map.core.model.Panorama
import ru.ttk.map.core.model.PanoramaWalk
import ru.ttk.map.core.model.PanoramaWalkGap
import ru.ttk.map.core.model.PanoramaWalkStep
import ru.ttk.map.core.model.Point
import ru.ttk.map.core.model.RouteResponse
import java.util.PriorityQueue
import kotlin.math.hypot
import kotlin.math.round

/**
 * Offline-capable Dijkstra pathfinding & Panorama Walk builder.
 * Mirrors backend/app/routers/public.py and the shared API invariants so
 * cached maps can calculate full 2D routes + 360° panorama walkthroughs even offline.
 */
object LocalRouteEngine {

    fun computeRoute(
        snapshot: MapSnapshot,
        fromNodeId: String,
        toNodeId: String
    ): RouteResponse? {
        val doc = snapshot.document
        val nodesById = doc.nodes.associateBy { it.id }
        val startNode = nodesById[fromNodeId] ?: return null
        val endNode = nodesById[toNodeId] ?: return null

        if (fromNodeId == toNodeId) {
            return RouteResponse(
                revision = snapshot.revision,
                nodeIds = listOf(fromNodeId),
                polyline = listOf(Point(startNode.x, startNode.y)),
                distanceUnits = 0.0,
                distanceM = if (doc.scaleMPerUnit != null) 0.0 else null,
                walk = PanoramaWalk(
                    available = false,
                    steps = emptyList(),
                    gaps = listOf(
                        PanoramaWalkGap(
                            fromNodeId = fromNodeId,
                            toNodeId = toNodeId,
                            reason = "same_node"
                        )
                    )
                )
            )
        }

        val adjacency = mutableMapOf<String, MutableList<Pair<String, Double>>>()
        for (edge in doc.edges) {
            val a = nodesById[edge.a] ?: continue
            val b = nodesById[edge.b] ?: continue
            val weight = hypot(b.x - a.x, b.y - a.y)
            adjacency.getOrPut(a.id) { mutableListOf() }.add(b.id to weight)
            adjacency.getOrPut(b.id) { mutableListOf() }.add(a.id to weight)
        }

        val dist = mutableMapOf<String, Double>().withDefault { Double.POSITIVE_INFINITY }
        val prev = mutableMapOf<String, String>()
        dist[fromNodeId] = 0.0

        data class QueueEntry(val nodeId: String, val cost: Double) : Comparable<QueueEntry> {
            override fun compareTo(other: QueueEntry): Int {
                val cmp = cost.compareTo(other.cost)
                return if (cmp != 0) cmp else nodeId.compareTo(other.nodeId)
            }
        }

        val pq = PriorityQueue<QueueEntry>()
        pq.add(QueueEntry(fromNodeId, 0.0))

        while (pq.isNotEmpty()) {
            val current = pq.poll() ?: break
            if (current.cost > dist.getValue(current.nodeId)) continue
            if (current.nodeId == toNodeId) break

            val neighbors = adjacency[current.nodeId]?.sortedBy { it.first } ?: emptyList()
            for ((nextId, weight) in neighbors) {
                val nextCost = current.cost + weight
                if (nextCost + 1e-9 < dist.getValue(nextId)) {
                    dist[nextId] = nextCost
                    prev[nextId] = current.nodeId
                    pq.add(QueueEntry(nextId, nextCost))
                }
            }
        }

        val totalDist = dist.getValue(toNodeId)
        if (!totalDist.isFinite()) return null

        val pathNodeIds = mutableListOf<String>()
        var cursor: String? = toNodeId
        while (cursor != null) {
            pathNodeIds.add(cursor)
            if (cursor == fromNodeId) break
            cursor = prev[cursor]
        }
        pathNodeIds.reverse()
        if (pathNodeIds.firstOrNull() != fromNodeId) return null

        val polyline = pathNodeIds.mapNotNull { id ->
            nodesById[id]?.let { Point(it.x, it.y) }
        }

        val walk = buildPanoramaWalk(
            pathNodeIds = pathNodeIds,
            nodesById = nodesById,
            panoramas = doc.panoramas,
            hotspots = doc.hotspots,
            maxWalkGapUnits = doc.maxWalkGapUnits
        )

        val distanceM = doc.scaleMPerUnit?.takeIf { it > 0.0 }?.let {
            round(totalDist * it * 100.0) / 100.0
        }

        return RouteResponse(
            revision = snapshot.revision,
            nodeIds = pathNodeIds,
            polyline = polyline,
            distanceUnits = round(totalDist * 100.0) / 100.0,
            distanceM = distanceM,
            walk = walk
        )
    }

    private fun buildPanoramaWalk(
        pathNodeIds: List<String>,
        nodesById: Map<String, NavNode>,
        panoramas: List<Panorama>,
        hotspots: List<ru.ttk.map.core.model.Hotspot>,
        maxWalkGapUnits: Double
    ): PanoramaWalk {
        val panoByNode = panoramas
            .filter { !it.navNodeId.isNullOrBlank() }
            .associateBy { it.navNodeId!! }

        val gaps = mutableListOf<PanoramaWalkGap>()
        val steps = mutableListOf<PanoramaWalkStep>()

        for (i in 0 until pathNodeIds.size - 1) {
            val fromId = pathNodeIds[i]
            val toId = pathNodeIds[i + 1]
            val fromNode = nodesById[fromId]
            val toNode = nodesById[toId]
            val fromPano = panoByNode[fromId]
            val toPano = panoByNode[toId]

            if (fromPano == null || toPano == null) {
                gaps.add(PanoramaWalkGap(fromId, toId, "missing_panorama"))
                continue
            }

            val edgeDistance = if (fromNode != null && toNode != null) {
                hypot(toNode.x - fromNode.x, toNode.y - fromNode.y)
            } else {
                hypot(toPano.x - fromPano.x, toPano.y - fromPano.y)
            }

            if (edgeDistance > maxWalkGapUnits) {
                gaps.add(PanoramaWalkGap(fromId, toId, "gap_too_large"))
                continue
            }

            val transitionHotspot = hotspots.firstOrNull {
                it.panoramaId == fromPano.id &&
                    it.kind == HotspotKind.TRANSITION &&
                    it.targetPanoramaId == toPano.id
            }

            if (transitionHotspot == null) {
                gaps.add(PanoramaWalkGap(fromId, toId, "missing_transition"))
                continue
            }

            steps.add(
                PanoramaWalkStep(
                    nodeId = fromId,
                    panoramaId = fromPano.id,
                    yawDeg = transitionHotspot.yawDeg,
                    nextHotspotId = transitionHotspot.id
                )
            )
        }

        if (gaps.isEmpty() && pathNodeIds.size >= 2) {
            val lastNodeId = pathNodeIds.last()
            val lastPano = panoByNode[lastNodeId]
            if (lastPano != null) {
                val arrivalYaw = steps.lastOrNull()?.yawDeg ?: 0.0
                steps.add(
                    PanoramaWalkStep(
                        nodeId = lastNodeId,
                        panoramaId = lastPano.id,
                        yawDeg = arrivalYaw,
                        nextHotspotId = null
                    )
                )
                return PanoramaWalk(available = true, steps = steps, gaps = emptyList())
            }
        }

        return PanoramaWalk(available = false, steps = emptyList(), gaps = gaps)
    }
}
