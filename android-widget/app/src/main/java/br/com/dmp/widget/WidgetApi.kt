package br.com.dmp.widget
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection
class ApiFailure(val status:Int):Exception()
object WidgetApi {
 fun call(base:String,path:String,body:JSONObject?=null,token:String?=null):JSONObject {
  val c=URL(WidgetRules.origin(base)+path).openConnection() as HttpsURLConnection
  try{c.connectTimeout=12000;c.readTimeout=20000;c.instanceFollowRedirects=false;c.requestMethod=if(body==null)"GET" else "POST";c.setRequestProperty("Accept","application/json");if(token!=null)c.setRequestProperty("Authorization","Bearer $token");if(body!=null){c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(body.toString().toByteArray(Charsets.UTF_8))}};val status=c.responseCode;if(status!=200&&status!=202)throw ApiFailure(status);val text=c.inputStream.bufferedReader().use{it.readText()};if(text.length>32768)throw ApiFailure(502);return JSONObject(text)
  }finally{c.disconnect()}
 }
}
