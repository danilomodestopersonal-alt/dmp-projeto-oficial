# DMP — Hoje (Android companheiro)

Kotlin + AppWidget/RemoteViews; package `br.com.dmp.widget`, minSdk26 (Android8), compileSdk35/targetSdk35 (Android15), versão0.1.0. Sem PlayStore. Debug APK para homologação.

Build com Java17 e Android SDK35/BuildTools35.0.0: `gradlew.bat assembleDebug lintDebug testDebugUnitTest` no Windows, ou `./gradlew` no Linux. APK gerado em `app/build/outputs/apk/debug/app-debug.apk`. O APK já compilado é entregue separadamente; não é necessário Android Studio para instalar no Samsung.

O módulo fica isolado do web/Render. Não precisa alterar o deploy nem variáveis de ambiente do Render. O backend usa a conexão Google já configurada, via aprovação autenticada em `/widget-android`. Use o endereço HTTPS canônico do DMP (o mesmo de APP_URL, quando configurado).

O dispositivo gera prova aleatória de256bits e abre a autorização no navegador somente com ID público. A credencial nunca aparece em tela/URL/log e é cifrada no Android Keystore. O servidor guarda apenas hash da credencial e cifra a autorização Google com chave derivada do GOOGLE_CLIENT_SECRET já existente. Revogação em `/widget-android` invalida o dispositivo e apaga sua autorização Google cifrada. Rotação desse segredo Google exige reconexão dos dispositivos.

Sem fórmulas Android: quatro números e próximo item vêm do GET `/api/widget/today`. A lógica do servidor espelha literalmente o Resumo/Home e sua identificação oficial de alunos; os testes detectam divergência das regras. Não há leitura/gravação Financeiro nem uso de PIN.

JobScheduler e AppWidget solicitam atualização aproximadamente a cada30min; Android/Doze/Samsung podem adiar. Sem atualização em tempo real. Rede indisponível mantém cache cifrado e indica último horário.401/revogação apaga credencial e cache e pede reconexão. Solicitações antigas não sobrescrevem dados de outra conexão. Jobs persistem após reinício, depois de desbloquear o aparelho; não funciona após "Forçar parada" até reabrir o app.

Fase2 (não implementada): cores por tipo, próximos2/3, atalhos, presença, abrir aluno, treino/compromissos, atualização manual, tamanhos extras, escuro e notificações. Release/signing/PlayStore exigem rodada própria; não use este APK debug como distribuição pública.
