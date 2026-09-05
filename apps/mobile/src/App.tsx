import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useSession } from "./lib/session";
import { useTheme, useIconSprite } from "@toboggo/design-system";
import { GlobalOverlays } from "./components/GlobalOverlays";
import { takeResumeRoute } from "./lib/contributionDraft";

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
import NotificationPrefs from "./screens/profile/NotificationPrefs";
import NotifCenter from "./screens/profile/NotifCenter";
import NotifResolved from "./screens/profile/NotifResolved";
import Display from "./screens/profile/Display";
import Privacy from "./screens/profile/Privacy";
import Legal from "./screens/profile/Legal";
import Help from "./screens/profile/Help";
import Contact from "./screens/profile/Contact";

export default function App() {
  const init = useSession((s) => s.init);
  const loading = useSession((s) => s.loading);
  const profile = useSession((s) => s.profile);
  const userId = useSession((s) => s.userId);
  const navigate = useNavigate();
  const [, setTheme] = useTheme();
  useIconSprite(); // charge packages/design-system/src/icons/icons-sprite.svg (public/icons-sprite.svg)

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (profile) setTheme(profile.dark_mode ? "dark" : "light");
  }, [profile, setTheme]);

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
      <Route path="/notifications" element={<NotificationPrefs />} />
      <Route path="/notifications/center" element={<NotifCenter />} />
      <Route path="/notifications/resolved/:notifId" element={<NotifResolved />} />
      <Route path="/display" element={<Display />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/legal/:doc" element={<Legal />} />
      <Route path="/help" element={<Help />} />
      <Route path="/contact" element={<Contact />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
