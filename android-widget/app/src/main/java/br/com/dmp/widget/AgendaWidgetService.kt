package br.com.dmp.widget

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Binder
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONObject

class AgendaWidgetService:RemoteViewsService(){
 override fun onGetViewFactory(intent:Intent):RemoteViewsFactory=AgendaFactory(this,intent.getIntExtra("widgetId",-1))
}
class AgendaFactory(private val c:Context,private val id:Int,private val read:()->JSONObject?={try{SecureStore(c).get("snapshot")?.let{JSONObject(it)}}catch(_:Exception){null}}):RemoteViewsService.RemoteViewsFactory {
 private var rows:List<AgendaRow> = emptyList()
 private var date=""
 override fun onCreate(){onDataSetChanged()}
 override fun onDataSetChanged(){val identity=Binder.clearCallingIdentity();try{val snapshot=read();date=snapshot?.optJSONObject("agenda")?.optString("date").orEmpty();rows=if(date.isBlank())emptyList()else AgendaRows.rows(snapshot,date,WidgetSettings.flag(c,id,"tomorrow",true))}finally{Binder.restoreCallingIdentity(identity)}}
 override fun onDestroy(){rows=emptyList()}
 override fun getCount()=rows.size
 override fun getViewAt(position:Int):RemoteViews?=rows.getOrNull(position)?.let{AgendaCollection.row(c,id,it,date)}
 override fun getLoadingView():RemoteViews?=null
 override fun getViewTypeCount()=2
 override fun getItemId(position:Int)=rows.getOrNull(position)?.stableId?:-1
 override fun hasStableIds()=true
}
