package ru.ttk.map.ui.components

import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.ttk.map.core.model.Panorama
import ru.ttk.map.core.model.Point
import ru.ttk.map.core.model.Poi
import ru.ttk.map.core.model.PoiCategory
import ru.ttk.map.core.model.Shape
import ru.ttk.map.core.model.ShapeKind
import ru.ttk.map.ui.theme.PlanCorridorFill
import ru.ttk.map.ui.theme.PlanRoomFill
import ru.ttk.map.ui.theme.TtkBrandRed
import ru.ttk.map.ui.theme.TtkDeepTeal
import ru.ttk.map.ui.theme.TtkGreen
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Interactive 3D Isometric & Perspective Space Model Canvas.
 * Fulfills Section 6 ("Полноценная 3D-модель пространства") with real-time gesture rotation,
 * extruded architectural 3D walls, elevated floating POI markers, and 3D animated route lines.
 */
@Composable
fun Interactive3DPlanCanvas(
    widthUnits: Double,
    heightUnits: Double,
    shapes: List<Shape>,
    pois: List<Poi>,
    panoramas: List<Panorama>,
    selectedPoiId: String? = null,
    routePolyline: List<Point>? = null,
    onSelectPoi: (Poi) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val view = LocalView.current
    val textMeasurer = rememberTextMeasurer()

    var azimuthDeg by remember { mutableFloatStateOf(35f) } // Rotation around vertical axis (-180..180)
    var elevationDeg by remember { mutableFloatStateOf(48f) } // Pitch / tilt angle (20..75)
    var zoomScale by remember { mutableFloatStateOf(1.0f) }
    var panOffsetX by remember { mutableFloatStateOf(0f) }
    var panOffsetY by remember { mutableFloatStateOf(0f) }
    var isFullscreen by remember { mutableStateOf(false) }

    val infiniteTransition = rememberInfiniteTransition(label = "3dAnim")
    val routeDashPhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = -30f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "3dRouteDash"
    )
    val floatBounce by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 6f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400),
            repeatMode = RepeatMode.Reverse
        ),
        label = "poiFloat"
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(22.dp))
    ) {
        // 3D Header Toolbar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = TtkDeepTeal.copy(alpha = 0.12f)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(TtkGreen)
                    )
                    Text(
                        text = "3D Изометрия · Азимут: ${azimuthDeg.roundToInt()}° · Наклон: ${elevationDeg.roundToInt()}°",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                IconButton(
                    onClick = {
                        azimuthDeg = 35f
                        elevationDeg = 48f
                        zoomScale = 1.0f
                        panOffsetX = 0f
                        panOffsetY = 0f
                        view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                    },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = "Сбросить камеру",
                        modifier = Modifier.size(16.dp)
                    )
                }
                IconButton(
                    onClick = { isFullscreen = true },
                    modifier = Modifier.size(32.dp)
                ) {
                    FullscreenExpandIcon(tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(18.dp))
                }
            }
        }

        // Interactive 3D Render Surface Lambda
        val render3dSurface: @Composable (Modifier) -> Unit = { surfaceModifier ->
            Box(
                modifier = surfaceModifier
                    .background(Color(0xFF0F1718))
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        zoomScale = (zoomScale * zoom).coerceIn(0.6f, 3.5f)
                        // If one or two fingers drag, update azimuth & tilt
                        azimuthDeg = ((azimuthDeg + pan.x * 0.4f + 180f) % 360f) - 180f
                        elevationDeg = (elevationDeg - pan.y * 0.3f).coerceIn(20f, 75f)
                    }
                }
        ) {
            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(pois) {
                        detectTapGestures { tapOffset ->
                            // Hit test 3D projected POI markers
                            // Re-project pois and check proximity
                            val safeW = widthUnits.coerceAtLeast(1.0).toFloat()
                            val safeH = heightUnits.coerceAtLeast(1.0).toFloat()
                            val cx = size.width / 2f + panOffsetX
                            val cy = size.height / 2f + panOffsetY
                            val baseScale = (min(size.width / safeW, size.height / safeH) * 0.85f) * zoomScale

                            val radAzimuth = Math.toRadians(azimuthDeg.toDouble())
                            val radElevation = Math.toRadians(elevationDeg.toDouble())
                            val cosA = cos(radAzimuth).toFloat()
                            val sinA = sin(radAzimuth).toFloat()
                            val sinE = sin(radElevation).toFloat()
                            val cosE = cos(radElevation).toFloat()

                            val hitPoi = pois.firstOrNull { poi ->
                                val lx = (poi.x.toFloat() - safeW / 2f) * baseScale
                                val ly = (poi.y.toFloat() - safeH / 2f) * baseScale
                                val lz = 24f * baseScale // Pin height

                                val rx = lx * cosA - ly * sinA
                                val ry = (lx * sinA + ly * cosA) * cosE - lz * sinE
                                val screenX = cx + rx
                                val screenY = cy + ry
                                hypot(tapOffset.x - screenX, tapOffset.y - screenY) <= 36f
                            }
                            if (hitPoi != null) {
                                view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                                onSelectPoi(hitPoi)
                            }
                        }
                    }
            ) {
                val canvasW = size.width
                val canvasH = size.height
                val safeW = widthUnits.coerceAtLeast(1.0).toFloat()
                val safeH = heightUnits.coerceAtLeast(1.0).toFloat()

                val cx = canvasW / 2f + panOffsetX
                val cy = canvasH / 2f + panOffsetY
                val baseScale = (min(canvasW / safeW, canvasH / safeH) * 0.82f) * zoomScale

                val radAzimuth = Math.toRadians(azimuthDeg.toDouble())
                val radElevation = Math.toRadians(elevationDeg.toDouble())
                val cosA = cos(radAzimuth).toFloat()
                val sinA = sin(radAzimuth).toFloat()
                val sinE = sin(radElevation).toFloat()
                val cosE = cos(radElevation).toFloat()

                // Projection Helper: 3D (X, Y, Z) -> Screen 2D (screenX, screenY)
                fun project3D(x: Float, y: Float, z: Float): Offset {
                    val lx = (x - safeW / 2f) * baseScale
                    val ly = (y - safeH / 2f) * baseScale
                    val lz = z * baseScale

                    val rx = lx * cosA - ly * sinA
                    val ry = (lx * sinA + ly * cosA) * cosE - lz * sinE
                    return Offset(cx + rx, cy + ry)
                }

                // 1. Draw 3D Ground Base Grid
                val gridStep = (safeW / 10f).coerceAtLeast(20f)
                val gridColor = Color.Gray.copy(alpha = 0.12f)
                var gx = 0f
                while (gx <= safeW) {
                    val p1 = project3D(gx, 0f, 0f)
                    val p2 = project3D(gx, safeH, 0f)
                    drawLine(gridColor, p1, p2, strokeWidth = 1f)
                    gx += gridStep
                }
                var gy = 0f
                while (gy <= safeH) {
                    val p1 = project3D(0f, gy, 0f)
                    val p2 = project3D(safeW, gy, 0f)
                    drawLine(gridColor, p1, p2, strokeWidth = 1f)
                    gy += gridStep
                }

                // 2. Draw 3D Room / Corridor Floor Polygons
                for (shape in shapes) {
                    if (shape.points.size < 3) continue
                    if (shape.kind == ShapeKind.WALL) continue

                    val floorPath = Path().apply {
                        val first = project3D(shape.points[0].x.toFloat(), shape.points[0].y.toFloat(), 0f)
                        moveTo(first.x, first.y)
                        for (i in 1 until shape.points.size) {
                            val pt = project3D(shape.points[i].x.toFloat(), shape.points[i].y.toFloat(), 0f)
                            lineTo(pt.x, pt.y)
                        }
                        close()
                    }

                    val fillColor = if (shape.kind == ShapeKind.CORRIDOR) {
                        PlanCorridorFill.copy(alpha = 0.85f)
                    } else {
                        PlanRoomFill.copy(alpha = 0.90f)
                    }
                    drawPath(floorPath, fillColor)
                    drawPath(floorPath, Color(0xFF64748B).copy(alpha = 0.4f), style = Stroke(width = 1.5f))
                }

                // 3. Draw 3D Extruded Architectural Walls
                // Height in space units (e.g. 18-24 units)
                val wallHeight = 22f
                val wallTopColor = Color(0xFFE2E8F0)
                val wallFaceColor1 = Color(0xFF94A3B8)
                val wallFaceColor2 = Color(0xFF64748B)

                for (shape in shapes) {
                    if (shape.points.size < 2) continue
                    val isPolygon = shape.points.size >= 3 && shape.kind != ShapeKind.WALL
                    val pointCount = if (isPolygon) shape.points.size else shape.points.size - 1

                    for (i in 0 until pointCount) {
                        val pA = shape.points[i]
                        val pB = shape.points[(i + 1) % shape.points.size]

                        val ax = pA.x.toFloat()
                        val ay = pA.y.toFloat()
                        val bx = pB.x.toFloat()
                        val by = pB.y.toFloat()

                        val bA = project3D(ax, ay, 0f)
                        val bB = project3D(bx, by, 0f)
                        val tA = project3D(ax, ay, wallHeight)
                        val tB = project3D(bx, by, wallHeight)

                        // Vertical Wall Face Polygon
                        val wallFace = Path().apply {
                            moveTo(bA.x, bA.y)
                            lineTo(bB.x, bB.y)
                            lineTo(tB.x, tB.y)
                            lineTo(tA.x, tA.y)
                            close()
                        }

                        // Shading based on orientation
                        val dx = bx - ax
                        val dy = by - ay
                        val angle = (Math.toDegrees(kotlin.math.atan2(dy.toDouble(), dx.toDouble())) + 360) % 360
                        val faceColor = if (angle in 45.0..225.0) wallFaceColor1 else wallFaceColor2

                        drawPath(wallFace, faceColor.copy(alpha = 0.88f))
                        drawPath(wallFace, Color(0xFF334155), style = Stroke(width = 1.2f))

                        // Wall Top Stroke
                        drawLine(wallTopColor, tA, tB, strokeWidth = 2.5f)
                    }
                }

                // 4. Draw 3D Animated Route Polyline
                if (routePolyline != null && routePolyline.size >= 2) {
                    val routeElevation = 10f
                    val routePath = Path()
                    val firstPt = project3D(routePolyline[0].x.toFloat(), routePolyline[0].y.toFloat(), routeElevation)
                    routePath.moveTo(firstPt.x, firstPt.y)

                    for (i in 1 until routePolyline.size) {
                        val pt = project3D(routePolyline[i].x.toFloat(), routePolyline[i].y.toFloat(), routeElevation)
                        routePath.lineTo(pt.x, pt.y)
                    }

                    // Shadow on the floor
                    val shadowPath = Path()
                    val firstShadow = project3D(routePolyline[0].x.toFloat(), routePolyline[0].y.toFloat(), 0f)
                    shadowPath.moveTo(firstShadow.x, firstShadow.y)
                    for (i in 1 until routePolyline.size) {
                        val pt = project3D(routePolyline[i].x.toFloat(), routePolyline[i].y.toFloat(), 0f)
                        shadowPath.lineTo(pt.x, pt.y)
                    }
                    drawPath(
                        path = shadowPath,
                        color = Color.Black.copy(alpha = 0.25f),
                        style = Stroke(width = 4f)
                    )

                    // Elevated animated dashed route
                    drawPath(
                        path = routePath,
                        color = TtkBrandRed,
                        style = Stroke(
                            width = 5.5f,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 8f), routeDashPhase)
                        )
                    )
                }

                // 5. Draw 3D Floating POI Markers
                for (poi in pois) {
                    val px = poi.x.toFloat()
                    val py = poi.y.toFloat()
                    val pinHeight = 26f + (if (poi.id == selectedPoiId) floatBounce else 0f)

                    val floorOffset = project3D(px, py, 0f)
                    val topOffset = project3D(px, py, pinHeight)

                    val isSelected = poi.id == selectedPoiId
                    val catColor = poiCategoryColor(poi.category)

                    // Stem from floor to pin
                    drawLine(
                        color = if (isSelected) TtkBrandRed else Color(0xFF64748B),
                        start = floorOffset,
                        end = topOffset,
                        strokeWidth = if (isSelected) 3f else 1.8f
                    )

                    // Base circle shadow on the floor
                    drawCircle(
                        color = Color.Black.copy(alpha = 0.35f),
                        radius = 4.5f,
                        center = floorOffset
                    )

                    // Floating 3D Pin Head
                    val headRadius = if (isSelected) 12f else 9f
                    drawCircle(
                        color = if (isSelected) TtkBrandRed else catColor,
                        radius = headRadius,
                        center = topOffset
                    )
                    drawCircle(
                        color = Color.White,
                        radius = headRadius * 0.45f,
                        center = topOffset
                    )

                    // POI Label floating above
                    val titleText = if (poi.title.length > 18) poi.title.take(16) + "…" else poi.title
                    val textLayout = textMeasurer.measure(
                        text = titleText,
                        style = TextStyle(
                            fontSize = if (isSelected) 11.sp else 9.sp,
                            fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.SemiBold,
                            color = Color.White
                        )
                    )

                    val tagW = textLayout.size.width + 12f
                    val tagH = textLayout.size.height + 6f
                    val tagTopLeft = Offset(topOffset.x - tagW / 2f, topOffset.y - headRadius - tagH - 4f)

                    drawRoundRect(
                        color = if (isSelected) TtkBrandRed else Color(0xCC0F172A),
                        topLeft = tagTopLeft,
                        size = Size(tagW, tagH),
                        cornerRadius = CornerRadius(6f, 6f)
                    )

                    drawText(
                        textLayoutResult = textLayout,
                        topLeft = Offset(tagTopLeft.x + 6f, tagTopLeft.y + 3f)
                    )
                }

                // 6. Draw 3D Panorama Camera Spheres
                for (pano in panoramas) {
                    val pBase = project3D(pano.x.toFloat(), pano.y.toFloat(), 0f)
                    val pHead = project3D(pano.x.toFloat(), pano.y.toFloat(), 16f)

                    drawLine(TtkGreen, pBase, pHead, strokeWidth = 1.5f)
                    drawCircle(TtkGreen, radius = 6f, center = pHead)
                    drawCircle(Color.White, radius = 2.5f, center = pHead)
                }
            }
        }
        }

        render3dSurface(
            Modifier
                .fillMaxWidth()
                .weight(1f, fill = false)
        )
        if (isFullscreen) {
            FullscreenExpandedDialog(
                visible = true,
                title = "3D-Модель пространства",
                onDismiss = { isFullscreen = false },
                actions = {
                    IconButton(
                        onClick = {
                            azimuthDeg = 35f
                            elevationDeg = 48f
                            zoomScale = 1.0f
                            panOffsetX = 0f
                            panOffsetY = 0f
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Сброс камеры",
                            tint = Color.White
                        )
                    }
                }
            ) {
                render3dSurface(Modifier.fillMaxSize())
            }
        }
    }
}
