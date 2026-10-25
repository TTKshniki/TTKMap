package ru.ttk.map.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val LightColorScheme = lightColorScheme(
    primary = TtkBrandRed,
    onPrimary = Color.White,
    primaryContainer = TtkRedContainer,
    onPrimaryContainer = TtkRedDark,
    secondary = TtkGreen,
    onSecondary = Color.White,
    secondaryContainer = TtkSecondarySand,
    onSecondaryContainer = TtkSandDarkText,
    tertiary = TtkDeepTeal,
    onTertiary = Color.White,
    tertiaryContainer = TtkPublishedBg,
    onTertiaryContainer = TtkPublishedText,
    background = TtkCanvas,
    onBackground = TtkInk,
    surface = TtkSurface,
    onSurface = TtkInk,
    surfaceVariant = TtkSurfaceVariant,
    onSurfaceVariant = TtkMuted,
    outline = TtkLine,
    outlineVariant = TtkGreenBorder,
    error = Color(0xFF982B2C),
    errorContainer = Color(0xFFFFF5F4),
    onErrorContainer = Color(0xFF982B2C)
)

private val DarkColorScheme = darkColorScheme(
    primary = TtkBrandRed,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF5A1E19),
    onPrimaryContainer = Color(0xFFFFDAD6),
    secondary = TtkGreenLight,
    onSecondary = TtkDeepTeal,
    secondaryContainer = TtkDarkSurfaceHigh,
    onSecondaryContainer = TtkGreenLight,
    tertiary = TtkLiveDot,
    onTertiary = TtkDeepTeal,
    background = TtkDarkCanvas,
    onBackground = TtkDarkInk,
    surface = TtkDarkSurface,
    onSurface = TtkDarkInk,
    surfaceVariant = TtkDarkSurfaceHigh,
    onSurfaceVariant = TtkDarkMuted,
    outline = TtkDarkLine,
    outlineVariant = TtkDarkLine
)

// Material 3 Expressive Shapes: bold squircle cards + technical crisp inner controls
val TtkExpressiveShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp)
)

val TtkExpressiveTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Black,
        fontSize = 36.sp,
        lineHeight = 40.sp,
        letterSpacing = (-0.5).sp
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 28.sp,
        lineHeight = 33.sp,
        letterSpacing = (-0.3).sp
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 27.sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 18.sp,
        lineHeight = 23.sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 15.sp,
        lineHeight = 20.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 19.sp
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.2.sp
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 1.0.sp
    )
)

object TtkMotion {
    fun <T> expressiveSpring() = spring<T>(
        dampingRatio = Spring.DampingRatioLowBouncy,
        stiffness = Spring.StiffnessMediumLow
    )

    fun <T> snappySpring() = spring<T>(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMedium
    )
}

@Composable
fun TTKMapTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        shapes = TtkExpressiveShapes,
        typography = TtkExpressiveTypography,
        content = content
    )
}
