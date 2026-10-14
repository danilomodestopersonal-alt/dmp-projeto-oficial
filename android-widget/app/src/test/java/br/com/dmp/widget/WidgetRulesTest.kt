package br.com.dmp.widget
import org.junit.Test
import org.junit.Assert.*
class WidgetRulesTest {
 @Test fun brazilDate(){assertEquals("14/10",WidgetRules.day("2026-10-14"));assertEquals("09:30",WidgetRules.updated("2026-10-14T12:30:00Z"))}
 @Test fun emptyNext(){assertEquals("Sem próximos atendimentos hoje",WidgetRules.next(null,null))}
 @Test fun officialNext(){assertEquals("Próximo: 10:00 • João Silva",WidgetRules.next("10:00","João Silva"))}
 @Test fun networkKeepsCache(){assertTrue(WidgetRules.retainCache(503));assertTrue(WidgetRules.retainCache(502));assertFalse(WidgetRules.retainCache(401))}
 @Test fun ignoresResponseFromPreviousConnection(){assertTrue(WidgetRules.sameConnection("one","one"));assertFalse(WidgetRules.sameConnection("one","two"));assertFalse(WidgetRules.sameConnection(null,null))}
 @Test fun originIsHttps(){assertEquals("https://dmp.example",WidgetRules.origin("https://DMP.example/app?home=1"))}
 @Test(expected=IllegalArgumentException::class) fun rejectsHttp(){WidgetRules.origin("http://dmp.example")}
 @Test(expected=IllegalArgumentException::class) fun rejectsCredentials(){WidgetRules.origin("https://secret@example.com")}
}
