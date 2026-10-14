package br.com.dmp.widget
import java.net.URI
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
object WidgetRules {
 fun origin(value:String):String {val u=URI(value.trim());require(u.scheme=="https"&&u.host!=null&&u.rawUserInfo==null&&(u.port==-1||u.port==443));return "https://"+u.host.lowercase()}
 fun retainCache(status:Int)=status!=401
 fun sameConnection(initial:String?,current:String?)=initial!=null&&initial==current
 fun day(value:String)=LocalDate.parse(value).format(DateTimeFormatter.ofPattern("dd/MM"))
 fun updated(value:String)=Instant.parse(value).atZone(ZoneId.of("America/Sao_Paulo")).format(DateTimeFormatter.ofPattern("HH:mm"))
 fun next(time:String?,title:String?)=if(time==null||title==null)"Sem próximos atendimentos hoje" else "Próximo: $time • $title"
}
