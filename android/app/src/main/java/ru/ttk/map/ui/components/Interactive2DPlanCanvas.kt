package ru.ttk.map.ui.components

import android.graphics.Bitmap
import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.ttk.map.core.model.NavEdge
import ru.ttk.map.core.model.NavNode
import ru.ttk.map.core.model.Panorama
import ru.ttk.map.core.model.Point
import ru.ttk.map.core.model.Poi
import ru.ttk.map.core.model.PoiCategory
import ru.ttk.map.core.model.Shape
import ru.ttk.map.core.model.ShapeKind
import ru.ttk.map.core.network.TtkNetworkEnvironment
import ru.ttk.map.ui.theme.PlanCorridorFill
import ru.ttk.map.ui.theme.PlanRoomFill
import ru.ttk.map.ui.theme.PlanShapeBorder
import ru.ttk.map.ui.theme.PlanWallStroke
import ru.ttk.map.ui.theme.PoiBoothRed
import ru.ttk.map.ui.theme.PoiCustomSlate
import ru.ttk.map.ui.theme.PoiEntranceGreen
import ru.ttk.map.ui.theme.PoiHallTeal
import ru.ttk.map.ui.theme.PoiServiceViolet
import ru.ttk.map.ui.theme.PoiWifiBlue
import ru.ttk.map.ui.theme.TtkBrandRed
import ru.ttk.map.ui.theme.TtkGreen
import kotlin.math.hypot
import kotlin.math.min

fun poiCategoryColor(category: PoiCategory): Color = when (category) {
    PoiCategory.BOOTH -> PoiBoothRed
    PoiCategory.HALL -> PoiHallTeal
    PoiCategory.ENTRANCE -> PoiEntranceGreen
    PoiCategory.SERVICE_DESK -> PoiServiceViolet
    PoiCategory.WIFI -> PoiWifiBlue
    PoiCategory.CUSTOM -> PoiCustomSlate
}

/**
 * Interactive 2D Plan Canvas matching PublicPlan.tsx & PlanEditor.tsx:
 * - Preserves local plan coordinate units `(0,0) -> (widthUnits, heightUnits)` regardless of zoom/pan.
 * - Renders background plan image, room/corridor polygons, wall polylines, optional navigation graph,
 *   animated dashed route polyline (`.animate-route`), pulsing panorama markers (`.ttk-plan__pano`),
 *   and semantic POI pins with labels + Android 12+ rich haptics on selection.
 */
@Composable
fun Interactive2DPlanCanvas(
    widthUnits: Double,
    heightUnits: Double,
    backgroundUrl: String?,
    network: TtkNetworkEnvironment,
    shapes: List<Shape>,
    nodes: List<NavNode>,
    edges: List<NavEdge>,
    pois: List<Poi>,
    panoramas: List<Panorama>,
    selectedPoiId: String? = null,
    activePanoramaId: String? = null,
    selectedNodeId: String? = null,
    selectedShapeId: String? = null,
    routePolyline: List<Point>? = null,
    draftPolygonPoints: List<Point> = emptyList(),
    captureMarkerPoint: Point? = null,
    showNavGraph: Boolean = false,
    onSelectPoi: (Poi) -> Unit = {},
    onOpenPanorama: (Panorama) -> Unit = {},
    onSelectNode: ((NavNode) -> Unit)? = null,
    onTapPlanCoordinate: ((Point) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val view = LocalView.current
    val safeWidth = widthUnits.coerceAtLeast(1.0).toFloat()
    val safeHeight = heightUnits.coerceAtLeast(1.0).toFloat()

    var zoom by remember { mutableFloatStateOf(1f) }
    var panOffset by remember { mutableStateOf(Offset.Zero) }
    var isFullscreen by remember { mutableStateOf(false) }
    var backgroundBitmap by remember(backgroundUrl) { mutableStateOf<Bitmap?>(null) }
    val textMeasurer = rememberTextMeasurer()

    LaunchedEffect(backgroundUrl) {
        backgroundBitmap = if (!backgroundUrl.isNullOrBlank()) {
            network.loadBitmap(backgroundUrl)
        } else null
    }

    val infiniteTransition = rememberInfiniteTransition(label = "planAnimations")
    val dashPhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = -36f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "routeDash"
    )
    val pulseRadiusFactor by infiniteTransition.animateFloat(
        initialValue = 1.0f,
        targetValue = 1.65f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1500),
            repeatMode = RepeatMode.Reverse
        ),
        label = "panoPulse"
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(22.dp))
    ) {
        // Top Toolbar (.ttk-plan__toolbar)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Place,
                        contentDescription = null,
                        tint = TtkBrandRed,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = "${pois.size} объектов · ${panoramas.size} панорам",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                IconButton(
                    onClick = {
                        zoom = 1f
                        panOffset = Offset.Zero
                    },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Сбросить масштаб", modifier = Modifier.size(16.dp))
                }
                IconButton(
                    onClick = { isFullscreen = true },
                    modifier = Modifier.size(32.dp)
                ) {
                    FullscreenExpandIcon(tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(18.dp))
                }
            }
        }

        // Interactive Stage Content Lambda
        val stageContent: @Composable (Modifier) -> Unit = { stageModifier ->
            Box(
                modifier = stageModifier
                    .background(Color(0xFFF8FAFC))
                .pointerInput(safeWidth, safeHeight) {
                    detectTransformGestures { _, pan, gestureZoom, _ ->
                        val nextZoom = (zoom * gestureZoom).coerceIn(0.65f, 5.0f)
                        zoom = nextZoom
                        panOffset += pan
                    }
                }
                .pointerInput(safeWidth, safeHeight, pois, panoramas, nodes, showNavGraph, zoom, panOffset) {
                    detectTapGestures { tapOffset ->
                        val stageScale = min(size.width / safeWidth, size.height / safeHeight) * zoom
                        val stageW = safeWidth * stageScale
                        val stageH = safeHeight * stageScale
                        val originX = (size.width - stageW) / 2f + panOffset.x
                        val originY = (size.height - stageH) / 2f + panOffset.y

                        val planX = ((tapOffset.x - originX) / stageScale).toDouble()
                        val planY = ((tapOffset.y - originY) / stageScale).toDouble()
                        val hitRadiusUnits = (24.dp.toPx() / stageScale).toDouble()

                        val hitPoi = pois.minByOrNull { hypot(it.x - planX, it.y - planY) }
                            ?.takeIf { hypot(it.x - planX, it.y - planY) <= hitRadiusUnits }
                        if (hitPoi != null && onTapPlanCoordinate == null) {
                            view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                            onSelectPoi(hitPoi)
                            return@detectTapGestures
                        }

                        val hitPano = panoramas.minByOrNull { hypot(it.x - planX, it.y - planY) }
                            ?.takeIf { hypot(it.x - planX, it.y - planY) <= hitRadiusUnits }
                        if (hitPano != null && onTapPlanCoordinate == null) {
                            view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                            onOpenPanorama(hitPano)
                            return@detectTapGestures
                        }

                        if (showNavGraph && onSelectNode != null) {
                            val hitNode = nodes.minByOrNull { hypot(it.x - planX, it.y - planY) }
                                ?.takeIf { hypot(it.x - planX, it.y - planY) <= hitRadiusUnits }
                            if (hitNode != null) {
                                view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                                onSelectNode(hitNode)
                                return@detectTapGestures
                            }
                        }

                        if (onTapPlanCoordinate != null && planX in 0.0..widthUnits && planY in 0.0..heightUnits) {
                            view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                            onTapPlanCoordinate(
                                Point(
                                    x = planX.coerceIn(0.0, widthUnits),
                                    y = planY.coerceIn(0.0, heightUnits)
                                )
                            )
                        } else if (hitPoi != null) {
                            view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                            onSelectPoi(hitPoi)
                        } else if (hitPano != null) {
                            view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                            onOpenPanorama(hitPano)
                        }
                    }
                }
        ) {
            backgroundBitmap?.let { bmp ->
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = "Подложка плана",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize()
                )
            }

            Canvas(modifier = Modifier.fillMaxSize()) {
                val stageScale = min(size.width / safeWidth, size.height / safeHeight) * zoom
                val stageW = safeWidth * stageScale
                val stageH = safeHeight * stageScale
                val originX = (size.width - stageW) / 2f + panOffset.x
                val originY = (size.height - stageH) / 2f + panOffset.y

                fun toScreen(pt: Point): Offset = Offset(
                    x = originX + pt.x.toFloat() * stageScale,
                    y = originY + pt.y.toFloat() * stageScale
                )

                if (backgroundBitmap == null) {
                    drawRoundRect(
                        color = Color.White,
                        topLeft = Offset(originX, originY),
                        size = Size(stageW, stageH),
                        cornerRadius = CornerRadius(14.dp.toPx())
                    )
                    val gridStep = 50f
                    var gx = gridStep
                    while (gx < safeWidth) {
                        val sx = originX + gx * stageScale
                        drawLine(
                            color = Color(0xFFF1F5F9),
                            start = Offset(sx, originY),
                            end = Offset(sx, originY + stageH),
                            strokeWidth = 1f
                        )
                        gx += gridStep
                    }
                    var gy = gridStep
                    while (gy < safeHeight) {
                        val sy = originY + gy * stageScale
                        drawLine(
                            color = Color(0xFFF1F5F9),
                            start = Offset(originX, sy),
                            end = Offset(originX + stageW, sy),
                            strokeWidth = 1f
                        )
                        gy += gridStep
                    }
                }

                // 1. Draw Shapes
                for (shape in shapes) {
                    if (shape.points.size < 2) continue
                    val path = Path().apply {
                        val first = toScreen(shape.points.first())
                        moveTo(first.x, first.y)
                        for (i in 1 until shape.points.size) {
                            val pt = toScreen(shape.points[i])
                            lineTo(pt.x, pt.y)
                        }
                        if (shape.kind != ShapeKind.WALL && shape.points.size >= 3) {
                            close()
                        }
                    }

                    val isSelected = shape.id == selectedShapeId
                    when (shape.kind) {
                        ShapeKind.ROOM -> {
                            drawPath(
                                path = path,
                                color = if (isSelected) TtkBrandRed.copy(alpha = 0.16f) else PlanRoomFill
                            )
                            drawPath(
                                path = path,
                                color = if (isSelected) TtkBrandRed else PlanShapeBorder,
                                style = Stroke(width = if (isSelected) 3.dp.toPx() else 1.8.dp.toPx())
                            )
                        }
                        ShapeKind.CORRIDOR -> {
                            drawPath(
                                path = path,
                                color = if (isSelected) TtkGreen.copy(alpha = 0.22f) else PlanCorridorFill
                            )
                            drawPath(
                                path = path,
                                color = if (isSelected) TtkGreen else PlanShapeBorder,
                                style = Stroke(width = 1.5.dp.toPx())
                            )
                        }
                        ShapeKind.WALL -> {
                            drawPath(
                                path = path,
                                color = if (isSelected) TtkBrandRed else PlanWallStroke,
                                style = Stroke(
                                    width = 3.2.dp.toPx(),
                                    cap = StrokeCap.Round,
                                    join = StrokeJoin.Round
                                )
                            )
                        }
                    }

                    if (shape.label.isNotBlank() && shape.kind != ShapeKind.WALL) {
                        val avgX = shape.points.map { it.x }.average()
                        val avgY = shape.points.map { it.y }.average()
                        val center = toScreen(Point(avgX, avgY))
                        val measured = textMeasurer.measure(
                            text = shape.label,
                            style = TextStyle(
                                color = Color(0xFF475569),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        )
                        drawText(
                            textLayoutResult = measured,
                            topLeft = Offset(
                                center.x - measured.size.width / 2f,
                                center.y - measured.size.height / 2f
                            )
                        )
                    }
                }

                // Draft polygon points in editor mode
                if (draftPolygonPoints.isNotEmpty()) {
                    val draftPath = Path().apply {
                        val first = toScreen(draftPolygonPoints.first())
                        moveTo(first.x, first.y)
                        for (i in 1 until draftPolygonPoints.size) {
                            val pt = toScreen(draftPolygonPoints[i])
                            lineTo(pt.x, pt.y)
                        }
                    }
                    drawPath(
                        path = draftPath,
                        color = TtkBrandRed,
                        style = Stroke(
                            width = 2.5.dp.toPx(),
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f))
                        )
                    )
                    for (pt in draftPolygonPoints) {
                        drawCircle(
                            color = TtkBrandRed,
                            radius = 5.dp.toPx(),
                            center = toScreen(pt)
                        )
                    }
                }

                // 2. Optional Navigation Graph
                if (showNavGraph) {
                    val nodesById = nodes.associateBy { it.id }
                    for (edge in edges) {
                        val a = nodesById[edge.a] ?: continue
                        val b = nodesById[edge.b] ?: continue
                        drawLine(
                            color = TtkGreen.copy(alpha = 0.65f),
                            start = toScreen(Point(a.x, a.y)),
                            end = toScreen(Point(b.x, b.y)),
                            strokeWidth = 2.2.dp.toPx(),
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f))
                        )
                    }
                    for (node in nodes) {
                        val pos = toScreen(Point(node.x, node.y))
                        val isNodeSelected = node.id == selectedNodeId
                        drawCircle(
                            color = if (isNodeSelected) TtkBrandRed else TtkGreen,
                            radius = if (isNodeSelected) 7.dp.toPx() else 5.dp.toPx(),
                            center = pos
                        )
                        drawCircle(
                            color = Color.White,
                            radius = 2.2.dp.toPx(),
                            center = pos
                        )
                    }
                }

                // 3. Active Route Polyline (.animate-route)
                if (routePolyline != null && routePolyline.size >= 2) {
                    val routePath = Path().apply {
                        val start = toScreen(routePolyline.first())
                        moveTo(start.x, start.y)
                        for (i in 1 until routePolyline.size) {
                            val pt = toScreen(routePolyline[i])
                            lineTo(pt.x, pt.y)
                        }
                    }
                    drawPath(
                        path = routePath,
                        color = TtkBrandRed.copy(alpha = 0.20f),
                        style = Stroke(
                            width = 9.dp.toPx(),
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round
                        )
                    )
                    drawPath(
                        path = routePath,
                        color = TtkBrandRed,
                        style = Stroke(
                            width = 4.dp.toPx(),
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(18f, 12f), dashPhase)
                        )
                    )
                    val startScreen = toScreen(routePolyline.first())
                    val endScreen = toScreen(routePolyline.last())
                    drawCircle(color = Color.White, radius = 8.dp.toPx(), center = startScreen)
                    drawCircle(color = PoiEntranceGreen, radius = 6.dp.toPx(), center = startScreen)

                    drawCircle(color = Color.White, radius = 8.dp.toPx(), center = endScreen)
                    drawCircle(color = TtkBrandRed, radius = 6.dp.toPx(), center = endScreen)
                }

                // 4. Panorama Markers (.ttk-plan__pano)
                for (pano in panoramas) {
                    val pos = toScreen(Point(pano.x, pano.y))
                    val isActive = pano.id == activePanoramaId
                    drawCircle(
                        color = TtkBrandRed.copy(alpha = if (isActive) 0.34f else 0.18f),
                        radius = (11.dp.toPx() * pulseRadiusFactor),
                        center = pos
                    )
                    drawCircle(
                        color = Color.White,
                        radius = 7.dp.toPx(),
                        center = pos
                    )
                    drawCircle(
                        color = TtkBrandRed,
                        radius = 5.dp.toPx(),
                        center = pos
                    )
                }

                // 5. POI Pins (.ttk-plan__pin)
                for (poi in pois) {
                    val pos = toScreen(Point(poi.x, poi.y))
                    val isSelected = poi.id == selectedPoiId
                    val pinColor = poiCategoryColor(poi.category)
                    val radius = if (isSelected) 14.dp.toPx() else 11.dp.toPx()

                    if (isSelected) {
                        drawCircle(
                            color = pinColor.copy(alpha = 0.25f),
                            radius = radius * pulseRadiusFactor,
                            center = pos
                        )
                    }

                    drawCircle(
                        color = if (isSelected) pinColor else Color.White,
                        radius = radius,
                        center = pos
                    )
                    drawCircle(
                        color = pinColor,
                        radius = radius,
                        center = pos,
                        style = Stroke(width = 2.4.dp.toPx())
                    )
                    drawCircle(
                        color = if (isSelected) Color.White else pinColor,
                        radius = 4.dp.toPx(),
                        center = pos
                    )

                    if (isSelected || zoom >= 1.15f || pois.size <= 8) {
                        val labelLayout = textMeasurer.measure(
                            text = poi.title,
                            style = TextStyle(
                                color = Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        )
                        val padH = 5.dp.toPx()
                        val padV = 2.5.dp.toPx()
                        val boxW = labelLayout.size.width + padH * 2
                        val boxH = labelLayout.size.height + padV * 2
                        val boxLeft = pos.x - boxW / 2f
                        val boxTop = pos.y + radius + 4.dp.toPx()

                        drawRoundRect(
                            color = if (isSelected) TtkBrandRed else Color(0xDE0F172A),
                            topLeft = Offset(boxLeft, boxTop),
                            size = Size(boxW, boxH),
                            cornerRadius = CornerRadius(6.dp.toPx())
                        )
                        drawText(
                            textLayoutResult = labelLayout,
                            topLeft = Offset(boxLeft + padH, boxTop + padV)
                        )
                    }
                }

                // 6. Active Capture Point Picker crosshair
                if (captureMarkerPoint != null) {
                    val cPos = toScreen(captureMarkerPoint)
                    drawCircle(
                        color = TtkGreen.copy(alpha = 0.25f),
                        radius = 16.dp.toPx(),
                        center = cPos
                    )
                    drawCircle(
                        color = TtkGreen,
                        radius = 7.dp.toPx(),
                        center = cPos
                    )
                }
            }
        }
        }

        stageContent(Modifier.fillMaxSize())
        if (isFullscreen) {
            FullscreenExpandedDialog(
                visible = true,
                title = "2D-План пространства",
                onDismiss = { isFullscreen = false },
                actions = {
                    IconButton(
                        onClick = {
                            zoom = 1f
                            panOffset = Offset.Zero
                        }
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Сброс масштаба", tint = Color.White)
                    }
                }
            ) {
                stageContent(Modifier.fillMaxSize())
            }
        }
    }
}
