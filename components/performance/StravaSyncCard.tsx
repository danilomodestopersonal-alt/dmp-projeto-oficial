"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./PerformancePage.module.css";

type StravaStatus = {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  athlete?: { id: number; name: string } | null;
  lastSyncAt?: string | null;
  lastSync?: { fetched: number; added: number; updated: number } | null;
  error?: string;
};

function fmtWhen(value?: string | null) {
  if (!value) return "Ainda não sincronizado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sincronização registrada";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function StravaSyncCard({ onSynced }: { onSynced: () => void }) {
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const autoAttempted = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/strava/status", { cache: "no-store" });
      const result = await response.json();
      setStatus(result);
      return result as StravaStatus;
    } catch (error) {
      console.error(error);
      setStatus({ ok: false, configured: false, connected: false, error: "Falha ao consultar Strava." });
      return null;
    }
  }, []);

  const syncNow = useCallback(async (automatic = false) => {
    setSyncing(true);
    if (!automatic) setMessage("");
    try {
      const response = await fetch("/api/strava/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Falha ao sincronizar Strava.");
      setMessage(result.added > 0
        ? `${result.added} nova${result.added === 1 ? "" : "s"} atividade${result.added === 1 ? "" : "s"} importada${result.added === 1 ? "" : "s"}.`
        : "Strava atualizado. Nenhuma atividade nova.");
      await loadStatus();
      onSynced();
    } catch (error) {
      console.error(error);
      if (!automatic) setMessage(error instanceof Error ? error.message : "Falha ao sincronizar Strava.");
    } finally {
      setSyncing(false);
    }
  }, [loadStatus, onSynced]);

  useEffect(() => {
    void loadStatus().then(result => {
      if (!result?.connected || autoAttempted.current) return;
      autoAttempted.current = true;
      const last = result.lastSyncAt ? new Date(result.lastSyncAt).getTime() : 0;
      const stale = !last || Date.now() - last > 30 * 60 * 1000;
      if (stale) void syncNow(true);
    });
  }, [loadStatus, syncNow]);

  async function disconnect() {
    if (!window.confirm("Desconectar o Strava do DMP? Seu histórico no Performance será preservado.")) return;
    setMessage("");
    try {
      const response = await fetch("/api/strava/disconnect", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Falha ao desconectar Strava.");
      setMessage("Strava desconectado. O histórico do Performance foi mantido.");
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao desconectar Strava.");
    }
  }

  if (!status) {
    return <section className={styles.stravaCard}><div><span className={styles.kicker}>STRAVA</span><h2>Verificando conexão...</h2></div><div className={styles.stravaMark}>S</div></section>;
  }

  if (!status.configured) {
    return (
      <section className={styles.stravaCard}>
        <div><span className={styles.kicker}>STRAVA SYNC</span><h2>Credenciais pendentes</h2><p>Configure STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET no servidor para habilitar a conexão.</p></div>
        <div className={styles.stravaMark}>S</div>
      </section>
    );
  }

  if (!status.connected) {
    return (
      <section className={styles.stravaCard}>
        <div>
          <span className={styles.kicker}>STRAVA SYNC</span>
          <h2>Conecte seu Strava</h2>
          <p>Autorize o DMP uma vez. Depois, ao abrir o Performance, as atividades novas serão buscadas automaticamente.</p>
          {message ? <p className={styles.stravaMessage}>{message}</p> : null}
          <div className={styles.stravaActions}><a className={styles.stravaConnect} href="/api/strava/auth">Conectar Strava</a></div>
        </div>
        <div className={styles.stravaMark}>S</div>
      </section>
    );
  }

  return (
    <section className={styles.stravaCard}>
      <div>
        <span className={styles.kicker}>STRAVA CONECTADO</span>
        <h2>{status.athlete?.name || "Sua conta Strava"}</h2>
        <p>Última sincronização: {fmtWhen(status.lastSyncAt)}. O DMP verifica novas atividades automaticamente ao abrir o Performance.</p>
        {status.lastSync ? <p className={styles.stravaMeta}>Última busca: {status.lastSync.fetched} encontrada(s), {status.lastSync.added} nova(s), {status.lastSync.updated} atualizada(s).</p> : null}
        {message ? <p className={styles.stravaMessage}>{message}</p> : null}
        <div className={styles.stravaActions}>
          <button className="primary" disabled={syncing} onClick={() => void syncNow(false)}>{syncing ? "Sincronizando..." : "Sincronizar agora"}</button>
          <button className="secondary" disabled={syncing} onClick={() => void disconnect()}>Desconectar</button>
        </div>
      </div>
      <div className={styles.stravaMark}>S</div>
    </section>
  );
}
