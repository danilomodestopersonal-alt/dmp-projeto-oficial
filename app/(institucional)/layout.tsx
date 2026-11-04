import type { ReactNode } from "react";
import styles from "./publico.module.css";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className={styles.site}>
    <a className={styles.skip} href="#conteudo">Ir para o conteúdo</a>
    <header className={styles.header}>
      <a href="/sobre" aria-label="DMP Personal Trainer — apresentação"><img src="/logo-danilo.jpg" alt="Danilo Modesto Personal Trainer" width="176" height="94" /></a>
      <a className={styles.enter} href="/login">Entrar no DMP <span aria-hidden="true">↗</span></a>
    </header>
    <main id="conteudo" className={styles.main}>{children}</main>
    <footer className={styles.footer}>
      <strong>DMP Personal Trainer</strong>
      <nav aria-label="Informações do aplicativo"><a href="/sobre">Sobre o DMP</a><a href="/privacidade">Privacidade</a><a href="/termos">Termos de uso</a></nav>
      <p>Responsável: Danilo Modesto · <a href="mailto:danilomodestopersonal@hotmail.com">danilomodestopersonal@hotmail.com</a></p>
    </footer>
  </div>;
}
