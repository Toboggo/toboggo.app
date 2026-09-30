import { create } from "zustand";

/**
 * Mises à jour de la PWA — enregistrement du service worker et application
 * d'une nouvelle version sans réinstallation.
 *
 * Le `sw.js` généré (vite-plugin-pwa, registerType "autoUpdate") fait
 * `skipWaiting()` + `clientsClaim()` : dès qu'un nouveau build est détecté il
 * prend le contrôle de la page ouverte (`controllerchange`), mais la page
 * continue d'exécuter l'ancien JS jusqu'au prochain chargement. Ce module :
 *
 * - vérifie activement la présence d'un nouveau `sw.js` (démarrage, retour au
 *   premier plan, toutes les 30 min) — sur iOS une PWA est suspendue/reprise
 *   sans jamais naviguer, donc sans ça le navigateur ne revérifie pas ;
 * - recharge la page une seule fois quand un nouveau SW prend le contrôle,
 *   SAUF si l'utilisateur est en pleine saisie : bannière « Mettre à jour » ;
 * - se protège des chunks obsolètes (`vite:preloadError`).
 *
 * Pourquoi pas le `registerSW` de `virtual:pwa-register` : en mode autoUpdate
 * il recharge la page sans condition dès l'activation, ce qui détruirait une
 * contribution en cours. L'enregistrement est donc fait ici, à la main (et
 * `injectRegister: false` évite tout double enregistrement).
 */

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** Fenêtre pendant laquelle un second reload automatique est refusé (anti-boucle). */
export const RELOAD_GUARD_WINDOW_MS = 60 * 1000;
export const RELOAD_GUARD_KEY = "toboggo:pwa-last-reload";

/** Vrai quand une nouvelle version est prête mais non appliquée (saisie en cours). */
export const usePwaUpdateStore = create<{ updateAvailable: boolean }>(() => ({ updateAvailable: false }));

/** Routes de formulaires / wizards : recharger y ferait perdre la saisie. */
const FORM_ROUTE_PREFIXES = [
  "/login",
  "/add",
  "/rate",
  "/report",
  "/photo-add",
  "/contribute",
  "/profile/edit",
  "/profile/children/",
  "/profile/account",
  "/contact",
  "/group",
];

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["button", "submit", "checkbox", "radio", "range", "reset", "image", "file"].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/** L'utilisateur est-il au milieu d'une saisie susceptible d'être perdue ? */
export function isUserBusy(doc: Document = document, pathname: string = window.location.pathname): boolean {
  if (FORM_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`))) {
    return true;
  }
  return isEditable(doc.activeElement);
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Recharge la page, sauf si un reload automatique a déjà eu lieu dans la
 * fenêtre de garde (sessionStorage). Retourne false si le reload est refusé.
 * Si sessionStorage est inaccessible, on refuse : mieux vaut ne pas recharger
 * que risquer une boucle.
 */
export function reloadOnce(
  reload: () => void = () => window.location.reload(),
  storage: StorageLike | null = safeSessionStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(RELOAD_GUARD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_WINDOW_MS) return false;
    storage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

function safeSessionStorage(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Action du bouton « Mettre à jour » : choix explicite, donc hors garde. */
export function applyPendingUpdate(reload: () => void = () => window.location.reload()): void {
  const storage = safeSessionStorage();
  try {
    storage?.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* sans incidence : le reload est voulu */
  }
  reload();
}

export interface PwaUpdateDeps {
  serviceWorker: ServiceWorkerContainer;
  doc: Document;
  win: Pick<Window, "addEventListener" | "setInterval" | "clearInterval">;
  isBusy: () => boolean;
  reload: () => void;
  storage: StorageLike | null;
  scriptUrl: string;
}

function defaultDeps(): PwaUpdateDeps | null {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return {
    serviceWorker: navigator.serviceWorker,
    doc: document,
    win: window,
    isBusy: () => isUserBusy(),
    reload: () => window.location.reload(),
    storage: safeSessionStorage(),
    scriptUrl: "/sw.js",
  };
}

/**
 * Enregistre le service worker et branche les vérifications de mise à jour.
 * Retourne une fonction de nettoyage (utile aux tests).
 */
export function initPwaUpdates(overrides?: Partial<PwaUpdateDeps>): () => void {
  const deps = { ...defaultDeps(), ...overrides } as PwaUpdateDeps | null;
  if (!deps || !deps.serviceWorker) return () => {};
  const { serviceWorker, doc, win, isBusy, reload, storage, scriptUrl } = deps;

  // Sans contrôleur au chargement, le premier `controllerchange` n'est que la
  // prise de contrôle de la toute première installation : pas une mise à jour.
  let hadController = Boolean(serviceWorker.controller);
  let registration: ServiceWorkerRegistration | undefined;

  const checkForUpdate = () => {
    registration?.update().catch(() => {
      /* hors ligne / réseau instable : on réessaiera au prochain déclencheur */
    });
  };

  const onControllerChange = () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (isBusy()) {
      usePwaUpdateStore.setState({ updateAvailable: true });
      return;
    }
    reloadOnce(reload, storage);
  };
  serviceWorker.addEventListener("controllerchange", onControllerChange);

  const onVisibility = () => {
    if (doc.visibilityState === "visible") checkForUpdate();
  };
  doc.addEventListener("visibilitychange", onVisibility);

  const register = () => {
    serviceWorker
      .register(scriptUrl, { scope: "/" })
      .then((reg) => {
        registration = reg;
        checkForUpdate(); // démarrage : ne pas attendre le prochain déclencheur
      })
      .catch(() => {
        /* SW indisponible (contexte non sécurisé, navigation privée…) : l'app reste fonctionnelle */
      });
  };
  if (doc.readyState === "complete") register();
  else win.addEventListener("load", register);

  const interval = win.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

  return () => {
    serviceWorker.removeEventListener("controllerchange", onControllerChange);
    doc.removeEventListener("visibilitychange", onVisibility);
    win.clearInterval(interval);
  };
}

/**
 * Un chunk hashé d'un ancien build n'existe plus sur le serveur (déploiement
 * entre-temps) : un reload suffit à récupérer le nouvel index.html. Un seul
 * reload (garde sessionStorage) ; en pleine saisie, on propose plutôt la
 * bannière et on laisse l'erreur se propager comme avant.
 */
export function initPreloadErrorGuard(
  target: Pick<Window, "addEventListener"> = window,
  deps: { isBusy?: () => boolean; reload?: () => void; storage?: StorageLike | null } = {},
): void {
  const isBusy = deps.isBusy ?? (() => isUserBusy());
  target.addEventListener("vite:preloadError", (event) => {
    if (isBusy()) {
      usePwaUpdateStore.setState({ updateAvailable: true });
      return;
    }
    const storage = deps.storage === undefined ? safeSessionStorage() : deps.storage;
    if (reloadOnce(deps.reload, storage)) event.preventDefault();
  });
}
