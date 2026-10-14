package br.com.dmp.widget

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

object AgendaCollection {
 private val legacy=listOf(80 to R.layout.agenda_widget_legacy_80,140 to R.layout.agenda_widget_legacy_140,200 to R.layout.agenda_widget_legacy_200,260 to R.layout.agenda_widget_legacy_260,340 to R.layout.agenda_widget_legacy_340,440 to R.layout.agenda_widget_legacy_440,600 to R.layout.agenda_widget_legacy_600)
 fun title(e:JSONObject):String{val names=e.optJSONArray("studentNames");return if(names!=null&&names.length()>0)(0 until names.length()).map{names.optString(it)}.filter{it.isNotBlank()}.joinToString("\n").ifBlank{e.optString("title")}else e.optString("title")}
 private fun rowHeight(row:AgendaRow,size:WidgetLayout):Int{
  if(row.event==null)return kotlin.math.ceil(22*size.fontScale).toInt()
  val perLine=((size.width-55)/(6*size.fontScale)).toInt().coerceAtLeast(6)
  val lines=title(row.event).split("\n").sumOf{((it.length+perLine-1)/perLine).coerceAtLeast(1)}
  return kotlin.math.ceil(14f*size.fontScale*lines+if(size.fontScale>1.15f)14f else 28f).toInt().coerceAtLeast(40)
 }
 fun viewport(size:WidgetLayout,rows:List<AgendaRow>):Int{
  val max=(size.height-16-52-(if(size.showUpdated)16 else 0)-4).coerceAtLeast(80)
  return minOf(max,rows.sumOf{rowHeight(it,size)}.coerceAtLeast(24))
 }
 fun layout(size:WidgetLayout,rows:List<AgendaRow>):Int{
  if(rows.isEmpty())return R.layout.agenda_widget_empty
  if(Build.VERSION.SDK_INT<31){val max=viewport(size,rows);return legacy.lastOrNull{it.first<=max}?.second?:legacy.first().second}
  return if(size.compact)R.layout.agenda_widget_compact else R.layout.agenda_widget
 }
 fun row(c:Context,id:Int,row:AgendaRow,date:String):RemoteViews{
  if(row.event==null)return RemoteViews(c.packageName,R.layout.widget_section).apply{setTextViewText(R.id.section,AgendaRows.heading(row.day,date));WidgetTypography.section(c,this,id)}
  val e=row.event;val category=e.optString("category").takeIf{it.isNotBlank()&&it!="null"}
  val stripe=when{e.optString("type").contains("Kids",true)->try{Color.parseColor(e.optString("color"))}catch(_:Exception){Color.rgb(188,103,28)};e.optString("type")=="Compromisso"->Color.rgb(71,108,137);else->Color.rgb(126,140,133)}
  val alpha=255*(WidgetSettings.opacity(WidgetSettings.value(c,id,"opacity",90))+8).coerceIn(88,100)/100
  val large=c.resources.configuration.fontScale*WidgetTypography.factor(c,id)>1.15f
  return RemoteViews(c.packageName,R.layout.agenda_card).apply{
   WidgetTypography.text(c,this,id,R.id.row_start to 11f,R.id.row_end to 9f,R.id.row_title to 12f,R.id.row_type to 9f)
   setInt(R.id.row_bg,"setImageAlpha",alpha);setInt(R.id.row_stripe,"setBackgroundColor",stripe)
   setTextViewText(R.id.row_start,if(e.optString("source")=="todoist"&&e.optBoolean("allDay"))"Sem"else if(e.optBoolean("allDay"))"Dia"else e.optString("start"))
   setTextViewText(R.id.row_end,if(e.optString("source")=="todoist"&&e.optBoolean("allDay"))"horário"else if(e.optBoolean("allDay"))"inteiro"else e.optString("end").takeIf{it!="null"}.orEmpty())
   setTextViewText(R.id.row_title,title(e));setTextViewText(R.id.row_type,listOfNotNull(e.optString("type"),category).distinct().joinToString(" · "))
   setViewVisibility(R.id.row_type,if(large)View.GONE else View.VISIBLE)
   setTextColor(R.id.row_type,if(e.optString("type")=="Compromisso"||category!=null)stripe else Color.rgb(99,113,108))
   setContentDescription(R.id.row,AgendaRows.heading(row.day,date)+", "+e.optString("start")+", "+title(e)+", "+e.optString("type"))
   setOnClickFillInIntent(R.id.row,Intent().putExtra("path",WidgetNavigation.record(e)))
  }
 }
 fun attach(c:Context,v:RemoteViews,id:Int,size:WidgetLayout,rows:List<AgendaRow>,date:String){
  if(rows.isEmpty()){v.setTextViewText(R.id.empty_agenda,"Agenda livre neste período");return}
  v.setPendingIntentTemplate(R.id.items,WidgetNavigation.collection(c,id))
  if(Build.VERSION.SDK_INT>=31&&rows.size<=80){val builder=RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(2);for(entry in rows)builder.addItem(entry.stableId,row(c,id,entry,date));v.setRemoteAdapter(R.id.items,builder.build())}
  else{val intent=Intent(c,AgendaWidgetService::class.java).putExtra("widgetId",id).setData(Uri.parse("dmp-widget://agenda/$id"));v.setRemoteAdapter(R.id.items,intent)}
  if(Build.VERSION.SDK_INT>=31)v.setViewLayoutHeight(R.id.items,viewport(size,rows).toFloat(),TypedValue.COMPLEX_UNIT_DIP)
 }
}
