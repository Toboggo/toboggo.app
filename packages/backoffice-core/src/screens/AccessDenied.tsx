import { Button, Icon } from "@toboggo/design-system";
import { useOrgSession } from "../lib/orgSession";
import styles from "./AccessDenied.module.css";

export default function AccessDenied() {
  const signOut = useOrgSession((s) => s.signOut);
  const email = useOrgSession((s) => s.userEmail);
  const reason = useOrgSession((s) => s.accessDeniedReason);
  const surface = useOrgSession((s) => s.surface);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          <Icon name="ic-shield" size={28} />
        </div>
        <h1 className={styles.title}>Accès non autorisé</h1>
        {reason === "wrong-surface" ? (
          <p className={styles.text}>
            Le compte <strong>{email}</strong> n'a pas accès à{" "}
            {surface === "admin" ? "l'espace Admin Toboggo" : "l'espace Collectivités"}. Il est rattaché à l'autre espace
            Toboggo : connectez-vous depuis celui-ci.
          </p>
        ) : (
          <p className={styles.text}>
            Le compte <strong>{email}</strong> n'est associé à aucune équipe Toboggo ni collectivité. Sans invitation,
            l'accès au back office n'est pas possible — contactez un administrateur pour être invité.
          </p>
        )}
        <Button variant="secondary" className={styles.action} onClick={() => signOut()}>
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}
