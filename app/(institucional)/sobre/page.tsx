import type { Metadata } from "next";
import styles from "../publico.module.css";
export const metadata: Metadata = { title: "DMP Personal Trainer — sobre o aplicativo", description: "Conheça o DMP, ferramenta de Danilo Modesto para organizar alunos, treinos, aulas e compromissos, com integração ao Google Agenda." };
export default function AboutPage() {
  return <>
    <p className={styles.eyebrow}>Danilo Modesto · Personal Trainer</p>
    <h1>Alunos, treinos e agenda.<br />Tudo no mesmo lugar.</h1>
    <p className={styles.intro}>O DMP Personal Trainer é uma ferramenta de uso pessoal e profissional de Danilo Modesto para organizar sua rotina de atendimentos. O acesso às informações de alunos e à área de gestão é restrito.</p>
    <div className={styles.grid}>
      <section><h2>Alunos e treinos</h2><p>Organização de cadastros, avaliações, treinos e histórico de aulas realizadas.</p></section>
      <section><h2>Agenda e compromissos</h2><p>Consulta de horários, aulas e compromissos, com integração ao Google Agenda mediante autorização.</p></section>
      <section><h2>Rotina de gestão</h2><p>Acompanhamento de presenças, atividades e controles financeiros no ambiente privado do DMP.</p></section>
    </div>
    <section className={styles.google}><h2>Como o DMP usa o Google Agenda</h2>
      <p>Ao conectar sua conta, você autoriza o DMP a consultar e gerenciar eventos para exibir a agenda e executar as ações de organização disponíveis no aplicativo. A permissão solicitada é de eventos do Google Agenda; ela não concede acesso ao conteúdo do Gmail ou do Google Drive.</p>
      <p>Os widgets DMP — Hoje e DMP Agenda mostram os dados no celular autorizado, incluindo o último conteúdo sincronizado quando uma atualização não é possível. É possível remover o acesso pela sua Conta Google e revogar um dispositivo no DMP.</p>
      <p>Leia a <a href="/privacidade">Política de Privacidade</a> e os <a href="/termos">Termos de Uso</a> para conhecer o tratamento dos dados e as condições de utilização.</p>
    </section>
  </>;
}
