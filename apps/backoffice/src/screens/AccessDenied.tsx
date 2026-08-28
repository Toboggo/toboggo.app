import { Button } from "@toboggo/design-system";
import { useOrgSession } from "../lib/orgSession";

export default function AccessDenied() {
  const signOut = useOrgSession((s) => s.signOut);
  const email = useOrgSession((s) => s.userEmail);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
      <div style={{ maxWidth: 380 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h1 style={{ fontSize: 20, marginTop: 12 }}>Accès non autorisé</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginTop: 8 }}>
          Le compte <strong>{email}</strong> n'est associé à aucune équipe Toboggo ni collectivité. Sans invitation,
          l'accès au back office n'est pas possible — contactez un administrateur pour être invité.
        </p>
        <Button variant="secondary" style={{ marginTop: 20 }} onClick={() => signOut()}>
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}
