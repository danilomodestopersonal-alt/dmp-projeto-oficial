package br.com.dmp.widget
import android.content.Context
import org.json.JSONObject
import java.time.ZonedDateTime
import java.time.ZoneId

object WidgetCarousel {
 fun items(snapshot:JSONObject?,date:String)=AgendaRows.events(snapshot,date,false).filter{!it.optBoolean("allDay")&&(it.optString("type")=="Personal"||it.optString("type").contains("Kids",true))}
 fun initial(items:List<JSONObject>,officialId:String?,time:String):Int {
  if(items.isEmpty())return -1
  val official=items.indexOfFirst{it.optString("id")==officialId};if(official>=0)return official
  val current=items.indexOfFirst{it.optString("end").ifBlank{it.optString("start")}>=time}
  return if(current>=0)current else items.lastIndex
 }
 fun index(items:List<JSONObject>,selected:String?,officialId:String?,time:String):Int {
  val selectedIndex=items.indexOfFirst{it.optString("id")==selected};return if(selectedIndex>=0)selectedIndex else initial(items,officialId,time)
 }
 fun step(index:Int,direction:Int,count:Int)=if(count==0)-1 else (index+direction.coerceIn(-1,1)).coerceIn(0,count-1)
 fun selected(c:Context,id:Int,date:String):String?{val p=c.getSharedPreferences("widget-settings",0);return if(p.getString("$id-carouselDate",null)==date)p.getString("$id-carouselId",null)else null}
 fun save(c:Context,id:Int,date:String,eventId:String){c.getSharedPreferences("widget-settings",0).edit().putString("$id-carouselDate",date).putString("$id-carouselId",eventId).apply()}
 fun now()=ZonedDateTime.now(ZoneId.of("America/Sao_Paulo")).toLocalTime().toString().take(5)
}
