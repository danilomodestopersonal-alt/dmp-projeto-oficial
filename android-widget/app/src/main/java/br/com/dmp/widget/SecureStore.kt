package br.com.dmp.widget
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
class SecureStore(context: Context) {
 private val prefs=context.getSharedPreferences("dmp_widget_encrypted",Context.MODE_PRIVATE)
 private fun key():SecretKey { val ks=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}; (ks.getKey("dmp-widget-aes-v1",null) as? SecretKey)?.let{return it}; val g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(KeyGenParameterSpec.Builder("dmp-widget-aes-v1",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());return g.generateKey() }
 @Synchronized fun put(name:String,value:String){val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());val encoded=Base64.encodeToString(c.iv+c.doFinal(value.toByteArray(Charsets.UTF_8)),Base64.NO_WRAP);check(prefs.edit().putString(name,encoded).commit())}
 @Synchronized fun get(name:String):String? {val encoded=prefs.getString(name,null)?:return null;return try{val b=Base64.decode(encoded,Base64.NO_WRAP);val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,b.copyOfRange(0,12)));String(c.doFinal(b.copyOfRange(12,b.size)),Charsets.UTF_8)}catch(_:Exception){null}}
 fun connection():org.json.JSONObject?=try{get("connection")?.let{org.json.JSONObject(it)}}catch(_:Exception){null}
 fun clear(){prefs.edit().clear().commit()}
 fun remove(name:String){prefs.edit().remove(name).commit()}
}
