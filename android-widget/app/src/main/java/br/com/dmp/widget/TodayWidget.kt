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
import android.widget.RemoteViews
import android.text.SpannableString
import android.text.style.StyleSpan
import android.graphics.Typeface
import org.json.JSONObject
class TodayWidget:AppWidgetProvider(){
 override fun onUpdate(c:Context,m:AppWidgetManager,ids:IntArray){renderAll(c);schedule(c)}
 override fun onEnabled(c:Context){schedule(c)}
 override fun onDisabled(c:Context){(c.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler).apply{cancel(100);cancel(101)}}
 override fun onReceive(c:Context,i:Intent){super.onReceive(c,i);if(i.action==Intent.ACTION_BOOT_COMPLETED){renderAll(c);schedule(c)}}
 companion object{
  fun schedule(c:Context){val s=c.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler;val job=ComponentName(c,RefreshJob::class.java);s.schedule(JobInfo.Builder(100,job).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(1800000).setPersisted(true).build());s.schedule(JobInfo.Builder(101,job).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(0).build())}
  private fun metric(value:Int,label:String):CharSequence{val n=value.toString();return SpannableString("$n $label").apply{setSpan(StyleSpan(Typeface.BOLD),0,n.length,0)}}
  fun renderAll(c:Context){val store=SecureStore(c);val snapshot=try{store.get("snapshot")?.let{JSONObject(it)}}catch(_:Exception){null};val manager=AppWidgetManager.getInstance(c);for(id in manager.getAppWidgetIds(ComponentName(c,TodayWidget::class.java))){val view=RemoteViews(c.packageName,R.layout.widget);val home=store.connection()?.getString("home");val target=if(home==null)Intent(c,ConfigureActivity::class.java) else Intent(Intent.ACTION_VIEW,Uri.parse(home));view.setOnClickPendingIntent(R.id.root,PendingIntent.getActivity(c,id,target,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE));if(snapshot!=null)try{view.setTextViewText(R.id.date,WidgetRules.day(snapshot.getString("date")));view.setTextViewText(R.id.programmed,metric(snapshot.getInt("programmed"),"programados"));view.setTextViewText(R.id.attended,metric(snapshot.getInt("attended"),"atendidos"));view.setTextViewText(R.id.absent,metric(snapshot.getInt("absent"),"ausências"));view.setTextViewText(R.id.remaining,metric(snapshot.getInt("remaining"),"faltam"));val next=snapshot.optJSONObject("next");view.setTextViewText(R.id.next,WidgetRules.next(next?.getString("time"),next?.getString("title")));val stale=store.get("offline")=="1";view.setTextViewText(R.id.updated,(if(stale)"Sem conexão · " else "Atualizado ")+WidgetRules.updated(snapshot.getString("updatedAt")))}catch(_:Exception){view.setTextViewText(R.id.next,"Resumo indisponível. Abra o aplicativo.")};manager.updateAppWidget(id,view)}}
 }
}
