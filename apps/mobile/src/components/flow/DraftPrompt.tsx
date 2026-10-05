import { useTranslation } from "react-i18next";
import { Button, Dialog } from "@toboggo/design-system";
import styles from "./Flow.module.css";

/**
 * Choix explicite devant un brouillon d'ajout de parc existant — jamais de
 * reprise silencieuse, jamais de suppression silencieuse.
 *
 * - `resume` : ouverture normale → « Reprendre mon ajout » / « Commencer un nouvel ajout ».
 * - `replace` : arrivée depuis un autre parcours (« Je ne trouve pas mon parc ») →
 *   prévient que commencer un nouvel ajout remplace l'ancien ; `onCancel` revient
 *   au parcours d'origine.
 */
export function DraftPrompt({
  mode,
  onResume,
  onNew,
  onCancel,
}: {
  mode: "resume" | "replace";
  onResume: () => void;
  onNew: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation("contribute");
  const replace = mode === "replace";
  return (
    <Dialog
      open
      // Pas de fermeture par un tap à côté : la décision doit être explicite.
      onClose={() => undefined}
      title={replace ? t("addPark.draft.replaceTitle") : t("addPark.draft.title")}
      actions={
        <div className={styles.dialogStack}>
          <Button block onClick={replace ? onNew : onResume}>
            {replace ? t("addPark.draft.new") : t("addPark.draft.resume")}
          </Button>
          <Button block variant="secondary" onClick={replace ? onResume : onNew}>
            {replace ? t("addPark.draft.resumeOld") : t("addPark.draft.new")}
          </Button>
          {replace && onCancel && (
            <Button block variant="ghost" onClick={onCancel}>
              {t("addPark.draft.cancel")}
            </Button>
          )}
        </div>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-muted)" }}>
        {replace ? t("addPark.draft.replaceBody") : t("addPark.draft.body")}
      </p>
    </Dialog>
  );
}
