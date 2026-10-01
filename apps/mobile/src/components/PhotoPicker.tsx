import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";

// Sélecteur de photos partagé (AddPhotos + AddPark) : aperçus avec suppression,
// compteur, deux sources distinctes (caméra / photothèque) et conseil. Ne
// connaît ni la validation, ni l'upload, ni la règle « au moins une photo » :
// chaque parcours les garde — ce composant ne fait que remonter des `File`.
//
// Deux inputs distincts : `capture` force l'ouverture directe de l'appareil
// photo (un seul cliché) — l'imposer sur l'input photothèque empêchait tout
// accès à la pellicule sur mobile. L'input photothèque, sans `capture`, ouvre
// le sélecteur natif et accepte une sélection multiple.
export function PhotoPicker({
  previews,
  max,
  onFiles,
  onRemove,
  canPick,
  onRequireAuth,
  busy = false,
}: {
  previews: string[];
  max: number;
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
  /** Faux (invité) : aucun `<input type="file">` n'est rendu, le sélecteur natif ne s'ouvre jamais. */
  canPick: boolean;
  onRequireAuth: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation("contribute");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // annulation / re-sélection du même fichier
    if (files.length) onFiles(files);
  }

  return (
    <>
      {previews.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {previews.map((src, i) => (
            <div key={i} style={{ position: "relative" }}>
              <div style={{ aspectRatio: "1", borderRadius: 14, backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" }} />
              <button
                type="button"
                aria-label={t("common.removePhoto")}
                onClick={() => onRemove(i)}
                style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}
              >
                <Icon name="ic-close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 10 }}>
        {t("addPhotos.counter", { count: previews.length, max })}
      </p>

      {previews.length < max && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <PhotoSourceRow
            tone="primary"
            icon={<CameraIcon />}
            label={t("addPhotos.takePhoto")}
            disabled={busy}
            onClick={canPick ? () => cameraInputRef.current?.click() : onRequireAuth}
          />
          <PhotoSourceRow
            tone="neutral"
            icon={<GalleryIcon />}
            label={t("addPhotos.chooseFromLibrary")}
            disabled={busy}
            onClick={canPick ? () => libraryInputRef.current?.click() : onRequireAuth}
          />
          {canPick && (
            <>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={onChange} />
              <input ref={libraryInputRef} type="file" accept="image/*" multiple hidden onChange={onChange} />
            </>
          )}
        </div>
      )}

      <TipBlock label={t("photoTip.label")} text={t("photoTip.text")} />
    </>
  );
}

// Ligne pleine largeur « source de photo » (caméra / photothèque). Pictogrammes
// en SVG inline : pas de symbole caméra/photothèque dans `icons-sprite.svg`.
function PhotoSourceRow({
  tone,
  icon,
  label,
  onClick,
  disabled,
}: {
  tone: "primary" | "neutral";
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "15px 16px",
        borderRadius: 14,
        border: tone === "primary" ? "1px solid transparent" : "1px solid var(--color-border)",
        background: tone === "primary" ? "var(--color-primary-tint)" : "var(--color-surface)",
        color: "var(--color-text)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        font: "inherit",
        textAlign: "left",
      }}
    >
      <span style={{ display: "flex", color: tone === "primary" ? "var(--color-primary)" : "var(--color-text-muted)", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{label}</span>
      <Chevron />
    </button>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 16.5 15.5 11 6 20" />
    </svg>
  );
}

// Bloc Conseil — aussi utilisé seul par l'étape Confirmation d'AddPhotos.
export function TipBlock({ label, text }: { label: string; text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        background: "var(--color-warning-bg)",
        color: "var(--color-warning-text)",
        borderRadius: "var(--radius-sm)",
        padding: "12px 14px",
        fontSize: 13,
        marginTop: 16,
      }}
    >
      <BulbIcon />
      <span>
        <strong>{label}</strong> — {text}
      </span>
    </div>
  );
}

function BulbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.7v.3h5.6v-.3c0-.7.3-1.3.8-1.7A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-faint)", flexShrink: 0 }} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
