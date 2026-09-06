import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Select, Textarea, useToast } from "@toboggo/design-system";
import {
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
      address: park.formatted_address ?? "",
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
      form.address !== initial.address ||
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
        formatted_address: form.address.trim(),
        description: form.description.trim() || null,
        operational_status: form.operational,
      };
      if (form.ageMin.trim() !== "") patch.age_min = Number(form.ageMin);
      if (form.ageMax.trim() !== "") patch.age_max = Number(form.ageMax);
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

  async function cancel() {
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
          <Input
            label="Adresse"
            value={form.address}
            placeholder="Ex. 12 rue des Écoles, 12100 Millau"
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            className={styles.formWide}
          />
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
            <Value>{park.formatted_address}</Value>
            <dt>Ville</dt>
            <Value>{park.city}</Value>
            <dt>Coordonnées</dt>
            <Value>
              {park.latitude != null && park.longitude != null
                ? `${Number(park.latitude).toFixed(6)}, ${Number(park.longitude).toFixed(6)}`
                : null}
            </Value>
          </dl>
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
