package br.com.dmp.widget
import android.content.Context
object WidgetSettings{
 fun background(width:Int,height:Int,alpha:Int):android.graphics.Bitmap{val w=width.coerceIn(250,500);val h=height.coerceIn(200,900);return android.graphics.Bitmap.createBitmap(w,h,android.graphics.Bitmap.Config.ARGB_8888).apply{val canvas=android.graphics.Canvas(this);val p=android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply{color=android.graphics.Color.argb(alpha,243,248,244)};canvas.drawRoundRect(android.graphics.RectF(0f,0f,w.toFloat(),h.toFloat()),18f,18f,p)}}
 fun opacity(value:Int)=value.coerceIn(20,100)
 fun capacity(height:Int,requested:Int)=((height-105)/48).coerceIn(1,20).coerceAtMost(requested.coerceIn(1,20))
 fun safePath(path:String)=path.startsWith("/app?")||path.startsWith("/app/widget?")
 fun save(c:Context,id:Int,opacity:Int,items:Int,tomorrow:Boolean,calendar:Boolean,notes:Boolean){c.getSharedPreferences("widget-settings",0).edit().putInt("$id-opacity",opacity(opacity)).putInt("$id-items",items.coerceIn(1,20)).putBoolean("$id-tomorrow",tomorrow).putBoolean("$id-calendar",calendar).putBoolean("$id-notes",notes).apply()}
 fun value(c:Context,id:Int,key:String,default:Int)=c.getSharedPreferences("widget-settings",0).getInt("$id-$key",default)
 fun flag(c:Context,id:Int,key:String,default:Boolean)=c.getSharedPreferences("widget-settings",0).getBoolean("$id-$key",default)
 fun remove(c:Context,id:Int){val e=c.getSharedPreferences("widget-settings",0).edit();for(k in arrayOf("opacity","items","tomorrow","calendar","notes"))e.remove("$id-$k");e.apply()}
}
