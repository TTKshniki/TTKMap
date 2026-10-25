package ru.ttk.map.core.domain

import ru.ttk.map.core.model.Capture
import ru.ttk.map.core.model.CaptureFrame
import ru.ttk.map.core.model.CaptureState
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Mirrors frontend/src/features/capture/guide.ts for 16-frame 360° capture sessions.
 */
object CaptureGuideLogic {
    const val TOTAL_FRAMES = 16
    const val STEP_DEG = 22.5
    const val FULL_TURN_DEG = 360.0
    const val COMPASS_TOLERANCE_DEG = 8.0

    enum class TurnDirection {
        LEFT, RIGHT, HOLD, UNKNOWN
    }

    data class CompassGuidance(
        val deltaDeg: Double?,
        val aligned: Boolean,
        val direction: TurnDirection,
        val text: String
    )

    fun targetAngleFor(index: Int): Double {
        return (index * STEP_DEG) % FULL_TURN_DEG
    }

    fun shortAngle(value: Double): Double {
        val wrapped = (((value + 180.0) % 360.0) + 360.0) % 360.0 - 180.0
        return if (wrapped == 180.0) -180.0 else wrapped
    }

    fun compassGuidance(
        targetDeg: Double,
        headingDeg: Double?,
        toleranceDeg: Double = COMPASS_TOLERANCE_DEG
    ): CompassGuidance {
        if (headingDeg == null || !headingDeg.isFinite()) {
            return CompassGuidance(
                deltaDeg = null,
                aligned = false,
                direction = TurnDirection.UNKNOWN,
                text = "Компас недоступен — держите телефон вертикально и поворачивайтесь на шаг 22,5°"
            )
        }
        val delta = shortAngle(targetDeg - headingDeg)
        val aligned = abs(delta) <= toleranceDeg
        if (aligned) {
            return CompassGuidance(
                deltaDeg = delta,
                aligned = true,
                direction = TurnDirection.HOLD,
                text = "Ориентир совпал — можно снимать"
            )
        }
        val direction = if (delta > 0) TurnDirection.RIGHT else TurnDirection.LEFT
        val dirWord = if (direction == TurnDirection.RIGHT) "вправо" else "влево"
        return CompassGuidance(
            deltaDeg = delta,
            aligned = false,
            direction = direction,
            text = "Повернитесь $dirWord на ${abs(delta.roundToInt())}°"
        )
    }

    fun nextFrameIndex(frames: List<CaptureFrame>, total: Int = TOTAL_FRAMES): Int {
        val taken = frames.map { it.index }.toSet()
        for (index in 0 until total) {
            if (index !in taken) return index
        }
        return total
    }

    fun isSeriesComplete(frames: List<CaptureFrame>, total: Int = TOTAL_FRAMES): Boolean {
        return frames.size >= total
    }

    fun shootingProgress(frames: List<CaptureFrame>, total: Int = TOTAL_FRAMES): Int {
        return min(95, ((frames.size.toDouble() / total.toDouble()) * 95.0).roundToInt())
    }

    fun captureStateLabel(capture: Capture?): String {
        if (capture == null) return "Сессия не создана"
        return when (capture.state) {
            CaptureState.COLLECTING -> "Съёмка: ${capture.frames.size}/$TOTAL_FRAMES кадров"
            CaptureState.QUEUED -> "В очереди на склейку"
            CaptureState.RUNNING -> "Склейка на сервере: ${capture.progress}%"
            CaptureState.SUCCEEDED -> "Панорама готова"
            CaptureState.FAILED -> "Ошибка склейки (${capture.errorCode ?: "UNKNOWN"})"
            CaptureState.CANCELLED -> "Съёмка отменена"
        }
    }

    fun captureErrorHint(code: String?): String = when (code) {
        "INPUT_EXPIRED" -> "Кадры серии устарели: переснимите панораму или загрузите готовую сферу 2:1."
        "NOT_ENOUGH_OVERLAP" -> "Мало перекрытия: повторите серию с шагом 22,5° и без пропусков."
        "LOOP_NOT_CLOSED" -> "Не замкнулось кольцо: последний кадр должен перекрывать первый."
        "INSUFFICIENT_COVERAGE" -> "Сфера покрыта не полностью: держите телефон ровно, без наклона в пол."
        "QUALITY_REJECTED" -> "Склейка не прошла контроль качества: переснимите серию или загрузите готовую сферу."
        "TIMEOUT" -> "Склейка превысила лимит времени: повторите позже или загрузите готовую сферу."
        "WORKER_LOST" -> "Сервер потерял задачу: поставьте склейку в очередь повторно."
        "TOOL_FAILED" -> "Инструменты склейки недоступны: загрузите готовую сферу 2:1."
        else -> "Повторите склейку или загрузите готовую панораму 2:1."
    }

    fun canRetry(capture: Capture?): Boolean {
        if (capture == null) return false
        return capture.state == CaptureState.FAILED && capture.attempt < 2
    }
}
