package ru.ttk.map.feature.visitor

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.displayCutoutPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import ru.ttk.map.core.domain.CoordinateMath
import ru.ttk.map.core.model.Panorama
import ru.ttk.map.core.model.Poi
import ru.ttk.map.core.model.PoiCategory
import ru.ttk.map.core.model.PublicMap
import ru.ttk.map.core.model.RouteResponse
import ru.ttk.map.core.network.TtkApiException
import ru.ttk.map.core.repository.PublicMapFetchResult
import ru.ttk.map.core.repository.TtkMapRepository
import ru.ttk.map.feature.panorama.Panorama360Dialog
import ru.ttk.map.ui.components.Interactive2DPlanCanvas
import ru.ttk.map.ui.components.poiCategoryColor
import ru.ttk.map.ui.theme.TtkBrandLockup
import ru.ttk.map.ui.theme.TtkBrandRed
import ru.ttk.map.ui.theme.TtkDarkNeutralBorder
import ru.ttk.map.ui.theme.TtkDarkNeutralSurface
import ru.ttk.map.ui.theme.TtkDeepTeal
import ru.ttk.map.ui.theme.TtkExpressiveLoadingIndicator
import ru.ttk.map.ui.theme.TtkEyebrow
import ru.ttk.map.ui.theme.TtkFilterChip
import ru.ttk.map.ui.theme.TtkGreen
import ru.ttk.map.ui.theme.TtkLiveBadge
import ru.ttk.map.ui.theme.TtkPrimaryButton
import ru.ttk.map.ui.theme.TtkRedBorder
import ru.ttk.map.ui.theme.TtkRedContainer
import ru.ttk.map.ui.theme.TtkWhiteRedTint
import ru.ttk.map.core.model.AnalyticsEventType
import ru.ttk.map.core.model.MultiFloorHelper
import ru.ttk.map.feature.organizer.PlanViewMode
import ru.ttk.map.ui.components.Interactive3DPlanCanvas
import androidx.compose.material3.FilterChip
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import kotlin.math.hypot

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun VisitorSpaceScreen(
    slug: String,
    repository: TtkMapRepository,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var snapshot by remember { mutableStateOf<PublicMap?>(null) }
    var etag by remember { mutableStateOf<String?>(null) }
    var isOffline by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var noticeText by remember { mutableStateOf<String?>(null) }

    val context = LocalContext.current
    var activeFloorLevel by remember { mutableIntStateOf(1) }
    var visitorViewMode by remember { mutableStateOf(PlanViewMode.VIEW_2D) }

    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf<PoiCategory?>(null) }
    var selectedPoiId by remember { mutableStateOf<String?>(null) }

    var routeFromPoiId by remember { mutableStateOf<String?>(null) }
    var routeToPoiId by remember { mutableStateOf<String?>(null) }
    var routeResponse by remember { mutableStateOf<RouteResponse?>(null) }
    var routeError by remember { mutableStateOf<String?>(null) }
    var routeBusy by remember { mutableStateOf(false) }

    var activePanorama by remember { mutableStateOf<Panorama?>(null) }
    var activePanoramaYaw by remember { mutableStateOf(0.0) }
    var currentWalkStepIndex by remember { mutableIntStateOf(-1) }

    fun pushNotice(msg: String) {
        noticeText = msg
    }

    LaunchedEffect(noticeText) {
        if (noticeText != null) {
            delay(4200)
            noticeText = null
        }
    }

    suspend fun loadOrPoll(isInitial: Boolean) {
        if (isInitial) loading = true else refreshing = true
        try {
            val prevRevision = snapshot?.revision
            when (val res = repository.fetchPublicMap(slug, etag)) {
                is PublicMapFetchResult.Updated -> {
                    snapshot = res.map
                    etag = res.etag
                    isOffline = res.isFromOfflineCache
                    loadError = null
                    if (!isInitial && prevRevision != null && prevRevision != res.map.revision) {
                        routeResponse = null
                        pushNotice("Карта обновлена организатором · ревизия v${res.map.revision}")
                    }
                }
                is PublicMapFetchResult.NotModified -> {
                    snapshot = res.map
                    etag = res.etag
                    isOffline = false
                    loadError = null
                }
            }
        } catch (e: Exception) {
            if (snapshot == null) {
                loadError = e.message ?: "Ссылка неверна или организатор снял карту с публикации."
            } else {
                isOffline = true
            }
        } finally {
            loading = false
            refreshing = false
        }
    }

    // Initial load + 15-second live polling matching PublicSpacePage.tsx
    LaunchedEffect(slug) {
        loadOrPoll(isInitial = true)
        while (isActive) {
            delay(15_000)
            loadOrPoll(isInitial = false)
        }
    }

    val currentMap = snapshot
    if (loading && currentMap == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                TtkExpressiveLoadingIndicator(size = 32.dp)
                Text("Загружаем интерактивную карту…", style = MaterialTheme.typography.bodyMedium)
            }
        }
        return
    }

    if (currentMap == null) {
        Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Surface(
                shape = RoundedCornerShape(28.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 8.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    TtkBrandLockup()
                    Text("Карта недоступна", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        text = loadError ?: "Ссылка неверна или организатор снял карту с публикации.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    TtkPrimaryButton(
                        text = "Попробовать снова",
                        onClick = { scope.launch { loadOrPoll(isInitial = true) } },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                        Text("На главную")
                    }
                }
            }
        }
        return
    }

    LaunchedEffect(currentMap.id) {
        repository.logAnalyticsEvent(
            mapId = currentMap.id,
            eventType = AnalyticsEventType.MAP_VIEW
        )
    }

    val doc = currentMap.document
    val floorLevels = remember(doc) {
        MultiFloorHelper.getAvailableFloors(doc)
    }
    val floorFilteredDoc = remember(doc, activeFloorLevel) {
        MultiFloorHelper.filterDocumentByFloor(doc, activeFloorLevel)
    }

    val backgroundAsset = floorFilteredDoc.backgroundAssetId?.let { bgId ->
        currentMap.assets.firstOrNull { it.id == bgId }
    } ?: doc.backgroundAssetId?.let { bgId ->
        currentMap.assets.firstOrNull { it.id == bgId }
    }
    val backgroundUrl = repository.network.resolveMediaUrl(
        backgroundAsset?.mobileUrl?.takeIf { it.isNotBlank() }
            ?: backgroundAsset?.fullUrl?.takeIf { it.isNotBlank() }
            ?: backgroundAsset?.previewUrl?.takeIf { it.isNotBlank() }
    )

    val filteredPois = remember(doc.pois, floorFilteredDoc.pois, searchQuery, selectedCategory) {
        val q = searchQuery.trim().lowercase()
        val pool = if (q.isNotEmpty()) doc.pois else floorFilteredDoc.pois
        pool.filter { poi ->
            val catMatch = selectedCategory == null || poi.category == selectedCategory
            val textMatch = q.isEmpty() ||
                poi.title.lowercase().contains(q) ||
                poi.displayCategoryLabel().lowercase().contains(q) ||
                poi.description.lowercase().contains(q)
            catMatch && textMatch
        }
    }

    val selectedPoi = remember(doc.pois, selectedPoiId) {
        doc.pois.firstOrNull { it.id == selectedPoiId }
    }

    fun selectPoiAndSwitchFloor(poi: Poi) {
        val floor = MultiFloorHelper.extractFloorLevel(poi.id, poi.title, poi.description)
        activeFloorLevel = floor
        selectedPoiId = poi.id
        scope.launch {
            repository.logAnalyticsEvent(
                mapId = currentMap.id,
                eventType = AnalyticsEventType.POI_CLICK,
                poiId = poi.id
            )
        }
    }

    fun resolveNodeForPoi(poi: Poi): String? {
        if (!poi.navNodeId.isNullOrBlank() && doc.nodes.any { it.id == poi.navNodeId }) {
            return poi.navNodeId
        }
        return doc.nodes.minByOrNull { hypot(it.x - poi.x, it.y - poi.y) }?.id
    }

    fun triggerBuildRoute() {
        val fromPoi = doc.pois.firstOrNull { it.id == routeFromPoiId }
        val toPoi = doc.pois.firstOrNull { it.id == routeToPoiId }
        if (fromPoi == null || toPoi == null) {
            routeError = "Выберите точки «Откуда» и «Куда»"
            return
        }
        val fromNode = resolveNodeForPoi(fromPoi)
        val toNode = resolveNodeForPoi(toPoi)
        if (fromNode == null || toNode == null) {
            routeError = "У выбранных объектов нет привязки к графу проходов"
            return
        }
        scope.launch {
            routeBusy = true
            routeError = null
            try {
                val res = repository.buildRoute(currentMap, fromNode, toNode)
                routeResponse = res
                if (res.walk.available) {
                    pushNotice("Маршрут построен: доступен виртуальный проход 360°")
                } else {
                    pushNotice("Маршрут построен на плане")
                }
                repository.logAnalyticsEvent(
                    mapId = currentMap.id,
                    eventType = AnalyticsEventType.ROUTE_BUILT,
                    metadata = "${fromPoi.id}->${toPoi.id}"
                )
            } catch (e: TtkApiException) {
                if (e.statusCode == 409) {
                    routeError = "Карта изменилась. Обновляем снимок…"
                    loadOrPoll(isInitial = false)
                } else {
                    routeError = e.message ?: "Между этими точками нет связанного прохода"
                }
                routeResponse = null
            } catch (e: Exception) {
                routeError = e.message ?: "Не удалось построить маршрут"
                routeResponse = null
            } finally {
                routeBusy = false
            }
        }
    }

    fun openPanoramaForPoi(poi: Poi) {
        val nodeId = resolveNodeForPoi(poi)
        val byNode = nodeId?.let { nid -> doc.panoramas.firstOrNull { it.navNodeId == nid } }
        val nearest = doc.panoramas.minByOrNull { hypot(it.x - poi.x, it.y - poi.y) }
        val target = byNode ?: nearest
        if (target == null) {
            pushNotice("Для этого объекта ещё нет панорамы")
            return
        }
        val yawToPoi = CoordinateMath.yawToTarget(
            dx = poi.x - target.x,
            dy = poi.y - target.y,
            headingOffsetDeg = target.headingOffsetDeg
        )
        currentWalkStepIndex = -1
        activePanorama = target
        activePanoramaYaw = yawToPoi
        scope.launch {
            repository.logAnalyticsEvent(
                mapId = currentMap.id,
                eventType = AnalyticsEventType.PANORAMA_VIEW,
                metadata = target.id
            )
        }
    }

    Scaffold(
        topBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .displayCutoutPadding()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            IconButton(onClick = onBack) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = doc.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                if (doc.description.isNotBlank()) {
                                    Text(
                                        text = doc.description,
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            TtkLiveBadge(revision = currentMap.revision, isOffline = isOffline)
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = TtkDeepTeal.copy(alpha = 0.12f),
                                modifier = Modifier.clickable {
                                    scope.launch {
                                        repository.cachePublicSnapshot(currentMap, etag ?: "\"offline-${currentMap.id}-v${currentMap.revision}\"")
                                        pushNotice("💾 Карта сохранена офлайн на устройстве")
                                        Toast.makeText(context, "Карта сохранена для работы без интернета", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            ) {
                                Text(
                                    text = "💾 Офлайн",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TtkDeepTeal,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
                                )
                            }
                            IconButton(
                                onClick = { scope.launch { loadOrPoll(isInitial = false) } }
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Refresh,
                                    contentDescription = "Обновить карту",
                                    tint = if (refreshing) TtkBrandRed else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    AnimatedVisibility(visible = isOffline) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFFFEF3C7))
                                .padding(horizontal = 16.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = null,
                                tint = Color(0xFF92400E),
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = "Офлайн-режим: показана сохранённая на устройстве ревизия карты.",
                                fontSize = 11.sp,
                                color = Color(0xFF92400E),
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    AnimatedVisibility(visible = noticeText != null) {
                        noticeText?.let { msg ->
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(TtkDeepTeal)
                                    .padding(horizontal = 16.dp, vertical = 8.dp)
                            ) {
                                Text(
                                    text = msg,
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }
            }
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. Interactive 2D / 3D Plan Canvas & Floor Controls
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (floorLevels.size > 1) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                floorLevels.forEach { floor ->
                                    FilterChip(
                                        selected = activeFloorLevel == floor.levelNumber,
                                        onClick = { activeFloorLevel = floor.levelNumber },
                                        label = { Text(floor.shortCode) }
                                    )
                                }
                            }
                        } else {
                            Text(
                                text = "Интерактивный план",
                                style = MaterialTheme.typography.titleMedium
                            )
                        }

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            FilterChip(
                                selected = visitorViewMode == PlanViewMode.VIEW_2D,
                                onClick = { visitorViewMode = PlanViewMode.VIEW_2D },
                                label = { Text("2D") }
                            )
                            FilterChip(
                                selected = visitorViewMode == PlanViewMode.VIEW_3D,
                                onClick = { visitorViewMode = PlanViewMode.VIEW_3D },
                                label = { Text("3D") }
                            )
                        }
                    }

                    // Inter-floor guidance banner
                    val fromPoi = doc.pois.firstOrNull { it.id == routeFromPoiId }
                    val toPoi = doc.pois.firstOrNull { it.id == routeToPoiId }
                    val fromFloor = fromPoi?.let { MultiFloorHelper.extractFloorLevel(it.id, it.title, it.description) } ?: 1
                    val toFloor = toPoi?.let { MultiFloorHelper.extractFloorLevel(it.id, it.title, it.description) } ?: 1
                    if (routeResponse != null && fromFloor != toFloor) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = TtkDeepTeal,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(
                                    text = "🪜 Межэтажный переход (${fromFloor}F → ${toFloor}F):\nПройдите к лестнице/лифту и перейдите на этаж $toFloor к объекту «${toPoi?.title}».",
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.weight(1f)
                                )
                                OutlinedButton(
                                    onClick = { activeFloorLevel = toFloor },
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                                ) {
                                    Text("На ${toFloor}F", fontSize = 11.sp)
                                }
                            }
                        }
                    }

                    if (visitorViewMode == PlanViewMode.VIEW_3D) {
                        Interactive3DPlanCanvas(
                            widthUnits = currentMap.widthUnits,
                            heightUnits = currentMap.heightUnits,
                            shapes = floorFilteredDoc.shapes,
                            pois = filteredPois,
                            panoramas = floorFilteredDoc.panoramas,
                            selectedPoiId = selectedPoiId,
                            routePolyline = routeResponse?.polyline,
                            onSelectPoi = { poi -> selectPoiAndSwitchFloor(poi) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(340.dp)
                        )
                    } else {
                        Interactive2DPlanCanvas(
                            widthUnits = currentMap.widthUnits,
                            heightUnits = currentMap.heightUnits,
                            backgroundUrl = backgroundUrl,
                            network = repository.network,
                            shapes = floorFilteredDoc.shapes,
                            nodes = floorFilteredDoc.nodes,
                            edges = floorFilteredDoc.edges,
                            pois = filteredPois,
                            panoramas = floorFilteredDoc.panoramas,
                            selectedPoiId = selectedPoiId,
                            activePanoramaId = activePanorama?.id,
                            routePolyline = routeResponse?.polyline,
                            onSelectPoi = { poi -> selectPoiAndSwitchFloor(poi) },
                            onOpenPanorama = { pano ->
                                currentWalkStepIndex = -1
                                activePanorama = pano
                                activePanoramaYaw = 0.0
                                scope.launch {
                                    repository.logAnalyticsEvent(mapId = currentMap.id, eventType = AnalyticsEventType.PANORAMA_VIEW, metadata = pano.id)
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(340.dp)
                        )
                    }
                }
            }

            // 2. Selected POI Expressive Card
            if (selectedPoi != null) {
                item {
                    Surface(
                        shape = RoundedCornerShape(24.dp),
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 6.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                TtkEyebrow(text = selectedPoi.displayCategoryLabel())
                                IconButton(
                                    onClick = { selectedPoiId = null },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Icon(Icons.Default.Clear, contentDescription = "Скрыть карточку")
                                }
                            }
                            Text(
                                text = selectedPoi.title,
                                style = MaterialTheme.typography.headlineMedium
                            )
                            if (selectedPoi.description.isNotBlank()) {
                                Text(
                                    text = selectedPoi.description,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                TtkPrimaryButton(
                                    text = "Маршрут сюда",
                                    icon = Icons.Default.LocationOn,
                                    onClick = {
                                        routeToPoiId = selectedPoi.id
                                        if (routeFromPoiId == null || routeFromPoiId == selectedPoi.id) {
                                            routeFromPoiId = doc.pois.firstOrNull { it.id != selectedPoi.id }?.id
                                        }
                                        triggerBuildRoute()
                                    }
                                )
                                OutlinedButton(
                                    onClick = {
                                        routeFromPoiId = selectedPoi.id
                                    },
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier.height(48.dp)
                                ) {
                                    Text("Отсюда")
                                }
                                if (doc.panoramas.isNotEmpty()) {
                                    Button(
                                        onClick = { openPanoramaForPoi(selectedPoi) },
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = TtkGreen),
                                        modifier = Modifier.height(48.dp)
                                    ) {
                                        Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Панорама 360°")
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 3. Route Builder & Virtual Panorama Walkthrough Card
            item {
                RouteBuilderSection(
                    pois = doc.pois,
                    routeFromPoiId = routeFromPoiId,
                    routeToPoiId = routeToPoiId,
                    routeResponse = routeResponse,
                    scaleMPerUnit = doc.scaleMPerUnit,
                    routeBusy = routeBusy,
                    routeError = routeError,
                    onSelectFrom = { routeFromPoiId = it },
                    onSelectTo = { routeToPoiId = it },
                    onBuildRoute = ::triggerBuildRoute,
                    onClearRoute = {
                        routeResponse = null
                        routeError = null
                    },
                    onStartVirtualWalk = {
                        val steps = routeResponse?.walk?.steps.orEmpty()
                        val firstStep = steps.firstOrNull() ?: return@RouteBuilderSection
                        val targetPano = doc.panoramas.firstOrNull { it.id == firstStep.panoramaId } ?: return@RouteBuilderSection
                        currentWalkStepIndex = 0
                        activePanorama = targetPano
                        activePanoramaYaw = firstStep.yawDeg
                    }
                )
            }

            // 4. 360° Panoramas Carousel
            if (doc.panoramas.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("360° Панорамы пространства", style = MaterialTheme.typography.titleLarge)
                            Text(
                                text = "${doc.panoramas.size} точек обзора",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            doc.panoramas.forEach { pano ->
                                val hsCount = doc.hotspots.count { it.panoramaId == pano.id }
                                Surface(
                                    shape = RoundedCornerShape(18.dp),
                                    color = TtkDeepTeal,
                                    contentColor = Color.White,
                                    modifier = Modifier
                                        .width(210.dp)
                                        .clickable {
                                            currentWalkStepIndex = -1
                                            activePanorama = pano
                                            activePanoramaYaw = 0.0
                                            scope.launch {
                                                repository.logAnalyticsEvent(mapId = currentMap.id, eventType = AnalyticsEventType.PANORAMA_VIEW, metadata = pano.id)
                                            }
                                        }
                                ) {
                                    Column(
                                        modifier = Modifier.padding(14.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.PlayArrow,
                                                contentDescription = null,
                                                tint = TtkBrandRed,
                                                modifier = Modifier.size(18.dp)
                                            )
                                            Text(
                                                text = "360° ОБЗОР",
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.ExtraBold,
                                                color = Color(0xFFB2D2C9)
                                            )
                                        }
                                        Text(
                                            text = pano.title,
                                            style = MaterialTheme.typography.titleMedium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = "$hsCount интерактивных точек",
                                            fontSize = 11.sp,
                                            color = Color(0xFFD1DCDA)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 5. Search & Category Filter Chips + POI Directory
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Объекты и точки интереса (POI)", style = MaterialTheme.typography.titleLarge)

                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text("Поиск по названию, категории или описанию…") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        trailingIcon = {
                            if (searchQuery.isNotEmpty()) {
                                IconButton(onClick = { searchQuery = "" }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Очистить")
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        TtkFilterChip(
                            label = "Все",
                            count = doc.pois.size,
                            selected = selectedCategory == null,
                            onClick = { selectedCategory = null }
                        )
                        PoiCategory.entries.forEach { category ->
                            val count = doc.pois.count { it.category == category }
                            if (count > 0) {
                                TtkFilterChip(
                                    label = category.defaultLabelRu,
                                    count = count,
                                    selected = selectedCategory == category,
                                    onClick = {
                                        selectedCategory = if (selectedCategory == category) null else category
                                    }
                                )
                            }
                        }
                    }
                }
            }

            items(filteredPois, key = { it.id }) { poi ->
                val isSelected = poi.id == selectedPoiId
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                    tonalElevation = 1.dp,
                    shadowElevation = 2.dp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { selectPoiAndSwitchFloor(poi) }
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .background(poiCategoryColor(poi.category).copy(alpha = 0.14f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Place,
                                    contentDescription = null,
                                    tint = poiCategoryColor(poi.category)
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = poi.title,
                                    style = MaterialTheme.typography.titleMedium
                                )
                                Text(
                                    text = poi.displayCategoryLabel(),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = poiCategoryColor(poi.category)
                                )
                                if (poi.description.isNotBlank()) {
                                    Text(
                                        text = poi.description,
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }

                        IconButton(
                            onClick = {
                                selectedPoiId = poi.id
                                routeToPoiId = poi.id
                                if (routeFromPoiId == null || routeFromPoiId == poi.id) {
                                    routeFromPoiId = doc.pois.firstOrNull { it.id != poi.id }?.id
                                }
                                triggerBuildRoute()
                            }
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                contentDescription = "Построить маршрут",
                                tint = TtkBrandRed
                            )
                        }
                    }
                }
            }
        }
    }

    // 360° Panorama Fullscreen Viewer Dialog
    activePanorama?.let { pano ->
        val walkSteps = routeResponse?.walk?.steps.orEmpty()
        Panorama360Dialog(
            panorama = pano,
            allPanoramas = doc.panoramas,
            hotspots = doc.hotspots,
            pois = doc.pois,
            assets = currentMap.assets,
            initialYawDeg = activePanoramaYaw,
            editable = false,
            walkSteps = if (currentWalkStepIndex >= 0) walkSteps else emptyList(),
            currentWalkStepIndex = currentWalkStepIndex,
            network = repository.network,
            onDismiss = {
                activePanorama = null
                currentWalkStepIndex = -1
            },
            onSelectPanorama = { nextPano, yaw ->
                activePanorama = nextPano
                activePanoramaYaw = yaw
            },
            onSelectPoi = { poi ->
                selectedPoiId = poi.id
            },
            onAdvanceWalkStep = { nextIdx ->
                val step = walkSteps.getOrNull(nextIdx) ?: return@Panorama360Dialog
                val targetPano = doc.panoramas.firstOrNull { it.id == step.panoramaId } ?: return@Panorama360Dialog
                currentWalkStepIndex = nextIdx
                activePanorama = targetPano
                activePanoramaYaw = step.yawDeg
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RouteBuilderSection(
    pois: List<Poi>,
    routeFromPoiId: String?,
    routeToPoiId: String?,
    routeResponse: RouteResponse?,
    scaleMPerUnit: Double?,
    routeBusy: Boolean,
    routeError: String?,
    onSelectFrom: (String) -> Unit,
    onSelectTo: (String) -> Unit,
    onBuildRoute: () -> Unit,
    onClearRoute: () -> Unit,
    onStartVirtualWalk: () -> Unit
) {
    var fromExpanded by remember { mutableStateOf(false) }
    var toExpanded by remember { mutableStateOf(false) }

    val fromPoi = pois.firstOrNull { it.id == routeFromPoiId }
    val toPoi = pois.firstOrNull { it.id == routeToPoiId }

    Surface(
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 4.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f
                val navIconBg = if (isDark) TtkDarkNeutralSurface else TtkRedContainer
                val navIconBorder = if (isDark) TtkDarkNeutralBorder else TtkRedBorder
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(navIconBg)
                        .border(1.dp, navIconBorder, RoundedCornerShape(10.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.LocationOn,
                        contentDescription = null,
                        tint = TtkBrandRed,
                        modifier = Modifier.size(20.dp)
                    )
                }
                Column {
                    TtkEyebrow(text = "НАВИГАЦИЯ")
                    Text("Маршрут А → Б", style = MaterialTheme.typography.titleLarge)
                }
            }

            // From Selector
            ExposedDropdownMenuBox(
                expanded = fromExpanded,
                onExpandedChange = { fromExpanded = it }
            ) {
                OutlinedTextField(
                    value = fromPoi?.title ?: "Выберите начальную точку",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Откуда (Точка А)") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = fromExpanded) },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .menuAnchor()
                        .fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = fromExpanded,
                    onDismissRequest = { fromExpanded = false }
                ) {
                    pois.forEach { poi ->
                        DropdownMenuItem(
                            text = { Text("${poi.title} · ${poi.displayCategoryLabel()}", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            onClick = {
                                onSelectFrom(poi.id)
                                fromExpanded = false
                            }
                        )
                    }
                }
            }

            // To Selector
            ExposedDropdownMenuBox(
                expanded = toExpanded,
                onExpandedChange = { toExpanded = it }
            ) {
                OutlinedTextField(
                    value = toPoi?.title ?: "Выберите конечную точку",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Куда (Точка Б)") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = toExpanded) },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .menuAnchor()
                        .fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = toExpanded,
                    onDismissRequest = { toExpanded = false }
                ) {
                    pois.forEach { poi ->
                        DropdownMenuItem(
                            text = { Text("${poi.title} · ${poi.displayCategoryLabel()}", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            onClick = {
                                onSelectTo(poi.id)
                                toExpanded = false
                            }
                        )
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TtkPrimaryButton(
                    text = if (routeBusy) "Строим…" else "Построить маршрут",
                    icon = Icons.AutoMirrored.Filled.ArrowForward,
                    enabled = !routeBusy && pois.size >= 2,
                    onClick = onBuildRoute,
                    modifier = Modifier.weight(1f)
                )
                if (routeResponse != null || routeError != null) {
                    OutlinedButton(
                        onClick = onClearRoute,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.height(48.dp)
                    ) {
                        Text("Сбросить")
                    }
                }
            }

            if (routeError != null) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.errorContainer
                ) {
                    Text(
                        text = routeError,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            // Route Result & Virtual Panorama Walkthrough
            if (routeResponse != null) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.secondaryContainer
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Дистанция: ${CoordinateMath.formatDistance(routeResponse.distanceUnits, scaleMPerUnit)}",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 15.sp,
                                color = MaterialTheme.colorScheme.onSecondaryContainer
                            )
                            Text(
                                text = "${routeResponse.nodeIds.size} узлов графа",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSecondaryContainer
                            )
                        }

                        if (routeResponse.walk.available && routeResponse.walk.steps.isNotEmpty()) {
                            Button(
                                onClick = onStartVirtualWalk,
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = TtkGreen),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.PlayArrow, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Пройти маршрут в 360° (${routeResponse.walk.steps.size} панорам)",
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        } else if (routeResponse.walk.gaps.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    text = "2D-маршрут готов. Полный 360°-проход недоступен:",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                                routeResponse.walk.gaps.distinctBy { it.reason }.forEach { gap ->
                                    Text(
                                        text = "• ${gap.localizedReason()}",
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSecondaryContainer
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
