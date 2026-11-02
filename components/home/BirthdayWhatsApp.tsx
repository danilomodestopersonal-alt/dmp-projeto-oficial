"use client";

import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {birthdayRecipient, copyBirthdayImage, downloadBirthdayImage, loadBirthdayImage, type BirthdayImage} from "@/lib/birthday-whatsapp";
import styles from "./BirthdayWhatsApp.module.css";

export function useBirthdayWhatsApp() {
  const [recipient, setRecipient] = useState<ReturnType<typeof birthdayRecipient> | null>(null);
  const [image, setImage] = useState<BirthdayImage | null>(null);
  const [preview, setPreview] = useState("");
  const [imageStatus, setImageStatus] = useState("Carregando a imagem de aniversário…");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(false), generation = useRef(0), panel = useRef<HTMLDivElement>(null);
  const close = () => {generation.current++; active.current = false; setBusy(false); setRecipient(null);};

  useEffect(() => {
    const controller = new AbortController(); let disposed = false, objectUrl = "";
    const timeout = setTimeout(() => controller.abort(), 15_000);
    void (async () => {
      try {
        const response = await fetch("/api/settings/profile", {cache:"no-store", signal:controller.signal});
        if (!response.ok) throw Error("Não foi possível consultar a imagem. Feche e atualize o DMP para tentar novamente.");
        const settings = await response.json();
        if (!settings?.data?.birthdayImage) throw Error("Nenhuma imagem de aniversário configurada. Cadastre a imagem em Configurações → Comunicação de aniversário.");
        const loaded = await loadBirthdayImage(settings.data.birthdayImage, controller.signal);
        if (disposed) return;
        objectUrl = URL.createObjectURL(loaded.blob); setPreview(objectUrl); setImage(loaded); setImageStatus("");
      } catch (error) {
        if (!disposed) setImageStatus(controller.signal.aborted ? "A imagem demorou a carregar. Atualize o DMP para tentar novamente." : error instanceof Error ? error.message : "Imagem indisponível. Atualize o DMP para tentar novamente.");
      } finally {clearTimeout(timeout);}
    })();
    return () => {disposed = true; generation.current++; active.current = false; controller.abort(); clearTimeout(timeout); if (objectUrl) URL.revokeObjectURL(objectUrl);};
  }, []);

  useEffect(() => {
    if (!recipient) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {event.preventDefault(); close();}
      if (event.key !== "Tab") return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),textarea') || []);
      const first = items[0], last = items[items.length - 1];
      if (!first) {event.preventDefault(); return;}
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {event.preventDefault(); last.focus();}
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {event.preventDefault(); first.focus();}
    };
    document.addEventListener("keydown", keydown);
    return () => {document.removeEventListener("keydown", keydown); document.body.style.overflow = overflow; previous?.focus();};
  }, [recipient]);

  async function sendBirthday(student: {name: string; phone?: string}) {
    if (active.current) return;
    active.current = true; const attempt = ++generation.current;
    const target = birthdayRecipient(student);
    setRecipient(target); setNotice("");
    if (!target.url) {active.current = false; return;}
    setBusy(true);
    try {
      // Copy before opening WhatsApp so the DMP keeps focus while requesting clipboard access.
      const copied = image ? await copyBirthdayImage(image) : false;
      if (attempt !== generation.current) return;
      if (copied) setNotice("Imagem copiada. No WhatsApp, cole a imagem e confira o texto antes de enviar. Se o texto não entrar como legenda, use Copiar mensagem abaixo.");
      else if (image) {
        try {downloadBirthdayImage(image); setNotice(`Download de ${image.filename} solicitado. No WhatsApp, anexe esse arquivo e confira o texto antes de enviar.`);}
        catch {setNotice("Não foi possível iniciar o download. Use Baixar imagem abaixo.");}
      }
      // No Web Share API, no automatic send, no attachment claim. Link always remains available.
      window.open(target.url, "_blank", "noopener,noreferrer");
    } finally {if (attempt === generation.current) {setBusy(false); active.current = false;}}
  }

  async function copyImage() {
    if (!image || busy) return; const attempt = generation.current; setBusy(true);
    const copied = await copyBirthdayImage(image);
    if (attempt !== generation.current) return;
    setNotice(copied ? "Imagem copiada. Cole na conversa do WhatsApp. Confira a mensagem e confirme o envio lá." : "O navegador não permitiu copiar a imagem. Use Baixar imagem e anexe o arquivo no WhatsApp.");
    setBusy(false);
  }

  const dialog = recipient && typeof document !== "undefined" ? createPortal(
    <div className={styles.backdrop} onMouseDown={event => {if (event.target === event.currentTarget) close();}}>
      <div className={styles.dialog} ref={panel} role="dialog" aria-modal="true" aria-labelledby="birthday-whatsapp-title" tabIndex={-1}>
        <div className={styles.heading}><h2 id="birthday-whatsapp-title">Parabéns para {recipient.name}</h2><button type="button" className="secondary" onClick={close} aria-label="Fechar parabéns">Fechar</button></div>
        {!recipient.url ? <p role="alert">Telefone WhatsApp ausente ou inválido no cadastro de {recipient.name}. Confira o telefone com DDD; para outro país, use + e o código do país. Nenhuma conversa foi aberta.</p> : <>
          <p>WhatsApp cadastrado: <strong>+{recipient.phone}</strong></p>
          <p>A mensagem fica preparada na conversa. A imagem precisa ser colada ou anexada; o envio é confirmado por você no WhatsApp.</p>
          {notice && <p role="status">{notice}</p>}
          {imageStatus && <p role="status">{imageStatus}</p>}
          {preview && <img className={styles.image} src={preview} alt="Imagem padrão de aniversário cadastrada no DMP"/>}
          <div className={styles.actions}>
            <a className="primary" href={recipient.url} target="_blank" rel="noopener noreferrer">Abrir WhatsApp de {recipient.name.trim().split(/\s+/)[0] || "destinatário"}</a>
            {image && <><button className="secondary" type="button" disabled={busy} onClick={() => void copyImage()}>Copiar imagem</button><button className="secondary" type="button" onClick={() => {try {downloadBirthdayImage(image); setNotice(`Download de ${image.filename} solicitado. Anexe o arquivo na conversa.`);} catch {setNotice("O download não pôde ser iniciado. Tente novamente.");}}}>Baixar imagem</button></>}
          </div>
          <label className={styles.message}>Mensagem personalizada<textarea readOnly rows={7} value={recipient.message}/></label>
          <button type="button" className="secondary" onClick={() => {if (!navigator.clipboard?.writeText) {setNotice("Selecione e copie o texto acima."); return;} void navigator.clipboard.writeText(recipient.message).then(() => setNotice("Mensagem copiada. Cole na legenda da imagem ou na conversa do WhatsApp."), () => setNotice("Selecione e copie o texto acima; o navegador não permitiu a cópia automática."));}}>Copiar mensagem</button>
          <p className="muted">Se o WhatsApp não abriu, toque no botão acima. No celular, você pode anexar a imagem baixada em Arquivos/Downloads. Nada é enviado automaticamente.</p>
        </>}
      </div>
    </div>, document.body) : null;
  return {sendBirthday, dialog};
}
