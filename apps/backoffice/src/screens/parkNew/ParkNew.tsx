import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Segmented, useToast } from "@toboggo/design-system";
import {
  assertValidAgeRange,
  createPark,
  isValidCoordinate,
  logActivity,
  type Park,
} from "@toboggo/shared";
import { PageHeader } from "../../components/PageHeader";
import { useOrgScope } from "../../lib/orgScope";
import { useOrgSession } from "../../lib/orgSession";
import { usePermissions } from "../../lib/permissions";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { useUnsavedChangesGuard } from "../../lib/useUnsavedChangesGuard";
import { queryClient } from "../../lib/queryClient";
import { StepLocation } from "./StepLocation";
import { StepInfo } from "./StepInfo";
import styles from "./ParkNew.module.css";

export interface ParkDraft {
  // Étape 1 — Localisation
  addressLine: string;
  postalCode: string;
  city: string;
  latitude: string;
  longitude: string;
  // Étape 2 — Informations
  name: string;
  ageMin: string;
  ageMax: string;
  description: string;
}

const EMPTY_DRAFT: ParkDraft = {
  addressLine: "",
  postalCode: "",
  city: "",
  latitude: "",
  longitude: "",
  name: "",
  ageMin: "",
  ageMax: "",
  description: "",
};

type Step = "location" | "info";

function parkPayload(draft: ParkDraft, communeId: string, publish: boolean): Partial<Park> {
  const payload: Partial<Park> = {
    name: draft.name.trim(),
    organization_id: communeId,
    latitude: Number(draft.latitude),
    longitude: Number(draft.longitude),
    // Comportement produit existant (ParkModal + import CSV) : la création par
    // une collectivité gestionnaire est publiée directement ; un rôle inférieur
    // passerait par la file d'attente. L'écran est déjà réservé aux
    // gestionnaires (canCreatePark) — le ternaire est une défense en profondeur.
    status: publish ? "published" : "pending",
  };
  if (draft.addressLine.trim()) payload.address_line = draft.addressLine.trim();
  if (draft.postalCode.trim()) payload.postal_code = draft.postalCode.trim();
  if (draft.city.trim()) payload.city = draft.city.trim();
  // Âges (3C.1) : si une borne est renseignée, on envoie la paire complète
  // (l'autre à null) pour que la validation min <= max soit fiable ; sinon rien.
  if (draft.ageMin.trim() !== "" || draft.ageMax.trim() !== "") {
    payload.age_min = draft.ageMin.trim() === "" ? null : Number(draft.ageMin);
    payload.age_max = draft.ageMax.trim() === "" ? null : Number(draft.ageMax);
  }
  if (draft.description.trim()) payload.description = draft.description.trim();
  // `formatted_address` n'est jamais écrit : projection de la vue park_public.
  // `operational_status` non fourni → défaut DB 'active'.
  return payload;
}

export default function ParkNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const { communeId } = useOrgScope();
  const userName = useOrgSession((s) => s.userName);
  const isGestionnaireOrAbove = useOrgSession((s) => s.isGestionnaireOrAbove());
  const { canCreatePark } = usePermissions();

  const [step, setStep] = useState<Step>("location");
  const [draft, setDraft] = useState<ParkDraft>(EMPTY_DRAFT);
  const [advanceAttempted, setAdvanceAttempted] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const patch = (next: Partial<ParkDraft>) => setDraft((d) => ({ ...d, ...next }));

  const dirty = useMemo(() => Object.values(draft).some((v) => v.trim() !== ""), [draft]);
  const confirmIfDirty = useUnsavedChangesGuard(dirty);

  const latN = Number(draft.latitude);
  const lngN = Number(draft.longitude);
  const coordsValid =
    draft.latitude.trim() !== "" &&
    draft.longitude.trim() !== "" &&
    isValidCoordinate(latN, lngN);

  const nameEmpty = draft.name.trim() === "";

  const ageError = useMemo(() => {
    const min = draft.ageMin.trim() === "" ? null : Number(draft.ageMin);
    const max = draft.ageMax.trim() === "" ? null : Number(draft.ageMax);
    try {
      assertValidAgeRange(min, max);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Âge invalide.";
    }
  }, [draft.ageMin, draft.ageMax]);

  const coordError =
    (advanceAttempted || submitAttempted) && !coordsValid
      ? "Placez le parc sur la carte ou saisissez des coordonnées GPS valides pour continuer."
      : null;
  const nameError = submitAttempted && nameEmpty ? "Le nom du parc est obligatoire." : null;

  function goToStep(next: Step) {
    if (next === "info" && !coordsValid) {
      setAdvanceAttempted(true);
      return;
    }
    setAdvanceAttempted(false);
    setStep(next);
  }

  async function leave() {
    if (await confirmIfDirty()) navigate("/parks");
  }

  const { run: submit, pending: creating } = useAsyncAction(async () => {
    setSubmitAttempted(true);
    // Chaque garde renvoie sur la bonne étape ; l'erreur s'affiche inline
    // (coordError / nameError / ageError) — pas d'alert ni de toast redondant.
    if (!coordsValid) {
      setStep("location");
      setAdvanceAttempted(true);
      return;
    }
    if (nameEmpty || ageError) {
      setStep("info");
      return;
    }
    if (!communeId) {
      toast.error("Aucune collectivité active : impossible de rattacher le parc.");
      return;
    }

    const created = await createPark(parkPayload(draft, communeId, isGestionnaireOrAbove));
    await logActivity(communeId, userName, `Parc ajouté : ${created.name}`);
    for (const key of [["bo-parks-page"], ["bo-parks"], ["dash-parks"], ["shell-pending-parks"]]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    toast.success("Parc créé");
    navigate(`/parks/${created.id}`);
  });

  if (!canCreatePark) {
    return (
      <div>
        <PageHeader title="Ajouter un parc" />
        <p className={styles.stateBox}>
          Vous n'avez pas l'autorisation de créer un parc pour cette organisation.
        </p>
        <div style={{ textAlign: "center" }}>
          <Button variant="secondary" size="sm" onClick={() => navigate("/parks")}>
            Retour à la liste
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <nav className={styles.breadcrumb} aria-label="Fil d'Ariane">
        <a
          href="/parks"
          onClick={(e) => {
            e.preventDefault();
            void leave();
          }}
        >
          Mes parcs
        </a>
        <span className={styles.crumbSep} aria-hidden="true">
          ›
        </span>
        <span className={styles.crumbCurrent}>Ajouter un parc</span>
      </nav>

      <PageHeader
        title="Ajouter un parc"
        subtitle="Localisez précisément le parc. Son adresse peut être renseignée ou complétée séparément."
      />

      <Segmented<Step>
        className={styles.stepper}
        options={[
          { value: "location", label: "1. Localisation" },
          { value: "info", label: "2. Informations" },
        ]}
        value={step}
        onChange={goToStep}
      />

      <div className={styles.card}>
        {step === "location" ? (
          <StepLocation draft={draft} patch={patch} coordError={coordError} />
        ) : (
          <StepInfo
            draft={draft}
            patch={patch}
            onEditLocation={() => goToStep("location")}
            nameError={nameError}
            ageError={ageError}
          />
        )}
      </div>

      <div className={styles.actionBar}>
        <span className={styles.actionHint}>
          {step === "location"
            ? "Étape 1 sur 2 — position requise"
            : "Étape 2 sur 2 — vérifiez avant de créer"}
        </span>
        <Button variant="secondary" size="sm" onClick={leave} disabled={creating}>
          Annuler
        </Button>
        {step === "info" && (
          <Button variant="secondary" size="sm" onClick={() => goToStep("location")} disabled={creating}>
            Retour
          </Button>
        )}
        {step === "location" ? (
          <Button size="sm" onClick={() => goToStep("info")}>
            Continuer
          </Button>
        ) : (
          <Button size="sm" loading={creating} disabled={!!ageError} onClick={submit}>
            Créer le parc
          </Button>
        )}
      </div>
    </div>
  );
}
