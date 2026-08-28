import { useState } from "react";
import { Button, Input, PasswordInput, Logo } from "@toboggo/design-system";
import { signIn } from "@toboggo/shared";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
    } catch {
      setError("E-mail ou mot de passe incorrect.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg-alt)" }}>
      <form onSubmit={submit} style={{ width: 360, background: "var(--color-surface)", borderRadius: 20, padding: 32, boxShadow: "var(--shadow-lg)" }}>
        <Logo size={30} suffix="Back office" />
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "12px 0 24px" }}>Réservé à l'équipe Toboggo et aux collectivités partenaires.</p>
        {error && (
          <div style={{ background: "var(--color-error-tint)", color: "var(--color-error)", padding: 10, borderRadius: 10, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <PasswordInput label="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <Button type="submit" block loading={loading} style={{ marginTop: 8 }}>
            Se connecter
          </Button>
        </div>
      </form>
    </div>
  );
}
