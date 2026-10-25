package ru.ttk.map.ui.theme

import android.os.Build
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.ttk.map.R

/**
 * Dynamic layout metrics for display cutout & status bar alignment.
 */
data class CutoutLayoutMetrics(
    val startPadding: Dp,
    val endPadding: Dp,
    val cameraCenterY: Dp,
    val totalHeight: Dp
)

/**
 * Top app bar with dynamic camera cutout positioning:
 * - When camera is in the center, TTK is vertically on the same level as the camera, on the top-left.
 * - When camera is in the left corner, TTK is positioned safely to the right of the cutout.
 * - Opposite to TTK (top-right corner), a gray settings gear button sits on the same horizontal level.
 *   Gear icon is darker than background in light theme, lighter in dark theme.
 */
@Composable
fun TtkTopAppBar(
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
    trailingAction: (@Composable () -> Unit)? = null
) {
    val view = LocalView.current
    val density = LocalDensity.current
    val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f

    val cutout = remember(view) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            view.rootWindowInsets?.displayCutout
        } else null
    }

    val metrics = remember(cutout, density) {
        val displayWidthPx = view.resources.displayMetrics.widthPixels.coerceAtLeast(1)
        if (cutout != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && cutout.boundingRects.isNotEmpty()) {
            val rect = cutout.boundingRects.first()
            val isLeftCamera = rect.left < displayWidthPx / 4 && rect.bottom > 0
            val isRightCamera = rect.right > displayWidthPx * 3 / 4 && rect.bottom > 0

            val startDp = if (isLeftCamera) {
                with(density) { (rect.right.toDp() + 14.dp).coerceAtLeast(18.dp) }
            } else {
                18.dp
            }
            val endDp = if (isRightCamera) {
                with(density) { ((displayWidthPx - rect.left).toDp() + 14.dp).coerceAtLeast(16.dp) }
            } else {
                16.dp
            }
            val centerYDp = with(density) { ((rect.top + rect.bottom) / 2f).toDp().coerceAtLeast(16.dp) }
            val barHeightDp = with(density) { (rect.bottom.toFloat() + 20f).toDp().coerceAtLeast(54.dp) }
            CutoutLayoutMetrics(
                startPadding = startDp.coerceAtLeast(0.dp),
                endPadding = endDp.coerceAtLeast(0.dp),
                cameraCenterY = centerYDp.coerceAtLeast(0.dp),
                totalHeight = barHeightDp.coerceAtLeast(50.dp)
            )
        } else {
            CutoutLayoutMetrics(18.dp, 16.dp, 18.dp, 54.dp)
        }
    }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = modifier.fillMaxWidth()
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(metrics.totalHeight)
        ) {
            // Official TTK logo in the top-left, vertically aligned with the camera level
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(
                        start = metrics.startPadding,
                        top = (metrics.cameraCenterY - 12.dp).coerceAtLeast(0.dp)
                    ),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ttk_logo),
                    contentDescription = "ТТК",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.height(24.dp)
                )
            }

            // Top-right corner: optional trailing action + gray settings gear button
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(
                        end = metrics.endPadding,
                        top = (metrics.cameraCenterY - 18.dp).coerceAtLeast(0.dp)
                    ),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                trailingAction?.invoke()

                // Settings gear button (softer gray in light theme, lighter in dark theme)
                val gearBg = if (isDark) Color(0xFF1B3133) else Color(0xFFF4F4F5)
                val gearColor = if (isDark) Color(0xFFE5E7EB) else TtkGearLight

                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(gearBg)
                        .clickable(onClick = onOpenSettings),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = "Настройки",
                        tint = gearColor,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

/**
 * Material Design 3 Expressive indeterminate loading indicator.
 * Compact, silky-smooth morphing shape between rounded squircle and flower
 * with gentle seamless TTK gradient.
 */
@Composable
fun TtkExpressiveLoadingIndicator(
    modifier: Modifier = Modifier,
    size: Dp = 28.dp
) {
    val transition = rememberInfiniteTransition(label = "m3ExpressiveLoader")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(2400, easing = LinearEasing)
        ),
        label = "rotation"
    )
    val cornerPercent by transition.animateFloat(
        initialValue = 24f,
        targetValue = 50f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "cornerMorph"
    )
    val scale by transition.animateFloat(
        initialValue = 0.94f,
        targetValue = 1.04f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )

    Box(
        modifier = modifier
            .size(size)
            .scale(scale)
            .rotate(rotation)
            .clip(RoundedCornerShape(cornerPercent.toInt()))
            .background(
                Brush.sweepGradient(
                    colors = listOf(
                        Color(0xFFD14D40),
                        Color(0xFFD96357),
                        Color(0xFFE27F75),
                        Color(0xFFECA098),
                        Color(0xFFF5C7C2),
                        Color(0xFFECA098),
                        Color(0xFFE27F75),
                        Color(0xFFD96357),
                        Color(0xFFD14D40)
                    )
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(size * 0.62f)
                .clip(RoundedCornerShape((cornerPercent * 0.85f).toInt()))
                .background(MaterialTheme.colorScheme.surface)
        )
    }
}

/**
 * Material Design 3 native mini floating popup notification for offline suggestion.
 * Displays "Вы оффлайн" with WifiOffIcon and small trailing arrow.
 */
@Composable
fun TtkMiniOfflinePopup(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        color = TtkWhiteRedTint,
        border = BorderStroke(1.dp, TtkWhiteRedBorder),
        shadowElevation = 4.dp,
        modifier = modifier
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            WifiOffIcon(
                modifier = Modifier.size(16.dp),
                tint = TtkBrandRed
            )
            Text(
                text = "Вы оффлайн",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF7F1D1D)
            )
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = TtkBrandRed,
                modifier = Modifier.size(13.dp)
            )
        }
    }
}

/**
 * Official TTK brand logo
 */
@Composable
fun TtkLogo(
    modifier: Modifier = Modifier,
    height: Dp = 26.dp
) {
    Image(
        painter = painterResource(id = R.drawable.ttk_logo),
        contentDescription = "ТТК",
        contentScale = ContentScale.Fit,
        modifier = modifier.height(height)
    )
}

/**
 * Signature TTK MAP lockup from frontend/src/styles.css (.brand-lockup / .app-brand)
 */
@Composable
fun TtkBrandLockup(
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    lightOnDark: Boolean = false
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = "TTK",
            color = TtkRed,
            fontSize = 23.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = (-0.5).sp
        )
        Text(
            text = "MAP",
            color = if (lightOnDark) Color(0xFFF5F7F5) else Color(0xFF84908F),
            fontSize = 10.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 1.2.sp,
            modifier = Modifier.padding(top = 6.dp)
        )
        if (!subtitle.isNullOrBlank()) {
            Spacer(modifier = Modifier.width(6.dp))
            Box(
                modifier = Modifier
                    .height(18.dp)
                    .width(1.dp)
                    .background(if (lightOnDark) Color.White.copy(alpha = 0.24f) else MaterialTheme.colorScheme.outline)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = subtitle,
                color = if (lightOnDark) Color(0xFFD1DCDA) else MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

/**
 * Uppercase tracked Eyebrow label from TTK design code (.eyebrow)
 */
@Composable
fun TtkEyebrow(
    text: String,
    modifier: Modifier = Modifier,
    lightOnDark: Boolean = false
) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.ExtraBold,
        letterSpacing = 1.2.sp,
        color = if (lightOnDark) TtkGreenLight else TtkGreen,
        modifier = modifier
    )
}

/**
 * Live revision pill with pulsing emerald dot (.ttk-visitor-live)
 */
@Composable
fun TtkLiveBadge(
    revision: Int,
    isOffline: Boolean = false,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "livePulse")
    val dotScale by infiniteTransition.animateFloat(
        initialValue = 0.88f,
        targetValue = 1.25f,
        animationSpec = infiniteRepeatable(
            animation = tween(1100),
            repeatMode = RepeatMode.Reverse
        ),
        label = "dotScale"
    )

    val bgColor = if (isOffline) Color(0xFFFEF3C7) else TtkLiveBg
    val textColor = if (isOffline) Color(0xFF92400E) else TtkLiveText
    val dotColor = if (isOffline) Color(0xFFF59E0B) else TtkLiveDot

    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(bgColor)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .scale(if (isOffline) 1f else dotScale)
                .clip(CircleShape)
                .background(dotColor)
        )
        Text(
            text = if (isOffline) "Офлайн · v$revision" else "Live · v$revision",
            color = textColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

/**
 * Status tag for Organizer maps (.status-tag / .status-tag--published)
 */
@Composable
fun TtkStatusTag(
    isPublished: Boolean,
    modifier: Modifier = Modifier
) {
    val bg = if (isPublished) TtkPublishedBg else Color(0xFFF4F6F5)
    val border = if (isPublished) TtkPublishedBorder else Color(0xFFDCE2DF)
    val text = if (isPublished) TtkPublishedText else Color(0xFF5C6965)

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(6.dp),
        color = bg,
        border = BorderStroke(1.dp, border)
    ) {
        Text(
            text = if (isPublished) "Опубликована" else "Черновик",
            color = text,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

/**
 * Material 3 Expressive Filter Chip with spring scale & TTK active red fill (.ttk-visitor-chip)
 */
@Composable
fun TtkFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    count: Int? = null
) {
    val bg by animateColorAsState(
        targetValue = if (selected) TtkBrandRed else MaterialTheme.colorScheme.surface,
        animationSpec = TtkMotion.snappySpring(),
        label = "chipBg"
    )
    val contentColor by animateColorAsState(
        targetValue = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
        animationSpec = TtkMotion.snappySpring(),
        label = "chipContent"
    )
    val scale by animateFloatAsState(
        targetValue = if (selected) 1.03f else 1f,
        animationSpec = TtkMotion.expressiveSpring(),
        label = "chipScale"
    )

    Row(
        modifier = modifier
            .scale(scale)
            .clip(CircleShape)
            .background(bg)
            .border(
                width = 1.dp,
                color = if (selected) TtkBrandRed else MaterialTheme.colorScheme.outline,
                shape = CircleShape
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(15.dp)
            )
        }
        Text(
            text = if (count != null) "$label ($count)" else label,
            color = contentColor,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

/**
 * Second primary brand hero banner (#e4e2d1)
 */
@Composable
fun TtkSandHeroCard(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        color = TtkSecondarySand,
        contentColor = TtkSandDarkText,
        shadowElevation = 2.dp
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = TtkSandDarkText
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = TtkSandMutedText
            )
        }
    }
}

/**
 * Clean vector Wi-Fi off icon with strike-through line
 */
@Composable
fun WifiOffIcon(
    modifier: Modifier = Modifier,
    tint: Color = Color.Unspecified
) {
    Canvas(modifier = modifier) {
        val stroke = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
        val w = size.width
        val h = size.height

        // Outer arc
        drawArc(
            color = tint,
            startAngle = 210f,
            sweepAngle = 120f,
            useCenter = false,
            topLeft = Offset(w * 0.1f, h * 0.15f),
            size = Size(w * 0.8f, h * 0.8f),
            style = stroke
        )
        // Middle arc
        drawArc(
            color = tint,
            startAngle = 220f,
            sweepAngle = 100f,
            useCenter = false,
            topLeft = Offset(w * 0.25f, h * 0.35f),
            size = Size(w * 0.5f, h * 0.5f),
            style = stroke
        )
        // Center dot
        drawCircle(
            color = tint,
            radius = 1.8.dp.toPx(),
            center = Offset(w * 0.5f, h * 0.82f)
        )
        // Diagonal slash through the wifi symbol
        drawLine(
            color = tint,
            start = Offset(w * 0.12f, h * 0.12f),
            end = Offset(w * 0.88f, h * 0.88f),
            strokeWidth = 2.dp.toPx(),
            cap = StrokeCap.Round
        )
    }
}

/**
 * Expressive Hero Banner inspired by TTK's #203C3C auth-brand-panel
 */
@Composable
fun TtkTealHeroCard(
    eyebrow: String,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    trailingContent: (@Composable () -> Unit)? = null
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(24.dp),
        color = TtkDeepTeal,
        contentColor = Color.White,
        shadowElevation = 6.dp
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                TtkEyebrow(text = eyebrow, lightOnDark = true, modifier = Modifier.weight(1f))
                trailingContent?.invoke()
            }
            Text(
                text = title,
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFFD1DCDA)
            )
        }
    }
}

@Composable
fun TtkPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    containerColor: Color = TtkBrandRed,
    contentColor: Color = Color.White,
    border: BorderStroke? = null
) {
    val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f
    val disabledBg = if (isDark) Color(0xFF1E2829) else Color(0xFFE5E7EB)
    val disabledContent = if (isDark) Color(0xFF6B7280) else Color(0xFF9CA3AF)

    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(12.dp),
        border = border,
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
            disabledContainerColor = disabledBg,
            disabledContentColor = disabledContent
        ),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 10.dp)
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
        }
        Text(
            text = text,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp
        )
    }
}
