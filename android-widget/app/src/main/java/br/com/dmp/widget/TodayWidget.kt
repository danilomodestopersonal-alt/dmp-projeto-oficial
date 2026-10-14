package br.com.dmp.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetProvider
import android.appwidget.AppWidgetManager
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.widget.RemoteViews

open class TodayWidget: AppWidgetProvider() {
 override fun onUpdate(c:Context,m:AppWidgetManager,ids:IntArray){renderAll(c);schedule(c)}
 override fun onEnabled(c:Context){schedule(c)}
 override fun onDisabled(c:Context){val m=AppWidgetManager.getInstance(c);if(m.getAppWidgetIds(ComponentName(c,TodayWidget::class.java)).isEmpty()&&m.getAppWidgetIds(ComponentName(c,AgendaWidget::class.java)).isEmpty())(c.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler).apply{cancel(100);cancel(101)}}
 override fun onDeleted(c:Context,ids:IntArray){ids.forEach{WidgetSettings.remove(c,it)}}
 override fun onAppWidgetOptionsChanged(c:Context,m:AppWidgetManager,id:Int,o:Bundle){renderAll(c,false)}
 override fun onReceive(c:Context,i:Intent){super.onReceive(c,i);if(i.action==Intent.ACTION_BOOT_COMPLETED){renderAll(c);schedule(c)};if(i.action=="br.com.dmp.widget.REFRESH")schedule(c);if(i.action=="br.com.dmp.widget.CAROUSEL")move(c,i)}
 companion object {
  fun schedule(c:Context){val s=c.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler;val job=ComponentName(c,RefreshJob::class.java);s.schedule(JobInfo.Builder(100,job).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(1800000).setPersisted(true).build());s.schedule(JobInfo.Builder(101,job).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(0).build())}
  internal fun link(c:Context,id:Int,slot:String,path:String?,base:String?,home:String?):PendingIntent = WidgetNavigation.open(c,id,slot,requireNotNull(path))
  internal fun arrow(c:Context,id:Int,date:String,eventId:String,direction:Int):PendingIntent {
   val identity=Uri.Builder().scheme("dmp-widget").authority("carousel").appendPath(id.toString()).appendPath(date).appendPath(eventId).appendPath(direction.toString()).build()
   val i=Intent(c,TodayWidget::class.java).setAction("br.com.dmp.widget.CAROUSEL").setData(identity).putExtra("widgetId",id).putExtra("date",date).putExtra("eventId",eventId).putExtra("direction",direction)
   return PendingIntent.getBroadcast(c,WidgetNavigation.code(identity.toString()),i,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private fun move(c:Context,i:Intent){
   val id=i.getIntExtra("widgetId",-1);val m=AppWidgetManager.getInstance(c)
   if(!m.getAppWidgetIds(ComponentName(c,TodayWidget::class.java)).contains(id))return
   val snapshot=try{SecureStore(c).get("snapshot")?.let{org.json.JSONObject(it)}}catch(_:Exception){null}?:return
   val date=snapshot.optJSONObject("today")?.optString("date")?:return
   if(date!=i.getStringExtra("date")){renderAll(c,false);return}
   val items=WidgetCarousel.items(snapshot,date);if(items.isEmpty())return
   val displayed=items.indexOfFirst{it.optString("id")==i.getStringExtra("eventId")}
   val current=if(displayed>=0)displayed else WidgetCarousel.index(items,WidgetCarousel.selected(c,id,date),snapshot.optJSONObject("today")?.optJSONObject("next")?.optString("id"),WidgetCarousel.now())
   val next=WidgetCarousel.step(current,i.getIntExtra("direction",0),items.size)
   WidgetCarousel.save(c,id,date,items[next].getString("id"));renderAll(c,false)
  }
  fun renderAll(c:Context,updateCollections:Boolean=true){
   val store=SecureStore(c);val snapshot=try{store.get("snapshot")?.let{org.json.JSONObject(it)}}catch(_:Exception){null}
   val connection=store.connection();val manager=AppWidgetManager.getInstance(c)
   for(agenda in arrayOf(false,true)){
    val provider=if(agenda)AgendaWidget::class.java else TodayWidget::class.java
    for(id in manager.getAppWidgetIds(ComponentName(c,provider))){
     val o=manager.getAppWidgetOptions(id)
     fun render(w:Int,h:Int)=WidgetRenderer.render(c,id,agenda,WidgetLayout(w,h,c.resources.configuration.fontScale),snapshot,connection?.optString("base"),connection?.optString("home"),store.get("offline")=="1")
     // Android 12+: pair actual host widths and heights, including orientation changes.
     val sizes=if(Build.VERSION.SDK_INT>=31)o.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)else null
     val views=if(Build.VERSION.SDK_INT>=31&&!sizes.isNullOrEmpty())RemoteViews(sizes.take(16).associateWith{render(it.width.toInt(),it.height.toInt())})else{
      val minW=o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,150).coerceAtLeast(110)
      val maxW=o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,minW).coerceAtLeast(minW)
      val minH=o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,340).coerceAtLeast(260)
      val maxH=o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,minH).coerceAtLeast(minH)
      RemoteViews(render(maxW,minH),render(minW,maxH))
     }
     manager.updateAppWidget(id,views)
     if(agenda&&updateCollections){
      val date=snapshot?.optJSONObject("agenda")?.optString("date").orEmpty()
      if(date.isNotBlank()){
       val count=AgendaRows.rows(snapshot,date,WidgetSettings.flag(c,id,"tomorrow",true)).size
       if(count>0&&(Build.VERSION.SDK_INT<31||count>80))manager.notifyAppWidgetViewDataChanged(id,R.id.items)
      }
     }
    }
   }
  }
 }
}
class AgendaWidget:TodayWidget()
