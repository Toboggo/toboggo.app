import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Select, Textarea, useToast } from "@toboggo/design-system";
import {
  isValidCoordinate,
  listExternalIds,
  logActivity,
  updatePark,
  type Park,
  type ParkOperationalStatus,
} from "@toboggo/shared";
import { useOrgScope } from "../../lib/orgScope";
import { useOrgSession } from "../../lib/orgSession";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { queryClient } from "../../lib/queryClient";
import { ParkLocationEditor } from "./ParkLocationEditor";
import styles from "../ParkDetail.module.css";

const OPERATIONAL_LABEL: Record<ParkOperationalStatus, string> = {
  active: "Ouvert",
  temporarily_closed: "Fermé temporairement",
  partially_closed: "Partiellement fermé",
  under_construction: "En travaux",
  permanently_closed: "Fermé définitivement",
  unknown: "Inconnu",
};

const MODERATION_LABEL: Record<Park["status"], string> = {
  draft: "Brouillon",
  pending: "En attente",
  published: "Publié",
  blocked: "Bloqué",
  rejected: "Refusé",
};

const VERIFICATION_LABEL: Record<Park["verification_status"], string> = {
  unverified: "Non vérifié",
  community_verified: "Vérifié par la communauté",
  organization_verified: "Vérifié par la collectivité",
  toboggo_verified: "Vérifié par Toboggo",
};

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

function Value({ children }: { children: React.ReactNode }) {
  const empty = children == null || children === "";
  return <dd className={empty ? styles.empty : undefined}>{empty ? "Non renseigné" : children}</dd>;
}

/** Lignes d'adresse structurée pour le mode lecture — jamais de `null`,
 * `undefined` ni de chaîne sentinelle, et jamais d'adresse fabriquée. */
function addressLines(park: Park): string[] {
  const street = (park.address_line ?? "").trim();
  const cityLine = [park.postal_code ?? "", park.city ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  return [street, cityLine].filter(Boolean);
}

export function InfoPanel({
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
  const initial = useMemo(
    () => ({
      name: park.name,
      addressLine: park.address_line ?? "",
      postalCode: park.postal_code ?? "",
      city: park.city ?? "",
      latitude: park.latitude != null ? String(park.latitude) : "",
      longitude: park.longitude != null ? String(park.longitude) : "",
      ageMin: park.min_age != null ? String(park.min_age) : "",
      ageMax: park.max_age != null ? String(park.max_age) : "",
      description: park.description ?? "",
      operational: park.operational_status,
    }),
    [park],
  );

  const [form, setForm] = useState(initial);
  // Re-sync from the server copy only while NOT editing, so a background
  // refetch can't silently wipe in-progress edits.
  useEffect(() => {
    if (!editing) setForm(initial);
  }, [initial, editing]);

  const dirty =
    editing &&
    (form.name !== initial.name ||
      form.addressLine !== initial.addressLine ||
      form.postalCode !== initial.postalCode ||
      form.city !== initial.city ||
      form.latitude !== initial.latitude ||
      form.longitude !== initial.longitude ||
      form.ageMin !== initial.ageMin ||
      form.ageMax !== initial.ageMax ||
      form.description !== initial.description ||
      form.operational !== initial.operational);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  // Clear the guard if this panel unmounts (e.g. the user confirms discarding
  // and switches tab — the inactive TabPanel is unmounted).
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const { data: externalIds = [] } = useQuery({
    queryKey: ["park-external-ids", park.id],
    queryFn: () => listExternalIds(park.id),
  });
  const osm = externalIds.find((x) => x.provider === "osm");

  const { run: save, pending: saving } = useAsyncAction(
    async () => {
      if (!form.name.trim()) {
        toast.error("Le nom du parc est obligatoire.");
        return;
      }

      const patch: Partial<Park> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        operational_status: form.operational,
      };

      // ── Adresse structurée (indépendante de la position) ────────────────
      // Champs canoniques écrits en direct — `""` sauvegardé devient `null`.
      // `formatted_address` n'est JAMAIS écrit : c'est une projection de la vue.
      if (form.addressLine !== initial.addressLine) {
        patch.address_line = form.addressLine.trim() || null;
      }
      if (form.postalCode !== initial.postalCode) {
        patch.postal_code = form.postalCode.trim() || null;
      }
      if (form.city !== initial.city) {
        patch.city = form.city.trim() || null;
      }

      // ── Âges — si une borne est touchée, on envoie la PAIRE complète pour
      // que la validation min <= max côté shared soit fiable (3C.1). ────────
      if (form.ageMin !== initial.ageMin || form.ageMax !== initial.ageMax) {
        patch.age_min = form.ageMin.trim() === "" ? null : Number(form.ageMin);
        patch.age_max = form.ageMax.trim() === "" ? null : Number(form.ageMax);
      }

      // ── Position (indépendante de l'adresse) — uniquement si modifiée,
      // et toujours la paire lat+lng. ──────────────────────────────────────
      if (form.latitude !== initial.latitude || form.longitude !== initial.longitude) {
        const latN = Number(form.latitude);
        const lngN = Number(form.longitude);
        if (!isValidCoordinate(latN, lngN)) {
          toast.error(
            "Coordonnées GPS invalides : corrigez la latitude / longitude avant d'enregistrer.",
          );
          return;
        }
        patch.latitude = latN;
        patch.longitude = lngN;
      }

      await updatePark(park.id, patch, "Modifié depuis le back office");
      await logActivity(communeId ?? null, userName, `Parc modifié : ${form.name.trim()}`);
      for (const key of [["park", park.id], ["park-history", park.id], ["bo-parks-page"], ["bo-parks"], ["dash-parks"]]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      setEditing(false);
      onDirtyChange(false);
    },
    { successMessage: "Parc mis à jour." },
  );

  function cancel() {
    setForm(initial);
    setEditing(false);
    onDirtyChange(false);
  }

  if (editing) {
    return (
      <div className={styles.panel}>
        <div className={styles.form}>
          <Input
            label="Nom"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={styles.formWide}
          />

          <p className={`${styles.formNote} ${styles.formWide}`}>
            Adresse et position sont enregistrées séparément. Modifier l'une ne déplace pas
            automatiquement l'autre.
          </p>

          <div className={styles.formWide}>
            <h4 className={styles.formGroupTitle}>Adresse</h4>
            <Input
              label="Adresse / voie"
              value={form.addressLine}
              placeholder="Ex. 12 rue des Écoles"
              onChange={(e) => setForm((f) => ({ ...f, addressLine: e.target.value }))}
            />
            <div className={styles.twoCol}>
              <Input
                label="Code postal"
                value={form.postalCode}
                inputMode="numeric"
                placeholder="Ex. 12100"
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
              />
              <Input
                label="Ville"
                value={form.city}
                placeholder="Ex. Millau"
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
          </div>

          <div className={styles.locBlock}>
            <h4 className={styles.formGroupTitle}>Position sur la carte</h4>
            <ParkLocationEditor
              editing
              disabled={saving}
              latitude={form.latitude}
              longitude={form.longitude}
              onChange={(latitude, longitude) => setForm((f) => ({ ...f, latitude, longitude }))}
            />
          </div>

          <div className={styles.ageRow}>
            <Input
              label="Âge minimum"
              type="number"
              min={0}
              max={18}
              value={form.ageMin}
              onChange={(e) => setForm((f) => ({ ...f, ageMin: e.target.value }))}
            />
            <Input
              label="Âge maximum"
              type="number"
              min={0}
              max={18}
              value={form.ageMax}
              onChange={(e) => setForm((f) => ({ ...f, ageMax: e.target.value }))}
            />
          </div>
          <Select
            label="État d'exploitation"
            value={form.operational}
            onChange={(e) => setForm((f) => ({ ...f, operational: e.target.value as ParkOperationalStatus }))}
          >
            {(Object.keys(OPERATIONAL_LABEL) as ParkOperationalStatus[]).map((v) => (
              <option key={v} value={v}>
                {OPERATIONAL_LABEL[v]}
              </option>
            ))}
          </Select>
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={styles.formWide}
            rows={4}
          />
        </div>

        <div className={styles.editBar}>
          <span className={styles.editHint}>
            {dirty ? "Modifications non enregistrées" : "Aucune modification"}
          </span>
          <Button variant="secondary" size="sm" onClick={cancel} disabled={saving}>
            Annuler
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            Enregistrer
          </Button>
        </div>
      </div>
    );
  }

  const addr = addressLines(park);

  return (
    <div className={styles.panel}>
      {canEdit && (
        <div className={styles.infoToolbar}>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Modifier
          </Button>
        </div>
      )}
      <div className={styles.sectionGrid}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Identité</h3>
          <dl className={styles.dl}>
            <dt>Nom</dt>
            <Value>{park.name}</Value>
            <dt>Adresse</dt>
            {addr.length > 0 ? (
              <dd className={styles.addrLines}>
                {addr.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </dd>
            ) : (
              <dd className={styles.empty}>Adresse non renseignée</dd>
            )}
          </dl>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Localisation</h3>
          <ParkLocationEditor
            editing={false}
            latitude={initial.latitude}
            longitude={initial.longitude}
          />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Public</h3>
          <dl className={styles.dl}>
            <dt>Âge minimum</dt>
            <Value>{park.min_age != null ? `${park.min_age} an${park.min_age > 1 ? "s" : ""}` : null}</Value>
            <dt>Âge maximum</dt>
            <Value>{park.max_age != null ? `${park.max_age} an${park.max_age > 1 ? "s" : ""}` : null}</Value>
            <dt>Description</dt>
            <Value>{park.description}</Value>
          </dl>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Statut</h3>
          <dl className={styles.dl}>
            <dt>Publication</dt>
            <Value>{MODERATION_LABEL[park.status]}</Value>
            <dt>Exploitation</dt>
            <Value>{OPERATIONAL_LABEL[park.operational_status]}</Value>
            <dt>Vérification</dt>
            <Value>{VERIFICATION_LABEL[park.verification_status]}</Value>
          </dl>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Métadonnées</h3>
          <dl className={styles.dl}>
            <dt>Créé le</dt>
            <Value>{park.created_at ? dateTimeFmt.format(new Date(park.created_at)) : null}</Value>
            <dt>Modifié le</dt>
            <Value>{park.updated_at ? dateTimeFmt.format(new Date(park.updated_at)) : null}</Value>
            <dt>Source</dt>
            <Value>{osm ? `OpenStreetMap (${osm.external_id})` : null}</Value>
          </dl>
        </section>
      </div>
    </div>
  );
}
