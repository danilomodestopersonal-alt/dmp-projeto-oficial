package br.com.dmp.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.text.SpannableString
import android.text.Spanned
import android.text.style.AbsoluteSizeSpan
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
 private fun section(c:Context,text:String,id:Int)=RemoteViews(c.packageName,R.layout.widget_section).apply{setTextViewText(R.id.section,text);WidgetTypography.section(c,this,id)}
 private fun small(c:Context,text:String,path:String?,id:Int,slot:String,base:String?,home:String?,width:Int,alpha:Int)=RemoteViews(c.packageName,R.layout.widget_small_card).apply{
  WidgetTypography.text(c,this,id,R.id.small_text to 10f)
  setTextViewText(R.id.small_text,text);setInt(R.id.small_bg,"setImageAlpha",alpha)
  if(path!=null)setOnClickPendingIntent(R.id.small_card,TodayWidget.link(c,id,slot,path,base,home))
 }
 fun render(c:Context,id:Int,agenda:Boolean,requestedSize:WidgetLayout,snapshot:JSONObject?,base:String?,home:String?,offline:Boolean=false):RemoteViews{
  val size=requestedSize.copy(fontScale=requestedSize.fontScale*WidgetTypography.factor(c,id))
  val agendaDate=snapshot?.optJSONObject("agenda")?.optString("date")?.takeIf{it.isNotBlank()}?:LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString()
  val rows=if(agenda)AgendaRows.rows(snapshot,agendaDate,WidgetSettings.flag(c,id,"tomorrow",true))else emptyList()
  val layout=if(agenda)AgendaCollection.layout(size,rows)else{if(size.showCalendar&&WidgetSettings.flag(c,id,"calendar",true))R.layout.widget_expanded else if(size.height<310)R.layout.widget_tiny else if(size.compact)R.layout.widget_compact else R.layout.widget}
  val v=RemoteViews(c.packageName,layout);val today=snapshot?.optJSONObject("today")?:snapshot;val data=if(agenda)snapshot?.optJSONObject("agenda")else today
  val date=data?.optString("date")?.takeIf{it.isNotBlank()}?:LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString()
  val opacity=WidgetSettings.opacity(WidgetSettings.value(c,id,"opacity",90));val alpha=255*opacity/100;val cardAlpha=255*(opacity+8).coerceIn(88,100)/100
  val width=(size.width-if(size.compact)16 else 24).coerceAtLeast(80)
  WidgetTypography.header(c,v,id,!agenda&&size.height<310)
  v.setInt(R.id.shell_bg,"setImageAlpha",alpha)
  val updated=data?.optString("updatedAt")?.takeIf{it.isNotBlank()}?.let{try{WidgetRules.updated(it)}catch(_:Exception){"—"}}?:"—"
  v.setTextViewText(R.id.date,if(size.tight)day(date,"dd MMM")+" · "+(if(offline)"sem rede"else updated)else day(date,"dd MMM · EEE"))
  v.setTextViewText(R.id.updated,(if(offline)"Sem conexão · " else "Atualizado ")+(data?.optString("updatedAt")?.takeIf{it.isNotBlank()}?.let{try{WidgetRules.updated(it)}catch(_:Exception){"—"}}?:"—"))
  v.setViewVisibility(R.id.updated,if(size.showUpdated)View.VISIBLE else View.GONE)
  v.setOnClickPendingIntent(R.id.date,TodayWidget.link(c,id,"date","/app?widget=agenda&date=$date",base,home))
  v.setOnClickPendingIntent(R.id.header,TodayWidget.link(c,id,"home",(if(agenda)"/app?widget=agenda&date=$date&range=week"else "/app?widget=home&date=$date"),base,home))
  if(!agenda)v.setOnClickPendingIntent(R.id.open,TodayWidget.link(c,id,"open",if(agenda)"/app?widget=agenda&date=$date"else "/app?widget=home&date=$date",base,home))
  v.setOnClickPendingIntent(R.id.settings,PendingIntent.getActivity(c,id,Intent(c,WidgetSettingsActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).setData(Uri.parse("dmp-widget://settings/$id")),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
  v.setOnClickPendingIntent(R.id.refresh,PendingIntent.getBroadcast(c,id,Intent(c,if(agenda)AgendaWidget::class.java else TodayWidget::class.java).setAction("br.com.dmp.widget.REFRESH"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
  if(agenda){
   v.setOnClickPendingIntent(R.id.add,TodayWidget.link(c,id,"new",WidgetNavigation.path("new",date),base,home))
   AgendaCollection.attach(c,v,id,size,rows,date)
  }else today(c,v,id,size,today,date,width,cardAlpha,base,home,snapshot)
  return v
 }
 private fun today(c:Context,v:RemoteViews,id:Int,size:WidgetLayout,today:JSONObject?,date:String,width:Int,alpha:Int,base:String?,home:String?,snapshot:JSONObject?){
  WidgetTypography.text(c,v,id,R.id.next_time to (if(size.height<310)16f else 18f),R.id.next_title to (if(size.height<310)11f else 12f),R.id.next_type to 9f,R.id.next_label to 8f,R.id.open to 11f)
  val hideDetails=size.height/size.fontScale<250
  for((number,label)in listOf(R.id.programmed_number to R.id.programmed_label,R.id.attended_number to R.id.attended_label,R.id.absent_number to R.id.absent_label,R.id.remaining_number to R.id.remaining_label)){
   WidgetTypography.text(c,v,id,number to 18f,label to 8f);v.setViewVisibility(label,if(hideDetails)View.GONE else View.VISIBLE)
  }
  val metrics=listOf(Triple("programmed",R.id.programmed,R.id.programmed_number),Triple("attended",R.id.attended,R.id.attended_number),Triple("absent",R.id.absent,R.id.absent_number),Triple("remaining",R.id.remaining,R.id.remaining_number))
  val backgrounds=listOf(R.id.programmed_bg,R.id.attended_bg,R.id.absent_bg,R.id.remaining_bg)
  for((i,metric)in metrics.withIndex()){val(name,card,number)=metric;v.setTextViewText(number,today?.optInt(name)?.toString()?:"—");v.setInt(backgrounds[i],"setImageAlpha",alpha);v.setOnClickPendingIntent(card,TodayWidget.link(c,id,name,WidgetNavigation.path(name,date),base,home))}
  val entries=WidgetCarousel.items(snapshot,date)
  val index=WidgetCarousel.index(entries,WidgetCarousel.selected(c,id,date),today?.optJSONObject("next")?.optString("id"),WidgetCarousel.now())
  val next=entries.getOrNull(index)
  v.setInt(R.id.next_bg,"setImageAlpha",alpha)
  v.setTextViewText(R.id.next_time,next?.optString("start")?:"—")
  v.setTextViewText(R.id.next_title,next?.optString("title")?:"Sem atendimentos hoje")
  v.setTextViewText(R.id.next_type,listOfNotNull(next?.optString("type"),next?.optString("category")?.takeIf{it!="null"&&it.isNotBlank()}).distinct().joinToString(" · "))
  val stripe=if(next?.optString("type")=="Personal")Color.rgb(126,140,133)else color(next?.optString("color"))
  v.setInt(R.id.next_category,"setBackgroundColor",stripe);v.setTextColor(R.id.next_type,stripe)
  v.setViewVisibility(R.id.next_type,if(size.height/size.fontScale>=310&&next!=null)View.VISIBLE else View.GONE)
  v.setViewVisibility(R.id.next_label,if(size.height/size.fontScale<310)View.GONE else View.VISIBLE)
  if(next!=null)v.setOnClickPendingIntent(R.id.next,TodayWidget.link(c,id,"next-record",WidgetNavigation.record(next),base,home))
  for((button,direction,possible)in listOf(Triple(R.id.next_previous,-1,index>0),Triple(R.id.next_arrow,1,index>=0&&index<entries.lastIndex))){
   v.setBoolean(button,"setEnabled",possible)
   v.setTextColor(button,if(possible)Color.rgb(23,103,75)else Color.rgb(172,185,177))
   v.setContentDescription(button,if(possible)(if(direction<0)"Atendimento anterior"else "Próximo atendimento")else(if(direction<0)"Primeiro atendimento"else "Último atendimento"))
   if(next!=null)v.setOnClickPendingIntent(button,TodayWidget.arrow(c,id,date,next.optString("id"),direction))
  }
  if(next!=null)v.setContentDescription(R.id.next,"Atendimento ${index+1} de ${entries.size}, ${next.optString("start")}, ${next.optString("title")}, ${next.optString("type")}")
  v.setInt(R.id.next_title,"setMaxLines",if(size.height>=440)3 else 1)
  workouts(c,v,id,size,snapshot,date,alpha,base,home)
  for(isNotes in listOf(true)){
   val target=if(isNotes)R.id.notes else R.id.workouts;v.removeAllViews(target);val visible=!isNotes||(WidgetSettings.flag(c,id,"notes",true)&&size.height/size.fontScale>=235)
   v.setViewVisibility(target,if(visible)View.VISIBLE else View.GONE);if(!visible)continue
   val list=today?.optJSONArray(if(isNotes)"commitments"else "workouts")?:JSONArray();val label=if(isNotes)"Compromissos"else "Treinos do dia";val prefix=if(isNotes)"Compromissos"else "Treinos"
   val destination=if(isNotes)null else "/app?widget=performance&date=$date";val take=size.detailCount
   if(size.sectionHeadings)v.addView(target,section(c,label.uppercase(locale)+if(list.length()>take)" · +${list.length()-take}"else "",id))
   if(list.length()==0){val text=if(!isNotes)"Nenhum treino"else when(today?.optString("commitmentsStatus")){"unavailable"->"Indisponíveis";"not_configured"->"Não configurados";else->"Nenhum hoje"};v.addView(target,small(c,(if(!size.sectionHeadings)"$prefix · "else "")+text,destination,id,"$target-empty",base,home,width,alpha))}
   for(n in 0 until minOf(list.length(),take)){
    val e=list.getJSONObject(n);val labelType=WidgetLayout.workoutLabel(e.optString("type"))
    val text=if(isNotes)(e.optString("time").takeIf{it!="null"&&it.isNotBlank()}?.let{"$it · "}?:"")+e.optString("title")else labelType+e.optString("title").takeIf{it.isNotBlank()&&it!=labelType}?.let{" · $it"}.orEmpty()
    val extra=if(!size.sectionHeadings&&list.length()>take&&n==0)" · +${list.length()-take}"else ""
    v.addView(target,small(c,(if(!size.sectionHeadings)"$prefix · "else "• ")+text+extra,(e.optString("id").takeIf{it.isNotBlank()}?.let{WidgetNavigation.path(if(isNotes)"commitment"else "performance",date,it)}),id,"$target-$n",base,home,width,alpha))
   }
  };calendar(c,v,id,size,date,base,home,today?.optJSONArray("eventDates"))
 }
 private fun workouts(c:Context,v:RemoteViews,id:Int,size:WidgetLayout,snapshot:JSONObject?,date:String,alpha:Int,base:String?,home:String?){
  v.removeAllViews(R.id.workouts)
  if(size.sectionHeadings)v.addView(R.id.workouts,section(c,"TREINOS DO DIA",id))
  val items=WidgetCarousel.workouts(snapshot)
  if(items.isEmpty()){v.addView(R.id.workouts,small(c,"Nenhum treino",WidgetNavigation.path("performance",date),id,"workout-empty",base,home,size.width,alpha));return}
  val index=WidgetCarousel.workoutIndex(items,WidgetCarousel.workoutSelected(c,id,date));val record=items[index]
  val type=WidgetLayout.workoutLabel(record.optString("type"));val title=record.optString("title").takeIf{it.isNotBlank()&&it!=type}
  val card=RemoteViews(c.packageName,R.layout.widget_workout)
  WidgetTypography.text(c,card,id,R.id.workout_text to 10f,R.id.workout_position to 8f)
  card.setInt(R.id.workout_bg,"setImageAlpha",alpha)
  card.setTextViewText(R.id.workout_text,type+(title?.let{" · $it"}?:""))
  card.setContentDescription(R.id.workout_card,"Treino ${index+1} de ${items.size}, $type ${title.orEmpty()}")
  card.setOnClickPendingIntent(R.id.workout_card,TodayWidget.link(c,id,"workout-record",WidgetNavigation.path("performance",date,record.optString("id")),base,home))
  card.setTextViewText(R.id.workout_position,"${index+1}/${items.size}")
  card.setViewVisibility(R.id.workout_position,if(items.size>1)View.VISIBLE else View.GONE)
  for((button,direction,possible)in listOf(Triple(R.id.workout_previous,-1,index>0),Triple(R.id.workout_next,1,index<items.lastIndex))){
   card.setViewVisibility(button,if(items.size>1)View.VISIBLE else View.GONE)
   card.setBoolean(button,"setEnabled",possible)
   card.setTextColor(button,if(possible)Color.rgb(23,103,75)else Color.rgb(172,185,177))
   card.setOnClickPendingIntent(button,TodayWidget.arrow(c,id,date,record.optString("id"),direction,"workout"))
  }
  v.addView(R.id.workouts,card)
 }
 private fun calendar(c:Context,v:RemoteViews,id:Int,size:WidgetLayout,date:String,base:String?,home:String?,eventDates:JSONArray?){
  v.removeAllViews(R.id.calendar);val show=WidgetSettings.flag(c,id,"calendar",true)&&size.showCalendar;v.setViewVisibility(R.id.calendar,if(show)View.VISIBLE else View.GONE);if(!show)return
  val marked=if(eventDates==null)emptySet()else (0 until eventDates.length()).map{eventDates.optString(it)}.toSet()
  val d=LocalDate.parse(date);v.addView(R.id.calendar,section(c,d.format(DateTimeFormatter.ofPattern("MMMM yyyy",locale)).uppercase(locale),id))
  val days=intArrayOf(R.id.day0,R.id.day1,R.id.day2,R.id.day3,R.id.day4,R.id.day5,R.id.day6)
  val labels=RemoteViews(c.packageName,R.layout.calendar_week);for(i in 0..6){labels.setTextViewText(days[i],listOf("D","S","T","Q","Q","S","S")[i]);WidgetTypography.text(c,labels,id,days[i] to 11f)};v.addView(R.id.calendar,labels)
  val first=d.withDayOfMonth(1);val offset=first.dayOfWeek.value%7;var cell=0
  for(week in 0 until (offset+d.lengthOfMonth()+6)/7){val line=RemoteViews(c.packageName,R.layout.calendar_week)
   for(slot in 0..6){val n=cell++-offset+1;val cellId=days[slot];if(n in 1..d.lengthOfMonth()){val key=first.withDayOfMonth(n).toString();val number=n.toString();val caption=SpannableString(number+"\n"+(if(key in marked)"•"else " "));caption.setSpan(AbsoluteSizeSpan(5,true),number.length+1,caption.length,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);line.setTextViewText(cellId,caption);WidgetTypography.text(c,line,id,cellId to 11f);line.setContentDescription(cellId,key+(if(key in marked)", com evento"else ""));if(key==date){line.setInt(cellId,"setBackgroundResource",R.drawable.calendar_today);line.setTextColor(cellId,Color.rgb(23,103,75))};line.setOnClickPendingIntent(cellId,TodayWidget.link(c,id,"day-$n","/app?widget=agenda&date=$key",base,home))}else line.setTextViewText(cellId,"")};v.addView(R.id.calendar,line)
  }
 }
}
