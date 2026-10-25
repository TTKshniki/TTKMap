package ru.ttk.map.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import ru.ttk.map.ui.theme.TtkDeepTeal

@Composable
fun FullscreenExpandIcon(
    tint: Color = MaterialTheme.colorScheme.onSurface,
    modifier: Modifier = Modifier.size(18.dp)
) {
    Canvas(modifier = modifier) {
        val stroke = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        val s = size.minDimension
        val corner = s * 0.30f
        val pad = s * 0.08f

        val tl = Path().apply {
            moveTo(pad, pad + corner)
            lineTo(pad, pad)
            lineTo(pad + corner, pad)
        }
        val tr = Path().apply {
            moveTo(s - pad - corner, pad)
            lineTo(s - pad, pad)
            lineTo(s - pad, pad + corner)
        }
        val bl = Path().apply {
            moveTo(pad, s - pad - corner)
            lineTo(pad, s - pad)
            lineTo(pad + corner, s - pad)
        }
        val br = Path().apply {
            moveTo(s - pad - corner, s - pad)
            lineTo(s - pad, s - pad)
            lineTo(s - pad, s - pad - corner)
        }
        drawPath(tl, tint, style = stroke)
        drawPath(tr, tint, style = stroke)
        drawPath(bl, tint, style = stroke)
        drawPath(br, tint, style = stroke)
    }
}

/**
 * Animated Fullscreen Dialog with a top control bar.
 * Top-left features a close cross [Icons.Default.Close] to exit back to the regular window.
 */
@Composable
fun FullscreenExpandedDialog(
    visible: Boolean,
    title: String,
    onDismiss: () -> Unit,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable () -> Unit
) {
    if (visible) {
        Dialog(
            onDismissRequest = onDismiss,
            properties = DialogProperties(
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false
            )
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF0C1617))
            ) {
                // Fullscreen Content View
                content()

                // Top Control Bar floating over the content with top-left cross icon
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .align(Alignment.TopCenter),
                    shape = RoundedCornerShape(18.dp),
                    color = TtkDeepTeal.copy(alpha = 0.92f),
                    shadowElevation = 8.dp
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.weight(1f, fill = false)
                        ) {
                            IconButton(onClick = onDismiss) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Закрыть полный экран",
                                    tint = Color.White
                                )
                            }
                            Text(
                                text = title,
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                maxLines = 1
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            actions()
                        }
                    }
                }
            }
        }
    }
}
