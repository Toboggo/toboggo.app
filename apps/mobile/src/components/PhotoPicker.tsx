import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button, Icon } from "@toboggo/design-system";
import styles from "./flow/Flow.module.css";

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
  showCounter = true,
}: {
  previews: string[];
  max: number;
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
  /** Faux (invité) : aucun `<input type="file">` n'est rendu, le sélecteur natif ne s'ouvre jamais. */
  canPick: boolean;
  onRequireAuth: () => void;
  busy?: boolean;
  /** Masque « n / max photos » (parcours à photo unique). */
  showCounter?: boolean;
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
      {previews.length < max && (
        <div className={styles.dropzone}>
          <CameraIcon size={34} />
          <div className={styles.dropzoneButtons}>
            <Button
              block
              disabled={busy}
              onClick={canPick ? () => cameraInputRef.current?.click() : onRequireAuth}
            >
              {t("addPhotos.takePhoto")}
            </Button>
            <Button
              block
              variant="secondary"
              disabled={busy}
              onClick={canPick ? () => libraryInputRef.current?.click() : onRequireAuth}
            >
              {t("addPhotos.chooseFromLibrary")}
            </Button>
          </div>
          {canPick && (
            <>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={onChange} />
              <input ref={libraryInputRef} type="file" accept="image/*" multiple={max > 1} hidden onChange={onChange} />
            </>
          )}
        </div>
      )}
      {busy && (
        <p className={styles.counter} role="status">
          {t("flow.photos.uploading")}
        </p>
      )}

      {previews.length > 0 && (
        <div className={styles.thumbGrid}>
          {previews.map((src, i) => (
            <div key={i} className={styles.thumbWrap}>
              <div className={styles.thumb2} style={{ backgroundImage: `url(${src})` }} />
              <button type="button" className={styles.thumbRemove} aria-label={t("common.removePhoto")} onClick={() => onRemove(i)}>
                <span className={styles.thumbRemoveDot}>
                  <Icon name="ic-close" size={14} />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {showCounter && (
        <p className={styles.counter}>{t("addPhotos.counter", { count: previews.length, max })}</p>
      )}

      <p className={styles.tipSoft}>
        {t("photoTip.label")} — {t("photoTip.text")}
      </p>
    </>
  );
}

function CameraIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.2" />
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
