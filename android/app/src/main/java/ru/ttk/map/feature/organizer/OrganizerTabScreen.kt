package ru.ttk.map.feature.organizer

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.ttk.map.core.domain.AiGeneratedPlanResult
import ru.ttk.map.core.domain.AiPlanGenerator
import ru.ttk.map.core.model.CreateMapRequest
import ru.ttk.map.core.model.MapAnalyticsSummary
import ru.ttk.map.core.model.MapDocument
import ru.ttk.map.core.model.MapSummary
import ru.ttk.map.core.model.MultiFloorHelper
import ru.ttk.map.core.model.PoiCategory
import ru.ttk.map.core.network.TtkApiException
import ru.ttk.map.core.repository.TtkMapRepository
import ru.ttk.map.ui.components.poiCategoryColor
import ru.ttk.map.ui.theme.TtkBrandRed
import ru.ttk.map.ui.theme.TtkDeepTeal
import ru.ttk.map.ui.theme.TtkExpressiveLoadingIndicator
import ru.ttk.map.ui.theme.TtkEyebrow
import ru.ttk.map.ui.theme.TtkGreen
import ru.ttk.map.ui.theme.TtkGreenContainer
import ru.ttk.map.ui.theme.TtkPrimaryButton
import ru.ttk.map.ui.theme.TtkStatusTag
import ru.ttk.map.ui.theme.TtkTopAppBar

enum class OrganizerHubTab(val label: String) {
    SPACES("Пространства"),
    ANALYTICS("Аналитика"),
    AI_STUDIO("AI"),
    CAMPUS("Кампус")
}

/**
 * Organizer / Admin Tab Screen:
 * - When logged out: Shows full-screen Login Screen matching lk.ttk.ru/auth with TTK brand styling.
 * - When logged in: Complete organizer studio hub including:
 *   1. Spaces management, create new map, 2D/3D studio editor button, 360° capture, and live publishing.
 *   2. Analytics Dashboard (views, POI clicks, routes, top popular spots, peak hours).
 *   3. AI / CV 2D-Plan Generator from sketch or architectural blueprints.
 *   4. Multi-building campus network and floor overview.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrganizerTabScreen(
    repository: TtkMapRepository,
    onOpenSettings: () -> Unit,
    onOpenMapEditor: (String) -> Unit,
    onOpenCapture: (String) -> Unit,
    onOpenPublicPreview: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val serverUrl by repository.network.serverUrl.collectAsState()

    var isLoggedIn by remember { mutableStateOf(false) }
    var checkingSession by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        checkingSession = true
        runCatching {
            repository.currentSession()
            isLoggedIn = true
        }.onFailure {
            isLoggedIn = false
        }
        checkingSession = false
    }

    if (checkingSession) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            TtkExpressiveLoadingIndicator(size = 36.dp)
        }
        return
    }

    if (!isLoggedIn) {
        OrganizerAuthCardScreen(
            repository = repository,
            onOpenSettings = onOpenSettings,
            onLoginSuccess = { isLoggedIn = true }
        )
    } else {
        OrganizerWorkspaceContent(
            repository = repository,
            serverUrl = serverUrl,
            onOpenSettings = onOpenSettings,
            onOpenMapEditor = onOpenMapEditor,
            onOpenCapture = onOpenCapture,
            onOpenPublicPreview = onOpenPublicPreview,
            onLogout = { isLoggedIn = false }
        )
    }
}

/**
 * Fullscreen Login Screen styled after lk.ttk.ru/auth with TTK brand colors.
 */
@Composable
private fun OrganizerAuthCardScreen(
    repository: TtkMapRepository,
    onOpenSettings: () -> Unit,
    onLoginSuccess: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TtkTopAppBar(onOpenSettings = onOpenSettings)
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            item {
                Spacer(modifier = Modifier.height(12.dp))

                Surface(
                    shape = RoundedCornerShape(28.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 4.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(18.dp)
                    ) {
                        Text(
                            text = "Вход в панель организатора",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            textAlign = TextAlign.Center
                        )

                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            label = { Text("Электронная почта") },
                            placeholder = { Text("organizer@ttk.ru") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            label = { Text("Пароль") },
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        if (!errorText.isNullOrBlank()) {
                            Text(
                                text = errorText ?: "",
                                color = TtkBrandRed,
                                fontSize = 12.sp,
                                textAlign = TextAlign.Center
                            )
                        }

                        Button(
                            onClick = {
                                scope.launch {
                                    busy = true
                                    errorText = null
                                    try {
                                        repository.login(email.trim(), password)
                                        onLoginSuccess()
                                    } catch (e: Exception) {
                                        errorText = e.message ?: "Не удалось войти. Проверьте данные и сервер."
                                    } finally {
                                        busy = false
                                    }
                                }
                            },
                            enabled = !busy && email.isNotBlank() && password.isNotBlank(),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = TtkBrandRed,
                                contentColor = Color.White
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp)
                        ) {
                            if (busy) {
                                TtkExpressiveLoadingIndicator(size = 20.dp)
                            } else {
                                Text(
                                    text = "Войти",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp
                                )
                            }
                        }

                        Text(
                            text = "Забыли пароль?",
                            fontSize = 13.sp,
                            color = TtkBrandRed,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clickable {
                                errorText = "Для восстановления доступа обратитесь к администратору сервера."
                            }
                        )
                    }
                }
            }
        }
    }
}

/**
 * Organizer Workspace Hub after successful login:
 * Contains tabs: Spaces, Analytics, AI Studio, Campus.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun OrganizerWorkspaceContent(
    repository: TtkMapRepository,
    serverUrl: String,
    onOpenSettings: () -> Unit,
    onOpenMapEditor: (String) -> Unit,
    onOpenCapture: (String) -> Unit,
    onOpenPublicPreview: (String) -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var activeTab by remember { mutableStateOf(OrganizerHubTab.SPACES) }
    var maps by remember { mutableStateOf<List<MapSummary>>(emptyList()) }
    var analyticsSummary by remember { mutableStateOf<MapAnalyticsSummary?>(null) }
    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf<String?>(null) }
    var noticeText by remember { mutableStateOf<String?>(null) }

    var showCreateDialog by remember { mutableStateOf(false) }
    var sharingMap by remember { mutableStateOf<MapSummary?>(null) }

    fun refreshAll() {
        scope.launch {
            loading = true
            errorText = null
            try {
                maps = repository.listAllMaps()
                analyticsSummary = repository.getAnalyticsSummary(null)
            } catch (e: TtkApiException) {
                if (e.isUnauthorized) {
                    onLogout()
                    return@launch
                }
                errorText = e.message
            } catch (e: Exception) {
                errorText = e.message ?: "Не удалось загрузить данные"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        refreshAll()
    }

    val pullRefreshState = rememberPullToRefreshState()
    if (pullRefreshState.isRefreshing) {
        LaunchedEffect(true) {
            refreshAll()
            pullRefreshState.endRefresh()
        }
    }

    Scaffold(
        topBar = {
            TtkTopAppBar(onOpenSettings = onOpenSettings)
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .nestedScroll(pullRefreshState.nestedScrollConnection)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Top Tab Bar for Organizer Modules
                TabRow(
                    selectedTabIndex = activeTab.ordinal,
                    containerColor = MaterialTheme.colorScheme.surface,
                    contentColor = TtkBrandRed,
                    indicator = { tabPositions ->
                        TabRowDefaults.SecondaryIndicator(
                            modifier = Modifier.tabIndicatorOffset(tabPositions[activeTab.ordinal]),
                            color = TtkBrandRed,
                            height = 3.dp
                        )
                    }
                ) {
                    OrganizerHubTab.entries.forEach { tab ->
                        Tab(
                            selected = activeTab == tab,
                            onClick = { activeTab = tab },
                            text = {
                                Text(
                                    text = tab.label,
                                    fontWeight = if (activeTab == tab) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 11.5.sp,
                                    maxLines = 1,
                                    softWrap = false
                                )
                            }
                        )
                    }
                }

                // Tab Content Switcher
                AnimatedContent(
                    targetState = activeTab,
                    transitionSpec = { fadeIn() togetherWith fadeOut() },
                    label = "hubTabRouter"
                ) { currentTab ->
                    when (currentTab) {
                        OrganizerHubTab.SPACES -> {
                            SpacesTabContent(
                                maps = maps,
                                loading = loading,
                                analyticsSummary = analyticsSummary,
                                onOpenCreate = { showCreateDialog = true },
                                onOpenEditor = onOpenMapEditor,
                                onOpenCapture = onOpenCapture,
                                onOpenPreview = onOpenPublicPreview,
                                onOpenShare = { sharingMap = it },
                                onOpenAiStudio = { activeTab = OrganizerHubTab.AI_STUDIO },
                                onDownloadOffline = { slug ->
                                    scope.launch {
                                        try {
                                            repository.downloadMap(slug)
                                            noticeText = "Карта $slug скачана в офлайн-память"
                                        } catch (e: Exception) {
                                            errorText = e.message ?: "Ошибка загрузки карты"
                                        }
                                    }
                                },
                                onLogout = {
                                    scope.launch {
                                        repository.logout()
                                        onLogout()
                                    }
                                }
                            )
                        }

                        OrganizerHubTab.ANALYTICS -> {
                            AnalyticsTabContent(
                                maps = maps,
                                analyticsSummary = analyticsSummary,
                                onSelectMap = { mapId ->
                                    scope.launch {
                                        analyticsSummary = repository.getAnalyticsSummary(mapId)
                                    }
                                }
                            )
                        }

                        OrganizerHubTab.AI_STUDIO -> {
                            AiStudioTabContent(
                                repository = repository,
                                onMapCreated = { newMapId ->
                                    refreshAll()
                                    onOpenMapEditor(newMapId)
                                }
                            )
                        }

                        OrganizerHubTab.CAMPUS -> {
                            CampusTabContent(
                                maps = maps,
                                onOpenPublicPreview = onOpenPublicPreview
                            )
                        }
                    }
                }
            }

            // Pull to refresh indicator
            PullToRefreshContainer(
                state = pullRefreshState,
                modifier = Modifier.align(Alignment.TopCenter),
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = TtkBrandRed
            )
        }
    }

    // Modal: Create New Space
    if (showCreateDialog) {
        CreateMapBottomSheet(
            onDismiss = { showCreateDialog = false },
            onCreate = { title, w, h, scale ->
                showCreateDialog = false
                scope.launch {
                    try {
                        val (created, _) = repository.createMap(
                            CreateMapRequest(
                                title = title,
                                description = "",
                                widthUnits = w,
                                heightUnits = h,
                                scaleMPerUnit = scale,
                                maxWalkGapUnits = 500.0
                            )
                        )
                        refreshAll()
                        onOpenMapEditor(created.snapshot.id)
                    } catch (e: Exception) {
                        errorText = e.message ?: "Ошибка создания карты"
                    }
                }
            }
        )
    }

    // Modal: Share & Embed Dialog
    if (sharingMap != null) {
        val map = sharingMap!!
        ShareMapBottomSheet(
            map = map,
            serverUrl = serverUrl,
            onDismiss = { sharingMap = null }
        )
    }
}

/**
 * Tab 1: Spaces & Maps Management
 */
@Composable
private fun SpacesTabContent(
    maps: List<MapSummary>,
    loading: Boolean,
    analyticsSummary: MapAnalyticsSummary?,
    onOpenCreate: () -> Unit,
    onOpenEditor: (String) -> Unit,
    onOpenCapture: (String) -> Unit,
    onOpenPreview: (String) -> Unit,
    onOpenShare: (MapSummary) -> Unit,
    onOpenAiStudio: () -> Unit,
    onDownloadOffline: (String) -> Unit,
    onLogout: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Organizer profile bar
        item {
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        TtkEyebrow(text = "КАБИНЕТ ОРГАНИЗАТОРА")
                        Text(
                            text = "Управление пространствами",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    OutlinedButton(
                        onClick = onLogout,
                        shape = RoundedCornerShape(10.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                        modifier = Modifier.height(34.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Выйти", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }

        // Quick Stats Summary Banner
        item {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = TtkDeepTeal,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Сводка площадки", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Пространств", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp)
                            Text("${maps.size}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        }
                        Column {
                            Text("Опубликовано", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp)
                            Text("${maps.count { it.isPublished }}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        }
                        Column {
                            Text("Просмотров", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp)
                            Text("${analyticsSummary?.totalViews ?: 0}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        }
                        Column {
                            Text("Маршрутов", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp)
                            Text("${analyticsSummary?.totalRoutesBuilt ?: 0}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        }
                    }
                }
            }
        }

        // Action Buttons: + Create Space & AI Generator
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = onOpenCreate,
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = TtkBrandRed),
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Создать карту", fontWeight = FontWeight.Bold)
                }

                OutlinedButton(
                    onClick = onOpenAiStudio,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.height(48.dp)
                ) {
                    Text("✨ AI Чертеж", fontWeight = FontWeight.Bold, color = TtkGreen)
                }
            }
        }

        // Section Title
        item {
            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("Мои пространства", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("(${maps.size})", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        if (loading) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    TtkExpressiveLoadingIndicator(size = 36.dp)
                }
            }
        } else if (maps.isEmpty()) {
            item {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Здесь пока нет карт", style = MaterialTheme.typography.titleMedium)
                        Text(
                            text = "Нажмите «Создать карту» или используйте «AI Чертеж» для автоматической оцифровки помещения.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        } else {
            items(maps, key = { it.id }) { item ->
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 2.dp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenEditor(item.id) }
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Title row with Status Tag
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Slug: ${item.slug} · v${item.revision}",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            TtkStatusTag(isPublished = item.isPublished)
                        }

                        // Primary Action: Open 2D/3D Editor Studio
                        Button(
                            onClick = { onOpenEditor(item.id) },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = TtkBrandRed),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(44.dp)
                        ) {
                            Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Редактор 2D / 3D пространства", fontWeight = FontWeight.Bold)
                        }

                        // Secondary Actions Row: 360 Capture, Share, Preview, Offline
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // 360 Capture button
                            Button(
                                onClick = { onOpenCapture(item.id) },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = TtkGreen),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Снять 360°", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }

                            // Share / Embed
                            OutlinedButton(
                                onClick = { onOpenShare(item) },
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Icon(Icons.Default.Share, contentDescription = "Поделиться", modifier = Modifier.size(16.dp))
                            }

                            // Preview
                            OutlinedButton(
                                onClick = { onOpenPreview(item.slug) },
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Обзор", modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Tab 2: Analytics Dashboard
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun AnalyticsTabContent(
    maps: List<MapSummary>,
    analyticsSummary: MapAnalyticsSummary?,
    onSelectMap: (String?) -> Unit
) {
    var selectedMapId by remember { mutableStateOf<String?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Column {
                TtkEyebrow(text = "АНАЛИТИКА И СТАТИСТИКА")
                Text("Посещаемость площадки", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    text = "Анализ популярности объектов, просмотров 3D-панорам и построенных маршрутов.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Map filter chips
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = selectedMapId == null,
                    onClick = {
                        selectedMapId = null
                        onSelectMap(null)
                    },
                    label = { Text("Все пространства") },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = TtkBrandRed.copy(alpha = 0.15f))
                )
                maps.forEach { map ->
                    FilterChip(
                        selected = selectedMapId == map.id,
                        onClick = {
                            selectedMapId = map.id
                            onSelectMap(map.id)
                        },
                        label = { Text(map.title) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = TtkBrandRed.copy(alpha = 0.15f))
                    )
                }
            }
        }

        // 4 Stat Cards
        val summary = analyticsSummary
        if (summary != null) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    StatCard(
                        title = "Просмотры",
                        value = "${summary.totalViews}",
                        subtitle = "открытий карты",
                        color = TtkGreen,
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        title = "Клики POI",
                        value = "${summary.totalPoiClicks}",
                        subtitle = "интерес к объектам",
                        color = TtkBrandRed,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    StatCard(
                        title = "Маршруты",
                        value = "${summary.totalRoutesBuilt}",
                        subtitle = "построено путей",
                        color = Color(0xFF2563EB),
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        title = "Панорамы",
                        value = "${summary.totalPanoramaViews}",
                        subtitle = "360° обзоров",
                        color = Color(0xFF7C3AED),
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            // Top POIs Ranking
            item {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 2.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Топ популярных мест", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Text("Клики", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }

                        if (summary.topPois.isEmpty()) {
                            Text(
                                "Пока нет данных о кликах по объектам.",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            summary.topPois.take(6).forEachIndexed { idx, stat ->
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Text(
                                                text = "${idx + 1}.",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp,
                                                color = TtkBrandRed
                                            )
                                            Box(
                                                modifier = Modifier
                                                    .size(8.dp)
                                                    .clip(CircleShape)
                                                    .background(poiCategoryColor(stat.category))
                                            )
                                            Text(
                                                text = stat.title,
                                                fontWeight = FontWeight.SemiBold,
                                                fontSize = 13.sp,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                        Text(
                                            text = "${stat.clickCount}",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp
                                        )
                                    }
                                    LinearProgressIndicator(
                                        progress = { (stat.percentage / 100f).coerceIn(0.05f, 1f) },
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(6.dp)
                                            .clip(RoundedCornerShape(3.dp)),
                                        color = poiCategoryColor(stat.category),
                                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Category Distribution
            item {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 2.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Распределение интереса по категориям", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            summary.categoryDistribution.forEach { (cat, count) ->
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = poiCategoryColor(cat).copy(alpha = 0.12f)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(8.dp)
                                                .clip(CircleShape)
                                                .background(poiCategoryColor(cat))
                                        )
                                        Text(
                                            text = "${cat.defaultLabelRu}: $count",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Peak Activity Hours (24h histogram)
            item {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 2.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Активность по часам суток (пиковые часы)", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        val maxEvents = summary.hourlyActivity.maxOfOrNull { it.eventCount }?.coerceAtLeast(1) ?: 1
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(80.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Bottom
                        ) {
                            summary.hourlyActivity.filterIndexed { index, _ -> index % 2 == 0 }.forEach { stat ->
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Bottom,
                                    modifier = Modifier.weight(1f)
                                ) {
                                    val barHeight = ((stat.eventCount.toFloat() / maxEvents) * 60f).coerceIn(4f, 60f)
                                    Box(
                                        modifier = Modifier
                                            .width(8.dp)
                                            .height(barHeight.dp)
                                            .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                            .background(if (stat.hourOfDay in 11..16) TtkBrandRed else TtkDeepTeal)
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text("${stat.hourOfDay}", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCard(
    title: String,
    value: String,
    subtitle: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 2.dp,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(title, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
            Text(value, fontSize = 24.sp, fontWeight = FontWeight.Black, color = color)
            Text(subtitle, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * Tab 3: AI / CV Plan Generator
 */
@Composable
private fun AiStudioTabContent(
    repository: TtkMapRepository,
    onMapCreated: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var spaceTitle by remember { mutableStateOf("Оцифрованный зал ТТК") }
    var widthUnits by remember { mutableStateOf("700") }
    var heightUnits by remember { mutableStateOf("500") }

    var selectedImageUri by remember { mutableStateOf<Uri?>(null) }
    var analyzing by remember { mutableStateOf(false) }
    var generatedResult by remember { mutableStateOf<AiGeneratedPlanResult?>(null) }
    var errorText by remember { mutableStateOf<String?>(null) }

    val imagePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        selectedImageUri = uri
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Column {
                TtkEyebrow(text = "НЕЙРОСЕТЕВАЯ ОЦИФРОВКА")
                Text("AI Генератор 2D-плана", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    text = "Загрузите схему БТИ, фото чертежа или эскиз. AI распознает контуры стен, создаст комнаты, расставит базовые POI и построит навигационную сеть.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Image upload surface
        item {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 2.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { imagePicker.launch("image/*") }
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Place,
                        contentDescription = null,
                        tint = TtkGreen,
                        modifier = Modifier.size(36.dp)
                    )
                    Text(
                        text = if (selectedImageUri != null) "Чертеж выбран (нажмите для смены)" else "Нажмите для загрузки фото чертежа / плана БТИ",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center
                    )
                    Text(
                        text = "Поддерживаются форматы JPEG, PNG, WebP",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // Settings
        item {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Параметры пространства", fontWeight = FontWeight.Bold, fontSize = 15.sp)

                    OutlinedTextField(
                        value = spaceTitle,
                        onValueChange = { spaceTitle = it },
                        label = { Text("Название пространства") },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = widthUnits,
                            onValueChange = { widthUnits = it },
                            label = { Text("Ширина (ед.)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = heightUnits,
                            onValueChange = { heightUnits = it },
                            label = { Text("Высота (ед.)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Button(
                        onClick = {
                            scope.launch {
                                analyzing = true
                                errorText = null
                                try {
                                    val w = widthUnits.toDoubleOrNull() ?: 700.0
                                    val h = heightUnits.toDoubleOrNull() ?: 500.0

                                    val bmp = withContext(Dispatchers.IO) {
                                        selectedImageUri?.let { uri ->
                                            context.contentResolver.openInputStream(uri)?.use { stream ->
                                                BitmapFactory.decodeStream(stream)
                                            }
                                        }
                                    }

                                    val result = AiPlanGenerator.generatePlanFromSketch(
                                        bitmap = bmp,
                                        widthUnits = w,
                                        heightUnits = h,
                                        spaceNameHint = spaceTitle.trim()
                                    )
                                    generatedResult = result
                                } catch (e: Exception) {
                                    errorText = e.message ?: "Ошибка AI-анализа изображения"
                                } finally {
                                    analyzing = false
                                }
                            }
                        },
                        enabled = !analyzing && spaceTitle.isNotBlank(),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = TtkGreen),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                    ) {
                        if (analyzing) {
                            TtkExpressiveLoadingIndicator(size = 20.dp)
                        } else {
                            Text("✨ Запустить AI-распознавание стен", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Generated Result Preview Card
        if (generatedResult != null) {
            val res = generatedResult!!
            item {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = TtkGreenContainer,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("План успешно сформирован!", fontWeight = FontWeight.Bold, color = TtkDeepTeal)
                            Text("Точность: ${res.confidencePercent}%", fontWeight = FontWeight.Bold, color = TtkGreen)
                        }

                        Text(
                            text = res.summaryReport,
                            fontSize = 12.sp,
                            color = TtkDeepTeal
                        )

                        Text(
                            text = "Размечено объектов: ${res.pois.size} · Зон: ${res.detectedRoomsCount} · Узлов навигации: ${res.nodes.size}",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TtkDeepTeal
                        )

                        Button(
                            onClick = {
                                scope.launch {
                                    analyzing = true
                                    try {
                                        val (created, _) = repository.createMap(
                                            CreateMapRequest(
                                                title = res.title,
                                                description = res.description,
                                                widthUnits = widthUnits.toDoubleOrNull() ?: 700.0,
                                                heightUnits = heightUnits.toDoubleOrNull() ?: 500.0,
                                                scaleMPerUnit = 0.1,
                                                maxWalkGapUnits = 500.0
                                            )
                                        )
                                        // Update created map document with AI shapes, pois, nodes, edges
                                        val newDoc = MapDocument(
                                            title = res.title,
                                            description = res.description,
                                            isPublished = true,
                                            scaleMPerUnit = 0.1,
                                            maxWalkGapUnits = 500.0,
                                            shapes = res.shapes,
                                            nodes = res.nodes,
                                            edges = res.edges,
                                            pois = res.pois,
                                            panoramas = emptyList(),
                                            hotspots = emptyList()
                                        )
                                        repository.replaceMapDocument(created.snapshot.id, newDoc)
                                        onMapCreated(created.snapshot.id)
                                    } catch (e: Exception) {
                                        errorText = e.message ?: "Ошибка сохранения AI-карты"
                                    } finally {
                                        analyzing = false
                                    }
                                }
                            },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = TtkBrandRed),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Создать пространство и открыть в редакторе", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Tab 4: Multi-building Campus Hub
 */
@Composable
private fun CampusTabContent(
    maps: List<MapSummary>,
    onOpenPublicPreview: (String) -> Unit
) {
    val buildings = remember { MultiFloorHelper.getDefaultCampusBuildings() }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Column {
                TtkEyebrow(text = "СВЯЗКА ЗДАНИЙ И ТЕРРИТОРИИ")
                Text("Единый кампус площадки", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    text = "Объединение нескольких корпусов и уличной территории в единую навигационную сеть с переключением этажей.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        items(buildings, key = { it.id }) { bld ->
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(bld.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Text(bld.shortName, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = TtkGreenContainer
                        ) {
                            Text(
                                text = "${bld.floors.size} этажа",
                                color = TtkDeepTeal,
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }

                    Text(
                        text = bld.description,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // Floors row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        bld.floors.forEach { fl ->
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Text(
                                    text = fl.name,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }

                    // Open campus preview button
                    val targetSlug = maps.firstOrNull()?.slug ?: TtkMapRepository.DEMO_OFFLINE_SLUG
                    OutlinedButton(
                        onClick = { onOpenPublicPreview(targetSlug) },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Перейти к навигации по корпусу")
                    }
                }
            }
        }
    }
}

/**
 * Bottom Sheet: Create Space
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateMapBottomSheet(
    onDismiss: () -> Unit,
    onCreate: (title: String, w: Double, h: Double, scale: Double?) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var width by remember { mutableStateOf("700") }
    var height by remember { mutableStateOf("500") }
    var scaleM by remember { mutableStateOf("0.1") }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            TtkEyebrow(text = "НОВОЕ ПРОСТРАНСТВО")
            Text("Создание карты площадки", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Название карты") },
                placeholder = { Text("Главный павильон ТТК · Этаж 1") },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            )

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = width,
                    onValueChange = { width = it },
                    label = { Text("Ширина (ед.)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = height,
                    onValueChange = { height = it },
                    label = { Text("Высота (ед.)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                )
            }

            OutlinedTextField(
                value = scaleM,
                onValueChange = { scaleM = it },
                label = { Text("Масштаб (метров на единицу)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            )

            Button(
                onClick = {
                    val w = width.toDoubleOrNull() ?: 700.0
                    val h = height.toDoubleOrNull() ?: 500.0
                    val s = scaleM.toDoubleOrNull()
                    onCreate(title.trim(), w, h, s)
                },
                enabled = title.isNotBlank(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = TtkBrandRed),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
            ) {
                Text("Создать пространство и открыть редактор", fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

/**
 * Bottom Sheet: Share & Embed code
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShareMapBottomSheet(
    map: MapSummary,
    serverUrl: String,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val base = serverUrl.trimEnd('/')
    val publicUrl = "$base/m/${map.slug}"
    val embedCode = """<iframe src="$base/embed/${map.slug}" title="${map.title.replace("\"", "")}" width="100%" height="600" style="border:0;border-radius:16px;" loading="lazy" allowfullscreen></iframe>"""

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            TtkEyebrow(text = "ПУБЛИЧНЫЙ ДОСТУП И ВСТРАИВАНИЕ")
            Text("Поделиться картой «${map.title}»", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                text = "Токен ссылки неизменен: любые обновления плана автоматически видны посетителям без смены ссылки.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            // Direct Link
            OutlinedTextField(
                value = publicUrl,
                onValueChange = {},
                readOnly = true,
                label = { Text("Прямая ссылка для смартфона (/m/:slug)") },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            )

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = {
                        val clip = ClipData.newPlainText("TTKMap URL", publicUrl)
                        (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(clip)
                        Toast.makeText(context, "Ссылка скопирована в буфер", Toast.LENGTH_SHORT).show()
                    },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = TtkBrandRed),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Скопировать ссылку", fontWeight = FontWeight.Bold)
                }

                OutlinedButton(
                    onClick = {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(publicUrl))
                        context.startActivity(intent)
                    },
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Открыть")
                }
            }

            // Embed Iframe
            OutlinedTextField(
                value = embedCode,
                onValueChange = {},
                readOnly = true,
                label = { Text("Код для вставки на сайт (iframe)") },
                maxLines = 3,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            )

            Button(
                onClick = {
                    val clip = ClipData.newPlainText("TTKMap Embed", embedCode)
                    (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(clip)
                    Toast.makeText(context, "Код виджета скопирован", Toast.LENGTH_SHORT).show()
                },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = TtkDeepTeal),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Скопировать HTML код iframe", fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
