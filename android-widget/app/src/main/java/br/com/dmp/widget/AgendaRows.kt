package br.com.dmp.widget
import org.json.JSONObject
import java.security.MessageDigest
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

data class AgendaRow(val key:String,val day:String,val event:JSONObject?=null){
 val stableId:Long get()=java.nio.ByteBuffer.wrap(MessageDigest.getInstance("SHA-256").digest(key.toByteArray())).long and Long.MAX_VALUE
}
object AgendaRows {
 fun events(snapshot:JSONObject?,date:String,tomorrow:Boolean=true):List<JSONObject>{
  val array=snapshot?.optJSONObject("agenda")?.optJSONArray("items")?:return emptyList()
  val next=LocalDate.parse(date).plusDays(6).toString()
  return (0 until array.length()).mapNotNull{array.optJSONObject(it)}.filter{
   it.optString("id").isNotBlank()&&(it.optString("date")==date||(tomorrow&&it.optString("date")>date&&it.optString("date")<=next))
  }.sortedWith(compareBy<JSONObject>{it.optString("date")}.thenBy{if(it.optBoolean("allDay"))"00:00"else it.optString("start")}.thenBy{it.optString("id")})
 }
 fun rows(snapshot:JSONObject?,date:String,tomorrow:Boolean=true):List<AgendaRow>{
  val rows=mutableListOf<AgendaRow>();var previous=""
  for(e in events(snapshot,date,tomorrow)){
   val day=e.getString("date")
   if(day!=previous){rows.add(AgendaRow("heading:$day",day));previous=day}
   rows.add(AgendaRow("event:$day:${e.optString("source")}:${e.getString("id")}",day,e))
  };return rows
 }
 fun heading(day:String,date:String)=(if(day==date)"HOJE · "else if(day==LocalDate.parse(date).plusDays(1).toString())"AMANHÃ · "else "")+LocalDate.parse(day).format(DateTimeFormatter.ofPattern("EEE, dd MMM",Locale.forLanguageTag("pt-BR"))).uppercase(Locale.forLanguageTag("pt-BR")).replace(".","")
}
