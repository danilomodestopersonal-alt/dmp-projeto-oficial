package br.com.dmp.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],qualifiers="mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WidgetRenderTest {
 private val c:Context get()=RuntimeEnvironment.getApplication()
 private fun fixture(empty:Boolean=false):JSONObject {
  val today=JSONObject().put("date","2026-10-14").put("updatedAt","2026-10-14T17:20:00Z").put("programmed",17).put("attended",9).put("absent",1).put("remaining",7)
  val events=JSONArray()
  if(!empty){
   today.put("next",JSONObject().put("id","e4").put("time","13:30").put("title","Gra Paula").put("type","Personal").put("destination","/app?widget=event&date=2026-10-14&id=e4"))
   today.put("workouts",JSONArray().put(JSONObject().put("id","w1").put("type","CYCLING").put("title","Pedal").put("destination","/app?widget=performance&date=2026-10-14&id=w1")))
   today.put("commitments",JSONArray().put(JSONObject().put("id","t1").put("time","18:30").put("title","Reunião").put("destination","/app?widget=commitment&date=2026-10-14&id=t1")))
   val names=listOf("Rogério Novelli","Alexandre Deboni","Laranja","Vermelho","Verde","Luciana Grespi Juliana Revelk","Gra Paula","André Masili","Diego","Bruna")
   for((i,name)in names.withIndex()){
    val kids=i in 2..4;val date=if(i<8)"2026-10-14"else "2026-10-15"
    events.put(JSONObject().put("id","e$i").put("date",date).put("title",name).put("start",listOf("05:30","06:30","07:30","08:30","13:30","15:00","16:00","17:00","07:30","08:30")[i]).put("end",java.time.LocalTime.parse(listOf("05:30","06:30","07:30","08:30","13:30","15:00","16:00","17:00","07:30","08:30")[i]).plusHours(1).toString()).put("type",if(kids)"Tênis Kids"else "Personal").put("category",if(kids)name else JSONObject.NULL).put("color",if(name=="Vermelho")"#B73535"else if(name=="Verde")"#2D8B57"else "#BC671C").put("destination","/app?widget=event&date=$date&id=e$i"))
   }
  }
  return JSONObject().put("today",today).put("agenda",JSONObject().put("date","2026-10-14").put("updatedAt","2026-10-14T17:20:00Z").put("items",events))
 }
 private fun view(agenda:Boolean,w:Int,h:Int,empty:Boolean=false,scale:Float=1f):View {
  val config=android.content.res.Configuration(c.resources.configuration).apply{fontScale=scale}
  val context=c.createConfigurationContext(config)
  val rv=WidgetRenderer.render(context,101,agenda,WidgetLayout(w,h,scale),fixture(empty),"https://dmp.test","https://dmp.test/app")
  val parent=android.appwidget.AppWidgetHostView(context);val v=rv.apply(context,parent);parent.addView(v)
  parent.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));parent.layout(0,0,w,h)
  return v
 }
 @Test fun compactAndExpandedLayoutsFitRealRemoteViews(){
  for((w,h)in listOf(130 to 260,130 to 340,164 to 360,164 to 440,164 to 600,300 to 600))for(agenda in listOf(true,false))for(empty in listOf(false,true)){
   val v=view(agenda,w,h,empty);val shell=v.findViewById<View>(R.id.shell)
   assertTrue("$agenda $w x $h empty=$empty content=${shell.height}",shell.height<=h)
   val button=v.findViewById<View>(if(agenda)R.id.agenda else R.id.open)
   val rect=android.graphics.Rect();button.getDrawingRect(rect);(v as android.view.ViewGroup).offsetDescendantRectToMyCoords(button,rect);assertTrue("footer outside $agenda $w x $h bottom=${rect.bottom}",rect.bottom+v.findViewById<View>(R.id.content).paddingBottom<=h);assertTrue(button.height>=28);assertEquals(View.VISIBLE,button.visibility)
   if(!empty&&w==164&&h==360){val bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);v.draw(Canvas(bitmap));val out=File("build/widget-previews");out.mkdirs();File(out,if(agenda)"agenda-compact.png"else "hoje-compact.png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}}
   if(!empty&&w==164&&h==600){val bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);v.draw(Canvas(bitmap));val out=File("build/widget-previews");out.mkdirs();File(out,if(agenda)"agenda-alta.png"else "hoje-alto.png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}}
  }
 }
 @Test fun largerSystemTextFitsBothWidgets(){for(agenda in listOf(true,false)){val v=view(agenda,164,400,scale=1.3f);assertTrue("large text $agenda ${v.findViewById<View>(R.id.shell).height}",v.findViewById<View>(R.id.shell).height<=400);val b=v.findViewById<View>(if(agenda)R.id.agenda else R.id.open);val rect=android.graphics.Rect();b.getDrawingRect(rect);(v as android.view.ViewGroup).offsetDescendantRectToMyCoords(b,rect);assertTrue("large text footer outside $agenda ${rect.bottom}",rect.bottom+v.findViewById<View>(R.id.content).paddingBottom<=400)}}
 @Test fun agendaUsesNativeScrollableCollectionAndOneFooter(){val v=view(true,164,360);val items=v.findViewById<android.widget.ListView>(R.id.items);assertNotNull("native adapter missing",items.adapter);assertTrue("native count=${items.adapter.count}",items.adapter.count>=12);assertNull(v.findViewById<View>(R.id.open));assertFalse(v.findViewById<TextView>(R.id.more).text.isEmpty())}
 @Test fun compactHidesCalendarButExpandedShowsIt(){assertEquals(View.GONE,view(false,164,360).findViewById<View>(R.id.calendar).visibility);assertEquals(View.VISIBLE,view(false,164,600).findViewById<View>(R.id.calendar).visibility)}
 @Test fun clickKeepsTheExactRecordDestination(){val path=WidgetNavigation.path("event","2026-10-14","e0");val i=Shadows.shadowOf(WidgetNavigation.open(c,101,"row-0",path)).savedIntent;assertEquals(WidgetOpenActivity::class.java.name,i.component?.className);assertEquals("https://dmp.test/app?widget=event&date=2026-10-14&id=e0",WidgetNavigation.resolve("https://dmp.test",i.getStringExtra("path")))}
 @Test fun emptyAgendaDoesNotStretchFooterToHostBottom(){val v=view(true,164,600,true);assertTrue(v.findViewById<View>(R.id.shell).height<220)}
 @Test fun opacityIsIndependentAndTextRemainsSolid(){
  WidgetSettings.save(c,101,90,20,true,true,true);WidgetSettings.save(c,202,70,20,true,true,true)
  try {
   fun make(id:Int)=WidgetRenderer.render(c,id,false,WidgetLayout(164,400),fixture(),"https://dmp.test","https://dmp.test/app").apply(c,FrameLayout(c))
   val a=make(101);val b=make(202)
   assertEquals(229,a.findViewById<android.widget.ImageView>(R.id.shell_bg).imageAlpha)
   assertEquals(178,b.findViewById<android.widget.ImageView>(R.id.shell_bg).imageAlpha)
   assertTrue(b.findViewById<android.widget.ImageView>(R.id.next_bg).imageAlpha>178)
   assertEquals(1f,b.findViewById<TextView>(R.id.programmed_number).alpha,0f)
  }finally{WidgetSettings.remove(c,101);WidgetSettings.remove(c,202)}
 }
 @Test fun tomorrowIsInTheSameScrollableList(){val rows=AgendaRows.rows(fixture(),"2026-10-14");val headings=rows.filter{it.event==null};assertEquals(listOf("2026-10-14","2026-10-15"),headings.map{it.day});val v=view(true,164,360);val list=v.findViewById<android.widget.ListView>(R.id.items);list.setSelection(9);v.measure(View.MeasureSpec.makeMeasureSpec(164,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(360,View.MeasureSpec.EXACTLY));v.layout(0,0,164,360);assertTrue("scroll first=${list.firstVisiblePosition}, count=${list.adapter?.count}, children=${list.childCount}",list.firstVisiblePosition>0)}
 @Test fun renderHighDensityReferences(){
  val config=android.content.res.Configuration(c.resources.configuration).apply{densityDpi=480;fontScale=1f}
  val context=c.createConfigurationContext(config);val scale=context.resources.displayMetrics.density
  assertEquals(3f,scale,0f)
  val out=File("build/widget-previews");out.mkdirs()
  val source=fixture();source.getJSONObject("today").getJSONArray("workouts").put(JSONObject().put("id","w2").put("type","PILATES").put("title","Pilates"))
  WidgetSettings.save(context,101,90,20,true,true,true)
  try{for(h in listOf(360,600))for(agenda in listOf(true,false)){
   val rv=WidgetRenderer.render(context,101,agenda,WidgetLayout(164,h),source,"https://dmp.test","https://dmp.test/app")
   val p=android.appwidget.AppWidgetHostView(context);val v=rv.apply(context,p);p.addView(v);val wpx=(164*scale).toInt();val hpx=(h*scale).toInt()
   p.measure(View.MeasureSpec.makeMeasureSpec(wpx,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(hpx,View.MeasureSpec.EXACTLY));p.layout(0,0,wpx,hpx)
   val button=v.findViewById<View>(if(agenda)R.id.agenda else R.id.open);val rect=android.graphics.Rect();button.getDrawingRect(rect);(v as android.view.ViewGroup).offsetDescendantRectToMyCoords(button,rect);assertTrue("density footer $agenda $h ${rect.bottom}",rect.bottom+v.findViewById<View>(R.id.content).paddingBottom<=hpx)
   val image=Bitmap.createBitmap(wpx,hpx,Bitmap.Config.ARGB_8888);v.draw(Canvas(image));val name=(if(agenda)"agenda"else "hoje")+(if(h==360)"-compact-3x.png"else "-alto-3x.png")
   File(out,name).outputStream().use{image.compress(Bitmap.CompressFormat.PNG,100,it)}
  }}finally{WidgetSettings.remove(context,101)}
 }

 @Test fun collectionClickMergesTheExactRowIntoItsTemplate(){
  val v=view(true,164,360);val list=v.findViewById<android.widget.ListView>(R.id.items);val position=1
  val child=list.getChildAt(position-list.firstVisiblePosition);assertNotNull(child)
  assertTrue(list.performItemClick(child,position,list.adapter.getItemId(position)))
  val i=Shadows.shadowOf(RuntimeEnvironment.getApplication()).nextStartedActivity
  assertEquals(WidgetOpenActivity::class.java.name,i.component!!.className)
  assertEquals(WidgetNavigation.path("event","2026-10-14","e0"),i.getStringExtra("path"))
 }

 @Test fun todayHasNoInvisibleHostTailAtAnyResize(){for(h in listOf(260,340,360,440,600,800)){val v=view(false,164,h);assertEquals("host height=$h",h,v.findViewById<View>(R.id.shell).height);assertEquals(h,v.findViewById<View>(R.id.content).height);val b=v.findViewById<View>(R.id.open);val rect=android.graphics.Rect();b.getDrawingRect(rect);(v as android.view.ViewGroup).offsetDescendantRectToMyCoords(b,rect);assertEquals(h,rect.bottom+v.findViewById<View>(R.id.content).paddingBottom);assertTrue(v.findViewById<View>(R.id.next).height>=35)}}

}
