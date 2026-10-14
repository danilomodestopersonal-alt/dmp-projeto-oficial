package br.com.dmp.widget
import org.junit.Test
import org.junit.Assert.*
class WidgetSettingsTest{
 @Test fun opacityLimits(){assertEquals(20,WidgetSettings.opacity(-1));assertEquals(70,WidgetSettings.opacity(70));assertEquals(100,WidgetSettings.opacity(120))}
 @Test fun largerAgendaFitsMoreRows(){assertTrue(WidgetSettings.capacity(600,20)>WidgetSettings.capacity(250,20))}
 @Test fun agendaRespectsChoice(){assertEquals(2,WidgetSettings.capacity(900,2));assertEquals(1,WidgetSettings.capacity(100,8))}
 @Test fun linksOnlyOpenOfficialApp(){assertTrue(WidgetSettings.safePath("/app?widget=agenda&date=2026-10-14"));assertTrue(WidgetSettings.safePath("/app/widget?widget=attended&date=2026-10-14"));assertFalse(WidgetSettings.safePath("https://evil.test"));assertFalse(WidgetSettings.safePath("//evil.test"));assertFalse(WidgetSettings.safePath("/api/finance"))}
}
