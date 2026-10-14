package br.com.dmp.widget

import org.junit.Test
import org.junit.Assert.*

class WidgetLayoutTest {
 @Test fun twoColumnWidthUsesCompactLayout(){assertTrue(WidgetLayout(130,360).compact);assertTrue(WidgetLayout(164,600).compact);assertFalse(WidgetLayout(300,600).compact)}
 @Test fun compactAgendaFitsFiveToSevenRows(){assertTrue(WidgetLayout(164,360).agendaCapacity(20) in 5..7);assertTrue(WidgetLayout(164,440).agendaCapacity(20)>WidgetLayout(164,360).agendaCapacity(20))}
 @Test fun agendaLimitAndLargerFontsAreRespected(){assertEquals(2,WidgetLayout(164,600).agendaCapacity(2));assertTrue(WidgetLayout(130,360,1.3f).agendaCapacity(20)<WidgetLayout(130,360).agendaCapacity(20))}
 @Test fun compactTodayDoesNotReserveCalendarSpace(){assertFalse(WidgetLayout(164,360).showCalendar);assertTrue(WidgetLayout(164,600).showCalendar)}
 @Test fun largerTodayExpandsDetails(){assertTrue(WidgetLayout(164,500).detailCount>WidgetLayout(164,340).detailCount)}
 @Test fun allOfficialWorkoutLabelsAreReadable(){assertEquals("Musculação",WidgetLayout.workoutLabel("STRENGTH"));assertEquals("Ciclismo",WidgetLayout.workoutLabel("CYCLING"));assertEquals("Pilates",WidgetLayout.workoutLabel("PILATES"))}
}
