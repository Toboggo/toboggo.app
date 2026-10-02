import { Navigate, useSearchParams } from "react-router-dom";

/** Ancienne URL /login-method (écran de choix supprimé) → formulaire de connexion, paramètres conservés. */
export default function LoginMethodRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (!next.has("mode")) next.set("mode", "login");
  return <Navigate to={`/login?${next.toString()}`} replace />;
}
