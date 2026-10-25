package ru.ttk.map

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ru.ttk.map.feature.capture.GuidedCaptureStandaloneScreen
import ru.ttk.map.feature.home.HomeHubScreen
import ru.ttk.map.feature.organizer.OrganizerTabScreen
import ru.ttk.map.feature.organizer.OrganizerWorkspaceScreen
import ru.ttk.map.feature.settings.AppThemeSetting
import ru.ttk.map.feature.settings.TtkSettingsScreen
import ru.ttk.map.feature.visitor.VisitorSpaceScreen
import ru.ttk.map.ui.theme.TTKMapTheme
import ru.ttk.map.ui.theme.TtkBrandRed
import ru.ttk.map.ui.theme.TtkDarkNeutralIndicator
import ru.ttk.map.ui.theme.TtkDarkNeutralSurface
import ru.ttk.map.ui.theme.TtkDarkUnselectedText
import ru.ttk.map.ui.theme.TtkWhiteRedContainer
import ru.ttk.map.ui.theme.TtkWhiteRedTint

enum class MainTab {
    MAPS,
    ADMIN
}

sealed interface AppScreen {
    data object MainTabs : AppScreen
    data class Visitor(val slug: String) : AppScreen
    data object Settings : AppScreen
    data class CapturePanorama(val mapId: String) : AppScreen
    data class MapEditor(val mapId: String) : AppScreen
}

class MainActivity : ComponentActivity() {

    private var deepLinkSlug by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        parseDeepLink(intent)

        val app = application as TtkMapApplication

        setContent {
            var themeSetting by rememberSaveable { mutableStateOf(AppThemeSetting.SYSTEM) }
            val systemDark = isSystemInDarkTheme()
            val effectiveDarkTheme = when (themeSetting) {
                AppThemeSetting.SYSTEM -> systemDark
                AppThemeSetting.LIGHT -> false
                AppThemeSetting.DARK -> true
            }

            val backStack = remember { mutableStateListOf<AppScreen>(AppScreen.MainTabs) }
            val currentScreen = backStack.lastOrNull() ?: AppScreen.MainTabs

            var currentTab by rememberSaveable { mutableStateOf(MainTab.MAPS) }
            var isOfflineMode by rememberSaveable { mutableStateOf(false) }

            fun navigateTo(screen: AppScreen) {
                backStack.add(screen)
            }

            fun popBack() {
                if (backStack.size > 1) {
                    backStack.removeAt(backStack.lastIndex)
                }
            }

            BackHandler(enabled = backStack.size > 1) {
                popBack()
            }

            LaunchedEffect(deepLinkSlug) {
                val targetSlug = deepLinkSlug
                if (!targetSlug.isNullOrBlank()) {
                    deepLinkSlug = null
                    navigateTo(AppScreen.Visitor(targetSlug))
                }
            }

            TTKMapTheme(darkTheme = effectiveDarkTheme) {
                AnimatedContent(
                    targetState = currentScreen,
                    transitionSpec = { fadeIn() togetherWith fadeOut() },
                    label = "TtkScreenRouter"
                ) { screen ->
                    when (screen) {
                        is AppScreen.MainTabs -> {
                            Scaffold(
                                bottomBar = {
                                    val bottomBarBg = if (effectiveDarkTheme) TtkDarkNeutralSurface else MaterialTheme.colorScheme.surface
                                    val navColors = if (effectiveDarkTheme) {
                                        NavigationBarItemDefaults.colors(
                                            indicatorColor = TtkDarkNeutralIndicator,
                                            selectedIconColor = TtkBrandRed,
                                            selectedTextColor = Color.White,
                                            unselectedIconColor = TtkDarkUnselectedText,
                                            unselectedTextColor = TtkDarkUnselectedText
                                        )
                                    } else {
                                        NavigationBarItemDefaults.colors(
                                            indicatorColor = TtkBrandRed.copy(alpha = 0.12f),
                                            selectedIconColor = TtkBrandRed,
                                            selectedTextColor = TtkBrandRed,
                                            unselectedIconColor = Color(0xFF4B5563),
                                            unselectedTextColor = Color(0xFF374151)
                                        )
                                    }

                                    NavigationBar(
                                        containerColor = bottomBarBg,
                                        tonalElevation = 6.dp
                                    ) {
                                        // Tab 1: Карты / Скачанные
                                        NavigationBarItem(
                                            selected = currentTab == MainTab.MAPS,
                                            onClick = { currentTab = MainTab.MAPS },
                                            icon = {
                                                Icon(
                                                    imageVector = if (currentTab == MainTab.MAPS) Icons.Default.Place else Icons.Outlined.Place,
                                                    contentDescription = "Карты"
                                                )
                                            },
                                            label = {
                                                Text(
                                                    text = if (isOfflineMode) "Скачанные" else "Карты",
                                                    fontWeight = FontWeight.Bold
                                                )
                                            },
                                            colors = navColors
                                        )

                                        // Tab 2: Кабинет (Admin) - Hidden in offline mode!
                                        if (!isOfflineMode) {
                                            NavigationBarItem(
                                                selected = currentTab == MainTab.ADMIN,
                                                onClick = { currentTab = MainTab.ADMIN },
                                                icon = {
                                                    Icon(
                                                        imageVector = if (currentTab == MainTab.ADMIN) Icons.Default.Person else Icons.Outlined.Person,
                                                        contentDescription = "Кабинет"
                                                    )
                                                },
                                                label = {
                                                    Text(
                                                        text = "Кабинет",
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                },
                                                colors = navColors
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
                                    AnimatedContent(
                                        targetState = currentTab,
                                        transitionSpec = { fadeIn() togetherWith fadeOut() },
                                        label = "TtkTabRouter"
                                    ) { tab ->
                                        when (tab) {
                                            MainTab.MAPS -> {
                                                HomeHubScreen(
                                                    repository = app.repository,
                                                    isOfflineMode = isOfflineMode,
                                                    onToggleOfflineMode = { offline ->
                                                        isOfflineMode = offline
                                                        if (offline) currentTab = MainTab.MAPS
                                                    },
                                                    onOpenVisitorSlug = { slug ->
                                                        navigateTo(AppScreen.Visitor(slug))
                                                    },
                                                    onOpenSettings = {
                                                        navigateTo(AppScreen.Settings)
                                                    }
                                                )
                                            }

                                            MainTab.ADMIN -> {
                                                OrganizerTabScreen(
                                                    repository = app.repository,
                                                    onOpenSettings = {
                                                        navigateTo(AppScreen.Settings)
                                                    },
                                                    onOpenMapEditor = { mapId ->
                                                        navigateTo(AppScreen.MapEditor(mapId))
                                                    },
                                                    onOpenCapture = { mapId ->
                                                        navigateTo(AppScreen.CapturePanorama(mapId))
                                                    },
                                                    onOpenPublicPreview = { slug ->
                                                        navigateTo(AppScreen.Visitor(slug))
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        is AppScreen.MapEditor -> {
                            OrganizerWorkspaceScreen(
                                mapId = screen.mapId,
                                repository = app.repository,
                                onBack = ::popBack,
                                onOpenPublicPreview = { slug ->
                                    navigateTo(AppScreen.Visitor(slug))
                                }
                            )
                        }

                        is AppScreen.Visitor -> {
                            VisitorSpaceScreen(
                                slug = screen.slug,
                                repository = app.repository,
                                onBack = ::popBack
                            )
                        }

                        is AppScreen.Settings -> {
                            TtkSettingsScreen(
                                repository = app.repository,
                                currentThemeSetting = themeSetting,
                                onSelectThemeSetting = { themeSetting = it },
                                onBack = ::popBack
                            )
                        }

                        is AppScreen.CapturePanorama -> {
                            GuidedCaptureStandaloneScreen(
                                mapId = screen.mapId,
                                repository = app.repository,
                                onBack = ::popBack
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        parseDeepLink(intent)
    }

    private fun parseDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        val path = data.path.orEmpty()
        val slug = when {
            data.scheme == "ttkmap" && data.host == "m" -> data.lastPathSegment
            path.startsWith("/m/") -> path.removePrefix("/m/").substringBefore('/')
            path.startsWith("/embed/") -> path.removePrefix("/embed/").substringBefore('/')
            else -> null
        }
        if (!slug.isNullOrBlank()) {
            deepLinkSlug = slug
        }
    }
}
