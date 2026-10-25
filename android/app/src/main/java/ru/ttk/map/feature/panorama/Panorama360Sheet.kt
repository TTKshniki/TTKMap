package ru.ttk.map.feature.panorama

import android.content.Context
import android.graphics.Bitmap
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.view.HapticFeedbackConstants
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import ru.ttk.map.core.domain.CoordinateMath
import ru.ttk.map.core.model.AssetRef
import ru.ttk.map.core.model.Hotspot
import ru.ttk.map.core.model.HotspotKind
import ru.ttk.map.core.model.Panorama
import ru.ttk.map.core.model.PanoramaWalkStep
import ru.ttk.map.core.model.Poi
import ru.ttk.map.core.network.TtkNetworkEnvironment
import ru.ttk.map.ui.theme.TtkBrandRed
import ru.ttk.map.ui.theme.TtkDeepTeal
import ru.ttk.map.ui.theme.TtkEyebrow
import ru.ttk.map.ui.theme.TtkGreen
import ru.ttk.map.ui.theme.TtkLiveDot
import ru.ttk.map.ui.theme.TtkPrimaryButton
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.tan

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun Panorama360Dialog(
    panorama: Panorama,
    allPanoramas: List<Panorama>,
    hotspots: List<Hotspot>,
    pois: List<Poi>,
    assets: List<AssetRef>,
    initialYawDeg: Double = 0.0,
    editable: Boolean = false,
    walkSteps: List<PanoramaWalkStep> = emptyList(),
    currentWalkStepIndex: Int = -1,
    network: TtkNetworkEnvironment,
    onDismiss: () -> Unit,
    onSelectPanorama: (Panorama, Double) -> Unit,
    onSelectPoi: ((Poi) -> Unit)? = null,
    onAdvanceWalkStep: ((Int) -> Unit)? = null,
    onAddHotspot: ((HotspotKind, Double, Double, String?, String?) -> Unit)? = null,
    onDeleteHotspot: ((String) -> Unit)? = null
) {
    val context = LocalContext.current
    val view = LocalView.current
    val asset = remember(panorama.assetId, assets) {
        assets.firstOrNull { it.id == panorama.assetId }
    }
    val (minPitch, maxPitch) = remember(asset) { CoordinateMath.pitchBounds(asset) }

    var yawDeg by remember(panorama.id, initialYawDeg) {
        mutableDoubleStateOf(CoordinateMath.normalizeYaw(initialYawDeg))
    }
    var pitchDeg by remember(panorama.id, minPitch, maxPitch) {
        mutableDoubleStateOf(0.0.coerceIn(minPitch, maxPitch))
    }
    var hfovDeg by remember { mutableDoubleStateOf(95.0) }
    var gyroEnabled by remember { mutableStateOf(false) }

    var loadedBitmap by remember(panorama.assetId) { mutableStateOf<Bitmap?>(null) }
    var activePoiSheet by remember { mutableStateOf<Poi?>(null) }
    var showAddHotspotSheet by remember { mutableStateOf(false) }

    // Progressive equirectangular loading: preview -> mobile -> full
    LaunchedEffect(panorama.assetId, asset) {
        loadedBitmap = null
        val urls = listOfNotNull(
            asset?.previewUrl?.takeIf { it.isNotBlank() },
            asset?.mobileUrl?.takeIf { it.isNotBlank() } ?: "/api/v1/media/${panorama.assetId}/mobile",
            asset?.fullUrl?.takeIf { it.isNotBlank() }
        ).distinct()

        for (url in urls) {
            val bmp = network.loadBitmap(url)
            if (bmp != null) {
                loadedBitmap = bmp
            }
        }
    }

    // Optional Gyroscope look-around
    DisposableEffect(gyroEnabled, minPitch, maxPitch) {
        if (!gyroEnabled) return@DisposableEffect onDispose {}
        val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val rotationSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
            ?: sensorManager?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

        var lastAzimuth: Float? = null
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                val rotationMatrix = FloatArray(9)
                val orientation = FloatArray(3)
                SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
                SensorManager.getOrientation(rotationMatrix, orientation)
                val azimuthDeg = Math.toDegrees(orientation[0].toDouble()).toFloat()
                val rollPitchDeg = (-Math.toDegrees(orientation[1].toDouble())).coerceIn(minPitch, maxPitch)
                if (lastAzimuth != null) {
                    val delta = CoordinateMath.angleDelta(lastAzimuth!!.toDouble(), azimuthDeg.toDouble())
                    if (abs(delta) < 45.0) {
                        yawDeg = CoordinateMath.normalizeYaw(yawDeg + delta * 0.65)
                    }
                }
                lastAzimuth = azimuthDeg
                pitchDeg = rollPitchDeg
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }

        if (rotationSensor != null) {
            sensorManager?.registerListener(listener, rotationSensor, SensorManager.SENSOR_DELAY_GAME)
        }
        onDispose {
            sensorManager?.unregisterListener(listener)
        }
    }

    val activeHotspots = remember(panorama.id, hotspots, pois, allPanoramas) {
        val poiIds = pois.map { it.id }.toSet()
        val panoIds = allPanoramas.map { it.id }.toSet()
        hotspots.filter { hs ->
            hs.panoramaId == panorama.id &&
                if (hs.kind == HotspotKind.POI) hs.poiId in poiIds else hs.targetPanoramaId in panoIds
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF091213))
        ) {
            // Spherical 360° Interactive Viewport
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(minPitch, maxPitch) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            val degPerPx = hfovDeg / size.width.coerceAtLeast(1).toDouble()
                            yawDeg = CoordinateMath.normalizeYaw(yawDeg - pan.x * degPerPx)
                            pitchDeg = (pitchDeg + pan.y * degPerPx).coerceIn(minPitch, maxPitch)
                            if (zoom != 1f) {
                                hfovDeg = CoordinateMath.clampHfov(hfovDeg / zoom.toDouble())
                            }
                        }
                    }
            ) {
                val widthPx = constraints.maxWidth.toFloat().coerceAtLeast(1f)
                val heightPx = constraints.maxHeight.toFloat().coerceAtLeast(1f)
                val vfovDeg = (hfovDeg * (heightPx / widthPx)).coerceIn(25.0, 120.0)
                val density = LocalDensity.current

                Canvas(modifier = Modifier.fillMaxSize()) {
                    val bmp = loadedBitmap
                    if (bmp != null) {
                        drawEquirectangularSlice(
                            bitmap = bmp,
                            yawDeg = yawDeg,
                            pitchDeg = pitchDeg,
                            hfovDeg = hfovDeg,
                            vfovDeg = vfovDeg,
                            vaovDeg = asset?.vaovDeg ?: 180.0,
                            vOffsetDeg = asset?.vOffsetDeg ?: 0.0
                        )
                    } else {
                        drawSyntheticArchitecturalPanorama(
                            yawDeg = yawDeg,
                            pitchDeg = pitchDeg,
                            hfovDeg = hfovDeg,
                            vfovDeg = vfovDeg
                        )
                    }

                    val center = Offset(size.width / 2f, size.height / 2f)
                    if (editable) {
                        drawCircle(
                            color = TtkBrandRed,
                            radius = 18.dp.toPx(),
                            center = center,
                            style = Stroke(
                                width = 2.dp.toPx(),
                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))
                            )
                        )
                        drawCircle(
                            color = Color.White,
                            radius = 4.dp.toPx(),
                            center = center
                        )
                    }
                }

                // Project 3D Hotspots onto 2D viewport coordinates
                for (hs in activeHotspots) {
                    val dYaw = CoordinateMath.angleDelta(yawDeg, hs.yawDeg)
                    val dPitch = hs.pitchDeg - pitchDeg
                    if (abs(dYaw) <= hfovDeg * 0.62 && abs(dPitch) <= vfovDeg * 0.62) {
                        val normX = 0.5 + (tan(dYaw * PI / 180.0) / (2.0 * tan((hfovDeg * PI / 180.0) / 2.0)))
                        val normY = 0.5 - (tan(dPitch * PI / 180.0) / (2.0 * tan((vfovDeg * PI / 180.0) / 2.0)))

                        if (normX in -0.05..1.05 && normY in -0.05..1.05) {
                            val xPx = (normX * widthPx).roundToInt()
                            val yPx = (normY * heightPx).roundToInt()
                            val label = CoordinateMath.hotspotLabel(hs, pois, allPanoramas)
                            val isWalkNext = walkSteps.getOrNull(currentWalkStepIndex)?.nextHotspotId == hs.id

                            HotspotPinOverlay(
                                hotspot = hs,
                                label = label,
                                isHighlightedWalkStep = isWalkNext,
                                editable = editable,
                                modifier = Modifier.offset {
                                    IntOffset(
                                        x = xPx - with(density) { 24.dp.roundToPx() },
                                        y = yPx - with(density) { 22.dp.roundToPx() }
                                    )
                                },
                                onClick = {
                                    view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                                    if (hs.kind == HotspotKind.POI) {
                                        val poi = pois.firstOrNull { it.id == hs.poiId }
                                        if (poi != null) activePoiSheet = poi
                                    } else {
                                        val target = allPanoramas.firstOrNull { it.id == hs.targetPanoramaId }
                                        if (target != null) {
                                            onSelectPanorama(target, hs.yawDeg)
                                        }
                                    }
                                },
                                onDelete = if (editable && onDeleteHotspot != null) {
                                    { onDeleteHotspot(hs.id) }
                                } else null
                            )
                        }
                    }
                }
            }

            // Top Glass HUD Bar
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
                    .align(Alignment.TopCenter),
                shape = RoundedCornerShape(20.dp),
                color = TtkDeepTeal.copy(alpha = 0.90f),
                contentColor = Color.White
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        TtkEyebrow(
                            text = if (editable) "РЕДАКТОР ХОТСПOТОВ 360°" else "ПАНОРАМА 360° · ТТК",
                            lightOnDark = true
                        )
                        Text(
                            text = panorama.title,
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White
                        )
                        Text(
                            text = "Азимут ${yawDeg.roundToInt()}° · Наклон ${pitchDeg.roundToInt()}° · Обзор ${hfovDeg.roundToInt()}°",
                            fontSize = 11.sp,
                            color = Color(0xFFB2D2C9)
                        )
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilledTonalIconButton(
                            onClick = { gyroEnabled = !gyroEnabled }
                        ) {
                            Icon(
                                imageVector = Icons.Default.LocationOn,
                                contentDescription = "Гироскоп",
                                tint = if (gyroEnabled) TtkLiveDot else Color.White
                            )
                        }
                        FilledTonalIconButton(
                            onClick = {
                                yawDeg = 0.0
                                pitchDeg = 0.0.coerceIn(minPitch, maxPitch)
                                hfovDeg = 95.0
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = "Сбросить обзор",
                                tint = Color.White
                            )
                        }
                        IconButton(onClick = onDismiss) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Закрыть панораму",
                                tint = Color.White
                            )
                        }
                    }
                }
            }

            // Bottom Controls
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
                    .align(Alignment.BottomCenter),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (walkSteps.isNotEmpty() && currentWalkStepIndex in walkSteps.indices) {
                    val step = walkSteps[currentWalkStepIndex]
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = TtkDeepTeal.copy(alpha = 0.94f),
                        contentColor = Color.White
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                TtkEyebrow(
                                    text = "ВИРТУАЛЬНЫЙ ПРОХОД ПО МАРШРУТУ",
                                    lightOnDark = true
                                )
                                Text(
                                    text = "Шаг ${currentWalkStepIndex + 1} из ${walkSteps.size} · ${panorama.title}",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = Color.White
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (currentWalkStepIndex > 0) {
                                    Button(
                                        onClick = { onAdvanceWalkStep?.invoke(currentWalkStepIndex - 1) },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.16f))
                                    ) {
                                        Text("Назад")
                                    }
                                }
                                if (currentWalkStepIndex < walkSteps.size - 1) {
                                    TtkPrimaryButton(
                                        text = "Далее по маршруту",
                                        icon = Icons.AutoMirrored.Filled.ArrowForward,
                                        onClick = {
                                            view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                                            onAdvanceWalkStep?.invoke(currentWalkStepIndex + 1)
                                        }
                                    )
                                } else {
                                    Button(
                                        onClick = { yawDeg = step.yawDeg },
                                        colors = ButtonDefaults.buttonColors(containerColor = TtkGreen)
                                    ) {
                                        Text("Финиш маршрута")
                                    }
                                }
                            }
                        }
                    }
                }

                if (editable && onAddHotspot != null) {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = Color.White.copy(alpha = 0.95f)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Прицел: Yaw ${yawDeg.roundToInt()}° / Pitch ${pitchDeg.roundToInt()}°",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = Color(0xFF1C292D)
                                )
                                Text(
                                    text = "Наведите перекрестие в центр нужного объекта или прохода",
                                    fontSize = 11.sp,
                                    color = Color(0xFF667377)
                                )
                            }
                            TtkPrimaryButton(
                                text = "Добавить хотспот",
                                icon = Icons.Default.Add,
                                onClick = { showAddHotspotSheet = true }
                            )
                        }
                    }
                }

                if (allPanoramas.size > 1) {
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = Color(0xCC111F20)
                    ) {
                        FlowRow(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            allPanoramas.forEach { item ->
                                val selected = item.id == panorama.id
                                Surface(
                                    shape = CircleShape,
                                    color = if (selected) TtkBrandRed else Color.White.copy(alpha = 0.14f),
                                    modifier = Modifier.clickable {
                                        onSelectPanorama(item, 0.0)
                                    }
                                ) {
                                    Text(
                                        text = item.title,
                                        color = Color.White,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            AnimatedVisibility(
                visible = activePoiSheet != null,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.align(Alignment.Center)
            ) {
                activePoiSheet?.let { poi ->
                    Surface(
                        shape = RoundedCornerShape(24.dp),
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 12.dp,
                        modifier = Modifier
                            .padding(24.dp)
                            .fillMaxWidth(0.88f)
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            TtkEyebrow(text = poi.displayCategoryLabel())
                            Text(
                                text = poi.title,
                                style = MaterialTheme.typography.headlineMedium
                            )
                            if (poi.description.isNotBlank()) {
                                Text(
                                    text = poi.description,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.End,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (onSelectPoi != null) {
                                    Button(
                                        onClick = {
                                            activePoiSheet = null
                                            onSelectPoi(poi)
                                            onDismiss()
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = TtkGreen)
                                    ) {
                                        Text("Показать на 2D-плане")
                                    }
                                    Spacer(modifier = Modifier.width(8.dp))
                                }
                                TtkPrimaryButton(
                                    text = "Закрыть",
                                    onClick = { activePoiSheet = null }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddHotspotSheet && editable && onAddHotspot != null) {
        AddHotspotBottomSheet(
            currentPanoramaId = panorama.id,
            yawDeg = yawDeg,
            pitchDeg = pitchDeg,
            pois = pois,
            panoramas = allPanoramas,
            onDismiss = { showAddHotspotSheet = false },
            onConfirm = { kind, poiId, targetPanoId ->
                val (clampedYaw, clampedPitch) = CoordinateMath.clampHotspotAngles(yawDeg, pitchDeg)
                onAddHotspot(kind, clampedYaw, clampedPitch, poiId, targetPanoId)
                showAddHotspotSheet = false
            }
        )
    }
}

@Composable
private fun HotspotPinOverlay(
    hotspot: Hotspot,
    label: String,
    isHighlightedWalkStep: Boolean,
    editable: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
    onDelete: (() -> Unit)? = null
) {
    val isTransition = hotspot.kind == HotspotKind.TRANSITION
    val bgColor = when {
        isHighlightedWalkStep -> TtkLiveDot
        isTransition -> TtkGreen
        else -> TtkBrandRed
    }

    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(bgColor.copy(alpha = 0.94f))
            .border(
                width = if (isHighlightedWalkStep) 2.5.dp else 1.5.dp,
                color = Color.White,
                shape = CircleShape
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(
            imageVector = if (isTransition) Icons.AutoMirrored.Filled.ArrowForward else Icons.Default.Place,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(16.dp)
        )
        Text(
            text = label,
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
        if (editable && onDelete != null) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = "Удалить хотспот",
                tint = Color.White,
                modifier = Modifier
                    .size(18.dp)
                    .clickable(onClick = onDelete)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddHotspotBottomSheet(
    currentPanoramaId: String,
    yawDeg: Double,
    pitchDeg: Double,
    pois: List<Poi>,
    panoramas: List<Panorama>,
    onDismiss: () -> Unit,
    onConfirm: (HotspotKind, String?, String?) -> Unit
) {
    val otherPanoramas = remember(currentPanoramaId, panoramas) {
        panoramas.filter { it.id != currentPanoramaId }
    }
    var kind by remember {
        mutableStateOf(if (pois.isNotEmpty()) HotspotKind.POI else HotspotKind.TRANSITION)
    }
    var selectedPoiId by remember(pois) { mutableStateOf(pois.firstOrNull()?.id) }
    var selectedTargetPanoId by remember(otherPanoramas) { mutableStateOf(otherPanoramas.firstOrNull()?.id) }
    var dropdownExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            TtkEyebrow(text = "НОВЫЙ ХОТСПOТ В ПАНОРАМЕ")
            Text(
                text = "Привязка к углу Yaw ${yawDeg.roundToInt()}° · Pitch ${pitchDeg.roundToInt()}°",
                style = MaterialTheme.typography.titleLarge
            )

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FilterChip(
                    selected = kind == HotspotKind.POI,
                    onClick = { kind = HotspotKind.POI },
                    label = { Text("Точка интереса (POI)") }
                )
                FilterChip(
                    selected = kind == HotspotKind.TRANSITION,
                    onClick = { kind = HotspotKind.TRANSITION },
                    label = { Text("Переход к панораме") }
                )
            }

            if (kind == HotspotKind.POI) {
                if (pois.isEmpty()) {
                    Text(
                        text = "Сначала добавьте хотя бы одну точку интереса (POI) на 2D-плане.",
                        color = MaterialTheme.colorScheme.error
                    )
                } else {
                    val currentPoi = pois.firstOrNull { it.id == selectedPoiId }
                    ExposedDropdownMenuBox(
                        expanded = dropdownExpanded,
                        onExpandedChange = { dropdownExpanded = it }
                    ) {
                        OutlinedTextField(
                            value = currentPoi?.title ?: "Выберите объект",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Объект POI") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = dropdownExpanded) },
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = dropdownExpanded,
                            onDismissRequest = { dropdownExpanded = false }
                        ) {
                            pois.forEach { poi ->
                                DropdownMenuItem(
                                    text = { Text("${poi.title} (${poi.displayCategoryLabel()})") },
                                    onClick = {
                                        selectedPoiId = poi.id
                                        dropdownExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
            } else {
                if (otherPanoramas.isEmpty()) {
                    Text(
                        text = "Для создания перехода нужна хотя бы ещё одна панорама на карте.",
                        color = MaterialTheme.colorScheme.error
                    )
                } else {
                    val currentTarget = otherPanoramas.firstOrNull { it.id == selectedTargetPanoId }
                    ExposedDropdownMenuBox(
                        expanded = dropdownExpanded,
                        onExpandedChange = { dropdownExpanded = it }
                    ) {
                        OutlinedTextField(
                            value = currentTarget?.title ?: "Выберите целевую панораму",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Целевая панорама перехода") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = dropdownExpanded) },
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = dropdownExpanded,
                            onDismissRequest = { dropdownExpanded = false }
                        ) {
                            otherPanoramas.forEach { p ->
                                DropdownMenuItem(
                                    text = { Text(p.title) },
                                    onClick = {
                                        selectedTargetPanoId = p.id
                                        dropdownExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
            }

            val canSave = if (kind == HotspotKind.POI) selectedPoiId != null else selectedTargetPanoId != null
            TtkPrimaryButton(
                text = "Сохранить хотспот",
                enabled = canSave,
                onClick = {
                    onConfirm(
                        kind,
                        if (kind == HotspotKind.POI) selectedPoiId else null,
                        if (kind == HotspotKind.TRANSITION) selectedTargetPanoId else null
                    )
                },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawEquirectangularSlice(
    bitmap: Bitmap,
    yawDeg: Double,
    pitchDeg: Double,
    hfovDeg: Double,
    vfovDeg: Double,
    vaovDeg: Double,
    vOffsetDeg: Double
) {
    val imgBitmap = bitmap.asImageBitmap()
    val bmpW = bitmap.width
    val bmpH = bitmap.height

    val centerU = ((yawDeg + 180.0) / 360.0).coerceIn(0.0, 1.0)
    val spanU = (hfovDeg / 360.0).coerceIn(0.08, 0.95)

    val effectiveVaov = vaovDeg.takeIf { it > 10.0 } ?: 180.0
    val centerV = (0.5 - ((pitchDeg - vOffsetDeg) / effectiveVaov)).coerceIn(0.05, 0.95)
    val spanV = (vfovDeg / effectiveVaov).coerceIn(0.10, 0.95)

    val srcTop = ((centerV - spanV / 2.0).coerceIn(0.0, 0.92) * bmpH).roundToInt()
    val srcBottom = ((centerV + spanV / 2.0).coerceIn(0.08, 1.0) * bmpH).roundToInt()
    val srcH = (srcBottom - srcTop).coerceAtLeast(1)

    val uLeft = centerU - spanU / 2.0
    val uRight = centerU + spanU / 2.0

    if (uLeft >= 0.0 && uRight <= 1.0) {
        val srcX = (uLeft * bmpW).roundToInt()
        val srcW = ((uRight - uLeft) * bmpW).roundToInt().coerceAtLeast(1)
        drawImage(
            image = imgBitmap,
            srcOffset = IntOffset(srcX, srcTop),
            srcSize = IntSize(srcW.coerceAtMost(bmpW - srcX), srcH),
            dstOffset = IntOffset.Zero,
            dstSize = IntSize(size.width.roundToInt(), size.height.roundToInt())
        )
    } else {
        val wrappedLeft = (uLeft + 1.0) % 1.0
        val leftFraction = (1.0 - wrappedLeft) / spanU
        val splitScreenX = (size.width * leftFraction.toFloat()).roundToInt().coerceIn(1, size.width.roundToInt() - 1)

        val srcX1 = (wrappedLeft * bmpW).roundToInt().coerceIn(0, bmpW - 1)
        val srcW1 = (bmpW - srcX1).coerceAtLeast(1)
        drawImage(
            image = imgBitmap,
            srcOffset = IntOffset(srcX1, srcTop),
            srcSize = IntSize(srcW1, srcH),
            dstOffset = IntOffset(0, 0),
            dstSize = IntSize(splitScreenX, size.height.roundToInt())
        )

        val rightSpanU = spanU - (1.0 - wrappedLeft)
        val srcW2 = (rightSpanU * bmpW).roundToInt().coerceIn(1, bmpW)
        drawImage(
            image = imgBitmap,
            srcOffset = IntOffset(0, srcTop),
            srcSize = IntSize(srcW2, srcH),
            dstOffset = IntOffset(splitScreenX, 0),
            dstSize = IntSize(size.width.roundToInt() - splitScreenX, size.height.roundToInt())
        )
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawSyntheticArchitecturalPanorama(
    yawDeg: Double,
    pitchDeg: Double,
    hfovDeg: Double,
    vfovDeg: Double
) {
    val horizonY = (size.height * (0.5 + (pitchDeg / vfovDeg))).toFloat().coerceIn(0f, size.height)

    drawRect(
        brush = Brush.verticalGradient(
            colors = listOf(Color(0xFF0E2122), Color(0xFF1E3B3B), Color(0xFF284D4B)),
            startY = 0f,
            endY = horizonY.coerceAtLeast(1f)
        ),
        topLeft = Offset.Zero,
        size = Size(size.width, horizonY)
    )

    drawRect(
        brush = Brush.verticalGradient(
            colors = listOf(Color(0xFF1F3133), Color(0xFF142224), Color(0xFF0A1214)),
            startY = horizonY,
            endY = size.height
        ),
        topLeft = Offset(0f, horizonY),
        size = Size(size.width, size.height - horizonY)
    )

    drawLine(
        color = Color(0xFF1D6860),
        start = Offset(0f, horizonY),
        end = Offset(size.width, horizonY),
        strokeWidth = 3f
    )

    val stepDeg = 22.5
    var angle = -180.0
    while (angle < 180.0) {
        val dYaw = CoordinateMath.angleDelta(yawDeg, angle)
        if (abs(dYaw) <= hfovDeg * 0.65) {
            val x = (size.width * (0.5 + dYaw / hfovDeg)).toFloat()
            val isCardinal = abs(angle % 90.0) < 0.1
            drawLine(
                color = if (isCardinal) TtkBrandRed.copy(alpha = 0.55f) else Color.White.copy(alpha = 0.13f),
                start = Offset(x, 0f),
                end = Offset(x, size.height),
                strokeWidth = if (isCardinal) 3f else 1.5f
            )
            val panelTop = (horizonY - size.height * 0.22f).coerceAtLeast(0f)
            val panelHeight = size.height * 0.44f
            drawRect(
                color = Color.White.copy(alpha = 0.04f),
                topLeft = Offset(x - 28f, panelTop),
                size = Size(56f, panelHeight)
            )
        }
        angle += stepDeg
    }
}
