package br.com.dmp.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Presentation only: no network, credential access or record mutations. */
internal object WidgetRenderer {
 private val locale=Locale.forLanguageTag("pt-BR")
 private fun color(value:String?,fallback:Int=Color.rgb(24,59,51))=try{Color.parseColor(value)}catch(_:Exception){fallback}
 private fun day(value:String,pattern:String)=LocalDate.parse(value).format(DateTimeFormatter.ofPattern(pattern,locale)).uppercase(locale).replace(".","")
 private fun section(c:Context,text:String)=RemoteViews(c.packageName,R.layout.widget_section).apply{setTextViewText(R.id.section,text)}
 private fun small(c:Context,text:String,path:String?,id:Int,slot:String,base:String?,home:String?,width:Int,alpha:Int)=RemoteViews(c.packageName,R.layout.widget_small_card).apply{
  setTextViewText(R.id.small_text,text);setInt(R.id.small_bg,"setImageAlpha",alpha)
  setOnClickPendingIntent(R.id.small_card,TodayWidget.link(c,id,slot,path,base,home))
 }
 fun render(c:Context,id:Int,agenda:Boolean,size:WidgetLayout,snapshot:JSONObject?,base:String?,home:String?,offline:Boolean=false):RemoteViews{
  val layout=if(agenda){if(size.compact)R.layout.agenda_widget_compact else R.layout.agenda_widget}else{if(size.height<310)R.layout.widget_tiny else if(size.compact)R.layout.widget_compact else R.layout.widget}
  val v=RemoteViews(c.packageName,layout);val today=snapshot?.optJSONObject("today")?:snapshot;val data=if(agenda)snapshot?.optJSONObject("agenda")else today
  val date=data?.optString("date")?.takeIf{it.isNotBlank()}?:LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString()
  val opacity=WidgetSettings.opacity(WidgetSettings.value(c,id,"opacity",90));val alpha=255*opacity/100;val cardAlpha=255*(opacity+8).coerceIn(88,100)/100
  val width=(size.width-if(size.compact)16 else 24).coerceAtLeast(80)
  v.setInt(R.id.shell_bg,"setImageAlpha",alpha)
  val updated=data?.optString("updatedAt")?.takeIf{it.isNotBlank()}?.let{try{WidgetRules.updated(it)}catch(_:Exception){"—"}}?:"—"
  v.setTextViewText(R.id.date,if(size.tight)day(date,"dd MMM")+" · "+(if(offline)"sem rede"else updated)else day(date,"dd MMM · EEE"))
  v.setTextViewText(R.id.updated,(if(offline)"Sem conexão · " else "Atualizado ")+(data?.optString("updatedAt")?.takeIf{it.isNotBlank()}?.let{try{WidgetRules.updated(it)}catch(_:Exception){"—"}}?:"—"))
  v.setViewVisibility(R.id.updated,if(size.showUpdated)View.VISIBLE else View.GONE)
  v.setOnClickPendingIntent(R.id.date,TodayWidget.link(c,id,"date","/app?widget=agenda&date=$date",base,home))
  v.setOnClickPendingIntent(R.id.header,TodayWidget.link(c,id,"home","/app?widget=home&date=$date",base,home))
  v.setOnClickPendingIntent(if(agenda)R.id.agenda else R.id.open,TodayWidget.link(c,id,"open",if(agenda)"/app?widget=agenda&date=$date"else null,base,home))
  v.setOnClickPendingIntent(R.id.settings,PendingIntent.getActivity(c,id,Intent(c,WidgetSettingsActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).setData(Uri.parse("dmp-widget://settings/$id")),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
  v.setOnClickPendingIntent(R.id.refresh,PendingIntent.getBroadcast(c,id,Intent(c,if(agenda)AgendaWidget::class.java else TodayWidget::class.java).setAction("br.com.dmp.widget.REFRESH"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
  if(agenda)agenda(c,v,id,size,data,date,width,cardAlpha,base,home)else today(c,v,id,size,today,date,width,cardAlpha,base,home)
  return v
 }
 private fun agenda(c:Context,v:RemoteViews,id:Int,size:WidgetLayout,data:JSONObject?,date:String,width:Int,alpha:Int,base:String?,home:String?){
  v.removeAllViews(R.id.items);v.setOnClickPendingIntent(R.id.add,TodayWidget.link(c,id,"new","/app?widget=new&date=$date",base,home))
  val items=data?.optJSONArray("items")?:JSONArray()
  val filtered=(0 until items.length()).map{items.getJSONObject(it)}.filter{WidgetSettings.flag(c,id,"tomorrow",true)||it.optString("date")==date}
  val cap=size.agendaCapacity(WidgetSettings.value(c,id,"items",8));var previous=""
  for((index,e)in filtered.take(cap).withIndex()){
   val key=e.optString("date");if(key!=previous){v.addView(R.id.items,section(c,(if(key==date)"HOJE"else "AMANHÃ")+" · "+day(key,"EEE, dd MMM")));previous=key}
   val category=e.optString("category").takeIf{it.isNotBlank()&&it!="null"}
   val stripe=if(e.optString("type").contains("Kids",true))color(e.optString("color"))else Color.rgb(126,140,133)
   val row=RemoteViews(c.packageName,if(size.fontScale>1.15f)R.layout.agenda_card_large_text else R.layout.agenda_card).apply{
    setInt(R.id.row_bg,"setImageAlpha",alpha);setInt(R.id.row_stripe,"setBackgroundColor",stripe)
    setTextViewText(R.id.row_start,if(e.optBoolean("allDay"))"Dia"else e.optString("start"));setTextViewText(R.id.row_end,if(e.optBoolean("allDay"))"inteiro"else e.optString("end"))
    setTextViewText(R.id.row_title,e.optString("title"));setTextViewText(R.id.row_type,listOfNotNull(e.optString("type"),category).distinct().joinToString(" · "))
    setTextColor(R.id.row_type,if(category==null)Color.rgb(99,113,108)else stripe)
    setContentDescription(R.id.row,(if(key==date)"Hoje"else "Amanhã")+", "+e.optString("start")+", "+e.optString("title")+", "+e.optString("type"))
    setOnClickPendingIntent(R.id.row,TodayWidget.link(c,id,"item-$index",e.optString("destination"),base,home))
   };v.addView(R.id.items,row)
  }
  if(filtered.isEmpty()){v.addView(R.id.items,section(c,"HOJE"));v.addView(R.id.items,small(c,if(data==null)"Conecte o DMP"else "Agenda livre","/app?widget=agenda&date=$date",id,"empty",base,home,width,alpha))}
  v.setTextViewText(R.id.more,"+${filtered.size-cap} itens");v.setViewVisibility(R.id.more,if(filtered.size>cap)View.VISIBLE else View.GONE)
  v.setOnClickPendingIntent(R.id.more,TodayWidget.link(c,id,"more","/app?widget=agenda&date=$date",base,home))
 }
 private fun today(c:Context,v:RemoteViews,id:Int,size:WidgetLayout,today:JSONObject?,date:String,width:Int,alpha:Int,base:String?,home:String?){
  val metrics=listOf(Triple("programmed",R.id.programmed,R.id.programmed_number),Triple("attended",R.id.attended,R.id.attended_number),Triple("absent",R.id.absent,R.id.absent_number),Triple("remaining",R.id.remaining,R.id.remaining_number))
  val backgrounds=listOf(R.id.programmed_bg,R.id.attended_bg,R.id.absent_bg,R.id.remaining_bg)
  for((i,metric)in metrics.withIndex()){val(name,card,number)=metric;v.setTextViewText(number,today?.optInt(name)?.toString()?:"—");v.setInt(backgrounds[i],"setImageAlpha",alpha);v.setOnClickPendingIntent(card,TodayWidget.link(c,id,name,today?.optJSONObject("links")?.optString(name)?:"/app/widget?widget=$name&date=$date",base,home))}
  val next=today?.optJSONObject("next");v.setInt(R.id.next_bg,"setImageAlpha",alpha)
  v.setTextViewText(R.id.next_time,next?.optString("time")?:"—");v.setTextViewText(R.id.next_title,next?.optString("title")?:"Sem próximos hoje")
  v.setTextViewText(R.id.next_type,listOfNotNull(next?.optString("type"),next?.optString("category")?.takeIf{it!="null"&&it.isNotBlank()}).joinToString(" · "))
  v.setViewVisibility(R.id.next_type,if(size.showNextType&&next!=null)View.VISIBLE else View.GONE);v.setViewVisibility(R.id.next_label,if(size.height<310)View.GONE else View.VISIBLE)
  v.setOnClickPendingIntent(R.id.next,TodayWidget.link(c,id,"next",next?.optString("destination")?:"/app?widget=agenda&date=$date",base,home))
  for(isNotes in listOf(false,true)){
   val target=if(isNotes)R.id.notes else R.id.workouts;v.removeAllViews(target);val visible=!isNotes||WidgetSettings.flag(c,id,"notes",true)
   v.setViewVisibility(target,if(visible)View.VISIBLE else View.GONE);if(!visible)continue
   val list=today?.optJSONArray(if(isNotes)"commitments"else "workouts")?:JSONArray();val label=if(isNotes)"Compromissos"else "Treinos do dia";val prefix=if(isNotes)"Compromissos"else "Treinos"
   val destination=if(isNotes)"/app?widget=home&date=$date"else "/app?widget=performance&date=$date";val take=size.detailCount
   if(size.sectionHeadings)v.addView(target,section(c,label.uppercase(locale)+if(list.length()>take)" · +${list.length()-take}"else ""))
   if(list.length()==0){val text=if(!isNotes)"Nenhum treino"else when(today?.optString("commitmentsStatus")){"unavailable"->"Indisponíveis";"not_configured"->"Não configurados";else->"Nenhum hoje"};v.addView(target,small(c,(if(!size.sectionHeadings)"$prefix · "else "")+text,destination,id,"$target-empty",base,home,width,alpha))}
   for(n in 0 until minOf(list.length(),take)){
    val e=list.getJSONObject(n);val labelType=WidgetLayout.workoutLabel(e.optString("type"))
    val text=if(isNotes)(e.optString("time").takeIf{it!="null"&&it.isNotBlank()}?.let{"$it · "}?:"")+e.optString("title")else labelType+e.optString("title").takeIf{it.isNotBlank()&&it!=labelType}?.let{" · $it"}.orEmpty()
    val extra=if(!size.sectionHeadings&&list.length()>take&&n==0)" · +${list.length()-take}"else ""
    v.addView(target,small(c,(if(!size.sectionHeadings)"$prefix · "else "• ")+text+extra,e.optString("destination"),id,"$target-$n",base,home,width,alpha))
   }
  };calendar(c,v,id,size,date,base,home)
 }
 private fun calendar(c:Context,v:RemoteViews,id:Int,size:WidgetLayout,date:String,base:String?,home:String?){
  v.removeAllViews(R.id.calendar);val show=WidgetSettings.flag(c,id,"calendar",true)&&size.showCalendar;v.setViewVisibility(R.id.calendar,if(show)View.VISIBLE else View.GONE);if(!show)return
  val d=LocalDate.parse(date);v.addView(R.id.calendar,section(c,d.format(DateTimeFormatter.ofPattern("MMMM yyyy",locale)).uppercase(locale)))
  val days=intArrayOf(R.id.day0,R.id.day1,R.id.day2,R.id.day3,R.id.day4,R.id.day5,R.id.day6)
  val labels=RemoteViews(c.packageName,R.layout.calendar_week);for(i in 0..6)labels.setTextViewText(days[i],listOf("D","S","T","Q","Q","S","S")[i]);v.addView(R.id.calendar,labels)
  val first=d.withDayOfMonth(1);val offset=first.dayOfWeek.value%7;var cell=0
  for(week in 0 until (offset+d.lengthOfMonth()+6)/7){val line=RemoteViews(c.packageName,R.layout.calendar_week)
   for(slot in 0..6){val n=cell++-offset+1;val cellId=days[slot];if(n in 1..d.lengthOfMonth()){val key=first.withDayOfMonth(n).toString();line.setTextViewText(cellId,n.toString());if(key==date){line.setInt(cellId,"setBackgroundResource",R.drawable.calendar_today);line.setTextColor(cellId,Color.rgb(23,103,75))};line.setOnClickPendingIntent(cellId,TodayWidget.link(c,id,"day-$n","/app?widget=agenda&date=$key",base,home))}else line.setTextViewText(cellId,"")};v.addView(R.id.calendar,line)
  }
 }
}
