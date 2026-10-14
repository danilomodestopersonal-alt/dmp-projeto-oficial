package br.com.dmp.widget
import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.net.Uri
import android.widget.Toast
/** Explicit, non-exported relay for native collection fill-in clicks and standalone cards. */
class WidgetOpenActivity:Activity(){
 override fun onCreate(state:Bundle?){super.onCreate(state)
  val connection=SecureStore(this).connection()
  val destination=WidgetNavigation.resolve(connection?.optString("base"),intent.getStringExtra("path"))
  when {
   connection==null->startActivity(Intent(this,ConfigureActivity::class.java))
   destination!=null->startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(destination)).addCategory(Intent.CATEGORY_BROWSABLE))
   else->Toast.makeText(this,"Registro indisponível. Atualize o widget.",Toast.LENGTH_SHORT).show()
  };finish()
 }
}
