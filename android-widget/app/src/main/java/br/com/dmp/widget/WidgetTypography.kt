package br.com.dmp.widget
import android.content.Context
import android.util.TypedValue
import android.widget.RemoteViews
object WidgetTypography {
 fun factor(c:Context,id:Int)=WidgetSettings.font(c,id)/100f
 fun text(c:Context,v:RemoteViews,id:Int,vararg sizes:Pair<Int,Float>){for((view,base)in sizes)v.setTextViewTextSize(view,TypedValue.COMPLEX_UNIT_SP,base*factor(c,id))}
 fun section(c:Context,v:RemoteViews,id:Int){text(c,v,id,R.id.section to 9f)}
 fun header(c:Context,v:RemoteViews,id:Int,tiny:Boolean){text(c,v,id,R.id.header to (if(tiny)11f else 14f),R.id.date to 9f,R.id.updated to 8f,R.id.empty_agenda to 11f)}
}
