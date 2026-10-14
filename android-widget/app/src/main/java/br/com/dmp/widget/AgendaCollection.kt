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

/** Stable native collection. Scroll is owned by ListView, never by an app-opening gesture. */
object AgendaCollection {
 private val legacy=listOf(80 to R.layout.agenda_widget_legacy_80,140 to R.layout.agenda_widget_legacy_140,200 to R.layout.agenda_widget_legacy_200,260 to R.layout.agenda_widget_legacy_260,340 to R.layout.agenda_widget_legacy_340,440 to R.layout.agenda_widget_legacy_440,600 to R.layout.agenda_widget_legacy_600)
 fun viewport(size:WidgetLayout,rows:List<AgendaRow>):Int {
  val max=(size.height-16-52-(if(size.showUpdated)16 else 0)-36-kotlin.math.ceil(18*size.fontScale).toInt()-4).coerceAtLeast(80)
  val content=rows.fold(0){sum,entry->sum+(if(entry.event==null)18 else if(size.fontScale>1.15f)48 else 40)}
  return minOf(max,content.coerceAtLeast(24))
 }
 fun layout(size:WidgetLayout,rows:List<AgendaRow>):Int {
  if(rows.isEmpty())return R.layout.agenda_widget_empty
  if(Build.VERSION.SDK_INT<31){val max=viewport(size,rows);return legacy.lastOrNull{it.first<=max}?.second?:legacy.first().second}
  return if(size.compact)R.layout.agenda_widget_compact else R.layout.agenda_widget
 }
 fun row(c:Context,id:Int,row:AgendaRow,date:String):RemoteViews {
  if(row.event==null)return RemoteViews(c.packageName,R.layout.widget_section).apply{setTextViewText(R.id.section,AgendaRows.heading(row.day,date))}
  val e=row.event
  val category=e.optString("category").takeIf{it.isNotBlank()&&it!="null"}
  val stripe=if(e.optString("type").contains("Kids",true))try{Color.parseColor(e.optString("color"))}catch(_:Exception){Color.rgb(126,140,133)}else Color.rgb(126,140,133)
  val alpha=255*(WidgetSettings.opacity(WidgetSettings.value(c,id,"opacity",90))+8).coerceIn(88,100)/100
  return RemoteViews(c.packageName,if(c.resources.configuration.fontScale>1.15f)R.layout.agenda_card_large_text else R.layout.agenda_card).apply{
   setInt(R.id.row_bg,"setImageAlpha",alpha);setInt(R.id.row_stripe,"setBackgroundColor",stripe)
   setTextViewText(R.id.row_start,if(e.optBoolean("allDay"))"Dia"else e.optString("start"));setTextViewText(R.id.row_end,if(e.optBoolean("allDay"))"inteiro"else e.optString("end"))
   setTextViewText(R.id.row_title,e.optString("title"));setTextViewText(R.id.row_type,listOfNotNull(e.optString("type"),category).distinct().joinToString(" · "))
   setTextColor(R.id.row_type,if(category==null)Color.rgb(99,113,108)else stripe)
   setContentDescription(R.id.row,AgendaRows.heading(row.day,date)+", "+e.optString("start")+", "+e.optString("title")+", "+e.optString("type"))
   setOnClickFillInIntent(R.id.row,Intent().putExtra("path",WidgetNavigation.record(e)))
  }
 }
 fun attach(c:Context,v:RemoteViews,id:Int,size:WidgetLayout,rows:List<AgendaRow>,date:String){
  if(rows.isEmpty()){v.setTextViewText(R.id.empty_agenda,"Agenda livre neste período");v.setViewVisibility(R.id.more,View.GONE);return}
  v.setPendingIntentTemplate(R.id.items,WidgetNavigation.collection(c,id))
  if(Build.VERSION.SDK_INT>=31&&rows.size<=80){
   val builder=RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(2)
   for(entry in rows)builder.addItem(entry.stableId,row(c,id,entry,date))
   v.setRemoteAdapter(R.id.items,builder.build())
  }else{
   val intent=Intent(c,AgendaWidgetService::class.java).putExtra("widgetId",id).setData(Uri.parse("dmp-widget://agenda/$id"))
   v.setRemoteAdapter(R.id.items,intent)
  }
  val height=viewport(size,rows)
  if(Build.VERSION.SDK_INT>=31)v.setViewLayoutHeight(R.id.items,height.toFloat(),TypedValue.COMPLEX_UNIT_DIP)
  val full=rows.fold(0){sum,entry->sum+(if(entry.event==null)18 else if(size.fontScale>1.15f)48 else 40)}
  v.setTextViewText(R.id.more,"↕ Deslize para ver mais")
  v.setViewVisibility(R.id.more,if(full>height)View.VISIBLE else View.GONE)
 }
}
