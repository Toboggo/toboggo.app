import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Button, Icon, Select, useToast } from "@toboggo/design-system";
import {
  listFeatures,
  listParkFeatures,
  logActivity,
  removeParkFeature,
  setParkFeature,
  type Feature,
  type ParkFeature,
  type Park,
} from "@toboggo/shared";
import { useOrgScope } from "../../lib/orgScope";
import { useOrgSession } from "../../lib/orgSession";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { queryClient } from "../../lib/queryClient";
import { featureLabelBO, featureValueLabelBO, groupFeatures, humanValueOptions, isValueFeature } from "../../lib/featureCatalogue";
import styles from "../ParkDetail.module.css";

// ── Draft model ──────────────────────────────────────────────────────────
type Draft =
  | { kind: "unset" }
  | { kind: "available" }
  | { kind: "unavailable" }
  | { kind: "temp" } // status = temporarily_unavailable — preserved, never re-written
  | { kind: "value"; value: string };

const UNSET: Draft = { kind: "unset" };

/** DB row → editable draft. `unknown` status, `value = "unknown"` and a
 * missing row all collapse to "unset" (= non renseigné). An imported
 * `temporarily_unavailable` maps to its own "temp" draft: it stays exactly
 * that unless the user explicitly picks Oui / Non / Non renseigné. */
function pfToDraft(pf: ParkFeature | undefined, valueFeature: boolean): Draft {
  if (!pf) return UNSET;
  if (valueFeature) {
    return pf.value != null && pf.value !== "unknown" ? { kind: "value", value: pf.value } : UNSET;
  }
  if (pf.status === "available") return { kind: "available" };
  if (pf.status === "unavailable") return { kind: "unavailable" };
  if (pf.status === "temporarily_unavailable") return { kind: "temp" };
  return UNSET;
}

function draftEq(a: Draft, b: Draft): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "value" || b.kind !== "value" || a.value === b.value;
}

type ReadState = "yes" | "no" | "temp" | "value" | null;
function readState(pf: ParkFeature | undefined, valueFeature: boolean): ReadState {
  if (!pf) return null;
  if (valueFeature) return pf.value != null && pf.value !== "unknown" ? "value" : null;
  if (pf.status === "available") return "yes";
  if (pf.status === "unavailable") return "no";
  if (pf.status === "temporarily_unavailable") return "temp";
  return null;
}

// ── Tri-state control (real radiogroup, not a borrowed tablist) ───────────
type TriValue = "available" | "unavailable" | "temp" | "unset";
const TRI_BASE: { value: Exclude<TriValue, "temp">; label: string }[] = [
  { value: "available", label: "Oui" },
  { value: "unavailable", label: "Non" },
  { value: "unset", label: "Non renseigné" },
];
const TEMP_OPTION = { value: "temp" as const, label: "Temp. indisponible" };

function TriState({
  value,
  onChange,
  disabled,
  labelledBy,
  /** Only true for a row that arrived as `temporarily_unavailable` — adds a
   * 4th contextual option so that state is represented explicitly instead of
   * masquerading as "Non". Never shown on the other rows. */
  showTemp,
}: {
  value: TriValue;
  onChange: (v: TriValue) => void;
  disabled?: boolean;
  labelledBy: string;
  showTemp?: boolean;
}) {
  const options: { value: TriValue; label: string }[] = showTemp
    ? [TRI_BASE[0], TRI_BASE[1], TEMP_OPTION, TRI_BASE[2]]
    : TRI_BASE;
  const idx = options.findIndex((o) => o.value === value);
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
  }
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={styles.triState} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            className={clsx(
              styles.triOpt,
              selected && o.value === "available" && styles.triYes,
              selected && o.value === "unavailable" && styles.triNo,
              selected && o.value === "temp" && styles.triTemp,
              selected && o.value === "unset" && styles.triUnset,
            )}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Stable empty-array identities: a `useQuery(... ) ?? []` inline default would
// hand a fresh array to the memos below on every render → infinite re-render.
const NO_FEATURES: Feature[] = [];
const NO_PARK_FEATURES: ParkFeature[] = [];

// ── Panel ────────────────────────────────────────────────────────────────
export function FeaturesPanel({
  park,
  canEdit,
  onDirtyChange,
}: {
  park: Park;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { communeId } = useOrgScope();
  const userName = useOrgSession((s) => s.userName);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  // Which edit-mode categories are open. Empty = "not touched yet" → the first
  // category defaults open, the rest closed; every category stays freely
  // toggleable (no exclusive accordion).
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const { data: catalogueData, isLoading: catLoading } = useQuery({
    queryKey: ["features-catalogue"],
    queryFn: () => listFeatures(),
  });
  const { data: parkFeaturesData, isLoading: pfLoading } = useQuery({
    queryKey: ["park-features", park.id],
    queryFn: () => listParkFeatures(park.id),
  });
  const catalogue = catalogueData ?? NO_FEATURES;
  const parkFeatures = parkFeaturesData ?? NO_PARK_FEATURES;

  const groups = useMemo(() => groupFeatures(catalogue), [catalogue]);
  const allFeatures = useMemo(() => groups.flatMap((g) => g.features), [groups]);
  const pfByFeatureId = useMemo(() => {
    const m: Record<string, ParkFeature> = {};
    for (const pf of parkFeatures) m[pf.feature_id] = pf;
    return m;
  }, [parkFeatures]);

  const initialByFeature = useMemo(() => {
    const m: Record<string, Draft> = {};
    for (const f of allFeatures) m[f.id] = pfToDraft(pfByFeatureId[f.id], isValueFeature(f));
    return m;
  }, [allFeatures, pfByFeatureId]);

  const [draft, setDraft] = useState<Record<string, Draft>>({});
  useEffect(() => {
    if (!editing) setDraft(initialByFeature);
  }, [initialByFeature, editing]);

  const changedIds = useMemo(
    () => (editing ? allFeatures.filter((f) => !draftEq(draft[f.id] ?? UNSET, initialByFeature[f.id] ?? UNSET)).map((f) => f.id) : []),
    [editing, allFeatures, draft, initialByFeature],
  );
  const dirty = changedIds.length > 0;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const answeredCount = allFeatures.filter(
    (f) => readState(pfByFeatureId[f.id], isValueFeature(f)) !== null,
  ).length;

  const { run: save, pending: saving } = useAsyncAction(
    async () => {
      const changed = allFeatures.filter((f) => changedIds.includes(f.id));
      const failed: string[] = [];
      for (const f of changed) {
        const d = draft[f.id] ?? UNSET;
        try {
          if (d.kind === "unset") await removeParkFeature(park.id, f.id);
          else if (d.kind === "value") await setParkFeature(park.id, f.id, "available", { value: d.value });
          else if (d.kind === "available" || d.kind === "unavailable")
            await setParkFeature(park.id, f.id, d.kind);
          // d.kind === "temp": never written — `temporarily_unavailable` is
          // only ever preserved by not touching the row (it can't become a
          // "change", so this branch is unreachable — kept as a guarantee).
        } catch {
          failed.push(featureLabelBO(f.code));
        }
      }
      // Some writes may have landed even on partial failure — always refresh.
      for (const key of [["park-features", park.id], ["park", park.id], ["bo-parks-page"], ["park-history", park.id]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      const ok = changed.length - failed.length;
      if (failed.length) {
        toast.error(
          `${ok} caractéristique(s) enregistrée(s). Échec (à réessayer) : ${failed.join(", ")}.`,
        );
        return; // stay in edit mode; refetch re-seeds initial, failed rows stay dirty
      }
      void logActivity(communeId ?? null, userName, `Caractéristiques mises à jour : ${park.name} (${changed.length})`);
      toast.success(`${changed.length} caractéristique(s) enregistrée(s).`);
      setEditing(false);
      onDirtyChange(false);
    },
    { errorMessage: () => "L'enregistrement des caractéristiques a échoué." },
  );

  function cancel() {
    setDraft(initialByFeature);
    setEditing(false);
    onDirtyChange(false);
  }

  if (catLoading || pfLoading) {
    return <p className={styles.stateBox}>Chargement des caractéristiques…</p>;
  }

  // ── Read mode ──────────────────────────────────────────────────────────
  if (!editing) {
    if (answeredCount === 0) {
      return (
        <div className={styles.panel}>
          <div className={styles.featEmpty}>
            <p className={styles.featEmptyTitle}>Aucune caractéristique renseignée</p>
            <p>
              Indiquez les jeux, services, accès et l'aménagement réellement présents dans ce parc pour aider les
              familles à choisir.
            </p>
            {canEdit && (
              <Button size="sm" onClick={() => setEditing(true)}>
                Compléter
              </Button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className={styles.panel}>
        <div className={styles.featToolbar}>
          <span className={styles.featCounter}>
            {answeredCount} caractéristique{answeredCount === 1 ? "" : "s"} renseignée{answeredCount === 1 ? "" : "s"} sur{" "}
            {allFeatures.length}
          </span>
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Modifier
            </Button>
          )}
        </div>

        {groups.map((g) => {
          const rows = g.features
            .map((f) => ({ f, state: readState(pfByFeatureId[f.id], isValueFeature(f)) }))
            .filter((r) => r.state !== null);
          return (
            <section key={g.category} className={styles.featSection}>
              <h3 className={styles.sectionTitle}>{g.label}</h3>
              {rows.length === 0 ? (
                <p className={styles.empty}>Non renseigné pour cette catégorie</p>
              ) : (
                <ul className={styles.featReadList}>
                  {rows.map(({ f, state }) => (
                    <li key={f.id} className={styles.featReadRow}>
                      {state === "yes" && (
                        <span className={styles.featYesIcon}>
                          <Icon name="ic-check" size={15} />
                        </span>
                      )}
                      {state === "yes" && <span>{featureLabelBO(f.code)}</span>}
                      {state === "no" && <span className={styles.featNegative}>{featureLabelBO(f.code)} — absent</span>}
                      {state === "temp" && (
                        <span className={styles.featNegative}>
                          {featureLabelBO(f.code)} — Temporairement indisponible
                        </span>
                      )}
                      {state === "value" && (
                        <span>
                          {featureLabelBO(f.code)} :{" "}
                          <strong>{featureValueLabelBO(f.code, pfByFeatureId[f.id]!.value!)}</strong>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────
  return (
    <div className={clsx(styles.panel, styles.featEditPanel)}>
      <p className={styles.featEditHelp}>
        Indiquez les caractéristiques présentes ou absentes lorsque vous disposez de l'information. Laissez « Non
        renseigné » en cas de doute.
      </p>
      {groups.map((g) => {
        const answeredInCat = g.features.filter(
          (f) => readState(pfByFeatureId[f.id], isValueFeature(f)) !== null,
        ).length;
        return (
          <details
            key={g.category}
            className={styles.featEditGroup}
            open={!!openCats[g.category]}
            onToggle={(e) => {
              const el = e.target as HTMLDetailsElement | null;
              if (el) setOpenCats((prev) => ({ ...prev, [g.category]: el.open }));
            }}
          >
            <summary className={styles.featEditSummary}>
              <span>{g.label}</span>
              <span className={styles.featEditCount}>
                {answeredInCat} / {g.features.length} renseignée{answeredInCat === 1 ? "" : "s"}
              </span>
            </summary>
            <div className={styles.featEditRows}>
              {g.features.map((f) => {
                const d = draft[f.id] ?? UNSET;
                if (isValueFeature(f)) {
                  return (
                    <div key={f.id} className={styles.featEditRow}>
                      <Select
                        label={featureLabelBO(f.code)}
                        help={
                          f.code === "surface_type"
                            ? "Choisissez « Mixte » si plusieurs revêtements sont présents."
                            : undefined
                        }
                        value={d.kind === "value" ? d.value : ""}
                        disabled={saving}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [f.id]: e.target.value ? { kind: "value", value: e.target.value } : UNSET,
                          }))
                        }
                      >
                        <option value="">Non renseigné</option>
                        {humanValueOptions(f).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  );
                }
                const tri: TriValue =
                  d.kind === "available" || d.kind === "unavailable" || d.kind === "temp" ? d.kind : "unset";
                // 4th option only for rows that arrived as temporarily_unavailable.
                const showTemp = (initialByFeature[f.id] ?? UNSET).kind === "temp";
                return (
                  <div key={f.id} className={styles.featEditRow}>
                    <span id={`feat-${f.id}`} className={styles.featEditLabel}>
                      {featureLabelBO(f.code)}
                    </span>
                    <TriState
                      value={tri}
                      showTemp={showTemp}
                      disabled={saving}
                      labelledBy={`feat-${f.id}`}
                      onChange={(v) =>
                        setDraft((prev) => ({ ...prev, [f.id]: v === "unset" ? UNSET : { kind: v } }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}

      <div className={styles.editBar}>
        <span className={styles.editHint}>
          {dirty ? `${changedIds.length} modification${changedIds.length > 1 ? "s" : ""}` : "Aucune modification"}
        </span>
        <Button variant="secondary" size="sm" onClick={cancel} disabled={saving}>
          Annuler
        </Button>
        <Button size="sm" loading={saving} disabled={!dirty} onClick={save}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
