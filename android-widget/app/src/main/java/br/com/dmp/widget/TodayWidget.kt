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
 override fun onAppWidgetOptionsChanged(c:Context,m:AppWidgetManager,id:Int,o:Bundle){renderAll(c)}
 override fun onReceive(c:Context,i:Intent){super.onReceive(c,i);if(i.action==Intent.ACTION_BOOT_COMPLETED){renderAll(c);schedule(c)};if(i.action=="br.com.dmp.widget.REFRESH")schedule(c)}
 companion object {
  fun schedule(c:Context){val s=c.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler;val job=ComponentName(c,RefreshJob::class.java);s.schedule(JobInfo.Builder(100,job).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(1800000).setPersisted(true).build());s.schedule(JobInfo.Builder(101,job).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(0).build())}
  internal fun link(c:Context,id:Int,slot:String,path:String?,base:String?,home:String?):PendingIntent {
   val uri=if(path!=null&&WidgetSettings.safePath(path)&&base!=null)base+path else home
   val i=if(uri==null)Intent(c,ConfigureActivity::class.java)else Intent(Intent.ACTION_VIEW,Uri.parse(uri));i.data=i.data?:Uri.parse("dmp-widget://configure/$id/$slot")
   return PendingIntent.getActivity(c,("$id-$slot").hashCode(),i,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  fun renderAll(c:Context){
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
    }
   }
  }
 }
}
class AgendaWidget:TodayWidget()
