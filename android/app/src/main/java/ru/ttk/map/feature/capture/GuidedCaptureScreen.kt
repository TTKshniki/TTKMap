package ru.ttk.map.feature.capture

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint as AndroidPaint
import android.graphics.SurfaceTexture
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.params.OutputConfiguration
import android.hardware.camera2.params.SessionConfiguration
import android.net.Uri
import android.view.HapticFeedbackConstants
import android.view.Surface
import android.view.TextureView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.ttk.map.core.domain.CaptureGuideLogic
import ru.ttk.map.core.model.AssetRef
import ru.ttk.map.core.model.Capture
import ru.ttk.map.core.model.CaptureState
import ru.ttk.map.core.model.CreateCaptureRequest
import ru.ttk.map.core.model.MapDocument
import ru.ttk.map.core.model.Point
import ru.ttk.map.core.repository.TtkMapRepository
import ru.ttk.map.ui.components.Interactive2DPlanCanvas
import ru.ttk.map.ui.theme.TtkBrandRed
import androidx.compose.foundation.layout.displayCutoutPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import ru.ttk.map.core.model.OrganizerMap
import ru.ttk.map.core.model.Panorama
import ru.ttk.map.ui.theme.TtkDeepTeal
import ru.ttk.map.ui.theme.TtkExpressiveLoadingIndicator
import ru.ttk.map.ui.theme.TtkEyebrow
import ru.ttk.map.ui.theme.TtkGreen
import ru.ttk.map.ui.theme.TtkLiveDot
import ru.ttk.map.ui.theme.TtkPrimaryButton
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Fullscreen Guided Capture Screen with TopAppBar and back navigation.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuidedCaptureStandaloneScreen(
    mapId: String,
    repository: TtkMapRepository,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var organizerMap by remember { mutableStateOf<OrganizerMap?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(mapId) {
        loading = true
        runCatching {
            val (map, _) = repository.getOrganizerMap(mapId)
            organizerMap = map
        }
        loading = false
    }

    Scaffold(
        topBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 2.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .displayCutoutPadding()
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Назад",
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Text(
                        text = "Съёмка 360°-панорамы",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 4.dp)
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            val map = organizerMap
            if (loading || map == null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    TtkExpressiveLoadingIndicator(size = 36.dp)
                }
            } else {
                val doc = map.snapshot.document
                GuidedCaptureSection(
                    mapId = mapId,
                    widthUnits = map.snapshot.widthUnits,
                    heightUnits = map.snapshot.heightUnits,
                    document = doc,
                    repository = repository,
                    onNotify = { },
                    onPanoramaAssetReady = { asset, panoTitle, x, y ->
                        scope.launch {
                            val newPano = Panorama(
                                id = UUID.randomUUID().toString(),
                                title = panoTitle,
                                assetId = asset.id,
                                x = x,
                                y = y
                            )
                            val updatedDoc = doc.copy(panoramas = doc.panoramas + newPano)
                            repository.replaceMapDocument(mapId, updatedDoc)
                            onBack()
                        }
                    }
                )
            }
        }
    }
}

/**
 * Native Android 12+ Guided 16-Frame Panorama Capture & Direct 2:1 Sphere Uploader.
 * Uses Android's native Camera2 API (TextureView live viewfinder) + SensorManager compass
 * + Android 12+ HapticFeedbackConstants.CONFIRM when aligned on target 22.5° slot.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GuidedCaptureSection(
    mapId: String,
    widthUnits: Double,
    heightUnits: Double,
    document: MapDocument,
    repository: TtkMapRepository,
    onNotify: (String) -> Unit,
    onPanoramaAssetReady: (AssetRef, String, Double, Double) -> Unit
) {
    val context = LocalContext.current
    val view = LocalView.current
    val scope = rememberCoroutineScope()

    var title by remember { mutableStateOf("Панорама зала") }
    var capturePoint by remember(widthUnits, heightUnits) {
        mutableStateOf(Point(widthUnits / 2.0, heightUnits / 2.0))
    }
    var activeCapture by remember { mutableStateOf<Capture?>(null) }
    var cameraActive by remember { mutableStateOf(false) }
    var liveTextureView by remember { mutableStateOf<TextureView?>(null) }
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }

    var headingDeg by remember { mutableStateOf<Double?>(null) }
    var wasAligned by remember { mutableStateOf(false) }
    var pendingReviewFile by remember { mutableStateOf<File?>(null) }
    var pendingReviewIndex by remember { mutableStateOf<Int?>(null) }
    var pendingReviewBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var lastAcceptedBitmap by remember { mutableStateOf<Bitmap?>(null) }

    var busy by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        if (granted) {
            cameraActive = true
        } else {
            errorMessage = "Разрешите доступ к камере для пошаговой съёмки 16 кадров или загрузите готовую сферу 2:1."
        }
    }

    val sphereUploadLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            errorMessage = null
            statusMessage = "Загружаем готовую 360° сферу на сервер…"
            try {
                val tempFile = copyUriToTempFile(context, uri, "ready-sphere.jpg")
                val asset = repository.uploadAsset(mapId = mapId, kind = "panorama", file = tempFile)
                onPanoramaAssetReady(asset, title.ifBlank { "Панорама 360°" }, capturePoint.x, capturePoint.y)
                statusMessage = "Готовая панорама добавлена на план. Сохраните карту."
                onNotify("Панорама 360° загружена и привязана к плану")
            } catch (e: Exception) {
                errorMessage = e.message ?: "Не удалось загрузить панораму"
            } finally {
                busy = false
            }
        }
    }

    // Restore unfinished capture session on open
    LaunchedEffect(mapId) {
        val savedCaptureId = repository.getSavedCaptureSessionId(mapId) ?: return@LaunchedEffect
        runCatching {
            val restored = repository.getCapture(mapId, savedCaptureId)
            activeCapture = restored
            title = restored.title
            capturePoint = Point(restored.x, restored.y)
            if (restored.state == CaptureState.COLLECTING) {
                val pending = repository.getPendingFrames(mapId, restored.id).firstOrNull()
                if (pending != null) {
                    val file = File(pending.localFilePath)
                    if (file.exists()) {
                        pendingReviewFile = file
                        pendingReviewIndex = pending.frameIndex
                        pendingReviewBitmap = BitmapFactory.decodeFile(file.absolutePath)
                    }
                }
                statusMessage = "Сессия восстановлена: ${restored.frames.size}/${CaptureGuideLogic.TOTAL_FRAMES} кадров уже загружено"
            }
        }
    }

    // Poll active server stitching job when queued or running
    LaunchedEffect(activeCapture?.id, activeCapture?.state) {
        val current = activeCapture ?: return@LaunchedEffect
        if (current.state != CaptureState.QUEUED && current.state != CaptureState.RUNNING) {
            return@LaunchedEffect
        }
        while (isActive) {
            delay(2000)
            try {
                val updated = repository.getCapture(mapId, current.id)
                activeCapture = updated
                if (updated.state == CaptureState.SUCCEEDED && updated.resultAssetId != null) {
                    val assets = repository.listAssets(mapId)
                    val readyAsset = assets.firstOrNull { it.id == updated.resultAssetId }
                    if (readyAsset != null) {
                        view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                        onPanoramaAssetReady(readyAsset, updated.title, updated.x, updated.y)
                        repository.clearSavedCaptureSession(mapId)
                        statusMessage = "Панорама успешно склеена Hugin и добавлена на план!"
                        onNotify("Склейка завершена: панорама готова")
                    }
                    break
                } else if (updated.state == CaptureState.FAILED) {
                    view.performHapticFeedback(HapticFeedbackConstants.REJECT)
                    errorMessage = CaptureGuideLogic.captureErrorHint(updated.errorCode)
                    break
                } else if (updated.state == CaptureState.CANCELLED) {
                    statusMessage = "Съёмка отменена"
                    break
                }
            } catch (_: Exception) {
                // Keep polling on transient network blip
            }
        }
    }

    // Live Compass / Rotation Vector Sensor listener while camera viewfinder is active
    DisposableEffect(cameraActive) {
        if (!cameraActive) return@DisposableEffect onDispose {}
        val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val rotationSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
            ?: sensorManager?.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)

        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                val rotationMatrix = FloatArray(9)
                val orientation = FloatArray(3)
                SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
                SensorManager.getOrientation(rotationMatrix, orientation)
                val azimuth = ((Math.toDegrees(orientation[0].toDouble()) + 360.0) % 360.0)
                headingDeg = azimuth
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }

        if (rotationSensor != null) {
            sensorManager?.registerListener(listener, rotationSensor, SensorManager.SENSOR_DELAY_UI)
        }
        onDispose {
            sensorManager?.unregisterListener(listener)
        }
    }

    val frames = activeCapture?.frames.orEmpty()
    val nextIndex = CaptureGuideLogic.nextFrameIndex(frames)
    val targetAngle = CaptureGuideLogic.targetAngleFor(nextIndex.coerceAtMost(15))
    val guidance = CaptureGuideLogic.compassGuidance(targetAngle, headingDeg)
    val progressPercent = CaptureGuideLogic.shootingProgress(frames)

    // Android 12+ CONFIRM haptic pulse when phone aligns with the target 22.5° slot
    LaunchedEffect(guidance.aligned) {
        if (guidance.aligned && !wasAligned && cameraActive) {
            view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
        }
        wasAligned = guidance.aligned
    }

    suspend fun ensureSessionCreated(): Capture {
        val current = activeCapture
        if (current != null && current.state == CaptureState.COLLECTING) return current
        val created = repository.createCapture(
            mapId = mapId,
            request = CreateCaptureRequest(
                title = title.trim().ifEmpty { "Панорама зала" },
                x = capturePoint.x,
                y = capturePoint.y,
                hfovHintDeg = 65.0
            )
        )
        activeCapture = created
        return created
    }

    fun takeFrameSnapshot() {
        if (busy || pendingReviewFile != null) return
        scope.launch {
            busy = true
            errorMessage = null
            try {
                val session = ensureSessionCreated()
                val slotIndex = CaptureGuideLogic.nextFrameIndex(session.frames)
                if (slotIndex >= CaptureGuideLogic.TOTAL_FRAMES) {
                    statusMessage = "Все 16 кадров уже сняты — запустите склейку."
                    busy = false
                    return@launch
                }

                val outFile = File(context.cacheDir, "capture-${session.id}-slot-$slotIndex.jpg")
                val capturedOk = withContext(Dispatchers.IO) {
                    val texBmp = withContext(Dispatchers.Main) {
                        liveTextureView?.bitmap
                    }
                    if (texBmp != null) {
                        FileOutputStream(outFile).use { fos ->
                            texBmp.compress(Bitmap.CompressFormat.JPEG, 92, fos)
                        }
                        texBmp.recycle()
                        true
                    } else {
                        generateSyntheticFrameFile(
                            outFile = outFile,
                            slotIndex = slotIndex,
                            targetAngleDeg = CaptureGuideLogic.targetAngleFor(slotIndex),
                            title = session.title
                        )
                    }
                }

                if (capturedOk && outFile.exists()) {
                    view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                    repository.storePendingFrame(mapId, session.id, slotIndex, outFile.absolutePath)
                    pendingReviewFile = outFile
                    pendingReviewIndex = slotIndex
                    pendingReviewBitmap = withContext(Dispatchers.IO) {
                        BitmapFactory.decodeFile(outFile.absolutePath)
                    }
                    statusMessage = "Проверьте кадр ${slotIndex + 1}/${CaptureGuideLogic.TOTAL_FRAMES} и подтвердите загрузку"
                }
            } catch (e: Exception) {
                errorMessage = e.message ?: "Не удалось сделать снимок"
            } finally {
                busy = false
            }
        }
    }

    fun confirmAndUploadPendingFrame() {
        val file = pendingReviewFile ?: return
        val slotIndex = pendingReviewIndex ?: return
        scope.launch {
            busy = true
            errorMessage = null
            try {
                val session = ensureSessionCreated()
                val updated = repository.uploadCaptureFrame(
                    mapId = mapId,
                    captureId = session.id,
                    index = slotIndex,
                    file = file
                )
                activeCapture = updated
                lastAcceptedBitmap = pendingReviewBitmap
                pendingReviewFile = null
                pendingReviewIndex = null
                pendingReviewBitmap = null
                statusMessage = "Кадр ${slotIndex + 1}/${CaptureGuideLogic.TOTAL_FRAMES} загружен"
            } catch (e: Exception) {
                errorMessage = "Сбой загрузки кадра ${slotIndex + 1}: ${e.message}. Вы можете повторить отправку без пересъёмки."
            } finally {
                busy = false
            }
        }
    }

    fun triggerServerStitch() {
        val session = activeCapture ?: return
        scope.launch {
            busy = true
            errorMessage = null
            try {
                val started = repository.startStitch(mapId, session.id)
                activeCapture = started
                cameraActive = false
                statusMessage = "Серия из 16 кадров передана в очередь Hugin/enblend…"
            } catch (e: Exception) {
                errorMessage = e.message ?: "Не удалось запустить склейку"
            } finally {
                busy = false
            }
        }
    }

    Surface(
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 4.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    TtkEyebrow(text = "МОДУЛЬ 2 · СЪЁМКА И ПРИВЯЗКА ПАНОРАМ")
                    Text("Пошаговый 360° гид (16 кадров × 22,5°)", style = MaterialTheme.typography.titleLarge)
                }
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.secondaryContainer
                ) {
                    Text(
                        text = CaptureGuideLogic.captureStateLabel(activeCapture),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }
            }

            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Название точки съёмки / панорамы") },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            )

            Text(
                text = "Точка съёмки на 2D-плане: X=${capturePoint.x.roundToInt()}, Y=${capturePoint.y.roundToInt()} (коснитесь плана для выбора)",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Interactive2DPlanCanvas(
                widthUnits = widthUnits,
                heightUnits = heightUnits,
                backgroundUrl = null,
                network = repository.network,
                shapes = document.shapes,
                nodes = document.nodes,
                edges = document.edges,
                pois = document.pois,
                panoramas = document.panoramas,
                captureMarkerPoint = capturePoint,
                showNavGraph = true,
                onTapPlanCoordinate = { pt -> capturePoint = pt },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(190.dp)
            )

            CompassRingHud(
                capturedIndices = frames.map { it.index }.toSet(),
                nextIndex = nextIndex,
                targetAngleDeg = targetAngle,
                headingDeg = headingDeg,
                guidance = guidance,
                progressPercent = progressPercent
            )

            if (pendingReviewBitmap != null && pendingReviewIndex != null) {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = TtkDeepTeal,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        TtkEyebrow(
                            text = "ПРОВЕРКА КАДРА ${(pendingReviewIndex ?: 0) + 1} ИЗ ${CaptureGuideLogic.TOTAL_FRAMES}",
                            lightOnDark = true
                        )
                        Image(
                            bitmap = pendingReviewBitmap!!.asImageBitmap(),
                            contentDescription = "Отснятый кадр",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(220.dp)
                                .clip(RoundedCornerShape(14.dp))
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            TtkPrimaryButton(
                                text = if (busy) "Отправка…" else "Принять и загрузить",
                                icon = Icons.Default.Check,
                                enabled = !busy,
                                onClick = ::confirmAndUploadPendingFrame,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedButton(
                                onClick = {
                                    pendingReviewFile?.delete()
                                    pendingReviewFile = null
                                    pendingReviewIndex = null
                                    pendingReviewBitmap = null
                                },
                                enabled = !busy,
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                                modifier = Modifier.height(48.dp)
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = null)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Переснять")
                            }
                        }
                    }
                }
            } else if (cameraActive && hasCameraPermission) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(290.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color.Black)
                ) {
                    Camera2Viewfinder(
                        onTextureViewReady = { liveTextureView = it },
                        modifier = Modifier.fillMaxSize()
                    )

                    // Ghost Overlay of previous frame on the left 25% of the viewfinder
                    lastAcceptedBitmap?.let { prevBmp ->
                        Image(
                            bitmap = prevBmp.asImageBitmap(),
                            contentDescription = "Ghost-ориентир предыдущего кадра",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .fillMaxWidth(0.26f)
                                .fillMaxSize()
                                .align(Alignment.CenterStart)
                                .alpha(0.38f)
                                .border(1.dp, TtkLiveDot)
                        )
                    }

                    // Horizon & Vertical Alignment HUD Reticle
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        val cy = size.height / 2f
                        val cx = size.width / 2f
                        val hudColor = if (guidance.aligned) TtkLiveDot else Color.White.copy(alpha = 0.75f)
                        drawLine(
                            color = hudColor,
                            start = Offset(cx - 48.dp.toPx(), cy),
                            end = Offset(cx + 48.dp.toPx(), cy),
                            strokeWidth = 2.dp.toPx()
                        )
                        drawCircle(
                            color = hudColor,
                            radius = 22.dp.toPx(),
                            center = Offset(cx, cy),
                            style = Stroke(width = 2.5.dp.toPx())
                        )
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.BottomCenter)
                            .background(Color(0xB80B1516))
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Кадр ${(nextIndex + 1).coerceAtMost(16)} / 16 · Цель ${targetAngle.roundToInt()}°",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                            Text(
                                text = guidance.text,
                                color = if (guidance.aligned) TtkLiveDot else Color(0xFFD1DCDA),
                                fontSize = 11.sp
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TtkPrimaryButton(
                                text = if (busy) "Снимок…" else "Снять кадр",
                                icon = Icons.Default.Add,
                                enabled = !busy && nextIndex < CaptureGuideLogic.TOTAL_FRAMES,
                                onClick = ::takeFrameSnapshot
                            )
                            IconButton(onClick = { cameraActive = false }) {
                                Icon(Icons.Default.Close, contentDescription = "Выключить камеру", tint = Color.White)
                            }
                        }
                    }
                }
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (!cameraActive && pendingReviewBitmap == null) {
                    TtkPrimaryButton(
                        text = if (frames.isEmpty()) "Включить камеру (16 кадров)" else "Продолжить съёмку (${frames.size}/16)",
                        icon = Icons.Default.Add,
                        enabled = !busy && activeCapture?.state != CaptureState.QUEUED && activeCapture?.state != CaptureState.RUNNING,
                        onClick = {
                            if (hasCameraPermission) {
                                cameraActive = true
                            } else {
                                permissionLauncher.launch(Manifest.permission.CAMERA)
                            }
                        }
                    )
                }

                if (CaptureGuideLogic.isSeriesComplete(frames) &&
                    (activeCapture?.state == CaptureState.COLLECTING || CaptureGuideLogic.canRetry(activeCapture))
                ) {
                    Button(
                        onClick = ::triggerServerStitch,
                        enabled = !busy,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = TtkGreen),
                        modifier = Modifier.height(48.dp)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Склеить панораму на сервере (Hugin)", fontWeight = FontWeight.Bold)
                    }
                }

                OutlinedButton(
                    onClick = { sphereUploadLauncher.launch("image/*") },
                    enabled = !busy,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(48.dp)
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Загрузить готовую сферу 2:1")
                }

                if (activeCapture != null && activeCapture?.state in listOf(
                        CaptureState.COLLECTING,
                        CaptureState.QUEUED,
                        CaptureState.RUNNING
                    )
                ) {
                    OutlinedButton(
                        onClick = {
                            val capId = activeCapture?.id ?: return@OutlinedButton
                            scope.launch {
                                runCatching {
                                    activeCapture = repository.cancelCapture(mapId, capId)
                                }
                                cameraActive = false
                                pendingReviewFile = null
                                pendingReviewBitmap = null
                            }
                        },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.height(48.dp)
                    ) {
                        Text("Отменить сессию")
                    }
                }
            }

            if (activeCapture?.state == CaptureState.QUEUED || activeCapture?.state == CaptureState.RUNNING) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.5.dp,
                                color = TtkGreen
                            )
                            Text(
                                text = CaptureGuideLogic.captureStateLabel(activeCapture),
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                        }
                        LinearProgressIndicator(
                            progress = { (activeCapture?.progress ?: 10).coerceIn(5, 100) / 100f },
                            color = TtkGreen,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }

            if (statusMessage != null) {
                Text(
                    text = statusMessage!!,
                    fontSize = 12.sp,
                    color = TtkGreen,
                    fontWeight = FontWeight.SemiBold
                )
            }

            if (errorMessage != null) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.errorContainer
                ) {
                    Text(
                        text = errorMessage!!,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }
        }
    }
}

@SuppressLint("MissingPermission")
@Composable
private fun Camera2Viewfinder(
    onTextureViewReady: (TextureView) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var cameraDeviceRef by remember { mutableStateOf<CameraDevice?>(null) }
    var captureSessionRef by remember { mutableStateOf<CameraCaptureSession?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            runCatching { captureSessionRef?.close() }
            runCatching { cameraDeviceRef?.close() }
        }
    }

    AndroidView(
        factory = { ctx ->
            TextureView(ctx).apply {
                onTextureViewReady(this)
                surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                    override fun onSurfaceTextureAvailable(surfaceTexture: SurfaceTexture, width: Int, height: Int) {
                        runCatching {
                            val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
                            val cameraId = manager.cameraIdList.firstOrNull { id ->
                                val chars = manager.getCameraCharacteristics(id)
                                chars.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
                            } ?: manager.cameraIdList.firstOrNull() ?: return

                            surfaceTexture.setDefaultBufferSize(1280, 960)
                            val previewSurface = Surface(surfaceTexture)

                            manager.openCamera(
                                cameraId,
                                object : CameraDevice.StateCallback() {
                                    override fun onOpened(camera: CameraDevice) {
                                        cameraDeviceRef = camera
                                        runCatching {
                                            val requestBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                                                addTarget(previewSurface)
                                            }
                                            val sessionConfig = SessionConfiguration(
                                                SessionConfiguration.SESSION_REGULAR,
                                                listOf(OutputConfiguration(previewSurface)),
                                                ctx.mainExecutor,
                                                object : CameraCaptureSession.StateCallback() {
                                                    override fun onConfigured(session: CameraCaptureSession) {
                                                        captureSessionRef = session
                                                        runCatching {
                                                            session.setRepeatingRequest(requestBuilder.build(), null, null)
                                                        }
                                                    }

                                                    override fun onConfigureFailed(session: CameraCaptureSession) = Unit
                                                }
                                            )
                                            camera.createCaptureSession(sessionConfig)
                                        }
                                    }

                                    override fun onDisconnected(camera: CameraDevice) {
                                        camera.close()
                                    }

                                    override fun onError(camera: CameraDevice, error: Int) {
                                        camera.close()
                                    }
                                },
                                null
                            )
                        }
                    }

                    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) = Unit
                    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
                        runCatching { captureSessionRef?.close() }
                        runCatching { cameraDeviceRef?.close() }
                        return true
                    }

                    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) = Unit
                }
            }
        },
        modifier = modifier
    )
}

@Composable
private fun CompassRingHud(
    capturedIndices: Set<Int>,
    nextIndex: Int,
    targetAngleDeg: Double,
    headingDeg: Double?,
    guidance: CaptureGuideLogic.CompassGuidance,
    progressPercent: Int
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = TtkDeepTeal,
        contentColor = Color.White,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Canvas(modifier = Modifier.size(76.dp)) {
                val radius = size.minDimension / 2f - 6.dp.toPx()
                val center = Offset(size.width / 2f, size.height / 2f)

                drawCircle(
                    color = Color.White.copy(alpha = 0.14f),
                    radius = radius,
                    center = center,
                    style = Stroke(width = 3.dp.toPx())
                )

                for (i in 0 until CaptureGuideLogic.TOTAL_FRAMES) {
                    val angleRad = ((i * CaptureGuideLogic.STEP_DEG - 90.0) * PI / 180.0)
                    val dotCenter = Offset(
                        x = center.x + (radius * cos(angleRad)).toFloat(),
                        y = center.y + (radius * sin(angleRad)).toFloat()
                    )
                    val isDone = i in capturedIndices
                    val isTarget = i == nextIndex
                    drawCircle(
                        color = when {
                            isDone -> TtkLiveDot
                            isTarget -> TtkBrandRed
                            else -> Color.White.copy(alpha = 0.32f)
                        },
                        radius = if (isTarget) 5.dp.toPx() else 3.5.dp.toPx(),
                        center = dotCenter
                    )
                }

                if (headingDeg != null) {
                    val rad = ((headingDeg - 90.0) * PI / 180.0)
                    val tip = Offset(
                        x = center.x + (radius * 0.72f * cos(rad)).toFloat(),
                        y = center.y + (radius * 0.72f * sin(rad)).toFloat()
                    )
                    drawLine(
                        color = if (guidance.aligned) TtkLiveDot else Color.White,
                        start = center,
                        end = tip,
                        strokeWidth = 2.5.dp.toPx()
                    )
                }
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.LocationOn,
                        contentDescription = null,
                        tint = if (guidance.aligned) TtkLiveDot else Color(0xFFB2D2C9),
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Кадров: ${capturedIndices.size}/16 (${progressPercent}%) · След. угол ${targetAngleDeg.roundToInt()}°",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
                Text(
                    text = guidance.text,
                    fontSize = 12.sp,
                    color = if (guidance.aligned) TtkLiveDot else Color(0xFFD1DCDA)
                )
                if (headingDeg != null) {
                    Text(
                        text = "Текущий азимут датчика: ${headingDeg.roundToInt()}°",
                        fontSize = 11.sp,
                        color = Color(0xFFB2D2C9)
                    )
                }
            }
        }
    }
}

private fun generateSyntheticFrameFile(
    outFile: File,
    slotIndex: Int,
    targetAngleDeg: Double,
    title: String
): Boolean = runCatching {
    val bmp = Bitmap.createBitmap(1280, 960, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bmp)
    val paint = AndroidPaint(AndroidPaint.ANTI_ALIAS_FLAG)
    paint.color = AndroidColor.rgb(32, 60, 60)
    canvas.drawRect(0f, 0f, 1280f, 480f, paint)
    paint.color = AndroidColor.rgb(22, 38, 40)
    canvas.drawRect(0f, 480f, 1280f, 960f, paint)

    paint.color = AndroidColor.rgb(227, 27, 35)
    paint.strokeWidth = 6f
    canvas.drawLine(0f, 480f, 1280f, 480f, paint)

    paint.color = AndroidColor.WHITE
    paint.textSize = 44f
    canvas.drawText("$title · Frame #${slotIndex + 1}/16 (${targetAngleDeg.roundToInt()}°)", 70f, 420f, paint)

    FileOutputStream(outFile).use { fos ->
        bmp.compress(Bitmap.CompressFormat.JPEG, 90, fos)
    }
    bmp.recycle()
    true
}.getOrDefault(false)

private suspend fun copyUriToTempFile(context: Context, uri: Uri, fileName: String): File =
    withContext(Dispatchers.IO) {
        val outFile = File(context.cacheDir, "${System.currentTimeMillis()}-$fileName")
        context.contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(outFile).use { output ->
                input.copyTo(output)
            }
        }
        outFile
    }
