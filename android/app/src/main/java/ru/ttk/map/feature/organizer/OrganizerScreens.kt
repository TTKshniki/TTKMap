package ru.ttk.map.feature.organizer

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.ttk.map.core.model.AssetRef
import ru.ttk.map.core.model.CreateMapRequest
import ru.ttk.map.core.model.Hotspot
import ru.ttk.map.core.model.MapDocument
import ru.ttk.map.core.model.MapSummary
import ru.ttk.map.core.model.NavEdge
import ru.ttk.map.core.model.NavNode
import ru.ttk.map.core.model.OrganizerMap
import ru.ttk.map.core.model.Panorama
import ru.ttk.map.core.model.Point
import ru.ttk.map.core.model.Poi
import ru.ttk.map.core.model.PoiCategory
import ru.ttk.map.core.model.Shape
import ru.ttk.map.core.model.ShapeKind
import ru.ttk.map.core.network.TtkApiException
import android.graphics.BitmapFactory
import ru.ttk.map.core.domain.AiGeneratedPlanResult
import ru.ttk.map.core.domain.AiPlanGenerator
import ru.ttk.map.core.model.FloorLevel
import ru.ttk.map.core.model.MultiFloorHelper
import ru.ttk.map.core.repository.TtkMapRepository
import ru.ttk.map.feature.capture.GuidedCaptureSection
import ru.ttk.map.feature.panorama.Panorama360Dialog
import ru.ttk.map.ui.components.Interactive2DPlanCanvas
import ru.ttk.map.ui.components.Interactive3DPlanCanvas
import ru.ttk.map.ui.theme.TtkBrandLockup
import ru.ttk.map.ui.theme.TtkBrandRed
import ru.ttk.map.ui.theme.TtkDeepTeal
import ru.ttk.map.ui.theme.TtkEyebrow
import ru.ttk.map.ui.theme.TtkFilterChip
import ru.ttk.map.ui.theme.TtkGreen
import ru.ttk.map.ui.theme.TtkGreenContainer
import ru.ttk.map.ui.theme.TtkPrimaryButton
import ru.ttk.map.ui.theme.TtkStatusTag
import ru.ttk.map.ui.theme.TtkTealHeroCard
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.hypot
import kotlin.math.roundToInt

/**
 * 1. Organizer Login Screen (mirrors LoginPage.tsx & .auth-brand-panel)
 */
@Composable
fun OrganizerLoginScreen(
    repository: TtkMapRepository,
    onBack: () -> Unit,
    onLoginSuccess: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }

    // Check if an active session already exists
    LaunchedEffect(Unit) {
        runCatching {
            repository.currentSession()
            onLoginSuccess()
        }
    }

    Scaffold(
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .displayCutoutPadding()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                }
                TtkBrandLockup(subtitle = "Кабинет организатора")
            }
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(18.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            item {
                TtkTealHeroCard(
                    eyebrow = "ПЛАТФОРМА КАРТ ПРОСТРАНСТВ",
                    title = "Навигация начинается с точного плана.",
                    subtitle = "Создавайте интерактивные карты, снимайте 360°-панорамы смартфоном и делитесь маршрутами с посетителями."
                )
            }

            item {
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 6.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(22.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        TtkEyebrow(text = "ДОСТУП К ПРОСТРАНСТВАМ")
                        Text("Вход в кабинет", style = MaterialTheme.typography.headlineLarge)
                        Text(
                            text = "Войдите под учётной записью организатора площадки для редактирования и публикации карт.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            label = { Text("Электронная почта") },
                            placeholder = { Text("organizer@example.test") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            label = { Text("Пароль (не менее 12 символов)") },
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        if (errorText != null) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.errorContainer
                            ) {
                                Text(
                                    text = errorText!!,
                                    color = MaterialTheme.colorScheme.onErrorContainer,
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(12.dp)
                                )
                            }
                        }

                        TtkPrimaryButton(
                            text = if (busy) "Вход…" else "Войти",
                            enabled = !busy && email.isNotBlank() && password.length >= 12,
                            onClick = {
                                scope.launch {
                                    busy = true
                                    errorText = null
                                    try {
                                        repository.login(email, password)
                                        onLoginSuccess()
                                    } catch (e: Exception) {
                                        errorText = e.message ?: "Не удалось войти. Проверьте данные и адрес сервера."
                                    } finally {
                                        busy = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        )

                        Text(
                            text = "Учётную запись выдаёт администратор площадки (CLI: create-organizer).",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

/**
 * 2. Organizer Map List Screen (mirrors MapList.tsx)
 */
@Composable
fun OrganizerMapListScreen(
    repository: TtkMapRepository,
    onBackToHub: () -> Unit,
    onOpenMapEditor: (String) -> Unit,
    onLoggedOut: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var maps by remember { mutableStateOf<List<MapSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }

    var newTitle by remember { mutableStateOf("") }
    var newWidth by remember { mutableStateOf("700") }
    var newHeight by remember { mutableStateOf("500") }

    fun reloadMaps() {
        scope.launch {
            loading = true
            errorText = null
            try {
                maps = repository.listAllMaps()
            } catch (e: TtkApiException) {
                if (e.isUnauthorized) {
                    onLoggedOut()
                    return@launch
                }
                errorText = e.message
            } catch (e: Exception) {
                errorText = e.message ?: "Не удалось загрузить список карт"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        reloadMaps()
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
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = onBackToHub) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "На главную")
                        }
                        TtkBrandLockup(subtitle = "Мои карты")
                    }
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                repository.logout()
                                onLoggedOut()
                            }
                        },
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Выйти")
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
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        TtkEyebrow(text = "ОРГАНИЗАТОРСКИЙ КАБИНЕТ")
                        Text("Мои карты", style = MaterialTheme.typography.displayLarge)
                        Text(
                            text = "Управляйте пространствами и публикуйте готовые карты.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Text(
                        text = "TTK",
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }

            if (errorText != null) {
                item {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.errorContainer
                    ) {
                        Text(
                            text = errorText!!,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }

            // Create New Map Form (.map-create-form)
            item {
                Surface(
                    shape = RoundedCornerShape(22.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 4.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        TtkEyebrow(text = "НОВОЕ ПРОСТРАНСТВО")
                        OutlinedTextField(
                            value = newTitle,
                            onValueChange = { newTitle = it },
                            label = { Text("Название карты") },
                            placeholder = { Text("Павильон ТТК · Этаж 1") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = newWidth,
                                onValueChange = { newWidth = it },
                                label = { Text("Ширина (ед.)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = newHeight,
                                onValueChange = { newHeight = it },
                                label = { Text("Высота (ед.)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            )
                        }
                        TtkPrimaryButton(
                            text = if (busy) "Создаём…" else "Создать карту",
                            icon = Icons.Default.Add,
                            enabled = !busy && newTitle.isNotBlank(),
                            onClick = {
                                scope.launch {
                                    busy = true
                                    errorText = null
                                    try {
                                        val w = newWidth.toDoubleOrNull()?.coerceIn(10.0, 100000.0) ?: 700.0
                                        val h = newHeight.toDoubleOrNull()?.coerceIn(10.0, 100000.0) ?: 500.0
                                        val (created, _) = repository.createMap(
                                            CreateMapRequest(
                                                title = newTitle.trim(),
                                                description = "",
                                                widthUnits = w,
                                                heightUnits = h,
                                                scaleMPerUnit = null,
                                                maxWalkGapUnits = 500.0
                                            )
                                        )
                                        newTitle = ""
                                        onOpenMapEditor(created.snapshot.id)
                                    } catch (e: Exception) {
                                        errorText = e.message ?: "Ошибка создания карты"
                                    } finally {
                                        busy = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }

            item {
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text("Пространства", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        text = "${maps.size} карт",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (loading) {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = TtkBrandRed)
                    }
                }
            } else if (maps.isEmpty()) {
                item {
                    Surface(
                        shape = RoundedCornerShape(22.dp),
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text("01", fontWeight = FontWeight.ExtraBold, color = TtkGreen)
                            Text("Пока нет карт", style = MaterialTheme.typography.titleLarge)
                            Text(
                                text = "Создайте пространство выше, чтобы начать разметку 2D-плана, съёмку панорам и настройку маршрутов.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            } else {
                items(maps, key = { it.id }) { item ->
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 2.dp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenMapEditor(item.id) }
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
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
                                        .size(44.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(TtkGreenContainer),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Default.Place, contentDescription = null, tint = TtkGreen)
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = item.title,
                                        style = MaterialTheme.typography.titleMedium
                                    )
                                    Text(
                                        text = "Slug: ${item.slug.take(10)}… · v${item.revision}",
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                TtkStatusTag(isPublished = item.isPublished)
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                    contentDescription = "Открыть",
                                    tint = TtkBrandRed,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * 3. Full Organizer Map Editor & Workspace (mirrors OrganizerWorkspace.tsx + PlanEditor.tsx)
 */
enum class EditorTool(val labelRu: String) {
    SELECT("Выбор / Инспектор"),
    ADD_POI("Добавить POI"),
    DRAW_ROOM("Комната"),
    DRAW_CORRIDOR("Коридор"),
    DRAW_WALL("Стена"),
    ADD_NODE("Узел графа"),
    CONNECT_EDGE("Связь прохода"),
    ADD_STAIRS_ELEVATOR("Лестница / Лифт")
}

enum class PlanViewMode(val label: String) {
    VIEW_2D("2D План"),
    VIEW_3D("3D Модель")
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun OrganizerWorkspaceScreen(
    mapId: String,
    repository: TtkMapRepository,
    onBack: () -> Unit,
    onOpenPublicPreview: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var organizerMap by remember { mutableStateOf<OrganizerMap?>(null) }
    var draft by remember { mutableStateOf<MapDocument?>(null) }
    var assets by remember { mutableStateOf<List<AssetRef>>(emptyList()) }
    var dirty by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var versionConflict by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }
    var noticeText by remember { mutableStateOf<String?>(null) }

    val undoStack = remember { mutableStateListOf<MapDocument>() }
    val redoStack = remember { mutableStateListOf<MapDocument>() }

    var planViewMode by remember { mutableStateOf(PlanViewMode.VIEW_2D) }
    var activeFloorLevel by remember { mutableIntStateOf(1) }
    var showAiPlanDialog by remember { mutableStateOf(false) }
    var aiAnalyzing by remember { mutableStateOf(false) }
    var aiResult by remember { mutableStateOf<AiGeneratedPlanResult?>(null) }

    var activeTool by remember { mutableStateOf(EditorTool.SELECT) }
    var draftPolygonPoints by remember { mutableStateOf<List<Point>>(emptyList()) }
    var draftShapeLabel by remember { mutableStateOf("Помещение") }
    var selectedPoiId by remember { mutableStateOf<String?>(null) }
    var selectedNodeId by remember { mutableStateOf<String?>(null) }
    var selectedPanoramaId by remember { mutableStateOf<String?>(null) }
    var hotspotEditorOpen by remember { mutableStateOf(false) }
    var showShareDialog by remember { mutableStateOf(false) }

    fun updateDraft(mutator: (MapDocument) -> MapDocument) {
        val current = draft ?: return
        undoStack.add(current)
        if (undoStack.size > 40) undoStack.removeAt(0)
        redoStack.clear()
        draft = mutator(current)
        dirty = true
    }

    fun reloadFromServer() {
        scope.launch {
            errorText = null
            versionConflict = false
            try {
                val (loaded, _) = repository.getOrganizerMap(mapId)
                organizerMap = loaded
                draft = loaded.snapshot.document
                assets = loaded.snapshot.assets
                dirty = false
                undoStack.clear()
                redoStack.clear()
                if (selectedPanoramaId == null) {
                    selectedPanoramaId = loaded.snapshot.document.panoramas.firstOrNull()?.id
                }
            } catch (e: Exception) {
                errorText = e.message ?: "Не удалось загрузить карту"
            }
        }
    }

    LaunchedEffect(mapId) {
        reloadFromServer()
    }

    fun saveDocument(publishOverride: Boolean? = null) {
        val currentDraft = draft ?: return
        val docToSave = if (publishOverride != null) {
            currentDraft.copy(isPublished = publishOverride)
        } else {
            currentDraft
        }
        scope.launch {
            saving = true
            errorText = null
            try {
                val (saved, _) = repository.replaceMapDocument(mapId, docToSave)
                organizerMap = saved
                draft = saved.snapshot.document
                assets = saved.snapshot.assets
                dirty = false
                versionConflict = false
                noticeText = "Сохранено · ревизия v${saved.snapshot.revision}"
            } catch (e: TtkApiException) {
                if (e.isVersionConflict) {
                    versionConflict = true
                    errorText = "Конфликт версий (412): карта была изменена в другой сессии. Ваши локальные правки сохранены в редакторе."
                } else {
                    errorText = e.message ?: "Ошибка сохранения документа"
                }
            } catch (e: Exception) {
                errorText = e.message ?: "Ошибка сохранения документа"
            } finally {
                saving = false
            }
        }
    }

    // Background Plan Image Picker
    val planImageLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            saving = true
            errorText = null
            try {
                val file = withContext(Dispatchers.IO) {
                    val out = File(context.cacheDir, "plan-bg-${System.currentTimeMillis()}.jpg")
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        FileOutputStream(out).use { output -> input.copyTo(output) }
                    }
                    out
                }
                val uploadedAsset = repository.uploadAsset(mapId = mapId, kind = "plan", file = file)
                assets = assets + uploadedAsset
                updateDraft { it.copy(backgroundAssetId = uploadedAsset.id) }
                noticeText = "Подложка 2D-плана загружена. Нажмите «Сохранить» для фиксации."
            } catch (e: Exception) {
                errorText = e.message ?: "Не удалось загрузить подложку плана"
            } finally {
                saving = false
            }
        }
    }

    val currentMap = organizerMap?.snapshot
    val currentDoc = draft

    if (currentMap == null || currentDoc == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator(color = TtkBrandRed)
                Text(errorText ?: "Загружаем рабочее пространство…")
                if (errorText != null) {
                    TtkPrimaryButton(text = "Повторить загрузку", onClick = ::reloadFromServer)
                }
            }
        }
        return
    }

    val backgroundAsset = currentDoc.backgroundAssetId?.let { bgId ->
        assets.firstOrNull { it.id == bgId }
    }
    val backgroundUrl = repository.network.resolveMediaUrl(
        backgroundAsset?.mobileUrl?.takeIf { it.isNotBlank() }
            ?: backgroundAsset?.fullUrl?.takeIf { it.isNotBlank() }
            ?: backgroundAsset?.previewUrl?.takeIf { it.isNotBlank() }
    )

    val selectedPoi = currentDoc.pois.firstOrNull { it.id == selectedPoiId }
    val selectedPano = currentDoc.panoramas.firstOrNull { it.id == selectedPanoramaId }
        ?: currentDoc.panoramas.firstOrNull()

    fun handlePlanTap(pt: Point) {
        val roundedPt = Point(
            x = (pt.x * 10.0).roundToInt() / 10.0,
            y = (pt.y * 10.0).roundToInt() / 10.0
        )
        when (activeTool) {
            EditorTool.SELECT -> {
                val hitPoi = currentDoc.pois.minByOrNull { hypot(it.x - roundedPt.x, it.y - roundedPt.y) }
                    ?.takeIf { hypot(it.x - roundedPt.x, it.y - roundedPt.y) <= 32.0 }
                if (hitPoi != null) {
                    selectedPoiId = hitPoi.id
                }
            }
            EditorTool.ADD_POI -> {
                val newNodeId = UUID.randomUUID().toString()
                val newPoiId = UUID.randomUUID().toString()
                val newNode = NavNode(id = newNodeId, x = roundedPt.x, y = roundedPt.y)
                // Automatically connect to nearest existing node if present so routing works smoothly
                val nearestNode = currentDoc.nodes.minByOrNull { hypot(it.x - roundedPt.x, it.y - roundedPt.y) }
                val newEdges = if (nearestNode != null) {
                    currentDoc.edges + NavEdge(
                        id = UUID.randomUUID().toString(),
                        a = nearestNode.id,
                        b = newNodeId
                    )
                } else {
                    currentDoc.edges
                }
                val newPoi = Poi(
                    id = newPoiId,
                    title = "Объект ${currentDoc.pois.size + 1}",
                    category = PoiCategory.BOOTH,
                    description = "",
                    x = roundedPt.x,
                    y = roundedPt.y,
                    navNodeId = newNodeId
                )
                updateDraft {
                    it.copy(
                        nodes = it.nodes + newNode,
                        edges = newEdges,
                        pois = it.pois + newPoi
                    )
                }
                selectedPoiId = newPoiId
                activeTool = EditorTool.SELECT
                noticeText = "Точка интереса и узел доступа созданы на плане"
            }
            EditorTool.DRAW_ROOM, EditorTool.DRAW_CORRIDOR, EditorTool.DRAW_WALL -> {
                draftPolygonPoints = draftPolygonPoints + roundedPt
            }
            EditorTool.ADD_NODE -> {
                val newNode = NavNode(
                    id = UUID.randomUUID().toString(),
                    x = roundedPt.x,
                    y = roundedPt.y
                )
                updateDraft { it.copy(nodes = it.nodes + newNode) }
                selectedNodeId = newNode.id
                noticeText = "Узел графа добавлен (${roundedPt.x.roundToInt()}, ${roundedPt.y.roundToInt()})"
            }
            EditorTool.CONNECT_EDGE -> {
                val hitNode = currentDoc.nodes.minByOrNull { hypot(it.x - roundedPt.x, it.y - roundedPt.y) }
                if (hitNode == null) {
                    noticeText = "Сначала добавьте узлы графа"
                    return
                }
                val prevId = selectedNodeId
                if (prevId == null || prevId == hitNode.id) {
                    selectedNodeId = hitNode.id
                    noticeText = "Выбран первый узел — коснитесь второго узла для создания прохода"
                } else {
                    val exists = currentDoc.edges.any {
                        (it.a == prevId && it.b == hitNode.id) || (it.a == hitNode.id && it.b == prevId)
                    }
                    if (!exists) {
                        val edge = NavEdge(id = UUID.randomUUID().toString(), a = prevId, b = hitNode.id)
                        updateDraft { it.copy(edges = it.edges + edge) }
                        noticeText = "Проход между узлами создан"
                    }
                    selectedNodeId = hitNode.id
                }
            }
            EditorTool.ADD_STAIRS_ELEVATOR -> {
                val node1Id = UUID.randomUUID().toString()
                val node2Id = UUID.randomUUID().toString()
                val transitionPoiId = UUID.randomUUID().toString()
                val targetFloor = if (activeFloorLevel == 1) 2 else 1

                val node1 = NavNode(id = "${node1Id}_f${activeFloorLevel}_", x = roundedPt.x, y = roundedPt.y)
                val node2 = NavNode(id = "${node2Id}_f${targetFloor}_", x = roundedPt.x + 8.0, y = roundedPt.y)
                val interFloorEdge = NavEdge(id = UUID.randomUUID().toString(), a = node1.id, b = node2.id)

                val nearestNode = currentDoc.nodes.minByOrNull { hypot(it.x - roundedPt.x, it.y - roundedPt.y) }
                val newEdges = if (nearestNode != null) {
                    currentDoc.edges + listOf(
                        interFloorEdge,
                        NavEdge(UUID.randomUUID().toString(), nearestNode.id, node1.id)
                    )
                } else {
                    currentDoc.edges + interFloorEdge
                }

                val transitionPoi = Poi(
                    id = "${transitionPoiId}_f${activeFloorLevel}_",
                    title = "Лестница / Лифт на Этаж $targetFloor",
                    category = PoiCategory.SERVICE_DESK,
                    description = "Межэтажный переход между этажом $activeFloorLevel и этажом $targetFloor.",
                    x = roundedPt.x,
                    y = roundedPt.y,
                    navNodeId = node1.id
                )

                updateDraft {
                    it.copy(
                        nodes = it.nodes + listOf(node1, node2),
                        edges = newEdges,
                        pois = it.pois + transitionPoi
                    )
                }
                selectedPoiId = transitionPoi.id
                activeTool = EditorTool.SELECT
                noticeText = "Межэтажный переход (лестница/лифт) создан и связан с навигацией"
            }
        }
    }

    fun finishDraftShape() {
        val kind = when (activeTool) {
            EditorTool.DRAW_ROOM -> ShapeKind.ROOM
            EditorTool.DRAW_CORRIDOR -> ShapeKind.CORRIDOR
            EditorTool.DRAW_WALL -> ShapeKind.WALL
            else -> return
        }
        val minPts = if (kind == ShapeKind.WALL) 2 else 3
        if (draftPolygonPoints.size < minPts) {
            noticeText = "Добавьте минимум $minPts вершин на плане"
            return
        }
        val newShape = Shape(
            id = UUID.randomUUID().toString(),
            kind = kind,
            label = if (kind == ShapeKind.WALL) "" else draftShapeLabel.trim(),
            points = draftPolygonPoints
        )
        updateDraft { it.copy(shapes = it.shapes + newShape) }
        draftPolygonPoints = emptyList()
        activeTool = EditorTool.SELECT
        noticeText = "Геометрия добавлена на 2D-план"
    }

    Scaffold(
        topBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 3.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .displayCutoutPadding()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f)
                    ) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "К списку карт")
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = currentDoc.title,
                                style = MaterialTheme.typography.titleMedium,
                                maxLines = 1
                            )
                            Text(
                                text = if (dirty) "Есть несохранённые изменения" else "Сохранено · v${currentMap.revision}",
                                fontSize = 11.sp,
                                color = if (dirty) TtkBrandRed else TtkGreen,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        IconButton(
                            onClick = { showShareDialog = true }
                        ) {
                            Icon(Icons.Default.Share, contentDescription = "Публичная ссылка и код встраивания")
                        }
                        TtkPrimaryButton(
                            text = if (saving) "…" else "Сохранить",
                            icon = Icons.Default.Check,
                            enabled = !saving && !versionConflict,
                            onClick = { saveDocument(null) }
                        )
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
            // Version Conflict 412 Alert Banner (mirrors OrganizerWorkspace.tsx)
            if (versionConflict) {
                item {
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = MaterialTheme.colorScheme.errorContainer,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(
                                text = "Конфликт версии (412 Precondition Failed)",
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Text(
                                text = "Карта изменена в другой вкладке или устройстве. Ваши локальные правки сохранены в редакторе; автоматическая перезапись остановлена.",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                OutlinedButton(
                                    onClick = {
                                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                        val serialized = currentDoc.toJson().toString(2)
                                        clipboard.setPrimaryClip(ClipData.newPlainText("ttkmap-draft.json", serialized))
                                        noticeText = "JSON локальных правок скопирован в буфер обмена"
                                    }
                                ) {
                                    Text("Скопировать локальный JSON")
                                }
                                Button(
                                    onClick = ::reloadFromServer,
                                    colors = ButtonDefaults.buttonColors(containerColor = TtkBrandRed)
                                ) {
                                    Text("Загрузить версию с сервера")
                                }
                            }
                        }
                    }
                }
            }

            if (errorText != null && !versionConflict) {
                item {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.errorContainer
                    ) {
                        Text(
                            text = errorText!!,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }

            if (noticeText != null) {
                item {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = TtkGreenContainer
                    ) {
                        Text(
                            text = noticeText!!,
                            color = TtkDeepTeal,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }

            // 1. Map Settings & Publish Gate Card
            item {
                Surface(
                    shape = RoundedCornerShape(22.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 3.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            TtkEyebrow(text = "МОДУЛЬ 1 · ПАРАМЕТРЫ И ПУБЛИКАЦИЯ")
                            TtkStatusTag(isPublished = currentMap.document.isPublished)
                        }

                        OutlinedTextField(
                            value = currentDoc.title,
                            onValueChange = { title -> updateDraft { it.copy(title = title) } },
                            label = { Text("Название карты") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        OutlinedTextField(
                            value = currentDoc.description,
                            onValueChange = { desc -> updateDraft { it.copy(description = desc) } },
                            label = { Text("Описание пространства") },
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = currentDoc.scaleMPerUnit?.toString() ?: "",
                                onValueChange = { v ->
                                    updateDraft { it.copy(scaleMPerUnit = v.toDoubleOrNull()) }
                                },
                                label = { Text("Метров на ед.") },
                                placeholder = { Text("0.1") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = currentDoc.maxWalkGapUnits.roundToInt().toString(),
                                onValueChange = { v ->
                                    val num = v.toDoubleOrNull()?.coerceIn(1.0, 1000000.0) ?: 500.0
                                    updateDraft { it.copy(maxWalkGapUnits = num) }
                                },
                                label = { Text("Макс. шаг walk") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            )
                        }

                        // Publish gate hint
                        if (currentDoc.pois.isEmpty()) {
                            Text(
                                text = "Для публикации карты добавьте хотя бы одну точку интереса (POI) на план.",
                                fontSize = 12.sp,
                                color = TtkBrandRed,
                                fontWeight = FontWeight.Medium
                            )
                        }

                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Button(
                                onClick = { saveDocument(publishOverride = !currentMap.document.isPublished) },
                                enabled = !saving && !versionConflict && (currentMap.document.isPublished || currentDoc.pois.isNotEmpty()),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (currentMap.document.isPublished) Color(0xFF475569) else TtkGreen
                                ),
                                modifier = Modifier.height(46.dp)
                            ) {
                                Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = if (currentMap.document.isPublished) "Снять с публикации" else "Опубликовать карту",
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            if (currentMap.document.isPublished) {
                                OutlinedButton(
                                    onClick = { onOpenPublicPreview(currentMap.slug) },
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier.height(46.dp)
                                ) {
                                    Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Открыть как Посетитель")
                                }
                            }
                        }
                    }
                }
            }

            // 2. Interactive 2D Plan Editor Toolbar & Canvas
            item {
                Surface(
                    shape = RoundedCornerShape(22.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 3.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                TtkEyebrow(text = "РЕДАКТОР 2D-ПЛАНА")
                                Text("Геометрия, POI и граф навигации", style = MaterialTheme.typography.titleLarge)
                            }
                            Row {
                                IconButton(
                                    enabled = undoStack.isNotEmpty(),
                                    onClick = {
                                        val prev = undoStack.removeAt(undoStack.lastIndex)
                                        draft?.let { redoStack.add(it) }
                                        draft = prev
                                        dirty = true
                                    }
                                ) {
                                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Отменить")
                                }
                                IconButton(
                                    enabled = redoStack.isNotEmpty(),
                                    onClick = {
                                        val next = redoStack.removeAt(redoStack.lastIndex)
                                        draft?.let { undoStack.add(it) }
                                        draft = next
                                        dirty = true
                                    }
                                ) {
                                    Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Повторить")
                                }
                            }
                        }

                        // 2D / 3D Mode & AI Assist Row
                        val availableFloors = remember(currentDoc) { MultiFloorHelper.getAvailableFloors(currentDoc) }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                PlanViewMode.entries.forEach { mode ->
                                    FilterChip(
                                        selected = planViewMode == mode,
                                        onClick = { planViewMode = mode },
                                        label = { Text(mode.label, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
                                    )
                                }
                            }

                            OutlinedButton(
                                onClick = { showAiPlanDialog = true },
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("✨ AI Чертеж", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = TtkGreen)
                            }
                        }

                        // Multi-Floor Selector Row
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text("Этаж:", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            availableFloors.forEach { fl ->
                                FilterChip(
                                    selected = activeFloorLevel == fl.levelNumber,
                                    onClick = { activeFloorLevel = fl.levelNumber },
                                    label = { Text(fl.name) }
                                )
                            }
                            OutlinedButton(
                                onClick = {
                                    val nextFloor = (availableFloors.maxOfOrNull { it.levelNumber } ?: 1) + 1
                                    activeFloorLevel = nextFloor
                                    noticeText = "Переключено на $nextFloor Этаж"
                                },
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.height(32.dp)
                            ) {
                                Text("+ Этаж", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        // Tool Mode Selector Chips (only in 2D mode)
                        if (planViewMode == PlanViewMode.VIEW_2D) {
                            Row(
                                modifier = Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                EditorTool.entries.forEach { tool ->
                                    TtkFilterChip(
                                        label = tool.labelRu,
                                        selected = activeTool == tool,
                                        onClick = {
                                            activeTool = tool
                                            draftPolygonPoints = emptyList()
                                        },
                                        icon = when (tool) {
                                            EditorTool.SELECT -> Icons.Default.LocationOn
                                            EditorTool.ADD_POI -> Icons.Default.Place
                                            EditorTool.DRAW_ROOM, EditorTool.DRAW_CORRIDOR, EditorTool.DRAW_WALL -> Icons.Default.Edit
                                            EditorTool.ADD_NODE, EditorTool.CONNECT_EDGE, EditorTool.ADD_STAIRS_ELEVATOR -> Icons.Default.Build
                                        }
                                    )
                                }

                                TtkFilterChip(
                                    label = "Подложка PNG/JPG",
                                    selected = false,
                                    icon = Icons.Default.Add,
                                    onClick = { planImageLauncher.launch("image/*") }
                                )
                            }
                        }

                        // Shape Drawing Controls when in DRAW_* mode
                        if (planViewMode == PlanViewMode.VIEW_2D && activeTool in listOf(EditorTool.DRAW_ROOM, EditorTool.DRAW_CORRIDOR, EditorTool.DRAW_WALL)) {
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = MaterialTheme.colorScheme.secondaryContainer
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        text = "Коснитесь плана для добавления вершин (добавлено: ${draftPolygonPoints.size})",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    if (activeTool != EditorTool.DRAW_WALL) {
                                        OutlinedTextField(
                                            value = draftShapeLabel,
                                            onValueChange = { draftShapeLabel = it },
                                            label = { Text("Подпись помещения/коридора") },
                                            singleLine = true,
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        TtkPrimaryButton(
                                            text = "Завершить фигуру",
                                            icon = Icons.Default.Check,
                                            onClick = ::finishDraftShape
                                        )
                                        OutlinedButton(
                                            onClick = { draftPolygonPoints = emptyList() }
                                        ) {
                                            Text("Очистить точки")
                                        }
                                    }
                                }
                            }
                        }

                        val floorFilteredDoc = remember(currentDoc, activeFloorLevel) {
                            MultiFloorHelper.filterDocumentByFloor(currentDoc, activeFloorLevel)
                        }

                        if (planViewMode == PlanViewMode.VIEW_3D) {
                            Interactive3DPlanCanvas(
                                widthUnits = currentMap.widthUnits,
                                heightUnits = currentMap.heightUnits,
                                shapes = floorFilteredDoc.shapes,
                                pois = floorFilteredDoc.pois,
                                panoramas = floorFilteredDoc.panoramas,
                                selectedPoiId = selectedPoiId,
                                onSelectPoi = { poi -> selectedPoiId = poi.id },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(380.dp)
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
                                pois = floorFilteredDoc.pois,
                                panoramas = floorFilteredDoc.panoramas,
                                selectedPoiId = selectedPoiId,
                                selectedNodeId = selectedNodeId,
                                activePanoramaId = selectedPano?.id,
                                draftPolygonPoints = draftPolygonPoints,
                                showNavGraph = true,
                                onSelectPoi = { poi -> selectedPoiId = poi.id },
                                onOpenPanorama = { pano ->
                                    selectedPanoramaId = pano.id
                                    hotspotEditorOpen = true
                                },
                                onSelectNode = { node ->
                                    handlePlanTap(Point(node.x, node.y))
                                },
                                onTapPlanCoordinate = ::handlePlanTap,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(350.dp)
                            )
                        }
                    }
                }
            }

            // 3. Selected POI Inspector Card
            if (selectedPoi != null) {
                item {
                    PoiInspectorCard(
                        poi = selectedPoi,
                        nodes = currentDoc.nodes,
                        onUpdatePoi = { updated ->
                            updateDraft { doc ->
                                doc.copy(pois = doc.pois.map { if (it.id == updated.id) updated else it })
                            }
                        },
                        onDeletePoi = { poiId ->
                            updateDraft { doc ->
                                doc.copy(
                                    pois = doc.pois.filterNot { it.id == poiId },
                                    hotspots = doc.hotspots.filterNot { it.poiId == poiId }
                                )
                            }
                            selectedPoiId = null
                        }
                    )
                }
            }

            // 4. Module 2: Guided 16-Frame Camera2 Capture & Direct Sphere Upload
            item {
                GuidedCaptureSection(
                    mapId = mapId,
                    widthUnits = currentMap.widthUnits,
                    heightUnits = currentMap.heightUnits,
                    document = currentDoc,
                    repository = repository,
                    onNotify = { msg -> noticeText = msg },
                    onPanoramaAssetReady = { asset, title, x, y ->
                        assets = (assets + asset).distinctBy { it.id }
                        updateDraft { doc ->
                            if (doc.panoramas.any { it.assetId == asset.id }) return@updateDraft doc
                            val freeNode = doc.nodes
                                .filter { n -> doc.panoramas.none { p -> p.navNodeId == n.id } }
                                .minByOrNull { n -> hypot(n.x - x, n.y - y) }
                            val newPano = Panorama(
                                id = UUID.randomUUID().toString(),
                                assetId = asset.id,
                                title = title,
                                x = x,
                                y = y,
                                navNodeId = freeNode?.id,
                                headingOffsetDeg = 0.0
                            )
                            selectedPanoramaId = newPano.id
                            doc.copy(panoramas = doc.panoramas + newPano)
                        }
                    }
                )
            }

            // 5. Panoramas & 360° Hotspot Editor Card
            item {
                PanoramaInspectorCard(
                    panoramas = currentDoc.panoramas,
                    selectedPanorama = selectedPano,
                    nodes = currentDoc.nodes,
                    onSelectPanorama = { selectedPanoramaId = it.id },
                    onUpdatePanorama = { updated ->
                        updateDraft { doc ->
                            doc.copy(panoramas = doc.panoramas.map { if (it.id == updated.id) updated else it })
                        }
                    },
                    onDeletePanorama = { panoId ->
                        updateDraft { doc ->
                            doc.copy(
                                panoramas = doc.panoramas.filterNot { it.id == panoId },
                                hotspots = doc.hotspots.filterNot {
                                    it.panoramaId == panoId || it.targetPanoramaId == panoId
                                }
                            )
                        }
                        selectedPanoramaId = currentDoc.panoramas.firstOrNull { it.id != panoId }?.id
                    },
                    onOpenHotspotEditor = { hotspotEditorOpen = true }
                )
            }
        }
    }

    // 360° Hotspot Editor Dialog
    if (hotspotEditorOpen && selectedPano != null) {
        Panorama360Dialog(
            panorama = selectedPano,
            allPanoramas = currentDoc.panoramas,
            hotspots = currentDoc.hotspots,
            pois = currentDoc.pois,
            assets = assets,
            editable = true,
            network = repository.network,
            onDismiss = { hotspotEditorOpen = false },
            onSelectPanorama = { nextPano, _ ->
                selectedPanoramaId = nextPano.id
            },
            onAddHotspot = { kind, yaw, pitch, poiId, targetPanoId ->
                val newHotspot = Hotspot(
                    id = UUID.randomUUID().toString(),
                    panoramaId = selectedPano.id,
                    kind = kind,
                    yawDeg = yaw,
                    pitchDeg = pitch,
                    poiId = poiId,
                    targetPanoramaId = targetPanoId
                )
                updateDraft { doc -> doc.copy(hotspots = doc.hotspots + newHotspot) }
                noticeText = "Хотспот добавлен в панораму. Не забудьте сохранить карту."
            },
            onDeleteHotspot = { hotspotId ->
                updateDraft { doc ->
                    doc.copy(hotspots = doc.hotspots.filterNot { it.id == hotspotId })
                }
            }
        )
    }

    // Share & Iframe Sheet
    if (showShareDialog) {
        val baseOrigin = repository.network.serverUrl.value.trimEnd('/')
        val publicUrl = "$baseOrigin/m/${currentMap.slug}"
        val embedSnippet = """<iframe src="$baseOrigin/embed/${currentMap.slug}" title="${currentDoc.title.replace("\"", "")}" width="100%" height="640" style="border:0;border-radius:16px;" loading="lazy" allowfullscreen></iframe>"""

        ModalBottomSheet(onDismissRequest = { showShareDialog = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                TtkEyebrow(text = "ПУБЛИЧНАЯ ССЫЛКА И ВСТРАИВАНИЕ (EMBED)")
                Text(
                    text = "Поделиться картой «${currentDoc.title}»",
                    style = MaterialTheme.typography.titleLarge
                )
                Text(
                    text = "Публичный токен (slug) неизменен: любые сохранённые изменения автоматически доступны гостям по этой же ссылке.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                OutlinedTextField(
                    value = publicUrl,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Прямая ссылка для посетителей (/m/:slug)") },
                    trailingIcon = {
                        IconButton(
                            onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("TTKMap URL", publicUrl))
                                noticeText = "Ссылка скопирована"
                            }
                        ) {
                            Icon(Icons.Default.Share, contentDescription = "Скопировать")
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = embedSnippet,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Код встраивания iframe (/embed/:slug)") },
                    trailingIcon = {
                        IconButton(
                            onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("TTKMap Iframe", embedSnippet))
                                noticeText = "Код iframe скопирован"
                            }
                        ) {
                            Icon(Icons.Default.Share, contentDescription = "Скопировать iframe")
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }

    // AI Plan Recognition Bottom Sheet
    if (showAiPlanDialog) {
        ModalBottomSheet(onDismissRequest = { showAiPlanDialog = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                TtkEyebrow(text = "AI ОЦИФРОВКА ПОМЕЩЕНИЯ")
                Text("Распознавание геометрии и генерация плана", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    text = "AI проанализирует чертеж или создаст архитектурную структуру комнат, стен, коридоров, базовых POI и навигационной сети.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                if (aiResult == null) {
                    Button(
                        onClick = {
                            scope.launch {
                                aiAnalyzing = true
                                try {
                                    val bmp = withContext(Dispatchers.IO) {
                                        if (!backgroundUrl.isNullOrBlank()) {
                                            repository.network.loadBitmap(backgroundUrl)
                                        } else null
                                    }
                                    val result = AiPlanGenerator.generatePlanFromSketch(
                                        bitmap = bmp,
                                        widthUnits = currentMap.widthUnits,
                                        heightUnits = currentMap.heightUnits,
                                        spaceNameHint = currentDoc.title
                                    )
                                    aiResult = result
                                } finally {
                                    aiAnalyzing = false
                                }
                            }
                        },
                        enabled = !aiAnalyzing,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = TtkGreen),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                    ) {
                        if (aiAnalyzing) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp))
                        } else {
                            Text("✨ Запустить AI-распознавание", fontWeight = FontWeight.Bold)
                        }
                    }
                } else {
                    val res = aiResult!!
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = TtkGreenContainer,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Результат анализа (точность ${res.confidencePercent}%):", fontWeight = FontWeight.Bold, color = TtkDeepTeal)
                            Text(res.summaryReport, fontSize = 12.sp, color = TtkDeepTeal)
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = {
                                updateDraft { doc ->
                                    AiPlanGenerator.applyGeneratedResultToDocument(doc, res, replaceExisting = false)
                                }
                                noticeText = "AI геометрия успешно добавлена на карту!"
                                showAiPlanDialog = false
                                aiResult = null
                            },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = TtkBrandRed),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Применить к плану", fontWeight = FontWeight.Bold)
                        }

                        OutlinedButton(
                            onClick = { aiResult = null },
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Повторить")
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun PoiInspectorCard(
    poi: Poi,
    nodes: List<NavNode>,
    onUpdatePoi: (Poi) -> Unit,
    onDeletePoi: (String) -> Unit
) {
    Surface(
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 4.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Default.Edit, contentDescription = null, tint = TtkBrandRed)
                    Column {
                        TtkEyebrow(text = "ИНСПЕКТОР ОБЪЕКТА (POI)")
                        Text(poi.title, style = MaterialTheme.typography.titleLarge)
                    }
                }
                IconButton(onClick = { onDeletePoi(poi.id) }) {
                    Icon(Icons.Default.Delete, contentDescription = "Удалить POI", tint = MaterialTheme.colorScheme.error)
                }
            }

            OutlinedTextField(
                value = poi.title,
                onValueChange = { onUpdatePoi(poi.copy(title = it)) },
                label = { Text("Название точки") },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            )

            Text("Категория объекта:", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                PoiCategory.entries.forEach { cat ->
                    FilterChip(
                        selected = poi.category == cat,
                        onClick = { onUpdatePoi(poi.copy(category = cat)) },
                        label = { Text(cat.defaultLabelRu) }
                    )
                }
            }

            if (poi.category == PoiCategory.CUSTOM) {
                OutlinedTextField(
                    value = poi.categoryLabel ?: "",
                    onValueChange = { onUpdatePoi(poi.copy(categoryLabel = it.ifBlank { null })) },
                    label = { Text("Пользовательская категория") },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )
            }

            OutlinedTextField(
                value = poi.description,
                onValueChange = { onUpdatePoi(poi.copy(description = it)) },
                label = { Text("Описание объекта и услуг") },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            )

            Text(
                text = "Координаты на плане: X=${poi.x.roundToInt()}, Y=${poi.y.roundToInt()} · Узел маршрута: ${if (poi.navNodeId != null) "привязан" else "нет"}",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PanoramaInspectorCard(
    panoramas: List<Panorama>,
    selectedPanorama: Panorama?,
    nodes: List<NavNode>,
    onSelectPanorama: (Panorama) -> Unit,
    onUpdatePanorama: (Panorama) -> Unit,
    onDeletePanorama: (String) -> Unit,
    onOpenHotspotEditor: () -> Unit
) {
    var dropdownExpanded by remember { mutableStateOf(false) }

    Surface(
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 3.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            TtkEyebrow(text = "ПАНОРАМЫ И ХОТСПOТЫ 360°")
            Text("Управление обзорами и переходами", style = MaterialTheme.typography.titleLarge)

            if (panoramas.isEmpty()) {
                Text(
                    text = "На карте пока нет панорам. Снимите серию из 16 кадров выше или загрузите готовую 2:1 сферу.",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                ExposedDropdownMenuBox(
                    expanded = dropdownExpanded,
                    onExpandedChange = { dropdownExpanded = it }
                ) {
                    OutlinedTextField(
                        value = selectedPanorama?.title ?: "Выберите панораму",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Активная панорама (${panoramas.size})") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = dropdownExpanded) },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .menuAnchor()
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = dropdownExpanded,
                        onDismissRequest = { dropdownExpanded = false }
                    ) {
                        panoramas.forEach { p ->
                            DropdownMenuItem(
                                text = { Text(p.title) },
                                onClick = {
                                    onSelectPanorama(p)
                                    dropdownExpanded = false
                                }
                            )
                        }
                    }
                }

                if (selectedPanorama != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = selectedPanorama.title,
                            onValueChange = { onUpdatePanorama(selectedPanorama.copy(title = it)) },
                            label = { Text("Название панорамы") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = selectedPanorama.headingOffsetDeg.roundToInt().toString(),
                            onValueChange = { v ->
                                val h = v.toDoubleOrNull()?.coerceIn(-180.0, 180.0) ?: 0.0
                                onUpdatePanorama(selectedPanorama.copy(headingOffsetDeg = h))
                            },
                            label = { Text("Heading °") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.width(110.dp)
                        )
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        TtkPrimaryButton(
                            text = "Редактировать хотспоты в 360°",
                            icon = Icons.Default.PlayArrow,
                            onClick = onOpenHotspotEditor,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(
                            onClick = { onDeletePanorama(selectedPanorama.id) }
                        ) {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "Удалить панораму",
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }
        }
    }
}
