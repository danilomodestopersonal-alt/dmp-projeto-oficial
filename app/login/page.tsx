import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="center-page">
      <section className="auth-card">
        <img src="/logo-danilo.jpg" alt="Danilo Modesto Personal Trainer" className="login-logo" />
        <h1>Danilo Modesto Personal</h1>
        <p>Entre para acessar seus alunos e treinos.</p>
        <LoginForm />
      </section>
    </main>
  );
}
