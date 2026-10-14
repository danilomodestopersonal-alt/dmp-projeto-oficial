package br.com.dmp.widget
import android.app.job.JobService
import android.app.job.JobParameters
import java.util.concurrent.Executors
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Future
class RefreshJob:JobService(){
 private val jobs=ConcurrentHashMap<Int,Future<*>>()
 override fun onStartJob(p:JobParameters):Boolean{jobs[p.jobId]=executor.submit{val store=SecureStore(this);val initial=store.get("connection");try{val connection=initial?.let{org.json.JSONObject(it)};val base=connection?.getString("base");val token=connection?.getString("token");if(base!=null&&token!=null){val result=WidgetApi.call(base,"/api/widget/today",token=token);for(k in arrayOf("programmed","attended","absent","remaining"))require(result.getInt(k)>=0);WidgetRules.day(result.getString("date"));WidgetRules.updated(result.getString("updatedAt"));if(!Thread.currentThread().isInterrupted&&WidgetRules.sameConnection(initial,store.get("connection"))){store.put("snapshot",result.toString());store.remove("offline")}}}catch(e:ApiFailure){if(WidgetRules.sameConnection(initial,store.get("connection"))&&!WidgetRules.retainCache(e.status)){store.remove("connection");store.remove("snapshot")};if(WidgetRules.sameConnection(initial,store.get("connection")))store.put("offline","1")}catch(_:Exception){if(WidgetRules.sameConnection(initial,store.get("connection")))store.put("offline","1")}finally{if(!Thread.currentThread().isInterrupted){TodayWidget.renderAll(this);jobFinished(p,false)};jobs.remove(p.jobId)}};return true}
 override fun onStopJob(p:JobParameters):Boolean{jobs.remove(p.jobId)?.cancel(true);return true}
 companion object{private val executor=Executors.newSingleThreadExecutor()}
}
