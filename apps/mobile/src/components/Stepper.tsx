import { Icon } from "@toboggo/design-system";
import styles from "./Stepper.module.css";

/**
 * Explicit, labelled step progression — shared across the Toboggo
 * contribution wizards (Ajouter un parc, Donner un avis, Signaler un
 * problème, Ajouter des photos). Replaces the plain dots for a wizard that
 * opts in by passing `steps` to `WizardHeader`; a wizard that doesn't still
 * gets the original dots, unaffected.
 *
 * Visual states: done (green check), current (highlighted number), future
 * (neutral number) — connected by a line that fills in as steps complete.
 */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className={styles.wrap}>
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "current" : "future";
        return (
          <div className={styles.step} key={label}>
            {i > 0 && <div className={styles.line} data-done={i <= current ? "1" : undefined} />}
            <div className={styles.circle} data-state={state}>
              {state === "done" ? <Icon name="ic-check" size={12} /> : i + 1}
            </div>
            <span className={styles.label} data-state={state}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
