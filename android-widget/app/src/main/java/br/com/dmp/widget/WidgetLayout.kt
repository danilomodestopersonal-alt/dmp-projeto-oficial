package br.com.dmp.widget

/** Presentation only. Host options are in dp, independent of screen pixels. */
data class WidgetLayout(val width: Int, val height: Int, val fontScale: Float = 1f) {
    val compact = width < 230 || height < 440
    val tight = height / fontScale.coerceAtLeast(1f) < 400
    val sectionHeadings = height / fontScale.coerceAtLeast(1f) >= 350
    val showUpdated = !tight
    val showNextType = !tight
    val showCalendar = height / fontScale.coerceAtLeast(1f) >= 560
    val detailCount = ((height / fontScale.coerceAtLeast(1f) - if (showCalendar) 470 else 330) / 45).toInt().coerceIn(1, 3)
    // Both sections + the +N label are budgeted even when only today is displayed.
    fun agendaCapacity(requested: Int): Int {
        val row = if (fontScale > 1.15f) 48 else 40
        val overhead = 16 + 52 + (if (showUpdated) 16 else 0) + 36 + 18 + 36
        return ((height - overhead) / row).coerceIn(1, 20).coerceAtMost(requested.coerceIn(1, 20))
    }
    companion object {
        fun workoutLabel(type: String) = when (type.uppercase()) {
            "STRENGTH" -> "Musculação"; "CYCLING" -> "Ciclismo"; "PILATES" -> "Pilates"
            "RUNNING" -> "Corrida"; "TENNIS" -> "Tênis"; "OTHER" -> "Atividade"
            else -> type
        }
    }
}
