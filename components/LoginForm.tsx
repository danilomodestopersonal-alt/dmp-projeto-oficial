"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("danilo@dmp.local");
  const [password, setPassword] = useState("Dmp@2026");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email, password})
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Não foi possível entrar.");
        return;
      }

      router.push("/app");
      router.refresh();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        E-mail
        <input type="email" value={email} onChange={event => setEmail(event.target.value)} required />
      </label>

      <label>
        Senha
        <input type="password" value={password} onChange={event => setPassword(event.target.value)} required />
      </label>

      {error ? <p className="error">{error}</p> : null}

      <button className="primary" disabled={loading}>
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
