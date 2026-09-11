import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "./lib/session";
import { useIconSprite } from "@toboggo/design-system";
import { GlobalOverlays } from "./components/GlobalOverlays";
import { takeResumeRoute } from "./lib/resumeRoute";

import Splash from "./screens/onboarding/Splash";
import LoginMethod from "./screens/onboarding/LoginMethod";
import AuthForm from "./screens/onboarding/AuthForm";
import Permissions from "./screens/onboarding/Permissions";

import MapExplore from "./screens/map/MapExplore";
import ParkDetail from "./screens/detail/ParkDetail";
import ScoreDetail from "./screens/detail/ScoreDetail";
import DetailPhotos from "./screens/detail/DetailPhotos";
import DetailAmenities from "./screens/detail/DetailAmenities";
import DetailReviews from "./screens/detail/DetailReviews";
import Directions from "./screens/detail/Directions";

import ActionIntro from "./screens/actions/ActionIntro";
import AddPark from "./screens/actions/AddPark";
import RatePark from "./screens/actions/RatePark";
import ReportProblem from "./screens/actions/ReportProblem";
import AddPhotos from "./screens/actions/AddPhotos";
import EditInfo from "./screens/actions/EditInfo";
import MoreActions from "./screens/actions/MoreActions";

import Favorites from "./screens/favorites/Favorites";
import Compare from "./screens/favorites/Compare";
import GroupOuting from "./screens/social/GroupOuting";

import Contributions from "./screens/contributions/Contributions";
import Activity from "./screens/contributions/Activity";

import Profile from "./screens/profile/Profile";
import EditProfile from "./screens/profile/EditProfile";
import Children from "./screens/profile/Children";
import ChildForm from "./screens/profile/ChildForm";
import NotificationPrefs from "./screens/profile/NotificationPrefs";
import NotifCenter from "./screens/profile/NotifCenter";
import NotifResolved from "./screens/profile/NotifResolved";
import Language from "./screens/profile/Language";
import Appearance from "./screens/profile/Appearance";
import LegalIndex from "./screens/profile/LegalIndex";
import Legal from "./screens/profile/Legal";
import Help from "./screens/profile/Help";
import Contact from "./screens/profile/Contact";
import About from "./screens/profile/About";

// Legacy intro path for "Donner un avis": the wizard canonique (Parc → Avis →
// Commentaire) est auto-porteur, comme AddPark. Redirige vers /rate en
// préservant `?park=` pour ne pas reperdre le contexte parc. `replace` : le
// Retour du 1er step revient à l'origine, pas à cette redirection.
function RateIntroRedirect() {
  const [params] = useSearchParams();
  const qs = params.toString();
  return <Navigate to={qs ? `/rate?${qs}` : "/rate"} replace />;
}

// Idem "Signaler un problème" : le wizard (Problème → Détails → Confirmation)
// est auto-porteur, la sélection du parc étant intégrée au flow. `/action-intro/
// report` redirige vers /report en préservant toute la query string — `?park=`
// et, pour un lien de reprise après auth, `?resume=1`. `replace` : le Retour du
// 1er step revient à l'origine, jamais à cette redirection ni à un écran
// "Commencer" supprimé.
function ReportIntroRedirect() {
  const [params] = useSearchParams();
  const qs = params.toString();
  return <Navigate to={qs ? `/report?${qs}` : "/report"} replace />;
}

export default function App() {
  const init = useSession((s) => s.init);
  const loading = useSession((s) => s.loading);
  const userId = useSession((s) => s.userId);
  const navigate = useNavigate();
  useIconSprite(); // charge packages/design-system/src/icons/icons-sprite.svg (public/icons-sprite.svg)

  // Le thème (Système/Clair/Sombre) est appliqué par useTheme lui-même dès
  // son import (store module, voir packages/design-system/src/useTheme.ts) —
  // local à l'appareil, indépendant du profil Supabase et du compte.

  useEffect(() => {
    init();
  }, [init]);

  // A contribution started while signed out stashes a resume route before the
  // just-in-time auth flow (which, for Google OAuth, is a full-page redirect).
  // Once authenticated, return to that flow to finish the send.
  useEffect(() => {
    if (!userId) return;
    const route = takeResumeRoute();
    if (route) navigate(route, { replace: true });
  }, [userId, navigate]);

  if (loading) return null;

  return (
    <>
    <GlobalOverlays />
    <Routes>
      <Route path="/" element={<Splash />} />
      <Route path="/login-method" element={<LoginMethod />} />
      <Route path="/login" element={<AuthForm />} />
      <Route path="/permissions" element={<Permissions />} />

      <Route path="/map" element={<MapExplore />} />
      <Route path="/park/:id" element={<ParkDetail />} />
      <Route path="/park/:id/score" element={<ScoreDetail />} />
      <Route path="/park/:id/photos" element={<DetailPhotos />} />
      <Route path="/park/:id/amenities" element={<DetailAmenities />} />
      <Route path="/park/:id/reviews" element={<DetailReviews />} />
      <Route path="/park/:id/directions" element={<Directions />} />

      {/* AddPark / RatePark / ReportProblem n'ont plus d'écran d'intro : le
          wizard canonique est auto-porteur. `/action-intro/{add,rate,report}`
          vont droit au 1er step (en préservant la query string — `?park=`, et
          `?resume=1` pour report). Le fallback `/action-intro/:type` reste pour
          d'éventuels types legacy. */}
      <Route path="/action-intro/add" element={<Navigate to="/add" replace />} />
      <Route path="/action-intro/rate" element={<RateIntroRedirect />} />
      <Route path="/action-intro/report" element={<ReportIntroRedirect />} />
      <Route path="/action-intro/:type" element={<ActionIntro />} />
      <Route path="/add" element={<AddPark />} />
      <Route path="/rate" element={<RatePark />} />
      <Route path="/report" element={<ReportProblem />} />
      <Route path="/photo-add" element={<AddPhotos />} />
      <Route path="/contribute/edit" element={<EditInfo />} />
      <Route path="/more-actions" element={<MoreActions />} />

      <Route path="/favorites" element={<Favorites />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/group" element={<GroupOuting />} />

      <Route path="/contributions" element={<Contributions />} />
      <Route path="/activity" element={<Activity />} />

      <Route path="/profile" element={<Profile />} />
      <Route path="/profile/edit" element={<EditProfile />} />
      <Route path="/profile/children" element={<Children />} />
      <Route path="/profile/children/new" element={<ChildForm />} />
      <Route path="/profile/children/:childId" element={<ChildForm />} />
      <Route path="/notifications" element={<NotificationPrefs />} />
      <Route path="/notifications/center" element={<NotifCenter />} />
      <Route path="/notifications/resolved/:notifId" element={<NotifResolved />} />
      <Route path="/language" element={<Language />} />
      <Route path="/appearance" element={<Appearance />} />
      {/* Ancienne route (langue + apparence mélangées) — alias pour ne pas
          casser un lien/historique existant, cf. refonte profil/réglages §7. */}
      <Route path="/display" element={<Navigate to="/appearance" replace />} />
      <Route path="/legal" element={<LegalIndex />} />
      {/* Ancien écran Confidentialité (toggles placeholders + liens légaux +
          suppression de compte) retiré — alias vers le nouvel index léger,
          cf. refonte profil/réglages §6-7. */}
      <Route path="/privacy" element={<Navigate to="/legal" replace />} />
      <Route path="/legal/:doc" element={<Legal />} />
      <Route path="/help" element={<Help />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/about" element={<About />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
