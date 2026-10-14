package br.com.dmp.widget
import android.app.Activity
import android.appwidget.AppWidgetManager
import android.os.Bundle
import android.content.Intent
import android.widget.*
class WidgetSettingsActivity:Activity(){
 override fun onCreate(b:Bundle?){
  super.onCreate(b);val id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID);setResult(RESULT_CANCELED)
  if(id==AppWidgetManager.INVALID_APPWIDGET_ID){finish();return}
  val p=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(28,48,28,28)}
  p.addView(TextView(this).apply{text="Configurar este widget";textSize=24f})
  fun slider(title:String,min:Int,max:Int,value:Int):SeekBar{
   val label=TextView(this);p.addView(label)
   val bar=SeekBar(this).apply{this.max=max-min;progress=value-min;contentDescription=title}
   fun update(){label.text="$title: ${bar.progress+min}%"};update()
   bar.setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{override fun onProgressChanged(s:SeekBar?,v:Int,u:Boolean){update()};override fun onStartTrackingTouch(s:SeekBar?){};override fun onStopTrackingTouch(s:SeekBar?){} })
   p.addView(bar);return bar
  }
  val font=slider("Tamanho da fonte",90,130,WidgetSettings.font(this,id))
  val opacity=slider("Opacidade do fundo",20,100,WidgetSettings.opacity(WidgetSettings.value(this,id,"opacity",90)))
  p.addView(TextView(this).apply{text="Fonte e opacidade valem apenas para este widget. A Agenda rola por até sete dias. Redimensione para mostrar mais conteúdo; textos maiores reduzem detalhes secundários."})
  fun toggle(label:String,key:String,default:Boolean)=CheckBox(this).apply{text=label;isChecked=WidgetSettings.flag(this@WidgetSettingsActivity,id,key,default);p.addView(this)}
  val week=toggle("Agenda: mostrar os próximos 7 dias","tomorrow",true)
  val calendar=toggle("Hoje: mini calendário quando houver espaço","calendar",true)
  val notes=toggle("Hoje: mostrar compromissos","notes",true)
  p.addView(Button(this).apply{text="Salvar este widget";setOnClickListener{
   WidgetSettings.saveFont(this@WidgetSettingsActivity,id,font.progress+90)
   WidgetSettings.save(this@WidgetSettingsActivity,id,opacity.progress+20,WidgetSettings.value(this@WidgetSettingsActivity,id,"items",8),week.isChecked,calendar.isChecked,notes.isChecked)
   TodayWidget.renderAll(this@WidgetSettingsActivity);TodayWidget.schedule(this@WidgetSettingsActivity)
   setResult(RESULT_OK,Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));finish()
  }})
  p.addView(Button(this).apply{text="Conectar / gerenciar DMP";setOnClickListener{startActivity(Intent(this@WidgetSettingsActivity,ConfigureActivity::class.java))}})
  setContentView(ScrollView(this).apply{addView(p);setOnApplyWindowInsetsListener{v,i->v.setPadding(0,i.systemWindowInsetTop,0,i.systemWindowInsetBottom);i}})
 }
}
