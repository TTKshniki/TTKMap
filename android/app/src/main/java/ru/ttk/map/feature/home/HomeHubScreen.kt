package ru.ttk.map.feature.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ru.ttk.map.core.repository.TtkMapRepository
import ru.ttk.map.ui.theme.TtkBrandRed
import ru.ttk.map.ui.theme.TtkDarkNeutralBorder
import ru.ttk.map.ui.theme.TtkDarkNeutralSurface
import ru.ttk.map.ui.theme.TtkDeepTeal
import ru.ttk.map.ui.theme.TtkEyebrow
import ru.ttk.map.ui.theme.TtkGreen
import ru.ttk.map.ui.theme.TtkGreenContainer
import ru.ttk.map.ui.theme.TtkMiniOfflinePopup
import ru.ttk.map.ui.theme.TtkPrimaryButton
import ru.ttk.map.ui.theme.TtkRedBorder
import ru.ttk.map.ui.theme.TtkRedContainer
import ru.ttk.map.ui.theme.TtkSecondarySand
import ru.ttk.map.ui.theme.TtkTopAppBar
import ru.ttk.map.ui.theme.TtkWhiteRedBorder
import ru.ttk.map.ui.theme.TtkWhiteRedContainer
import ru.ttk.map.ui.theme.TtkWhiteRedTint
import ru.ttk.map.ui.theme.WifiOffIcon

/**
 * Main Maps Hub Screen (First / Default Tab):
 * - Input field for map URL/token and "Открыть" button.
 * - List of recently viewed / cached maps.
 * - Native Material 3 Expressive Pull-To-Refresh.
 * - Dynamic display cutout handling with centered TTK and settings gear.
 * - Mini floating M3 popup notification "В оффлайн" when ping fails.
 * - In offline mode: Displays downloaded maps or "Здесь пока ничего нет...".
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeHubScreen(
    repository: TtkMapRepository,
    isOfflineMode: Boolean,
    onToggleOfflineMode: (Boolean) -> Unit,
    onOpenVisitorSlug: (String) -> Unit,
    onOpenSettings: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val cachedMaps by repository.observeCachedMaps().collectAsState(initial = emptyList())
    val serverUrl by repository.network.serverUrl.collectAsState()

    var slugInput by remember { mutableStateOf("") }
    var serverHealthy by remember { mutableStateOf<Boolean?>(null) }

    fun checkServer() {
        scope.launch {
            serverHealthy = repository.checkHealth().getOrDefault(false)
        }
    }

    LaunchedEffect(serverUrl) {
        // Purge legacy demo slug if present so real server data is never shadowed
        repository.deleteCachedMap(TtkMapRepository.DEMO_OFFLINE_SLUG)
        checkServer()
    }

    val pullRefreshState = rememberPullToRefreshState()
    if (pullRefreshState.isRefreshing) {
        LaunchedEffect(true) {
            checkServer()
            pullRefreshState.endRefresh()
        }
    }

    fun extractSlug(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        val idxM = trimmed.indexOf("/m/")
        if (idxM >= 0) return trimmed.substring(idxM + 3).substringBefore('?').substringBefore('/')
        val idxEmbed = trimmed.indexOf("/embed/")
        if (idxEmbed >= 0) return trimmed.substring(idxEmbed + 7).substringBefore('?').substringBefore('/')
        return trimmed
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
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // ==================== OFFLINE MODE ====================
                if (isOfflineMode) {
                    item {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = TtkWhiteRedTint,
                            border = BorderStroke(1.dp, TtkWhiteRedBorder),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    WifiOffIcon(modifier = Modifier.size(16.dp), tint = TtkBrandRed)
                                    Text(
                                        text = "Вы оффлайн",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = Color(0xFF7F1D1D)
                                    )
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                        contentDescription = null,
                                        tint = TtkBrandRed,
                                        modifier = Modifier.size(13.dp)
                                    )
                                }
                                TextButtonLike(text = "В сеть") {
                                    onToggleOfflineMode(false)
                                    checkServer()
                                }
                            }
                        }
                    }

                    if (cachedMaps.isEmpty()) {
                        // "Здесь пока ничего нет..." large empty state per user specification
                        item {
                            Surface(
                                shape = RoundedCornerShape(24.dp),
                                color = MaterialTheme.colorScheme.surface,
                                shadowElevation = 1.dp,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 40.dp)
                            ) {
                                Column(
                                    modifier = Modifier.padding(32.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(64.dp)
                                            .clip(CircleShape)
                                            .background(MaterialTheme.colorScheme.surfaceVariant),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Place,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(32.dp)
                                        )
                                    }

                                    Text(
                                        text = "Здесь пока ничего нет...",
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )

                                    Text(
                                        text = "Для работы в оффлайн-режиме сначала откройте нужную карту онлайн.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }
                    } else {
                        item {
                            Text(
                                text = "Скачанные карты (${cachedMaps.size})",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        items(cachedMaps, key = { it.slug }) { map ->
                            Surface(
                                shape = RoundedCornerShape(18.dp),
                                color = MaterialTheme.colorScheme.surface,
                                shadowElevation = 2.dp,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onOpenVisitorSlug(map.slug) }
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
                                        val isDarkSurface = MaterialTheme.colorScheme.surface.luminance() < 0.5f
                                        val itemIconBg = if (isDarkSurface) TtkDarkNeutralSurface else TtkRedContainer
                                        val itemIconBorder = if (isDarkSurface) TtkDarkNeutralBorder else TtkRedBorder
                                        Box(
                                            modifier = Modifier
                                                .size(40.dp)
                                                .clip(RoundedCornerShape(10.dp))
                                                .background(itemIconBg)
                                                .border(1.dp, itemIconBorder, RoundedCornerShape(10.dp)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(Icons.Default.Place, contentDescription = null, tint = TtkBrandRed)
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = map.title,
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.SemiBold,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            Text(
                                                text = "v${map.revision} · ${map.poiCount} POI · ${map.panoramaCount} панорам",
                                                fontSize = 12.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }

                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                        contentDescription = "Открыть",
                                        tint = TtkBrandRed,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }

                // ==================== ONLINE MODE ====================
                else {
                    // 1. Visitor Card: Input slug/url to open map
                    item {
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = MaterialTheme.colorScheme.surface,
                            shadowElevation = 3.dp,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(18.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    val isDarkSurface = MaterialTheme.colorScheme.surface.luminance() < 0.5f
                                    val navIconBg = if (isDarkSurface) TtkDarkNeutralSurface else TtkRedContainer
                                    val navIconBorder = if (isDarkSurface) TtkDarkNeutralBorder else TtkRedBorder
                                    Box(
                                        modifier = Modifier
                                            .size(40.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(navIconBg)
                                            .border(1.dp, navIconBorder, RoundedCornerShape(10.dp)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.LocationOn,
                                            contentDescription = null,
                                            tint = TtkBrandRed,
                                            modifier = Modifier.size(22.dp)
                                        )
                                    }
                                    Column {
                                        TtkEyebrow(text = "ПОСЕТИТЕЛЬ")
                                        Text(
                                            text = "Открыть карту",
                                            style = MaterialTheme.typography.titleLarge,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }

                                OutlinedTextField(
                                    value = slugInput,
                                    onValueChange = { slugInput = it },
                                    label = { Text("Ссылка или токен карты") },
                                    placeholder = { Text("/m/slug или токен") },
                                    singleLine = true,
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier.fillMaxWidth()
                                )

                                TtkPrimaryButton(
                                    text = "Открыть",
                                    icon = Icons.AutoMirrored.Filled.ArrowForward,
                                    enabled = slugInput.isNotBlank(),
                                    onClick = {
                                        val clean = extractSlug(slugInput)
                                        if (clean.isNotBlank()) onOpenVisitorSlug(clean)
                                    },
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    }

                    // 2. Recent Maps Section
                    item {
                        Text(
                            text = "Последние карты",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    if (cachedMaps.isEmpty()) {
                        item {
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Place,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(24.dp)
                                    )
                                    Text(
                                        text = "Здесь появятся просмотренные и сохранённые карты",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    } else {
                        items(cachedMaps, key = { it.slug }) { map ->
                            Surface(
                                shape = RoundedCornerShape(18.dp),
                                color = MaterialTheme.colorScheme.surface,
                                shadowElevation = 2.dp,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onOpenVisitorSlug(map.slug) }
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
                                        val isDarkSurface = MaterialTheme.colorScheme.surface.luminance() < 0.5f
                                        val itemIconBg = if (isDarkSurface) TtkDarkNeutralSurface else TtkRedContainer
                                        val itemIconBorder = if (isDarkSurface) TtkDarkNeutralBorder else TtkRedBorder
                                        Box(
                                            modifier = Modifier
                                                .size(40.dp)
                                                .clip(RoundedCornerShape(10.dp))
                                                .background(itemIconBg)
                                                .border(1.dp, itemIconBorder, RoundedCornerShape(10.dp)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(Icons.Default.Place, contentDescription = null, tint = TtkBrandRed)
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = map.title,
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.SemiBold,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            Text(
                                                text = "v${map.revision} · ${map.poiCount} POI · ${map.panoramaCount} панорам",
                                                fontSize = 12.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }

                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                        contentDescription = "Открыть",
                                        tint = TtkBrandRed,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Native Material 3 Expressive PullToRefresh Indicator
            PullToRefreshContainer(
                state = pullRefreshState,
                modifier = Modifier.align(Alignment.TopCenter),
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = TtkBrandRed
            )

            // Mini Native Floating Popup: "В оффлайн" when ping fails
            AnimatedVisibility(
                visible = !isOfflineMode && serverHealthy == false,
                enter = fadeIn() + slideInVertically(initialOffsetY = { -it }),
                exit = fadeOut() + slideOutVertically(targetOffsetY = { -it }),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 10.dp)
            ) {
                TtkMiniOfflinePopup(
                    onClick = { onToggleOfflineMode(true) }
                )
            }
        }
    }
}

@Composable
private fun TextButtonLike(
    text: String,
    onClick: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = Color(0xFFFDE68A),
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Text(
            text = text,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF92400E),
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}
