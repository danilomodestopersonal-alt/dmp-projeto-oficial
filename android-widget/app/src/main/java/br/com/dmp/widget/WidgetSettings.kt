package br.com.dmp.widget
import android.content.Context
object WidgetSettings{
 fun opacity(value:Int)=value.coerceIn(20,100)
 fun capacity(height:Int,requested:Int)=WidgetLayout(160,height).agendaCapacity(requested)
 fun safePath(path:String)=path.startsWith("/app?")||path.startsWith("/app/widget?")
 fun save(c:Context,id:Int,opacity:Int,items:Int,tomorrow:Boolean,calendar:Boolean,notes:Boolean){c.getSharedPreferences("widget-settings",0).edit().putInt("$id-opacity",opacity(opacity)).putInt("$id-items",items.coerceIn(1,20)).putBoolean("$id-tomorrow",tomorrow).putBoolean("$id-calendar",calendar).putBoolean("$id-notes",notes).apply()}
 fun value(c:Context,id:Int,key:String,default:Int)=c.getSharedPreferences("widget-settings",0).getInt("$id-$key",default)
 fun flag(c:Context,id:Int,key:String,default:Boolean)=c.getSharedPreferences("widget-settings",0).getBoolean("$id-$key",default)
 fun remove(c:Context,id:Int){val e=c.getSharedPreferences("widget-settings",0).edit();for(k in arrayOf("opacity","items","tomorrow","calendar","notes","carouselDate","carouselId"))e.remove("$id-$k");e.apply()}
}
