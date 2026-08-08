"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import styles from "./BackupCenter.module.css";

type BackupKind = "MANUAL" | "AUTO" | "PRE_RESTORE";
type BackupItem = {
  id: string;
  kind: BackupKind;
  createdAt: string;
  checksum: string;
  sizeBytes: number;
  rowCount: number;
};

type RestoreTarget = { type: "stored"; id: string } | { type: "file"; backup: unknown; name: string } | null;

const KIND_LABEL: Record<BackupKind, string> = {
  MANUAL: "Manual",
  AUTO: "Automático",
  PRE_RESTORE: "Segurança pré-restauração",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function BackupCenter() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget>(null);
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/backup", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Falha ao consultar backups.");
      setBackups(result.backups || []);
      if (result.automatic?.created) setMessage("Backup automático diário criado agora.");
    } catch (err) {
      console.error(err);
      setError("Não foi possível consultar os backups.");
    } finally {
      setLoading(false);
    }
  }

  async function createBackup() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/backup", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Falha ao criar backup.");
      setMessage(`Backup criado com sucesso: ${result.backup.rowCount} blocos de dados protegidos.`);
      await load();
    } catch (err) {
      console.error(err);
      setError("Não foi possível criar o backup.");
    } finally { setBusy(false); }
  }

  function download(id: string) {
    window.location.href = `/api/backup/download/${encodeURIComponent(id)}`;
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setMessage("");
    try {
      const parsed = JSON.parse(await file.text());
      setRestoreTarget({ type: "file", backup: parsed, name: file.name });
      setConfirmation("");
    } catch {
      setError("O arquivo escolhido não é um JSON de backup válido.");
    }
  }

  async function restore() {
    if (!restoreTarget || confirmation !== "RESTAURAR") return;
    setBusy(true); setError(""); setMessage("");
    try {
      const body = restoreTarget.type === "stored"
        ? { backupId: restoreTarget.id }
        : { backup: restoreTarget.backup };
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Falha ao restaurar backup.");
      setRestoreTarget(null); setConfirmation("");
      setMessage(`Restauração concluída: ${result.restoredRows} blocos restaurados. Um backup de segurança foi criado antes da restauração.`);
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Não foi possível restaurar o backup.");
    } finally { setBusy(false); }
  }

  const latest = backups[0];
  const manualCount = useMemo(() => backups.filter(item => item.kind === "MANUAL").length, [backups]);
  const autoCount = useMemo(() => backups.filter(item => item.kind === "AUTO").length, [backups]);

  return (
    <section className={styles.wrapper}>
      <div className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Proteção de dados</p>
          <h2>Backup e Recuperação</h2>
          <p>Crie cópias completas dos dados do DMP, baixe para guardar fora do servidor e restaure com segurança quando necessário.</p>
        </div>
        <div className={styles.heroActions}>
          <button className={styles.primary} onClick={() => void createBackup()} disabled={busy}>🛡️ {busy ? "Processando..." : "Criar backup agora"}</button>
          <label className={styles.secondary}>📂 Restaurar de arquivo<input type="file" accept="application/json,.json" onChange={event => void chooseFile(event)} /></label>
        </div>
      </div>

      <div className={styles.stats}>
        <div><strong>{latest ? formatDate(latest.createdAt) : "—"}</strong><span>Último backup</span></div>
        <div><strong>{backups.length}</strong><span>Cópias visíveis</span></div>
        <div><strong>{manualCount}</strong><span>Manuais</span></div>
        <div><strong>{autoCount}</strong><span>Automáticos</span></div>
      </div>

      <div className={styles.notice}>
        <strong>Como funciona o automático:</strong> ao abrir esta área, o DMP garante pelo menos um snapshot automático a cada 20 horas. O pacote também inclui um script para agendamento diário no Render.
      </div>

      {message ? <div className={styles.success}>{message}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.panel}>
        <div className={styles.panelHeader}><div><h3>Histórico de backups</h3><p>Backups automáticos antigos são retidos por 45 dias; backups manuais não são apagados automaticamente.</p></div><button className={styles.smallButton} onClick={() => void load()} disabled={loading}>Atualizar</button></div>
        {loading ? <div className={styles.empty}>Carregando backups...</div> : backups.length === 0 ? <div className={styles.empty}>Nenhum backup encontrado.</div> : (
          <div className={styles.list}>
            {backups.map(item => (
              <article key={item.id} className={styles.row}>
                <div><span className={`${styles.kind} ${styles[item.kind.toLowerCase()]}`}>{KIND_LABEL[item.kind]}</span><strong>{formatDate(item.createdAt)}</strong><small>{item.rowCount} blocos · {formatBytes(item.sizeBytes)} · SHA-256 {item.checksum.slice(0, 12)}…</small></div>
                <div className={styles.rowActions}><button onClick={() => download(item.id)}>Baixar</button><button className={styles.restoreButton} onClick={() => { setRestoreTarget({ type: "stored", id: item.id }); setConfirmation(""); }}>Restaurar</button></div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className={styles.securityNote}>
        <strong>Segredos não entram no arquivo.</strong> Conexões OAuth, tokens e credenciais (como o vínculo do Strava) são excluídos do backup exportável. Se necessário, essas integrações podem ser reconectadas depois.
      </div>

      {restoreTarget ? <div className={styles.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget && !busy) setRestoreTarget(null); }}><div className={styles.modal}>
        <h3>⚠️ Confirmar restauração</h3>
        <p>{restoreTarget.type === "file" ? `Arquivo: ${restoreTarget.name}` : "Você selecionou um backup armazenado no DMP."}</p>
        <p>Antes de restaurar, o sistema cria automaticamente um backup de segurança do estado atual. A restauração substitui os blocos existentes pelos valores do backup selecionado.</p>
        <label>Para continuar, digite <strong>RESTAURAR</strong><input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value.toUpperCase())} /></label>
        <div className={styles.modalActions}><button onClick={() => setRestoreTarget(null)} disabled={busy}>Cancelar</button><button className={styles.danger} onClick={() => void restore()} disabled={busy || confirmation !== "RESTAURAR"}>{busy ? "Restaurando..." : "Restaurar agora"}</button></div>
      </div></div> : null}
    </section>
  );
}
