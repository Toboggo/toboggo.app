import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button, Card } from "@toboggo/design-system";

interface Props {
  children: ReactNode;
  /** Changing this value (e.g. the route pathname) resets a tripped boundary,
   * so navigating away from a broken screen recovers the app without a full
   * page reload. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Back-office socle (Lot 1 — audit §6 bis / §20): a React render error must
 * never fall through to a blank/white screen. Mounted twice in `App.tsx` —
 * once around the whole shell (catches a failure in the sidebar/nav itself),
 * once around the routed screen content, keyed by pathname (catches a failure
 * in one screen without taking down the rest of the app).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "48px 16px" }}>
        <Card style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Une erreur est survenue</h1>
          <p style={{ fontSize: 13.5, color: "var(--color-text-muted)", marginBottom: 20 }}>
            Cet écran n'a pas pu s'afficher correctement. Vous pouvez réessayer, ou recharger la
            page si le problème persiste.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <Button onClick={this.retry}>Réessayer</Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Recharger la page
            </Button>
          </div>
          <details style={{ marginTop: 16, textAlign: "left", fontSize: 11.5, color: "var(--color-text-faint)" }}>
            <summary style={{ cursor: "pointer" }}>Détail technique</summary>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{this.state.error.message}</pre>
          </details>
        </Card>
      </div>
    );
  }
}
