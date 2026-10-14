package br.com.dmp.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import java.security.MessageDigest
import java.time.LocalDate

/** Routes only. Never falls back from a missing record to a generic Home URL. */
object WidgetNavigation {
 val kinds=setOf("home","agenda","new","student","event","kids","performance","commitment","programmed","attended","absent","remaining")
 fun path(kind:String,date:String,id:String?=null):String {
  require(kind in kinds);require(Regex("\\d{4}-\\d{2}-\\d{2}").matches(date)&&LocalDate.parse(date).toString()==date)
  val builder=Uri.Builder().path(if(kind in setOf("programmed","attended","absent","remaining"))"/app/widget"else "/app").appendQueryParameter("widget",kind).appendQueryParameter("date",date)
  if(!id.isNullOrBlank())builder.appendQueryParameter("id",id)
  return builder.build().toString()
 }
 fun valid(path:String?):Boolean=try{
  if(path.isNullOrBlank()||path.length>2048)false else {
   val u=Uri.parse(path);val kind=u.getQueryParameter("widget");val date=u.getQueryParameter("date")?:""
   u.scheme==null&&u.authority==null&&u.fragment==null&&u.path in setOf("/app","/app/widget")&&kind in kinds&&Regex("\\d{4}-\\d{2}-\\d{2}").matches(date)&&LocalDate.parse(date).toString()==date&&(!u.queryParameterNames.contains("range")||(kind=="agenda"&&u.getQueryParameter("range")=="week"))&&u.queryParameterNames.all{it in setOf("widget","date","id","time","category","lessonId","range")}
  }
 }catch(_:Exception){false}
 fun record(e:org.json.JSONObject):String {
  val kind=if(e.optString("source")=="todoist")"commitment"else if(e.optString("type").contains("Kids",true))"kids"else "event"
  val generated=path(kind,e.getString("date"),e.getString("id"));val supplied=e.optString("destination")
  if(valid(supplied)){
   val u=Uri.parse(supplied)
   if(u.getQueryParameter("widget")==kind&&u.getQueryParameter("date")==e.getString("date")&&u.getQueryParameter("id")==e.getString("id"))return supplied
  };return generated
 }
 fun resolve(base:String?,path:String?):String?=try{if(base==null||!valid(path))null else WidgetRules.origin(base)+path}catch(_:Exception){null}
 fun code(value:String):Int {val b=MessageDigest.getInstance("SHA-256").digest(value.toByteArray());return java.nio.ByteBuffer.wrap(b).int and Int.MAX_VALUE}
 fun open(c:Context,id:Int,slot:String,path:String):PendingIntent {
  require(valid(path));val identity=Uri.Builder().scheme("dmp-widget").authority("open").appendPath(id.toString()).appendPath(slot).appendQueryParameter("path",path).build()
  val i=Intent(c,WidgetOpenActivity::class.java).setData(identity).putExtra("path",path)
  return PendingIntent.getActivity(c,code(identity.toString()),i,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 }
 fun collection(c:Context,id:Int):PendingIntent {
  val identity=Uri.parse("dmp-widget://collection/$id")
  val i=Intent(c,WidgetOpenActivity::class.java).setData(identity)
  return PendingIntent.getActivity(c,code(identity.toString()),i,PendingIntent.FLAG_UPDATE_CURRENT or if(Build.VERSION.SDK_INT>=31)PendingIntent.FLAG_MUTABLE else 0)
 }
}
