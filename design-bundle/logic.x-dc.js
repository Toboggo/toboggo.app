
const CRITERIA = [
  { key: 'wc', label: 'Toilettes', color: '#3B82F6', tint: '#E7F1FC', emoji: '🚻', icon: '<circle cx="8" cy="7" r="2.8"></circle><path d="M2.5 20v-1.5a4.8 4.8 0 0 1 9.6 0V20"></path><circle cx="17" cy="8" r="2.3"></circle><path d="M14.5 20v-1.2a4 4 0 0 1 7.5-1.9"></path>' },
  { key: 'shade', label: 'Ombragé', color: '#16A34A', tint: '#E7F6EC', emoji: '🌳', icon: '<circle cx="12" cy="9" r="6"></circle><line x1="12" y1="15" x2="12" y2="21"></line>' },
  { key: 'fenced', label: 'Clôturé', color: '#059669', tint: '#E1F5EA', emoji: '🔒', icon: '<line x1="4" y1="4" x2="4" y2="20"></line><line x1="10" y1="4" x2="10" y2="20"></line><line x1="16" y1="4" x2="16" y2="20"></line><line x1="20" y1="4" x2="20" y2="20"></line><line x1="2" y1="9" x2="22" y2="9"></line><line x1="2" y1="15" x2="22" y2="15"></line>' },
  { key: 'pmr', label: 'Accès PMR', color: '#8B5CF6', tint: '#F1E9FA', emoji: '♿', icon: '<circle cx="13" cy="5" r="1.6"></circle><path d="M13 8v5h5"></path><path d="M13 13l3 7"></path><circle cx="10" cy="16" r="5"></circle>' },
  { key: 'benches', label: 'Bancs', color: '#FF8800', tint: '#FFF1E0', emoji: '🪑', icon: '<rect x="3" y="9" width="18" height="3" rx="1"></rect><line x1="6" y1="12" x2="6" y2="19"></line><line x1="18" y1="12" x2="18" y2="19"></line><line x1="3" y1="16" x2="21" y2="16"></line>' },
  { key: 'water', label: "Point d'eau", color: '#3B82F6', tint: '#E7F1FC', emoji: '💧', icon: '<path d="M12 2C8 8 5 11.5 5 15a7 7 0 0 0 14 0c0-3.5-3-7-7-13z"></path>' },
  { key: 'parking', label: 'Parking', color: '#3B82F6', tint: '#E7F1FC', emoji: '🅿️', icon: '<rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M10 16V8h3a2.5 2.5 0 1 1 0 5h-3"></path>' },
];
const PLAY_EQUIPMENT = [
  { key: 'toboggan', label: 'Toboggan', icon: '<path d="M4 21l7-15 4 2-5 13"></path><path d="M13 6l7 11"></path>' },
  { key: 'swing', label: 'Balançoire', icon: '<path d="M4 4v16M20 4v16M4 4h16"></path><path d="M9 10l3 4 3-4"></path>' },
  { key: 'climbing', label: 'Escalade', icon: '<path d="M6 21V9l6-5 6 5v12"></path><path d="M9 21v-6h6v6"></path>' },
  { key: 'waterplay', label: 'Jeux d\u2019eau', icon: '<path d="M12 2C8 8 5 11.5 5 15a7 7 0 0 0 14 0c0-3.5-3-7-7-13z"></path><path d="M9 15a3 3 0 0 0 3 3"></path>' },
  { key: 'sandbox', label: 'Bac à sable', icon: '<rect x="3" y="14" width="18" height="7" rx="1"></rect><path d="M6 14l3-6h6l3 6"></path>' },
  { key: 'springs', label: 'Jeux à ressort', icon: '<path d="M7 21c0-3 10-3 10-6s-10-3-10-6 10-3 10-6"></path>' },
  { key: 'zipline', label: 'Tyrolienne', icon: '<line x1="3" y1="6" x2="21" y2="18"></line><circle cx="15" cy="14" r="2.4"></circle>' },
  { key: 'carousel', label: 'Tourniquet', icon: '<circle cx="12" cy="16" r="2"></circle><path d="M12 16L4 8M12 16l8-8M12 16V4"></path>' },
  { key: 'motorcourse', label: 'Parcours moteur', icon: '<circle cx="6" cy="17" r="2.2"></circle><circle cx="18" cy="17" r="2.2"></circle><path d="M6 17h6l3-8h4"></path>' },
  { key: 'multisport', label: 'Terrain multisport', icon: '<rect x="3" y="6" width="18" height="12" rx="1"></rect><circle cx="12" cy="12" r="2.6"></circle><line x1="12" y1="6" x2="12" y2="18"></line>' },
];

function photoUrl(seed, w, h) {
  return 'https://picsum.photos/seed/toboggo-' + seed + '/' + (w || 300) + '/' + (h || 300);
}
const CITIES = [
  { name: 'Millau', region: 'Aveyron' },
  { name: 'Lyon', region: 'Rhône' },
  { name: 'Marseille', region: 'Bouches-du-Rhône' },
  { name: 'Lille', region: 'Nord' },
  { name: 'Bordeaux', region: 'Gironde' },
  { name: 'Toulouse', region: 'Haute-Garonne' },
  { name: 'Nantes', region: 'Loire-Atlantique' },
];
function isParkOpenNow(p) {
  if (!p.closesAt) return true;
  const m = /(\d+)h(\d+)/.exec(p.closesAt);
  if (!m) return true;
  const closeMinutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= 8 * 60 && nowMinutes < closeMinutes;
}
function starsArray(rating) {
  const r = Math.round(rating);
  return [0, 1, 2, 3, 4].map(i => ({ fill: i < r ? '#FFC107' : 'none' }));
}

function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// --- Intégration météo réelle (à câbler plus tard) -------------------------
// API suggérée : Open-Meteo (gratuite, sans clé) — https://open-meteo.com
// GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}
//     &current=temperature_2m,precipitation,wind_speed_10m,weather_code
// Alternative avec clé : OpenWeatherMap /data/2.5/weather.
//
// Mapping code météo -> nos 3 catégories internes (heat/rain/wind) :
//   temperature_2m >= 28°C                     -> 'heat'
//   precipitation > 0 ou weather_code en 51-99  -> 'rain'
//   wind_speed_10m >= 30 km/h                   -> 'wind'
//   sinon                                        -> pas d'alerte (weatherAlertDismissed=true)
//
// Remplacer cycleWeather() par un vrai fetchWeather(lat, lon) :
//   async fetchWeather(lat, lon) {
//     this.setState({ weatherLoading: true, weatherError: false });
//     try {
//       const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m,weather_code`);
//       const data = await res.json();
//       const condition = mapToCondition(data.current); // implémenter le mapping ci-dessus
//       this.setState({ weatherCondition: condition, weatherTempLive: `${Math.round(data.current.temperature_2m)}°C`, weatherLoading: false });
//     } catch (e) { this.setState({ weatherLoading: false, weatherError: true }); }
//   }
// Appeler fetchWeather(lat, lon) dans componentDidMount (avec les coords de locationLabel/GPS)
// et à chaque changement de ville (selectCity/useCurrentLocation).
// weatherTemp doit alors lire weatherTempLive si présent, sinon retomber sur WEATHER_TEMPS (mode démo).
// ---------------------------------------------------------------------------
const WEATHER_TEMPS = { heat: '31°C', rain: '17°C', wind: '19°C' };
const WEATHER_CONDITIONS = {
  heat: { icon: '☀️', text: "Forte chaleur aujourd'hui — préférez un parc ombragé pour la sortie.", actionLabel: 'Voir les parcs ombragés', apply: (self) => { self.setState(s2 => ({ filters: { ...s2.filters, shade: true }, weatherAlertDismissed: true })); self.showToast('Filtre "Ombragé" activé'); } },
  rain: { icon: '🌧️', text: 'Pluie prévue cet après-midi — mieux vaut un parc proche de chez vous.', actionLabel: 'Trier par proximité', apply: (self) => { self.setSortMode('distance'); self.setState({ weatherAlertDismissed: true }); self.showToast('Tri par proximité activé'); } },
  wind: { icon: '💨', text: 'Vent fort annoncé — vérifiez que le parc est bien clôturé.', actionLabel: 'Voir les parcs clôturés', apply: (self) => { self.setState(s2 => ({ filters: { ...s2.filters, fenced: true }, weatherAlertDismissed: true })); self.showToast('Filtre "Clôturé" activé'); } },
};

const BADGE_ICONS = {
  star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"></path></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  heart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1"><path d="M12 21s-7.5-4.6-10-9.3C.5 7.8 2.7 4 6.5 4c2 0 3.5 1.2 5.5 3.3C14 5.2 15.5 4 17.5 4c3.8 0 6 3.8 4.5 7.7C19.5 16.4 12 21 12 21z"></path></svg>',
  award: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"></circle><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"></path></svg>',
};

const NOTIF_ICONS = {
  resolved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"></path></svg>',
  newPark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"></path><circle cx="12" cy="9" r="2.5"></circle></svg>',
  thanks: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"></path></svg>',
  confirm: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-2.9 2-2.9 4"></path><circle cx="12" cy="17.5" r=".6" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="9.5"></circle></svg>',
  recommend: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path><path d="M12 7l2.5 4.5L19 14l-4.5 2.5L12 21l-2.5-4.5L5 14l4.5-2.5z"></path></svg>',
};
const NOTIF_TINTS = {
  resolved: { bg: '#E7F1FC', color: '#2E6FA8' },
  newPark: { bg: '#E7F6EC', color: '#16A34A' },
  thanks: { bg: '#FFF3D6', color: '#B27A3F' },
  confirm: { bg: '#E7F1FC', color: '#2E6FA8' },
  recommend: { bg: '#EAF2FB', color: '#4C9EEB' },
};

class Component extends DCLogic {
  state = {
    screen: 'onboarding',
    resetSent: false,
    authMode: 'login',
    authOrigin: 'method',
    showPwd: false,
    loggedIn: false,
    guestMode: false,
    onboardEmail: '',
    onboardPwd: '',
    authError: '',
    authLoading: false,
    prefsConfigured: false,
    onboardingSkipped: false,
    onboardAgeMin: 2,
    onboardAgeMax: 8,
    onboardZoneSet: false,
    showLocationPermModal: false,
    permLocation: true,
    permNotif: true,
    locationLabel: 'Autour de vous',
    isCitySwitcherOpen: false,
    citySearch: '',
    search: '',
    searchOpen: false,
    recentSearches: ['Millau', 'Parc de la Victoire'],
    filters: { ageRange: [0, 12], wc: false, shade: false, fenced: false, pmr: false, benches: false, water: false, parking: false, distance: '2km', fewReports: false, verifiedRecently: false, openNow: false },
    weatherCondition: 'heat',
    visitPromptParkId: null,
    rateTags: { clean: false, safe: false, shade: false },
    rateCriteria: { clean: 0, safety: 0, equipment: 0, comfort: 0 },
    rateChildAge: '',
    rateStep: 1,
    rateSearchQuery: '',
    rateAgeBand: '',
    selectedParkId: 1,
    detailFrom: 'map',
    heroIndex: 0,
    amenitiesSheetOpen: false,
    previewParkId: null,
    sheetHeight: 200,
    dragging: false,
    favorites: {},
    offlineMode: false,
    weatherAlertDismissed: false,
    flaggedReviews: {},
    isShareOpen: false,
    shareParkId: null,
    ratePhotoAdded: false,
    groupActive: false,
    groupCode: null,
    groupMembers: [],
    groupParkId: null,
    groupJoinCode: '',
    recentIds: [],
    darkMode: false,
    gpsFailed: false,
    compareMode: false,
    compareIds: [],
    booting: true,
    notifBanner: null,
    profileName: 'Camille Martin',
    notifPrefs: { reports: true, newParks: true, reviewReplies: true, recommendations: true, news: false },
    notifChannels: { push: true, email: false },
    notifFilter: 'all',
    notifCenterFrom: 'map',
    notifResolvedId: 1,
    notifications: [
      { id: 1, type: 'resolved', title: 'Votre signalement a été résolu', desc: 'Le problème au Parc des Acacias a été corrigé. Merci !', time: 'Il y a 10 min', read: false, parkId: 7 },
      { id: 2, type: 'newPark', title: 'Nouveau parc près de vous', desc: 'Une nouvelle aire de jeux a été ajoutée à 500 m de chez vous.', time: 'Il y a 1h', read: false, parkId: 4 },
      { id: 3, type: 'thanks', title: 'Merci pour votre avis !', desc: 'Votre avis sur le Parc de la Victoire a été publié.', time: 'Il y a 2h', read: false },
      { id: 4, type: 'confirm', title: 'Pouvez-vous confirmer ?', desc: 'Le problème signalé au Parc du Centre est-il résolu ?', time: 'Il y a 1j', read: false },
      { id: 5, type: 'recommend', title: 'Recommandation du jour', desc: '3 parcs correspondent à vos critères d\u2019aujourd\u2019hui.', time: 'Il y a 1j', read: false },
    ],
    sortMode: 'distance',
    privacyPrefs: { shareLocation: true, publicProfile: false },
    permissionsSeen: false,
    showDeleteConfirm: false,
    legalDoc: null,
    legalFrom: 'privacy',
    helpOpenIndex: null,
    scoreInfoOpen: false,
    directionsFrom: 'map',
    directionsMode: 'walk',
    directionsStops: { bakery: false, parking: false, water: false },
    reportReasons: { broken: false, safety: false, maintenance: false, vegetation: false, accessibility: false, wrong: false, other: false },
    reportComment: '',
    reportLocation: '',
    reportDuration: 'Depuis quelques jours',
    contactSubject: 'Question générale',
    contactMessage: '',
    contactSent: false,
    rateStars: 0,
    rateComment: '',
    addForm: { name: '', address: '', description: '', ageMin: 2, ageMax: 8, fenced: true, shade: true, pmr: false, wc: false, benches: false, water: false, parking: false, playTypes: { toboggan: true, swing: true, climbing: false, springs: false, sandbox: false, other: false }, photos: [] },
    reportStep: 1,
    reportStartStep: 1,
    reportSearchQuery: '',
    reportPhotoAdded: false,
    myReports: [],
    addStep: 1,
    addSearchQuery: '',
    addPin: { x: 50, y: 46 },
    photoAddStep: 1,
    photoAddSearchQuery: '',
    photoAddParkId: null,
    photoAddPhotos: [],
    contribTab: 'added',
    quickMenuOpen: false,
    actionIntroType: null,
    children: [{ age: 4 }, { age: 7 }],
    newChildAge: '',
    toast: null,
    parks: [
      { id: 1, name: 'Square Voltaire', address: '12 rue Voltaire', distanceLabel: '180 m', distanceM: 180, age: '3-6 ans', ageMin: 3, ageMax: 6, closesAt: '20h00', wc: true, shade: true, fenced: true, pmr: false, benches: true, water: true, parking: false, playEquipment: ['toboggan', 'swing', 'climbing', 'sandbox'], surface: 'Sable', rating: 4.5, reviewCount: 2, pinLeft: '24%', pinTop: '38%', busy: [35, 60, 45, 75, 55], photoGallery: [1, 2, 3],
        reviews: [
          { name: 'Laure', stars: 5, date: '2 juil.', comment: 'Très ombragé, parfait l\u2019été. WC propres.', hasPhoto: true },
          { name: 'Karim', stars: 4, date: '18 juin', comment: 'Bien clôturé, mon fils de 4 ans adore le toboggan.' },
        ] },
      { id: 2, name: 'Parc des Tilleuls', address: '4 avenue des Tilleuls', distanceLabel: '420 m', distanceM: 420, age: 'Tout âge', ageMin: 0, ageMax: 12, closesAt: '21h00', wc: true, shade: true, fenced: false, pmr: true, benches: true, water: false, parking: true, playEquipment: ['toboggan', 'swing', 'climbing', 'sandbox', 'springs', 'zipline', 'carousel', 'multisport'], surface: 'Gazon', rating: 4.0, reviewCount: 2, pinLeft: '58%', pinTop: '26%', busy: [25, 50, 60, 80, 65], photoGallery: [1, 2],
        reviews: [
          { name: 'Sophie', stars: 4, date: '30 juin', comment: 'Accès PMR bien pensé, parking à côté.' },
          { name: 'Julien', stars: 4, date: '11 juin', comment: 'Pas clôturé, à surveiller si l\u2019enfant est petit.' },
        ] },
      { id: 3, name: 'Aire de jeux Bellevue', address: '9 chemin de Bellevue', distanceLabel: '650 m', distanceM: 650, age: '-3 ans', ageMin: 0, ageMax: 3, closesAt: '19h00', closingSoon: true, wc: false, shade: false, fenced: true, pmr: false, benches: false, water: false, parking: false, playEquipment: ['toboggan', 'swing'], surface: 'Sol souple', rating: 3.5, reviewCount: 1, pinLeft: '40%', pinTop: '64%', busy: [20, 30, 25, 45, 30], photoGallery: [1],
        reviews: [ { name: 'Nadia', stars: 3.5, date: '5 juin', comment: 'Petit mais sécurisé, manque de bancs.' } ] },
      { id: 4, name: 'Jardin des Moineaux', address: '2 place des Moineaux', distanceLabel: '900 m', distanceM: 900, age: '6-12 ans', ageMin: 6, ageMax: 12, closesAt: '22h00', wc: true, shade: false, fenced: true, pmr: true, benches: true, water: true, parking: true, playEquipment: ['toboggan', 'swing', 'climbing', 'sandbox', 'springs', 'zipline', 'carousel', 'motorcourse', 'multisport', 'waterplay'], surface: 'Sable', rating: 5, reviewCount: 3, pinLeft: '74%', pinTop: '52%', busy: [40, 70, 55, 85, 70], photoGallery: [1, 2, 3],
        reviews: [
          { name: 'Marc', stars: 5, date: '1 juil.', comment: 'Le meilleur du quartier, tout est présent.', hasPhoto: true },
          { name: 'Ines', stars: 5, date: '22 juin', comment: 'Parking facile, très complet.' },
        ] },
      { id: 5, name: 'Square Curie', address: '15 rue Curie', distanceLabel: '1.1 km', distanceM: 1100, age: '3-6 ans', ageMin: 3, ageMax: 6, closesAt: '20h30', wc: false, shade: true, fenced: false, pmr: false, benches: true, water: false, parking: false, playEquipment: [], surface: 'Gazon', rating: 4.2, reviewCount: 2, pinLeft: '15%', pinTop: '70%', busy: [15, 35, 30, 50, 35], photoGallery: [1],
        reviews: [ { name: 'Yasmine', stars: 4, date: '19 juin', comment: 'Calme et ombragé, pas de WC par contre.' } ] },
      { id: 6, name: 'Parc Belleville', address: '30 boulevard Belleville', distanceLabel: '1.4 km', distanceM: 1400, age: 'Tout âge', ageMin: 0, ageMax: 12, closesAt: '23h00', wc: true, shade: true, fenced: true, pmr: true, benches: true, water: true, parking: true, playEquipment: ['toboggan', 'swing', 'climbing'], surface: 'Sol souple', rating: 4.8, reviewCount: 4, pinLeft: '86%', pinTop: '20%', busy: [45, 75, 60, 90, 80], photoGallery: [1, 2, 3, 4],
        reviews: [ { name: 'Paul', stars: 5, date: '3 juil.', comment: 'Complet et bien entretenu, on y passe l\u2019après-midi.' } ] },
      { id: 7, name: 'Parc des Acacias', address: '5 rue des Acacias', distanceLabel: '750 m', distanceM: 750, age: '2-6 ans', ageMin: 2, ageMax: 6, closesAt: '20h00', wc: true, shade: true, fenced: true, pmr: false, benches: true, water: true, parking: false, playEquipment: ['toboggan', 'swing', 'climbing', 'waterplay', 'sandbox'], surface: 'Sable', rating: 4.6, reviewCount: 98, pinLeft: '68%', pinTop: '42%', busy: [30, 55, 50, 70, 60], photoGallery: [1, 2, 3],
        reviews: [ { name: 'Chloé', stars: 5, date: '15 août', comment: 'Le toboggan signalé a été réparé très vite, parfait maintenant.' } ] },
    ],
  };

  go(screen) { this.setState({ screen }); }
  back() {
    const cur = this.state.screen;
    if (cur === 'detail') this.setState({ screen: this.state.detailFrom || 'map' });
    else if (cur === 'rate') this.setState({ screen: 'detail', rateSubmitted: false });
    else if (cur === 'legal') this.setState({ screen: this.state.legalFrom });
    else if (['editProfile', 'myParks', 'myReviews', 'notifications', 'privacy', 'help', 'activity', 'contributions'].includes(cur)) this.setState({ screen: 'profile' });
    else if (cur === 'contact') this.setState({ screen: 'help' });
    else if (cur === 'directions') this.setState({ screen: this.state.directionsFrom || 'map' });
    else if (cur === 'report') {
      if (this.state.reportStep > this.state.reportStartStep) this.setState(s => ({ reportStep: s.reportStep - 1 }));
      else this.setState({ screen: 'detail' });
    }
    else if (cur === 'add') {
      if (this.state.addStep > 1) this.setState(s => ({ addStep: s.addStep - 1 }));
      else this.setState({ screen: 'map' });
    }
    else if (cur === 'notifResolved') this.setState({ screen: 'notifCenter' });
    else if (cur === 'notifCenter') this.setState({ screen: this.state.notifCenterFrom || 'map' });
    else if (['scoreDetail', 'detailPhotos', 'detailAmenities', 'detailReviews'].includes(cur)) this.setState({ screen: 'detail' });
    else this.setState({ screen: 'map' });
  }
  goHome() { this.setState({ screen: 'map' }); }
  openAdd() { if (!this.requireAccount(() => this.openAdd())) return; this.setState({ screen: 'add', addStep: 1, addForm: { name: '', address: '', description: '', ageMin: 2, ageMax: 8, fenced: true, shade: true, pmr: false, wc: false, benches: false, water: false, parking: false, playTypes: { toboggan: true, swing: true, climbing: false, springs: false, sandbox: false, other: false }, photos: [] } }); }
  goScoreDetail() { this.setState({ screen: 'scoreDetail' }); }
  goDetailPhotos() { this.setState({ screen: 'detailPhotos' }); }
  goDetailAmenities() { this.setState({ screen: 'detailAmenities' }); }
  goDetailReviews() { this.setState({ screen: 'detailReviews' }); }
  goContributions() { this.setState({ screen: 'contributions' }); }
  setContribTab(tab) { this.setState({ contribTab: tab }); }
  addChild() {
    const age = parseInt(this.state.newChildAge, 10);
    if (isNaN(age) || age < 0 || age > 17) return;
    this.setState(s => ({ children: [...s.children, { age }], newChildAge: '' }));
  }
  removeChild(i) { this.setState(s => ({ children: s.children.filter((_, idx) => idx !== i) })); }
  toggleQuickMenu() { this.setState(s => ({ quickMenuOpen: !s.quickMenuOpen })); }
  closeQuickMenu() { this.setState({ quickMenuOpen: false }); }
  openActionIntro(type) {
    if ((type === 'add' || type === 'rate') && !this.requireAccount(() => this.openActionIntro(type))) { this.setState({ quickMenuOpen: false }); return; }
    this.setState({ screen: 'actionIntro', actionIntroType: type, quickMenuOpen: false });
  }
  closeActionIntro() { this.setState({ screen: 'map', actionIntroType: null }); }
  actionIntroCommencer() {
    const t = this.state.actionIntroType;
    if (t === 'add') this.setState({ screen: 'add', addStep: 1, addForm: { name: '', address: '', description: '', ageMin: 2, ageMax: 8, fenced: true, shade: true, pmr: false, wc: false, benches: false, water: false, parking: false, playTypes: { toboggan: true, swing: true, climbing: false, springs: false, sandbox: false, other: false }, photos: [] } });
    else if (t === 'rate') this.goRate(false);
    else if (t === 'report') this.setState({ screen: 'report', reportStep: 1, reportStartStep: 1, reportSearchQuery: '', selectedParkId: null, reportPhotoAdded: false, reportReasons: { broken: false, safety: false, maintenance: false, vegetation: false, accessibility: false, wrong: false, other: false }, reportComment: '' });
  }
  goMoreActions() { this.setState({ screen: 'moreActions', quickMenuOpen: false }); }
  goPhotoAdd() {
    if (!this.requireAccount(() => this.goPhotoAdd())) return;
    this.setState({ screen: 'photoAdd', photoAddStep: 1, photoAddSearchQuery: '', photoAddParkId: null, photoAddPhotos: [], quickMenuOpen: false });
  }
  selectPhotoAddPark(id) { this.setState({ photoAddParkId: id, photoAddStep: 2 }); }
  addPhotoAddPhoto() {
    this.setState(s => {
      if (s.photoAddPhotos.length >= 4) return {};
      const photo = { id: Date.now() + Math.random(), url: photoUrl('padd-' + Date.now() + '-' + s.photoAddPhotos.length, 300, 300) };
      photo.remove = () => this.removePhotoAddPhoto(photo.id);
      return { photoAddPhotos: [...s.photoAddPhotos, photo] };
    });
  }
  removePhotoAddPhoto(id) { this.setState(s => ({ photoAddPhotos: s.photoAddPhotos.filter(p => p.id !== id) })); }
  submitPhotoAdd() {
    if (!this.state.photoAddPhotos.length) return;
    const pid = this.state.photoAddParkId;
    this.setState(s => ({
      parks: s.parks.map(p => p.id === pid ? { ...p, photoGallery: [...(p.photoGallery || []), ...s.photoAddPhotos.map(ph => ph.url)] } : p),
      photoAddStep: 3,
    }));
  }
  finishPhotoAdd() {
    const id = this.state.photoAddParkId;
    this.setState({ screen: 'map', photoAddStep: 1 });
    if (id != null) this.openDetail(id, 'map');
  }
  photoStub() { this.showToast('Ouverture de l’appareil photo (bientôt disponible)'); }
  questionStub() { this.showToast('Questions à la communauté (bientôt disponible)'); }
  openDetail(id, from) { this.setState({ selectedParkId: id, screen: 'detail', detailFrom: from || 'map', heroIndex: 0, amenitiesSheetOpen: false }); this.visitPark(id); }
  openAmenitiesSheet() { this.setState({ amenitiesSheetOpen: true }); }
  closeAmenitiesSheet() { this.setState({ amenitiesSheetOpen: false }); }
  nextHeroPhoto(e) { if (e) e.stopPropagation(); this.setState(s => ({ heroIndex: (s.heroIndex || 0) + 1 })); }
  prevHeroPhoto(e) { if (e) e.stopPropagation(); this.setState(s => ({ heroIndex: Math.max(0, (s.heroIndex || 0) - 1) })); }
  onHeroPointerDown = (e) => { this._heroStartX = e.clientX; };
  onHeroPointerUp = (e) => {
    if (this._heroStartX == null) return;
    const dx = e.clientX - this._heroStartX;
    const rect = e.currentTarget.getBoundingClientRect();
    const tapRight = (e.clientX - rect.left) > rect.width / 2;
    this._heroStartX = null;
    const count = (this._heroPhotoCount || 1);
    if (Math.abs(dx) > 30) {
      if (dx < 0) this.setState(s => ({ heroIndex: ((s.heroIndex || 0) + 1) % count }));
      else this.setState(s => ({ heroIndex: ((s.heroIndex || 0) - 1 + count) % count }));
    } else {
      if (tapRight) this.setState(s => ({ heroIndex: ((s.heroIndex || 0) + 1) % count }));
      else this.setState(s => ({ heroIndex: ((s.heroIndex || 0) - 1 + count) % count }));
    }
  };
  goFilters() { this.setState({ screen: 'filters' }); }
  setFilterDistance(d) { this.setState(s => ({ filters: { ...s.filters, distance: d } })); }
  setSortMode(mode) { this.setState({ sortMode: mode }); }
  goRate(skipChoice) {
    if (!this.requireAccount(() => this.goRate(skipChoice))) return;
    this.setState({ screen: 'rate', rateStep: skipChoice === false ? 1 : 2, rateSearchQuery: '', rateStars: 0, rateComment: '', ratePhotoAdded: false, rateSubmitted: false, rateTags: { clean: false, safe: false, shade: false }, rateCriteria: { clean: 0, safety: 0, equipment: 0, comfort: 0 }, rateChildAge: '', rateAgeBand: '' });
  }
  setRateCriteria(key, val) { this.setState(s => ({ rateCriteria: { ...s.rateCriteria, [key]: val } })); }
  selectRatePark(id) { this.setState({ selectedParkId: id, rateStep: 2 }); }
  rateNext() { this.setState(s => (s.rateStep === 2 && s.rateStars <= 0 ? {} : { rateStep: Math.min(3, s.rateStep + 1) })); }


  isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
  nextAfterAuth(isNewAccount) {
    if (this._pendingResume) return null;
    if (isNewAccount && !this.state.onboardingSkipped) return 'permissions';
    return 'map';
  }
  resolveAfterAuth(isNewAccount) {
    if (this._pendingResume) { const fn = this._pendingResume; this._pendingResume = null; fn(); return; }
    this.setState({ screen: this.nextAfterAuth(isNewAccount) });
  }
  persistSession(patch) {
    try {
      const raw = localStorage.getItem('toboggo_session');
      const cur = raw ? JSON.parse(raw) : {};
      localStorage.setItem('toboggo_session', JSON.stringify({ ...cur, ...patch }));
    } catch (e) {}
  }
  continueAsGuest() { this.setState({ guestMode: true }, () => this.resolveAfterAuth(false)); }
  socialAppleContinue() { this.setState({ loggedIn: true, guestMode: false, prefsConfigured: true, authError: '' }, () => { this.persistSession({ loggedIn: true, prefsConfigured: true }); this.showToast('Connecté avec Apple'); this.resolveAfterAuth(false); }); }
  socialGoogleContinue() { this.setState({ loggedIn: true, guestMode: false, prefsConfigured: true, authError: '' }, () => { this.persistSession({ loggedIn: true, prefsConfigured: true }); this.showToast('Connecté avec Google'); this.resolveAfterAuth(false); }); }
  socialFacebookContinue() { this.setState({ loggedIn: true, guestMode: false, prefsConfigured: true, authError: '' }, () => { this.persistSession({ loggedIn: true, prefsConfigured: true }); this.showToast('Connecté avec Facebook'); this.resolveAfterAuth(false); }); }
  goLoginScreen() { this.setState({ screen: 'login', authMode: 'login', authOrigin: 'method', authError: '', resetSent: false, showPwd: false }); }
  goLoginMethod() { this.setState({ screen: 'login', authMode: 'login', authOrigin: 'method', authError: '', resetSent: false, showPwd: false }); }
  backToSplash() { this.setState({ screen: 'onboarding' }); }
  goEmailLogin() { this.setState({ screen: 'login', authMode: 'login', authOrigin: 'method', resetSent: false, showPwd: false }); }
  goEmailSignup() { this.setState({ screen: 'login', authMode: 'signup', authOrigin: 'splash', resetSent: false, showPwd: false }); }
  goEmailFormBack() { this.setState({ screen: this.state.authOrigin === 'splash' ? 'onboarding' : 'loginMethod' }); }
  toggleAuthMode() { this.setState(s => ({ authMode: s.authMode === 'login' ? 'signup' : 'login', resetSent: false })); }
  togglePwdVisibility() { this.setState(s => ({ showPwd: !s.showPwd })); }
  phoneComingSoon() { this.showToast('Connexion par téléphone bientôt disponible'); }
  sendMagicLink() {
    if (!this.isValidEmail(this.state.onboardEmail)) { this.showToast('Entrez votre e-mail pour recevoir le lien'); return; }
    this.showToast('Lien de connexion envoyé à ' + this.state.onboardEmail);
  }
  submitAuth() { this.state.authMode === 'signup' ? this.signup() : this.login(); }
  goForgotPassword() { this.sendResetEmail(); }
  sendResetEmail() {
    if (!this.isValidEmail(this.state.onboardEmail)) { this.showToast('Entrez votre e-mail pour recevoir le lien'); return; }
    this.setState({ resetSent: true });
  }
  requireAccount(resumeFn) {
    if (this.state.loggedIn) return true;
    this._pendingResume = resumeFn || null;
    this.setState({ screen: 'login', authMode: 'login', authOrigin: 'method', authError: '', resetSent: false });
    this.showToast('Connectez-vous pour continuer');
    return false;
  }
  submitAuth() { if (this.state.authLoading) return; this.state.authMode === 'signup' ? this.signup() : this.login(); }
  login() {
    if (!this.isValidEmail(this.state.onboardEmail) || !this.state.onboardPwd.trim()) {
      this.setState({ authError: 'Entrez une adresse e-mail et un mot de passe valides.' });
      return;
    }
    this.setState({ authLoading: true, authError: '' });
    setTimeout(() => {
      if (this.state.onboardPwd.trim().length < 4) {
        this.setState({ authLoading: false, authError: 'Adresse e-mail ou mot de passe incorrect.' });
        return;
      }
      this.setState({ authLoading: false, loggedIn: true, guestMode: false, prefsConfigured: true }, () => {
        this.persistSession({ loggedIn: true, prefsConfigured: true });
        this.resolveAfterAuth(false);
      });
    }, 600);
  }
  signup() {
    if (!this.isValidEmail(this.state.onboardEmail) || !this.state.onboardPwd.trim()) {
      this.setState({ authError: 'Entrez une adresse e-mail et un mot de passe valides.' });
      return;
    }
    this.setState({ authLoading: true, authError: '' });
    setTimeout(() => {
      this.setState({ authLoading: false, loggedIn: true, guestMode: false, prefsConfigured: false }, () => {
        this.persistSession({ loggedIn: true, prefsConfigured: false });
        this.showToast('Compte créé');
        this.resolveAfterAuth(true);
      });
    }, 600);
  }
  togglePermLocation() { this.setState(s => ({ permLocation: !s.permLocation })); }
  togglePermNotif() { this.setState(s => ({ permNotif: !s.permNotif })); }
  goNotifCenter(from) { this.setState({ screen: 'notifCenter', notifCenterFrom: from || 'map' }); }
  markAllNotifsRead() { this.setState(s => ({ notifications: s.notifications.map(n => ({ ...n, read: true })) })); }
  markNotifRead(id, e) { if (e) e.stopPropagation(); this.setState(s => ({ notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n) })); }
  openNotification(id) {
    const n = this.state.notifications.find(x => x.id === id);
    this.setState(s => ({ notifications: s.notifications.map(x => x.id === id ? { ...x, read: true } : x) }));
    if (!n) return;
    if (n.type === 'resolved') this.setState({ screen: 'notifResolved', notifResolvedId: id });
    else if (n.type === 'newPark') this.openDetail(n.parkId || 4, 'notifCenter');
    else if (n.type === 'thanks') this.setState({ screen: 'myReviews' });
    else if (n.type === 'confirm') this.showToast('Merci, votre confirmation a été envoyée');
    else if (n.type === 'recommend') this.setState({ screen: 'filters' });
  }
  onOnboardAgeMinChange(e) { const v = parseInt(e.target.value, 10); this.setState(s => ({ onboardAgeMin: Math.min(v, s.onboardAgeMax) })); }
  onOnboardAgeMaxChange(e) { const v = parseInt(e.target.value, 10); this.setState(s => ({ onboardAgeMax: Math.max(v, s.onboardAgeMin) })); }
  useOnboardLocation() { this.setState({ showLocationPermModal: true }); }
  allowOnboardLocation() { this.setState({ onboardZoneSet: true, showLocationPermModal: false, permLocation: true }); this.locateUser(); }
  denyOnboardLocation() { this.setState({ onboardZoneSet: false, showLocationPermModal: false, permLocation: false }); }
  savePersonalize(skipped) {
    this.persistSession({ prefsConfigured: true, onboardingSkipped: !!skipped });
    this.setState({ prefsConfigured: true, onboardingSkipped: !!skipped, screen: 'map' });
  }
  continueFromPermissions() { this.savePersonalize(false); }
  skipPersonalize() { this.savePersonalize(true); }
  goPrivacyPolicy() { this.setState({ screen: 'legal', legalDoc: 'privacy', legalFrom: this.state.loggedIn || this.state.guestMode ? 'privacy' : 'onboarding' }); }
  goTerms() { this.setState({ screen: 'legal', legalDoc: 'terms', legalFrom: this.state.loggedIn || this.state.guestMode ? 'privacy' : 'onboarding' }); }
  goMentions() { this.setState({ screen: 'legal', legalDoc: 'mentions', legalFrom: 'privacy' }); }
  openDeleteConfirm() { this.setState({ showDeleteConfirm: true }); }
  closeDeleteConfirm() { this.setState({ showDeleteConfirm: false }); }
  confirmDeleteAccount() {
    this.setState({ showDeleteConfirm: false, loggedIn: false, guestMode: false, screen: 'onboarding', onboardPwd: '' });
    this.showToast('Compte supprimé. Vos données seront effacées sous 30 jours.');
  }
  openCitySwitcher() { this.setState({ isCitySwitcherOpen: true, citySearch: '' }); }
  closeCitySwitcher() { this.setState({ isCitySwitcherOpen: false }); }
  useCurrentLocation() { this.setState({ locationLabel: 'Autour de vous', isCitySwitcherOpen: false }); }
  selectCity(label) { this.setState({ locationLabel: label, isCitySwitcherOpen: false }); }
  logout() { try { localStorage.removeItem('toboggo_session'); } catch (e) {} this.setState({ loggedIn: false, guestMode: false, screen: 'onboarding', onboardPwd: '' }); }
  componentDidMount() {
    try {
      const raw = localStorage.getItem('toboggo_prefs');
      if (raw) {
        const saved = JSON.parse(raw);
        this.setState({
          favorites: saved.favorites || {},
          darkMode: !!saved.darkMode,
          recentIds: saved.recentIds || [],
          offlineMode: !!saved.offlineMode,
        });
      }
    } catch (e) {}
    try {
      const rawSession = localStorage.getItem('toboggo_session');
      if (rawSession) {
        const sess = JSON.parse(rawSession);
        if (sess.loggedIn) this.setState({ loggedIn: true, screen: 'map', prefsConfigured: !!sess.prefsConfigured, onboardingSkipped: !!sess.onboardingSkipped });
      }
    } catch (e) {}
    setTimeout(() => {
      this.setState({ booting: false });
      this.locateUser();
      if (!localStorage.getItem('toboggo_tour_seen')) {
        this.notifyMember("Astuce : essayez le mode sombre, le comparateur et les sorties de groupe depuis votre profil");
        localStorage.setItem('toboggo_tour_seen', '1');
      }
    }, 700);
  }
  persistPrefs() {
    try {
      localStorage.setItem('toboggo_prefs', JSON.stringify({
        favorites: this.state.favorites, darkMode: this.state.darkMode,
        recentIds: this.state.recentIds, offlineMode: this.state.offlineMode,
      }));
    } catch (e) {}
  }
  locateUser() {
    if (!navigator.geolocation) { this.setState({ gpsFailed: true }); return; }
    navigator.geolocation.getCurrentPosition(
      () => this.setState({ gpsFailed: false }),
      () => this.setState({ gpsFailed: true }),
      { timeout: 5000 }
    );
  }
  saveProfile() { this.setState({ screen: 'profile' }); this.showToast('Profil mis à jour'); }
  toggleNotif(key) { this.setState(s => ({ notifPrefs: { ...s.notifPrefs, [key]: !s.notifPrefs[key] } })); }
  toggleNotifChannel(key) { this.setState(s => ({ notifChannels: { ...s.notifChannels, [key]: !s.notifChannels[key] } })); }
  togglePrivacy(key) { this.setState(s => ({ privacyPrefs: { ...s.privacyPrefs, [key]: !s.privacyPrefs[key] } })); }
  downloadDataStub() { this.showToast('Export de vos données en cours… vous recevrez un e-mail sous 48h.'); }
  contactSupportStub() { this.showToast('Ouverture du support…'); }
  toggleHelp(i) { this.setState(s => ({ helpOpenIndex: s.helpOpenIndex === i ? null : i })); }
  toggleScoreInfo() { this.setState(s => ({ scoreInfoOpen: !s.scoreInfoOpen })); }
  goContact() { this.setState({ screen: 'contact', contactSent: false, contactMessage: '', contactSubject: 'Question générale' }); }
  setContactSubject(sub) { this.setState({ contactSubject: sub }); }
  submitContact() {
    if (!this.state.contactMessage.trim()) return;
    this.setState({ contactSent: true });
  }

  toggleFavorite(id) {
    if (!this.requireAccount(() => this.toggleFavorite(id))) return;
    this.setState(s => { const f = { ...s.favorites }; if (f[id]) delete f[id]; else f[id] = true; return { favorites: f }; }, () => this.persistPrefs());
  }
  toggleSelectedFavorite() { this.toggleFavorite(this.state.selectedParkId); }

  toggleFilter(key) { this.setState(s => ({ filters: { ...s.filters, [key]: !s.filters[key] } })); }
  setFilterAgeRange(range) { this.setState(s => ({ filters: { ...s.filters, ageRange: range } })); }
  setFilterAgeMin(v) { this.setState(s => ({ filters: { ...s.filters, ageRange: [Math.min(v, s.filters.ageRange[1]), s.filters.ageRange[1]] } })); }
  setFilterAgeMax(v) { this.setState(s => ({ filters: { ...s.filters, ageRange: [s.filters.ageRange[0], Math.max(v, s.filters.ageRange[0])] } })); }
  resetFilters() { this.setState({ filters: { ageRange: [0, 12], wc: false, shade: false, fenced: false, pmr: false, benches: false, water: false, parking: false } }); }
  toggleRateTag(key) { this.setState(s => ({ rateTags: { ...s.rateTags, [key]: !s.rateTags[key] } })); }
  cycleWeather() {
    const order = ['heat', 'rain', 'wind'];
    const next = order[(order.indexOf(this.state.weatherCondition) + 1) % order.length];
    this.setState({ weatherCondition: next, weatherAlertDismissed: false });
  }
  flagReview(parkId, i) {
    const key = parkId + '-' + i;
    if (this.state.flaggedReviews[key]) return;
    this.setState(s => ({ flaggedReviews: { ...s.flaggedReviews, [key]: true } }));
    this.showToast('Avis signalé — notre équipe va le vérifier');
  }
  quickGo() {
    const nearest = [...this.state.parks].sort((a, b) => a.distanceM - b.distanceM).slice(0, 3);
    const best = nearest.sort((a, b) => b.rating - a.rating)[0] || this.state.parks[0];
    this.setState({ selectedParkId: best.id, screen: 'directions', directionsFrom: 'map', directionsMode: 'walk', directionsStops: { bakery: false, parking: false, water: false } });
    this.showToast('Départ rapide vers ' + best.name);
  }

  toggleAddCriteria(key) { this.setState(s => ({ addForm: { ...s.addForm, [key]: !s.addForm[key] } })); }
  setAddField(key, val) { this.setState(s => ({ addForm: { ...s.addForm, [key]: val } })); }
  addPhoto() {
    this.setState(s => {
      if (s.addForm.photos.length >= 4) return {};
      const photo = { id: Date.now() + Math.random(), url: photoUrl('add-' + Date.now() + '-' + s.addForm.photos.length, 300, 300), isMain: s.addForm.photos.length === 0 };
      photo.remove = () => this.removeAddPhoto(photo.id);
      return { addForm: { ...s.addForm, photos: [...s.addForm.photos, photo] } };
    });
  }
  removeAddPhoto(id) {
    this.setState(s => {
      const photos = s.addForm.photos.filter(p => p.id !== id).map((p, i) => ({ ...p, isMain: i === 0 }));
      return { addForm: { ...s.addForm, photos } };
    });
  }

  setRateStars(n) { this.setState({ rateStars: n }); }

  applyIdea(type) {
    if (type === 'shade') this.setState(s => ({ filters: { ...s.filters, shade: true } }));
    else if (type === 'toddlers') this.setState(s => ({ filters: { ...s.filters, ageRange: [0, 3] } }));
    else if (type === 'equipped') this.setState(s => ({ filters: { ...s.filters, fenced: true, wc: true, benches: true } }));
    else if (type === 'top') this.setSortMode('rating');
  }
  applyChildrenAgeFilter() {
    const ages = this.state.children.map(c => c.age);
    if (!ages.length) return;
    this.setState(s => ({ filters: { ...s.filters, ageRange: [Math.min(...ages), Math.max(...ages)] } }));
  }
  cycleSheet() {
    const pts = [200, 340, 560];
    const cur = this.state.sheetHeight;
    const idx = pts.reduce((best, p, i) => Math.abs(p - cur) < Math.abs(pts[best] - cur) ? i : best, 0);
    this.setState({ sheetHeight: pts[(idx + 1) % pts.length] });
  }
  onSheetPointerDown = (e) => {
    this._dragStart = { y: e.clientY, h: this.state.sheetHeight };
    this.setState({ dragging: true });
    document.addEventListener('pointermove', this.onSheetPointerMove);
    document.addEventListener('pointerup', this.onSheetPointerUp);
  };
  onSheetPointerMove = (e) => {
    if (!this._dragStart) return;
    const dy = this._dragStart.y - e.clientY;
    const h = Math.max(90, Math.min(600, this._dragStart.h + dy));
    this.setState({ sheetHeight: h });
  };
  onSheetPointerUp = () => {
    document.removeEventListener('pointermove', this.onSheetPointerMove);
    document.removeEventListener('pointerup', this.onSheetPointerUp);
    const pts = [200, 340, 560];
    const h = this.state.sheetHeight;
    const nearest = pts.reduce((a, b) => Math.abs(b - h) < Math.abs(a - h) ? b : a);
    this._dragStart = null;
    this.setState({ sheetHeight: nearest, dragging: false });
  };
  previewPark(id) { this.setState(s => ({ previewParkId: id, sheetHeight: Math.max(s.sheetHeight, 400) })); }
  closePreview() { this.setState({ previewParkId: null }); }
  openSearch() { this.setState({ searchOpen: true }); }
  closeSearch() { this.setState({ searchOpen: false, search: '' }); }
  clearSearchText() { this.setState({ search: '' }); }
  addRecentSearch(label) {
    if (!label) return;
    this.setState(s => ({ recentSearches: [label, ...s.recentSearches.filter(r => r !== label)].slice(0, 5) }));
  }
  selectSearchPark(id) {
    const p = this.state.parks.find(pk => pk.id === id);
    this.addRecentSearch(p ? p.name : '');
    this.setState(s => ({ searchOpen: false, search: '', previewParkId: id, sheetHeight: Math.max(s.sheetHeight, 400) }));
  }
  selectSearchCity(name) {
    this.addRecentSearch(name);
    this.setState({ searchOpen: false, search: '', locationLabel: name, previewParkId: null });
  }
  openFromPreview() {
    if (this.state.previewParkId) { this.openDetail(this.state.previewParkId, 'map'); this.setState({ previewParkId: null }); }
  }

  showToast(msg) {
    this.setState({ toast: msg });
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.setState({ toast: null }), 2200);
  }
  openDirections() { this.setState({ screen: 'directions', directionsFrom: 'detail', directionsMode: 'walk', directionsStops: { bakery: false, parking: false, water: false } }); }
  openShareFromPreview() { this.setState({ isShareOpen: true, shareParkId: this.state.previewParkId }); }
  openReviewsFromPreview() {
    if (this.state.previewParkId) this.setState({ selectedParkId: this.state.previewParkId, screen: 'detailReviews', detailFrom: 'map', previewParkId: null });
  }
  reportFromPreview() {
    this.setState({
      selectedParkId: this.state.previewParkId, screen: 'report', reportStep: 2, reportStartStep: 2, reportPhotoAdded: false,
      reportReasons: { broken: false, safety: false, maintenance: false, vegetation: false, accessibility: false, wrong: false, other: false }, reportComment: '',
    });
  }
  openDirectionsFromPreview() {
    if (this.state.previewParkId) this.setState({ selectedParkId: this.state.previewParkId, screen: 'directions', directionsFrom: 'map', directionsMode: 'walk', directionsStops: { bakery: false, parking: false, water: false }, previewParkId: null });
  }
  setDirectionsMode(mode) { this.setState({ directionsMode: mode }); }
  toggleDirectionsStop(key) { this.setState(s => ({ directionsStops: { ...s.directionsStops, [key]: !s.directionsStops[key] } })); }
  startNavigation() {
    const p = this.state.parks.find(pk => pk.id === this.state.selectedParkId);
    const stopLabels = { bakery: 'boulangerie', parking: 'parking', water: "point d'eau" };
    const stops = Object.keys(this.state.directionsStops).filter(k => this.state.directionsStops[k]).map(k => stopLabels[k]);
    const targetId = this.state.selectedParkId;
    this.setState({ screen: this.state.directionsFrom || 'map' });
    this.showToast('Navigation démarrée vers ' + (p ? p.name : 'le parc') + (stops.length ? ' via ' + stops.join(', ') : ''));
    clearTimeout(this._visitTimer);
    this._visitTimer = setTimeout(() => this.setState({ visitPromptParkId: targetId }), 8000);
  }
  expandSheetFull() { this.setState({ sheetHeight: 560 }); }
  goReport() { this.setState({ screen: 'report', reportStep: 2, reportStartStep: 2, reportPhotoAdded: false, reportReasons: { broken: false, safety: false, maintenance: false, vegetation: false, accessibility: false, wrong: false, other: false }, reportComment: '' }); }
  selectReportPark(id) { this.setState({ selectedParkId: id, reportStep: 2 }); }
  reportNext() { this.setState(s => ({ reportStep: Math.min(4, s.reportStep + 1) })); }
  toggleReportPhoto() { this.setState(s => ({ reportPhotoAdded: !s.reportPhotoAdded })); }
  toggleReportReason(key) { this.setState(s => ({ reportReasons: Object.fromEntries(Object.keys(s.reportReasons).map(k => [k, k === key])) })); }
  submitReport() {
    if (!Object.values(this.state.reportReasons).some(Boolean)) return;
    const park = this.state.parks.find(p => p.id === this.state.selectedParkId);
    this.setState(s => ({ reportStep: 4, myReports: [{ parkName: park ? park.name : '', date: 'Aujourd’hui' }, ...s.myReports] }));
  }
  finishReport() { this.setState({ screen: 'detail', reportStep: 1, reportStartStep: 1 }); this.showToast('Merci, votre signalement a été transmis à notre équipe.'); }
  locateStub() { this.showToast('Position détectée sur la carte'); }
  addNext() {
    const s = this.state;
    if (s.addStep === 2 && !s.addForm.address.trim()) return;
    if (s.addStep === 3 && !s.addForm.name.trim()) return;
    this.setState(st => ({ addStep: Math.min(5, st.addStep + 1) }));
  }
  setAddPin(x, y) { this.setState({ addPin: { x, y } }); }
  toggleAddPlayType(key) { this.setState(s => ({ addForm: { ...s.addForm, playTypes: { ...s.addForm.playTypes, [key]: !s.addForm.playTypes[key] } } })); }

  submitAdd() {
    const f = this.state.addForm;
    if (!f.name.trim() || !f.address.trim()) return;
    const pin = this.state.addPin;
    const newPark = {
      id: Date.now(), name: f.name, address: f.address, distanceLabel: '—', age: f.ageMin + '-' + f.ageMax + ' ans', ageMin: f.ageMin, ageMax: f.ageMax, closesAt: '20h00',
      fenced: f.fenced, shade: f.shade, pmr: f.pmr, wc: f.wc, benches: f.benches, water: f.water, parking: f.parking,
      description: f.description, pinLeft: pin.x + '%', pinTop: pin.y + '%',
      surface: 'Non précisé', rating: 0, reviewCount: 0, distanceM: 50, busy: [30, 50, 40, 70, 55],
      reviews: [], photoGallery: f.photos.map(p => p.url),
    };
    this.setState(s => ({
      parks: [...s.parks, newPark],
      newAddedParkId: newPark.id,
      addStep: 6,
    }));
  }
  goDetailFromAdd() {
    const id = this.state.newAddedParkId;
    this.setState({
      screen: 'map',
      addForm: { name: '', address: '', description: '', ageMin: 2, ageMax: 8, fenced: true, shade: true, pmr: false, wc: false, benches: false, water: false, parking: false, playTypes: { toboggan: true, swing: true, climbing: false, springs: false, sandbox: false, other: false }, photos: [] },
      addStep: 1, addSearchQuery: '', addPin: { x: 50, y: 46 },
    });
    if (id != null) this.openDetail(id, 'map');
  }

  submitRate() {
    if (this.state.rateStars <= 0) return;
    const id = this.state.selectedParkId;
    this.setState(s => {
      const tagLabels = { clean: 'Propre', safe: 'Sécurisé', shade: 'Ombragé' };
      const tags = Object.keys(s.rateTags).filter(k => s.rateTags[k]).map(k => tagLabels[k]);
      return {
        parks: s.parks.map(p => {
          if (p.id !== id) return p;
          const reviews = [{ name: 'Camille', date: 'Aujourd\u2019hui', stars: s.rateStars, comment: s.rateComment || 'Aucun commentaire.', hasPhoto: s.ratePhotoAdded, tags }, ...p.reviews];
          const total = p.rating * p.reviewCount + s.rateStars;
          const reviewCount = p.reviewCount + 1;
          return { ...p, reviews, reviewCount, rating: Math.round((total / reviewCount) * 10) / 10 };
        }),
        rateSubmitted: true,
        ratePhotoAdded: false,
      };
    });
  }
  finishRate() { this.setState({ screen: 'detail', rateSubmitted: false }); }

  toggleOffline() { this.setState(s => ({ offlineMode: !s.offlineMode }), () => this.persistPrefs()); }
  openShare(id) { this.setState({ isShareOpen: true, shareParkId: id }); }
  closeShare() { this.setState({ isShareOpen: false }); }
  copyShareLink() {
    const p = this.state.parks.find(pk => pk.id === (this.state.shareParkId || this.state.selectedParkId));
    const link = 'toboggo.app/p/' + slugify(p ? p.name : '');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).catch(() => {});
    this.setState({ isShareOpen: false });
    this.showToast('Lien copié dans le presse-papiers');
  }
  createGroup() {
    if (!this.requireAccount(() => this.createGroup())) return;
    const code = Math.random().toString(36).slice(2, 7).toUpperCase();
    this.setState({
      groupActive: true, groupCode: code, groupParkId: this.state.selectedParkId,
      groupMembers: [
        { name: this.state.profileName + ' (vous)', status: 'Organisateur' },
        { name: 'Lucie', status: 'En route · 8 min' },
        { name: 'Thomas', status: 'Arrivé' },
      ],
    });
    this.showToast('Sortie créée — partagez le code ' + code);
    clearTimeout(this._arriveTimer);
    this._arriveTimer = setTimeout(() => {
      this.setState(s => ({ groupMembers: s.groupMembers.map(m => m.name === 'Lucie' ? { ...m, status: 'Arrivé' } : m) }));
      this.notifyMember('🔔 Lucie est arrivée au parc');
    }, 5000);
  }
  joinGroup() {
    if (!this.requireAccount(() => this.joinGroup())) return;
    if (!this.state.groupJoinCode.trim()) return;
    this.setState({
      groupActive: true, groupCode: this.state.groupJoinCode.trim().toUpperCase(), groupParkId: this.state.selectedParkId,
      groupMembers: [
        { name: 'Lucie', status: 'Organisateur' },
        { name: this.state.profileName + ' (vous)', status: 'En route' },
      ],
      groupJoinCode: '',
    });
    this.showToast('Vous avez rejoint la sortie');
  }
  leaveGroup() { this.setState({ groupActive: false, groupCode: null, groupMembers: [], groupParkId: null }); }

  notifyMember(text) {
    this.setState({ notifBanner: text });
    clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => this.setState({ notifBanner: null }), 3600);
  }
  toggleDarkMode() { this.setState(s => ({ darkMode: !s.darkMode }), () => this.persistPrefs()); }
  toggleGpsFailed() { this.setState(s => ({ gpsFailed: !s.gpsFailed })); }
  toggleCompareMode() { this.setState(s => ({ compareMode: !s.compareMode, compareIds: [] })); }
  toggleCompareId(id) {
    this.setState(s => {
      const has = s.compareIds.includes(id);
      const compareIds = has ? s.compareIds.filter(i => i !== id) : (s.compareIds.length < 3 ? [...s.compareIds, id] : s.compareIds);
      return { compareIds };
    });
  }
  visitPark(id) {
    this.setState(s => ({ recentIds: [id, ...s.recentIds.filter(r => r !== id)].slice(0, 6) }), () => this.persistPrefs());
  }

  renderVals() {
    const s = this.state;
    const chip = (on) => ({ bg: on ? '#16A34A' : '#F1ECE0', color: on ? '#fff' : '#5B5648' });

    const ageFilterActive = s.filters.ageRange[0] !== 0 || s.filters.ageRange[1] !== 12;
    const activeFilterCount = (ageFilterActive ? 1 : 0) + CRITERIA.filter(c => s.filters[c.key]).length;

    const withPark = (p) => ({
      ...p,
      starsArr: starsArray(p.rating),
      open: () => this.openDetail(p.id, s.screen === 'favorites' ? 'favorites' : 'map'),
      preview: () => this.previewPark(p.id),
      toggleFav: () => this.toggleFavorite(p.id),
      favBg: s.favorites[p.id] ? '#FFE8EC' : '#F7F4EC',
      favFill: s.favorites[p.id] ? '#EF4444' : 'none',
      pinScore: Math.round(p.rating * 2 * 10) / 10,
      pinColor: p.rating * 2 >= 8 ? '#16A34A' : p.rating * 2 >= 6 ? '#FF8800' : '#EF4444',
      photoUrl: photoUrl(p.id + '-a', 160, 160),
    });

    const filteredParks = s.parks.filter(p =>
      (!ageFilterActive || (p.ageMax >= s.filters.ageRange[0] && p.ageMin <= s.filters.ageRange[1])) &&
      CRITERIA.every(c => !s.filters[c.key] || p[c.key]) &&
      (!s.filters.openNow || isParkOpenNow(p)) &&
      (s.search.trim() === '' || p.name.toLowerCase().includes(s.search.trim().toLowerCase()))
    ).sort((a, b) => {
      if (s.sortMode === 'rating') return b.rating - a.rating;
      if (s.sortMode === 'recent') return (b.id > 1000000000000 ? b.id : 0) - (a.id > 1000000000000 ? a.id : 0) || a.distanceM - b.distanceM;
      return a.distanceM - b.distanceM;
    }).map(withPark);

    const selectedParkRaw = s.parks.find(p => p.id === s.selectedParkId) || s.parks[0];
    const shareParkRaw = s.parks.find(p => p.id === (s.shareParkId || s.selectedParkId)) || selectedParkRaw;
    const playPriority = ['toboggan', 'swing', 'climbing', 'waterplay', 'sandbox'];
    const playKeys = selectedParkRaw.playEquipment || [];
    const playOrdered = PLAY_EQUIPMENT.filter(e => playKeys.includes(e.key)).sort((a, b) => {
      const ai = playPriority.indexOf(a.key), bi = playPriority.indexOf(b.key);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }).map(e => ({ ...e, iconSetting: { __html: e.icon } }));
    const servicesAllList = CRITERIA.filter(c => c.key !== 'shade' && c.key !== 'fenced' && selectedParkRaw[c.key]).map(c => ({ ...c, iconSetting: { __html: c.icon } }));
    const heroPhotosArr = (selectedParkRaw.photoGallery && selectedParkRaw.photoGallery.length ? selectedParkRaw.photoGallery : [0, 1, 2]).slice(0, 5).map((_, i) => photoUrl(selectedParkRaw.id + '-hero' + i, 600, 400));
    const heroIdx = (s.heroIndex || 0) % heroPhotosArr.length;
    this._heroPhotoCount = heroPhotosArr.length;
    const selectedPark = {
      ...selectedParkRaw,
      pinScore: Math.round(selectedParkRaw.rating * 2 * 10) / 10,
      starsArr: starsArray(selectedParkRaw.rating),
      activeCriteria: CRITERIA.filter(c => selectedParkRaw[c.key]).map(c => ({ ...c, iconSetting: { __html: c.icon } })),
      equipmentOn: CRITERIA.filter(c => selectedParkRaw[c.key]).map(c => ({ ...c, iconSetting: { __html: c.icon } })),
      essentialChips: [
        { label: selectedParkRaw.age, tint: '#F1ECE0', color: '#5B5648', iconSetting: { __html: '<circle cx="12" cy="7" r="3.2"></circle><path d="M5 21v-2a7 7 0 0 1 14 0v2"></path>' } },
        ...(selectedParkRaw.fenced ? [{ label: 'Clôturé', tint: '#E1F5EA', color: '#059669', iconSetting: { __html: CRITERIA.find(c => c.key === 'fenced').icon } }] : []),
        ...(selectedParkRaw.shade ? [{ label: 'Ombragé', tint: '#E7F6EC', color: '#16A34A', iconSetting: { __html: CRITERIA.find(c => c.key === 'shade').icon } }] : []),
      ].slice(0, 3),
      playAll: playOrdered,
      playTop3: playOrdered.slice(0, 3),
      playExtraCount: Math.max(0, playOrdered.length - 3),
      playHasExtra: playOrdered.length > 3,
      playEmpty: playOrdered.length === 0,
      playNotEmpty: playOrdered.length > 0,
      servicesAll: servicesAllList,
      servicesEmpty: servicesAllList.length === 0,
      heroPhotos: heroPhotosArr,
      heroCounter: (heroIdx + 1) + '/' + heroPhotosArr.length,
      heroDots: heroPhotosArr.map((_, i) => ({ activeWidth: i === heroIdx ? '18px' : '6px', activeColor: i === heroIdx ? '#fff' : 'rgba(255,255,255,.5)' })),
      ageRangeText: 'de ' + selectedParkRaw.ageMin + ' à ' + selectedParkRaw.ageMax + ' ans',
      updatedDaysAgo: (selectedParkRaw.id % 12) + 2,
      scoreTier: (() => {
        const sc = Math.round(selectedParkRaw.rating * 2 * 10) / 10;
        if (sc >= 8) return { label: 'Excellent', color: '#16A34A' };
        if (sc >= 6) return { label: 'Bon', color: '#F5A623' };
        return { label: 'À améliorer', color: '#EF6C4D' };
      })(),
      walkMinutes: Math.max(1, Math.round((selectedParkRaw.distanceM / 1000) / 4.5 * 60)),
      hasOpenIssue: !!selectedParkRaw.openIssue,
      noOpenIssue: !selectedParkRaw.openIssue,
      reportStatusText: selectedParkRaw.openIssue || 'Aucun signalement actif',
      reportStatusColor: selectedParkRaw.openIssue ? '#EF4444' : '#16A34A',
      heroPhoto: heroPhotosArr[heroIdx],
      photoGallery: (selectedParkRaw.photoGallery && selectedParkRaw.photoGallery.length ? selectedParkRaw.photoGallery : [0, 1, 2, 3]).map((_, i) => photoUrl(selectedParkRaw.id + '-g' + i, 300, 300)),
      reviews: selectedParkRaw.reviews.map(r => ({ ...r, starsArr: starsArray(r.stars), tagsText: (r.tags || []).join(' · '), photoUrl: r.hasPhoto ? photoUrl(selectedParkRaw.id + '-r' + r.name, 200, 200) : null })),
      busyBars: (selectedParkRaw.busy || [30, 50, 40, 70, 55]).map((v, i) => ({
        label: ['9h', '12h', '15h', '17h', '19h'][i],
        heightPx: Math.round(8 + v * 0.4),
        color: v > 65 ? '#FF8800' : '#16A34A',
      })),
    };

    const favoriteParks = s.parks.filter(p => s.favorites[p.id]).map(withPark).map(p => ({
      ...p,
      isCompared: s.compareIds.includes(p.id),
      compareCheckBg: s.compareIds.includes(p.id) ? '#16A34A' : '#fff',
      compareCheckBorder: s.compareIds.includes(p.id) ? '#16A34A' : '#D8D1BF',
      toggleCompareSel: () => this.toggleCompareId(p.id),
    }));

    const seg = (val, key) => (val === key ? '#16A34A' : 'transparent');
    const segColor = (val, key) => (val === key ? '#fff' : '#5B5648');

    const addedCount = s.parks.filter(p => typeof p.id === 'number' && p.id > 1000000000000).length;
    const reviewsGivenCount = s.parks.reduce((n, p) => n + p.reviews.filter(r => r.name === 'Camille').length, 0);
    const badgesList = [
      { label: 'Premier avis', desc: 'Laisser un premier avis', earned: reviewsGivenCount >= 1, color: '#FFC107', icon: BADGE_ICONS.star },
      { label: 'Contributeur', desc: 'Ajouter un parc', earned: addedCount >= 1, color: '#16A34A', icon: BADGE_ICONS.plus },
      { label: 'Explorateur', desc: '3 parcs en favoris', earned: favoriteParks.length >= 3, color: '#EF4444', icon: BADGE_ICONS.heart },
      { label: 'Grand contributeur', desc: '3 parcs ajoutés', earned: addedCount >= 3, color: '#4C9EEB', icon: BADGE_ICONS.award },
    ].map(b => ({ label: b.label, desc: b.desc, opacity: b.earned ? 1 : 0.45, iconBg: b.earned ? b.color : '#E4DFCE', iconSetting: { __html: b.icon } }));

    return {
      isSplash: !s.loggedIn && !s.guestMode && s.screen === 'onboarding',
      isLoginMethod: !s.loggedIn && !s.guestMode && s.screen === 'loginMethod',
      isLoginForm: !s.loggedIn && !s.guestMode && s.screen === 'login',
      isSignupMode: s.authMode === 'signup',
      authTitle: s.authMode === 'signup' ? 'Créer un compte' : 'Bon retour !',
      authSubtitle: s.authMode === 'signup' ? 'Créez votre compte pour sauvegarder vos parcs favoris.' : 'Connectez-vous à votre compte.',
      authSubmitLabel: s.authLoading ? (s.authMode === 'signup' ? 'Création...' : 'Connexion...') : (s.authMode === 'signup' ? 'CRÉER UN COMPTE' : 'SE CONNECTER'),
      authSwitchPrompt: s.authMode === 'signup' ? 'Vous avez déjà un compte ?' : "Pas encore de compte ?",
      authSwitchAction: s.authMode === 'signup' ? 'Se connecter' : 'Créer un compte',
      pwdFieldType: s.showPwd ? 'text' : 'password',
      pwdPlaceholder: s.authMode === 'signup' ? 'Choisissez un mot de passe' : 'Votre mot de passe',
      resetSent: s.resetSent,
      authError: s.authError,
      authLoading: s.authLoading,
      emailErrorBorder: s.authError ? '#E8746A' : '#ECE6D8',
      authSubmitDisabled: s.authLoading,
      authSubmitOpacity: s.authLoading ? 0.85 : 1,
      access: s.loggedIn || s.guestMode,
      isMap: (s.loggedIn || s.guestMode) && s.screen === 'map',
      isDetail: (s.loggedIn || s.guestMode) && s.screen === 'detail',
      amenitiesSheetOpen: s.amenitiesSheetOpen,
      openAmenitiesSheet: () => this.openAmenitiesSheet(),
      closeAmenitiesSheet: () => this.closeAmenitiesSheet(),
      onHeroPointerDown: this.onHeroPointerDown,
      onHeroPointerUp: this.onHeroPointerUp,
      isFilters: (s.loggedIn || s.guestMode) && s.screen === 'filters',
      isAdd: (s.loggedIn || s.guestMode) && s.screen === 'add',
      isRate: (s.loggedIn || s.guestMode) && s.screen === 'rate',
      isProfile: (s.loggedIn || s.guestMode) && s.screen === 'profile',
      isFavorites: (s.loggedIn || s.guestMode) && s.screen === 'favorites',
      isEditProfile: (s.loggedIn || s.guestMode) && s.screen === 'editProfile',
      isMyParks: (s.loggedIn || s.guestMode) && s.screen === 'myParks',
      isMyReviews: (s.loggedIn || s.guestMode) && s.screen === 'myReviews',
      isNotifications: (s.loggedIn || s.guestMode) && s.screen === 'notifications',
      isNotifCenter: (s.loggedIn || s.guestMode) && s.screen === 'notifCenter',
      isNotifResolved: (s.loggedIn || s.guestMode) && s.screen === 'notifResolved',
      isPrivacy: (s.loggedIn || s.guestMode) && s.screen === 'privacy',
      isDisplay: (s.loggedIn || s.guestMode) && s.screen === 'display',
      isHelp: (s.loggedIn || s.guestMode) && s.screen === 'help',
      isActivity: (s.loggedIn || s.guestMode) && s.screen === 'activity',
      activityFeed: [
        { icon: 'star', text: 'Laure a laissé un avis 5★ sur Square Voltaire', time: 'Il y a 2h', color: '#FFC107' },
        { icon: 'plus', text: 'Un nouveau parc a été ajouté : Jardin des Moineaux', time: 'Il y a 5h', color: '#16A34A' },
        { icon: 'star', text: 'Sophie a laissé un avis 4★ sur Parc des Tilleuls', time: 'Hier', color: '#FFC107' },
        { icon: 'award', text: 'Signalement résolu : toboggan réparé au Parc Belleville', time: 'Hier', color: '#4C9EEB' },
        { icon: 'heart', text: '3 parents ont ajouté un parc à leurs favoris cette semaine', time: 'Il y a 2 jours', color: '#EF4444' },
        { icon: 'star', text: 'Nadia a laissé un avis 3.5★ sur Aire de jeux Bellevue', time: 'Il y a 3 jours', color: '#FFC107' },
      ].map(a => ({ text: a.text, time: a.time, iconBg: a.color, iconSetting: { __html: BADGE_ICONS[a.icon] } })),
      isDirections: (s.loggedIn || s.guestMode) && s.screen === 'directions',
      isReport: (s.loggedIn || s.guestMode) && s.screen === 'report',
      isContact: (s.loggedIn || s.guestMode) && s.screen === 'contact',

      isHome: (s.loggedIn || s.guestMode) && s.screen === 'home',
      isScoreDetail: (s.loggedIn || s.guestMode) && s.screen === 'scoreDetail',
      isDetailPhotos: (s.loggedIn || s.guestMode) && s.screen === 'detailPhotos',
      isDetailAmenities: (s.loggedIn || s.guestMode) && s.screen === 'detailAmenities',
      isDetailReviews: (s.loggedIn || s.guestMode) && s.screen === 'detailReviews',
      isContributions: (s.loggedIn || s.guestMode) && s.screen === 'contributions',
      goHome: () => this.go('home'),
      goScoreDetail: () => this.goScoreDetail(),
      goDetailPhotos: () => this.goDetailPhotos(),
      goDetailAmenities: () => this.goDetailAmenities(),
      goDetailReviews: () => this.goDetailReviews(),
      goContributions: () => this.goContributions(),

      quickMenuOpen: s.quickMenuOpen,
      toggleQuickMenu: () => this.toggleQuickMenu(),
      closeQuickMenu: () => this.closeQuickMenu(),
      openActionIntroAdd: () => this.openActionIntro('add'),
      openActionIntroRate: () => this.openActionIntro('rate'),
      openActionIntroReport: () => this.openActionIntro('report'),
      goMoreActions: () => this.goMoreActions(),
      quickMenuPhoto: () => this.photoStub(),
      quickMenuQuestion: () => this.questionStub(),
      photoStub: () => this.photoStub(),
      questionStub: () => this.questionStub(),

      isActionIntro: (s.loggedIn || s.guestMode) && s.screen === 'actionIntro',
      isMoreActions: (s.loggedIn || s.guestMode) && s.screen === 'moreActions',
      isPhotoAdd: (s.loggedIn || s.guestMode) && s.screen === 'photoAdd',
      goPhotoAddAction: () => this.goPhotoAdd(),
      photoAddStepIs1: s.photoAddStep === 1, photoAddStepIs2: s.photoAddStep === 2, photoAddStepIs3: s.photoAddStep === 3,
      photoAddStepBefore3: s.photoAddStep < 3,
      photoAddStepsUi: ['Parc', 'Photos', 'Confirmation'].map((label, i) => {
        const n = i + 1;
        const active = s.photoAddStep === n, done = s.photoAddStep > n;
        return {
          n, label, showLine: n < 3,
          circleBg: active || done ? '#2E6FA8' : '#F1ECE0', circleColor: active || done ? '#fff' : '#B3AC9C',
          labelColor: active ? '#2E6FA8' : '#B3AC9C',
          lineColor: done ? '#2E6FA8' : '#ECE6D8',
        };
      }),
      photoAddSearchQuery: s.photoAddSearchQuery,
      onPhotoAddSearch: (e) => this.setState({ photoAddSearchQuery: e.target.value }),
      photoAddNearbyParks: s.parks.filter(p => !s.photoAddSearchQuery.trim() || p.name.toLowerCase().includes(s.photoAddSearchQuery.trim().toLowerCase()))
        .slice().sort((a, b) => (a.distanceM || 0) - (b.distanceM || 0)).slice(0, 5)
        .map(p => ({ name: p.name, distanceLabel: p.distanceLabel, photoUrl: photoUrl(p.id + '-a', 120, 120), select: () => this.selectPhotoAddPark(p.id) })),
      photoAddParkName: (s.parks.find(p => p.id === s.photoAddParkId) || {}).name || '',
      photoAddParkAddress: (s.parks.find(p => p.id === s.photoAddParkId) || {}).address || '',
      photoAddPhotos: s.photoAddPhotos,
      photoAddSlots: Array(Math.max(0, 4 - s.photoAddPhotos.length)).fill(0),
      addPhotoAddPhoto: () => this.addPhotoAddPhoto(),
      photoAddDisabled: s.photoAddPhotos.length === 0,
      submitPhotoAdd: () => this.submitPhotoAdd(),
      finishPhotoAdd: () => this.finishPhotoAdd(),
      closeActionIntro: () => this.closeActionIntro(),
      actionIntroCommencer: () => this.actionIntroCommencer(),
      actionIntroProgress: [1, 2, 3].map(n => ({ bg: n === 1 ? '#16A34A' : '#ECE6D8' })),
      actionIntroHeaderTitle: s.actionIntroType === 'add' ? 'Ajouter un parc' : s.actionIntroType === 'rate' ? 'Donner mon avis' : 'Signaler un problème',
      actionIntroIconBg: s.actionIntroType === 'add' ? '#EAF7F0' : s.actionIntroType === 'rate' ? '#FFF3D6' : '#FFF5F6',
      actionIntroAccent: s.actionIntroType === 'add' ? '#16A34A' : s.actionIntroType === 'rate' ? '#8A5A00' : '#EF4444',
      actionIntroIconSetting: { __html: s.actionIntroType === 'add'
        ? '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13z"></path><circle cx="12" cy="9" r="2.8"></circle></svg>'
        : s.actionIntroType === 'rate'
        ? '<svg width="56" height="56" viewBox="0 0 24 24" fill="#8A5A00" stroke="none"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"></path></svg>'
        : '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"></path><circle cx="12" cy="16.5" r="0.6" fill="#EF4444"></circle><path d="M12 3l9 16H3z"></path></svg>' },
      actionIntroTitle: s.actionIntroType === 'add' ? 'Partagez un nouveau parc' : s.actionIntroType === 'rate' ? 'Votre avis compte !' : 'Signalez un problème',
      actionIntroSubtitle: s.actionIntroType === 'add' ? 'Aidez la communauté à découvrir de nouveaux endroits.' : s.actionIntroType === 'rate' ? 'Partagez votre expérience et aidez les autres parents à faire le bon choix.' : 'Votre signalement aide les équipes à intervenir rapidement.',
      actionIntroSteps: (s.actionIntroType === 'add'
        ? ['Remplissez les informations essentielles', 'Ajoutez des photos', "Aidez d'autres parents !"]
        : s.actionIntroType === 'rate'
        ? ['Notez le parc', 'Évaluez les critères', 'Ajoutez un commentaire', "C'est rapide et utile !"]
        : ['Sélectionnez le type de problème', 'Ajoutez une photo (si possible)', "Indiquez l'emplacement", 'Nous transmettons l\u2019info']
      ).map(label => ({ label, iconSetting: { __html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"></path></svg>' } })),

      reportStepIs1: s.reportStep === 1, reportStepIs2: s.reportStep === 2, reportStepIs3: s.reportStep === 3, reportStepIs4: s.reportStep === 4,
      reportStepLabel: 'Étape ' + Math.min(s.reportStep, 4) + ' sur 4',
      reportNext: () => this.reportNext(),
      reportNextDisabled: s.reportStep === 2 && !Object.values(s.reportReasons).some(Boolean),
      reportSearchQuery: s.reportSearchQuery,
      onReportSearch: (e) => this.setState({ reportSearchQuery: e.target.value }),
      reportNearbyParks: s.parks.filter(p => !s.reportSearchQuery.trim() || p.name.toLowerCase().includes(s.reportSearchQuery.trim().toLowerCase()))
        .slice().sort((a, b) => (a.distanceM || 0) - (b.distanceM || 0)).slice(0, 5)
        .map(p => ({ name: p.name, distanceLabel: p.distanceLabel, photoUrl: photoUrl(p.id + '-a', 120, 120), select: () => this.selectReportPark(p.id) })),
      reportPhotoAdded: s.reportPhotoAdded,
      toggleReportPhoto: () => this.toggleReportPhoto(),
      reportPhotoBorder: s.reportPhotoAdded ? '#16A34A' : '#D8D1BF',
      reportPhotoBg: s.reportPhotoAdded ? '#E7F6EC' : '#fff',
      reportPhotoColor: s.reportPhotoAdded ? '#059669' : '#5B5648',
      reportPhotoLabel: s.reportPhotoAdded ? 'Photo ajoutée ✓' : 'Ajouter une photo (facultatif)',
      finishReport: () => this.finishReport(),

      addStepIs1: s.addStep === 1, addStepIs2: s.addStep === 2, addStepIs3: s.addStep === 3, addStepIs4: s.addStep === 4, addStepIs5: s.addStep === 5, addStepIs6: s.addStep === 6,
      addHeaderVisible: s.addStep < 6,
      addFooterVisible: s.addStep >= 2 && s.addStep <= 4,
      addStepsUi: ['Parc', 'Localisation', 'Informations', 'Photos', 'Vérif'].map((label, i) => {
        const n = i + 1;
        const active = s.addStep === n, done = s.addStep > n;
        return {
          n, label, showLine: n < 5, done, notDone: !done,
          circleBg: active || done ? '#16A34A' : '#F1ECE0', circleColor: active || done ? '#fff' : '#B3AC9C',
          labelColor: active ? '#16A34A' : '#B3AC9C',
          lineColor: done ? '#16A34A' : '#ECE6D8',
        };
      }),
      addNext: () => this.addNext(),
      addNextDisabled: (s.addStep === 2 && !s.addForm.address.trim()) || (s.addStep === 3 && !s.addForm.name.trim()),
      addPinLeft: s.addPin.x + '%', addPinTop: s.addPin.y + '%',
      addPinOptions: [
        { label: 'Nord', x: 50, y: 20 }, { label: 'Ouest', x: 24, y: 50 }, { label: 'Centre', x: 50, y: 50 },
        { label: 'Est', x: 76, y: 50 }, { label: 'Sud', x: 50, y: 80 },
      ].map(o => ({ label: o.label, select: () => this.setAddPin(o.x, o.y), bg: s.addPin.x === o.x && s.addPin.y === o.y ? '#16A34A' : '#fff', color: s.addPin.x === o.x && s.addPin.y === o.y ? '#fff' : '#24303A' })),
      addSearchQuery: s.addSearchQuery,
      onAddSearch: (e) => this.setState({ addSearchQuery: e.target.value }),
      useMyLocationForAdd: () => { this.setAddField('address', '12 Rue des Acacias, 12100 Millau'); this.showToast('Position détectée'); },
      addNearbyParks: s.parks.filter(p => !s.addSearchQuery.trim() || p.name.toLowerCase().includes(s.addSearchQuery.trim().toLowerCase()))
        .slice().sort((a, b) => (a.distanceM || 0) - (b.distanceM || 0)).slice(0, 3)
        .map(p => ({ name: p.name, distanceLabel: p.distanceLabel, photoUrl: photoUrl(p.id + '-a', 120, 120), select: () => { this.setState({ screen: 'detail', selectedParkId: p.id, addStep: 1 }); this.showToast('Ce parc existe déjà — vous pouvez donner votre avis ou signaler un problème.'); } })),
      addNoneOfThese: () => this.setState({ addStep: 2 }),
      addAgeTrackLeft: (s.addForm.ageMin / 17) * 100,
      addAgeTrackRight: 100 - (s.addForm.ageMax / 17) * 100,
      onAddAgeMin: (e) => this.setState(s2 => ({ addForm: { ...s2.addForm, ageMin: Math.min(parseInt(e.target.value), s2.addForm.ageMax) } })),
      onAddAgeMax: (e) => this.setState(s2 => ({ addForm: { ...s2.addForm, ageMax: Math.max(parseInt(e.target.value), s2.addForm.ageMin) } })),
      addCharacteristicOptions: CRITERIA.map(c => ({ label: c.label, on: !!s.addForm[c.key], toggle: () => this.toggleAddCriteria(c.key), border: s.addForm[c.key] ? '#16A34A' : '#ECE6D8', bg: s.addForm[c.key] ? '#E7F6EC' : '#fff', color: s.addForm[c.key] ? '#16A34A' : '#5B5648' })),
      addPlayTypeOptions: [
        { key: 'toboggan', label: 'Toboggan' }, { key: 'swing', label: 'Balançoire' }, { key: 'climbing', label: 'Escalade' },
        { key: 'springs', label: 'Ressorts' }, { key: 'sandbox', label: 'Bac à sable' }, { key: 'other', label: 'Autre' },
      ].map(o => ({ label: o.label, on: !!s.addForm.playTypes[o.key], toggle: () => this.toggleAddPlayType(o.key), border: s.addForm.playTypes[o.key] ? '#16A34A' : '#ECE6D8', bg: s.addForm.playTypes[o.key] ? '#E7F6EC' : '#fff', color: s.addForm.playTypes[o.key] ? '#16A34A' : '#5B5648' })),
      addMainPhoto: s.addForm.photos.find(p => p.isMain) || null,
      addMainPhotoEmpty: !s.addForm.photos.some(p => p.isMain),
      addExtraPhotos: s.addForm.photos.filter(p => !p.isMain),
      addExtraPhotoSlots: Array(Math.max(0, 3 - s.addForm.photos.filter(p => !p.isMain).length)).fill(0),
      editAddPhotos: () => this.setState({ addStep: 4 }),
      addVerifyTags: [
        { label: s.addForm.ageMin + ' à ' + s.addForm.ageMax + ' ans' },
        ...(s.addForm.fenced ? [{ label: 'Clôturé' }] : []),
        ...(s.addForm.shade ? [{ label: 'Ombragé' }] : []),
      ],
      addVerifyPlayText: Object.entries(s.addForm.playTypes).filter(([, v]) => v).map(([k]) => ({ toboggan: 'Toboggan', swing: 'Balançoire', climbing: 'Escalade', springs: 'Ressorts', sandbox: 'Bac à sable', other: 'Autre' }[k])).join(' • ') || 'Aucun jeu renseigné',
      addAnotherPark: () => this.setState({ screen: 'add', addStep: 1, addSearchQuery: '', addForm: { name: '', address: '', description: '', ageMin: 2, ageMax: 8, fenced: true, shade: true, pmr: false, wc: false, benches: false, water: false, parking: false, playTypes: { toboggan: true, swing: true, climbing: false, springs: false, sandbox: false, other: false }, photos: [] } }),

      isPermissions: (s.loggedIn || s.guestMode) && s.screen === 'permissions',
      onboardAgeMin: s.onboardAgeMin,
      onboardAgeMax: s.onboardAgeMax,
      onboardAgeMaxLabel: s.onboardAgeMax >= 12 ? '12+' : s.onboardAgeMax,
      onboardAgeTrackLeft: (s.onboardAgeMin / 12) * 100,
      onboardAgeTrackRight: 100 - (s.onboardAgeMax / 12) * 100,
      onOnboardAgeMinChange: (e) => this.onOnboardAgeMinChange(e),
      onOnboardAgeMaxChange: (e) => this.onOnboardAgeMaxChange(e),
      useOnboardLocation: () => this.useOnboardLocation(),
      allowOnboardLocation: () => this.allowOnboardLocation(),
      denyOnboardLocation: () => this.denyOnboardLocation(),
      showLocationPermModal: s.showLocationPermModal,
      onboardZoneBorder: s.onboardZoneSet ? '1.5px solid #16A34A' : '1.5px solid #ECE6D8',
      onboardZoneSubtitle: s.onboardZoneSet ? 'Position activée' : 'Utiliser ma position actuelle',
      skipPersonalize: () => this.skipPersonalize(),
      permLocationBg: s.permLocation ? '#16A34A' : '#ECE6D8', permLocationDotLeft: s.permLocation ? '23px' : '3px',
      permNotifBg: s.permNotif ? '#16A34A' : '#ECE6D8', permNotifDotLeft: s.permNotif ? '23px' : '3px',
      togglePermLocation: () => this.togglePermLocation(), togglePermNotif: () => this.togglePermNotif(),
      continueFromPermissions: () => this.continueFromPermissions(),
      locationLabel: s.locationLabel, isCitySwitcherOpen: s.isCitySwitcherOpen,
      openCitySwitcher: () => this.openCitySwitcher(), closeCitySwitcher: () => this.closeCitySwitcher(),
      stopPropagation: (e) => e.stopPropagation(),
      citySearch: s.citySearch, onCitySearchChange: (e) => this.setState({ citySearch: e.target.value }),
      useCurrentLocation: () => this.useCurrentLocation(),
      citySuggestions: ['Lyon', 'Marseille', 'Lille', 'Bordeaux'].filter(c => !s.citySearch.trim() || c.toLowerCase().includes(s.citySearch.trim().toLowerCase())).map(label => ({ label, select: () => this.selectCity(label) })),
      onboardEmail: s.onboardEmail,
      onboardPwd: s.onboardPwd,
      onEmailChange: (e) => this.setState({ onboardEmail: e.target.value }),
      onPwdChange: (e) => this.setState({ onboardPwd: e.target.value }),
      continueAsGuest: () => this.continueAsGuest(),
      goLoginScreen: () => this.goLoginScreen(),
      backToSplash: () => this.backToSplash(),
      goForgotPassword: () => this.goForgotPassword(),
      sendResetEmail: () => this.sendResetEmail(),
      socialAppleContinue: () => this.socialAppleContinue(),
      socialGoogleContinue: () => this.socialGoogleContinue(),
      socialFacebookContinue: () => this.socialFacebookContinue(),
      loginDisabled: !(this.isValidEmail(s.onboardEmail) && s.onboardPwd.trim()),
      login: () => this.login(),
      signup: () => this.signup(),
      goLoginMethod: () => this.goLoginMethod(),
      goEmailLogin: () => this.goEmailLogin(),
      goEmailSignup: () => this.goEmailSignup(),
      goEmailFormBack: () => this.goEmailFormBack(),
      toggleAuthMode: () => this.toggleAuthMode(),
      togglePwdVisibility: () => this.togglePwdVisibility(),
      phoneComingSoon: () => this.phoneComingSoon(),
      sendMagicLink: () => this.sendMagicLink(),
      submitAuth: () => this.submitAuth(),

      search: s.search,
      onSearchChange: (e) => this.setState({ search: e.target.value }),
      openSearch: () => this.openSearch(),
      closeSearch: () => this.closeSearch(),
      clearSearchText: () => this.clearSearchText(),
      searchOpen: s.searchOpen,
      hasSearchText: !!s.search,
      searchModeEmpty: s.searchOpen && s.search.trim().length < 2,
      searchModeResults: s.searchOpen && s.search.trim().length >= 2,
      searchNearbyParks: s.parks.slice().sort((a, b) => (a.distanceM || 0) - (b.distanceM || 0)).slice(0, 3)
        .map(p => ({ id: p.id, name: p.name, distanceLabel: p.distanceLabel, age: p.age, rating: p.rating, photoUrl: photoUrl(p.id + '-a', 100, 100), select: () => this.selectSearchPark(p.id) })),
      recentSearchChips: s.recentSearches.map(label => ({ label, select: () => this.setState({ search: label }) })),
      searchCitySuggestions: CITIES.map(c => ({ name: c.name, region: c.region, select: () => this.selectSearchCity(c.name) })),
      searchResultParks: s.parks.filter(p => p.name.toLowerCase().includes(s.search.trim().toLowerCase()))
        .slice().sort((a, b) => (a.distanceM || 0) - (b.distanceM || 0)).slice(0, 6)
        .map(p => ({ id: p.id, name: p.name, distanceLabel: p.distanceLabel, age: p.age, rating: p.rating, photoUrl: photoUrl(p.id + '-a', 100, 100), select: () => this.selectSearchPark(p.id) })),
      searchResultCities: CITIES.filter(c => c.name.toLowerCase().includes(s.search.trim().toLowerCase()))
        .map(c => ({ name: c.name, region: c.region, select: () => this.selectSearchCity(c.name) })),
      noSearchResults: s.search.trim().length >= 2 && !s.parks.some(p => p.name.toLowerCase().includes(s.search.trim().toLowerCase())) && !CITIES.some(c => c.name.toLowerCase().includes(s.search.trim().toLowerCase())),
      goFilters: () => this.goFilters(),
      hasActiveFilters: activeFilterCount > 0,
      activeFilterCount,
      filterBtnBg: activeFilterCount > 0 ? '#16A34A' : '#F1ECE0',
      filterBtnColor: activeFilterCount > 0 ? '#fff' : '#24303A',
      quickChips: [
        { key: 'wc', c: CRITERIA[0] }, { key: 'shade', c: CRITERIA[1] },
        { key: 'fenced', c: CRITERIA[2] }, { key: 'pmr', c: CRITERIA[3] },
      ].map(({ key, c }) => ({ label: c.label, toggle: () => this.toggleFilter(key), bg: s.filters[key] ? c.color : c.tint, color: s.filters[key] ? '#fff' : c.color })),

      filteredParks,
      groupMapPark: s.groupActive ? (() => { const p = s.parks.find(pk => pk.id === s.groupParkId); return p ? withPark(p) : null; })() : null,
      noResults: filteredParks.length === 0,
      resultsLabel: filteredParks.length + ' parc' + (filteredParks.length === 1 ? '' : 's') + ' trouvé' + (filteredParks.length === 1 ? '' : 's'),
      sortMode: s.sortMode,
      sortOptions: [
        { key: 'distance', label: 'Proximité' },
        { key: 'rating', label: 'Mieux notés' },
        { key: 'recent', label: 'Récents' },
      ].map(o => ({ label: o.label, select: () => this.setSortMode(o.key), bg: s.sortMode === o.key ? '#16A34A' : '#F7F4EC', color: s.sortMode === o.key ? '#fff' : '#5B5648' })),

      favoriteParks,
      noFavorites: favoriteParks.length === 0,
      favoritesCount: favoriteParks.length,

      selectedPark,
      selectedFavBg: s.favorites[selectedParkRaw.id] ? '#FFE8EC' : 'rgba(255,255,255,.9)',
      selectedFavFill: s.favorites[selectedParkRaw.id] ? '#EF4444' : 'none',
      toggleSelectedFavorite: () => this.toggleSelectedFavorite(),
      openDirections: () => this.openDirections(),
      openDirectionsFromPreview: () => this.openDirectionsFromPreview(),
      openShareFromPreview: () => this.openShareFromPreview(),
      openReviewsFromPreview: () => this.openReviewsFromPreview(),
      reportFromPreview: () => this.reportFromPreview(),
      goRate: () => this.goRate(),
      goReport: () => this.goReport(),
      back: () => this.back(),

      directionsModes: (() => {
        const distM = (() => {
          const label = selectedParkRaw.distanceLabel || '';
          if (label.includes('km')) { const n = parseFloat(label); return isNaN(n) ? null : n * 1000; }
          const n = parseInt(label); return isNaN(n) ? null : n;
        })();
        const eta = (speedKmh) => distM == null ? '—' : Math.max(1, Math.round((distM / 1000) / speedKmh * 60)) + ' min';
        return [
          { key: 'walk', label: 'À pied', speed: 4.5 },
          { key: 'bike', label: 'Vélo', speed: 15 },
          { key: 'car', label: 'Voiture', speed: 25 },
        ].map(m => ({ label: m.label, eta: eta(m.speed), select: () => this.setDirectionsMode(m.key), bg: s.directionsMode === m.key ? '#16A34A' : '#fff', color: s.directionsMode === m.key ? '#fff' : '#24303A' }));
      })(),
      selectedEta: (() => {
        const label = selectedParkRaw.distanceLabel || '';
        let distM = null;
        if (label.includes('km')) { const n = parseFloat(label); distM = isNaN(n) ? null : n * 1000; }
        else { const n = parseInt(label); distM = isNaN(n) ? null : n; }
        const speeds = { walk: 4.5, bike: 15, car: 25 };
        const speed = speeds[s.directionsMode] || 4.5;
        return distM == null ? '—' : Math.max(1, Math.round((distM / 1000) / speed * 60)) + ' min';
      })(),
      startNavigation: () => this.startNavigation(),
      directionsStopChips: [
        { key: 'bakery', label: '🥖 Boulangerie' },
        { key: 'parking', label: '🅿️ Parking' },
        { key: 'water', label: "💧 Point d'eau" },
      ].map(c => ({ label: c.label, toggle: () => this.toggleDirectionsStop(c.key), bg: s.directionsStops[c.key] ? '#24303A' : '#F1ECE0', color: s.directionsStops[c.key] ? '#fff' : '#5B5648' })),
      expandSheetFull: () => this.expandSheetFull(),

      reportRows: [
        { key: 'broken', label: 'Équipement endommagé', icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a4 4 0 0 1-4.9 4.9L8.4 18.6a2 2 0 0 1-2.8-2.8l7.5-7.5a4 4 0 0 1 4.9-4.9z"/>' },
        { key: 'safety', label: 'Problème de sécurité', icon: '<path d="M12 3l9 16H3z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>' },
        { key: 'maintenance', label: 'Propreté', icon: '<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>' },
        { key: 'vegetation', label: 'Végétation / environnement', icon: '<circle cx="12" cy="9" r="6"></circle><line x1="12" y1="15" x2="12" y2="21"></line>' },
        { key: 'accessibility', label: 'Accessibilité', icon: '<circle cx="13" cy="5" r="1.6"></circle><path d="M13 8v5h5"></path><path d="M13 13l3 7"></path><circle cx="9" cy="20" r="2.2"></circle>' },
        { key: 'wrong', label: 'Information incorrecte', icon: '<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="12.5"></line><circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none"></circle>' },
        { key: 'other', label: 'Autre', icon: '<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>' },
      ].map(r => ({
        label: r.label, iconSetting: { __html: r.icon }, on: !!s.reportReasons[r.key], toggle: () => this.toggleReportReason(r.key),
        border: s.reportReasons[r.key] ? '#EF4444' : '#ECE6D8', bg: s.reportReasons[r.key] ? '#FFF1F3' : '#fff',
        color: s.reportReasons[r.key] ? '#EF4444' : '#5B5648',
      })),
      reportStepBefore3: s.reportStep < 4,
      reportSelectedLabel: (() => { const r = ['broken', 'safety', 'maintenance', 'vegetation', 'accessibility', 'wrong', 'other'].find(k => s.reportReasons[k]); const labels = { broken: 'Équipement endommagé', safety: 'Problème de sécurité', maintenance: 'Propreté', vegetation: 'Végétation / environnement', accessibility: 'Accessibilité', wrong: 'Information incorrecte', other: 'Autre' }; return labels[r] || ''; })(),
      reportStepsUi: ['Parc', 'Problème', 'Détails', 'Confirmation'].map((label, i) => {
        const n = i + 1;
        const active = s.reportStep === n, done = s.reportStep > n;
        return {
          n, label, showLine: n < 4,
          circleBg: active || done ? '#EF4444' : '#F1ECE0', circleColor: active || done ? '#fff' : '#B3AC9C',
          labelColor: active ? '#EF4444' : '#B3AC9C',
          lineColor: done ? '#EF4444' : '#ECE6D8',
        };
      }),
      reportPhotoUrl: photoUrl(selectedParkRaw.id + '-report', 300, 200),
      goReportsFromThanks: () => { this.setState({ screen: 'contributions', contribTab: 'reports' }); },
      reportComment: s.reportComment,
      onReportComment: (e) => this.setState({ reportComment: e.target.value.slice(0, 120) }),
      reportLocation: s.reportLocation,
      onReportLocation: (e) => this.setState({ reportLocation: e.target.value }),
      reportDuration: s.reportDuration,
      onReportDuration: (e) => this.setState({ reportDuration: e.target.value }),
      reportDisabled: !Object.values(s.reportReasons).some(Boolean),
      submitReport: () => this.submitReport(),

      ageRangeMin: s.filters.ageRange[0], ageRangeMax: s.filters.ageRange[1],
      ageRangeLabel: !ageFilterActive ? 'Tout âge' : (s.filters.ageRange[0] + ' - ' + s.filters.ageRange[1] + ' ans'),
      ageTrackLeft: (s.filters.ageRange[0] / 12) * 100,
      ageTrackRight: 100 - (s.filters.ageRange[1] / 12) * 100,
      onAgeMinChange: (e) => this.setFilterAgeMin(parseInt(e.target.value)),
      onAgeMaxChange: (e) => this.setFilterAgeMax(parseInt(e.target.value)),
      criteriaFilterRows: CRITERIA.map(c => ({ label: c.label, color: c.color, toggle: () => this.toggleFilter(c.key), trackBg: s.filters[c.key] ? c.color : '#E4DFCE', knobLeft: s.filters[c.key] ? '22px' : '3px' })),
      criteriaGrid: CRITERIA.map(c => ({ label: c.label, color: c.color, tint: c.tint, on: !!s.filters[c.key], toggle: () => this.toggleFilter(c.key), bg: s.filters[c.key] ? c.color : c.tint, iconColor: s.filters[c.key] ? '#fff' : c.color, iconSetting: { __html: c.icon } })),
      distanceOptions: ['500 m', '1 km', '2 km', '5 km', '10 km'].map(d => ({ label: d, select: () => this.setFilterDistance(d), bg: s.filters.distance === d ? '#16A34A' : '#F1ECE0', color: s.filters.distance === d ? '#fff' : '#5B5648' })),
      otherCriteriaRows: [
        { key: 'fewReports', label: 'Peu de signalements' },
        { key: 'verifiedRecently', label: 'Infos vérifiées récemment' },
      ].map(o => ({ label: o.label, toggle: () => this.toggleFilter(o.key), trackBg: s.filters[o.key] ? '#16A34A' : '#E4DFCE', knobLeft: s.filters[o.key] ? '22px' : '3px' })),
      openNowRow: { label: 'Ouvert maintenant', toggle: () => this.toggleFilter('openNow'), trackBg: s.filters.openNow ? '#16A34A' : '#E4DFCE', knobLeft: s.filters.openNow ? '22px' : '3px' },
      viewParksCountLabel: 'Voir les ' + filteredParks.length + ' parcs',
      resetFilters: () => this.resetFilters(),

      addForm: s.addForm,
      onAddName: (e) => this.setAddField('name', e.target.value),
      onAddAddress: (e) => this.setAddField('address', e.target.value),
      onAddDescription: (e) => this.setAddField('description', e.target.value),
      addCanAddPhoto: s.addForm.photos.length < 4,
      addPhoto: () => this.addPhoto(),
      submitAdd: () => this.submitAdd(),
      locateStub: () => this.locateStub(),
      addConfirmPhoto: (s.addForm.photos[0] && s.addForm.photos[0].url) || photoUrl('add-confirm', 400, 300),
      goDetailFromAdd: () => this.goDetailFromAdd(),

      rateStarsArr: [1, 2, 3, 4, 5].map(n => ({ fill: n <= s.rateStars ? '#FFC107' : 'none', set: () => this.setRateStars(n) })),
      rateStepIs1: s.rateStep === 1, rateStepIs2: s.rateStep === 2, rateStepIs3: s.rateStep === 3,
      rateStepsUi: ['Parc', 'Avis', 'Commentaire'].map((label, i) => {
        const n = i + 1;
        const active = s.rateStep === n, done = s.rateStep > n;
        return {
          n, label, showLine: n < 3,
          circleBg: active || done ? '#F59E0B' : '#F1ECE0', circleColor: active || done ? '#fff' : '#B3AC9C',
          labelColor: active ? '#8A5A00' : '#B3AC9C',
          lineColor: done ? '#F59E0B' : '#ECE6D8',
        };
      }),
      rateNext: () => this.rateNext(),
      rateNextDisabled: s.rateStep === 2 && s.rateStars <= 0,
      rateSearchQuery: s.rateSearchQuery,
      onRateSearch: (e) => this.setState({ rateSearchQuery: e.target.value }),
      rateNearbyParks: s.parks.filter(p => !s.rateSearchQuery.trim() || p.name.toLowerCase().includes(s.rateSearchQuery.trim().toLowerCase()))
        .slice().sort((a, b) => (a.distanceM || 0) - (b.distanceM || 0)).slice(0, 5)
        .map(p => ({ name: p.name, distanceLabel: p.distanceLabel, photoUrl: photoUrl(p.id + '-a', 120, 120), select: () => this.selectRatePark(p.id) })),
      rateCriteriaRows: [
        { key: 'clean', label: 'Propreté' },
        { key: 'safety', label: 'Sécurité' },
        { key: 'equipment', label: 'Équipements' },
        { key: 'comfort', label: 'Confort' },
      ].map(row => ({
        label: row.label,
        faces: [1, 2, 3].map(v => ({
          v, select: () => this.setRateCriteria(row.key, v),
          isSad: v === 1, isNeutral: v === 2, isHappy: v === 3,
          bg: s.rateCriteria[row.key] === v ? (v === 1 ? '#F6C4CB' : v === 2 ? '#FFE29A' : '#B9E6C9') : (v === 1 ? '#FCE9EC' : v === 2 ? '#FFF6DE' : '#E9F7EF'),
          color: v === 1 ? '#EF4444' : v === 2 ? '#D99A1E' : '#16A34A',
        })),
      })),
      rateChildAge: s.rateChildAge,
      onRateChildAge: (e) => this.setState({ rateChildAge: e.target.value }),
      rateAgeBandOptions: ['0-2 ans', '2-6 ans', '6-12 ans', '12+ ans'].map(label => ({ label, select: () => this.setState({ rateAgeBand: label }), bg: s.rateAgeBand === label ? '#16A34A' : '#F1ECE0', color: s.rateAgeBand === label ? '#fff' : '#5B5648' })),
      rateTagChips: [{ key: 'clean', label: 'Propre' }, { key: 'safe', label: 'Sécurisé' }, { key: 'shade', label: 'Ombragé' }].map(c => ({ label: c.label, toggle: () => this.toggleRateTag(c.key), bg: s.rateTags[c.key] ? '#16A34A' : '#F1ECE0', color: s.rateTags[c.key] ? '#fff' : '#5B5648' })),
      rateLabel: ['', 'Décevant', 'Correct', 'Bien', 'Très bien', 'Excellent'][s.rateStars] || '',
      rateComment: s.rateComment,
      onRateComment: (e) => this.setState({ rateComment: e.target.value.slice(0, 200) }),
      rateDisabled: s.rateStars <= 0,
      submitRate: () => this.submitRate(),
      rateSubmitted: s.rateSubmitted,
      rateNotSubmitted: !s.rateSubmitted,
      finishRate: () => this.finishRate(),
      rateAnother: () => this.goRate(false),

      addedCount,
      reviewsGivenCount,
      badgesList,
      profileLinksActivity: [
        { label: 'Sortie de groupe', action: () => this.go('group') },
        { label: "Fil d'activité", action: () => this.go('activity') },
      ],
      profileLinksSettings: [
        { label: 'Notifications', action: () => this.go('notifications') },
        { label: 'Affichage', action: () => this.go('display') },
        { label: 'Confidentialité', action: () => this.go('privacy') },
        { label: 'Aide', action: () => this.go('help') },
      ],
      goContributionsAdded: () => { this.setState({ screen: 'contributions', contribTab: 'added' }); },
      goContributionsReviews: () => { this.setState({ screen: 'contributions', contribTab: 'reviews' }); },
      goFavoritesFromProfile: () => this.go('favorites'),
      logout: () => this.logout(),

      profileName: s.profileName,
      profileInitials: s.profileName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'CM',
      onProfileNameChange: (e) => this.setState({ profileName: e.target.value }),
      goEditProfile: () => this.go('editProfile'),
      saveProfile: () => this.saveProfile(),

      myAddedParks: s.parks.filter(p => typeof p.id === 'number' && p.id > 1000000000000).map(p => ({ ...p, photoUrl: photoUrl(p.id + '-a', 160, 160) })),
      noMyParks: s.parks.filter(p => typeof p.id === 'number' && p.id > 1000000000000).length === 0,

      myReviewsList: s.parks.flatMap(p => p.reviews.filter(r => r.name === 'Camille').map(r => ({ ...r, parkName: p.name, starsArr: starsArray(r.stars), tagsText: (r.tags || []).join(' · ') }))),
      noMyReviews: s.parks.flatMap(p => p.reviews.filter(r => r.name === 'Camille')).length === 0,

      notifRows: [
        { key: 'reports', label: 'Signalements et problèmes' },
        { key: 'newParks', label: 'Nouveaux parcs près de moi' },
        { key: 'reviewReplies', label: 'Réponses à mes avis' },
        { key: 'recommendations', label: 'Recommandations personnalisées' },
        { key: 'news', label: 'Actualités de Toboggo' },
      ].map(n => ({ label: n.label, toggle: () => this.toggleNotif(n.key), trackBg: s.notifPrefs[n.key] ? '#16A34A' : '#E4DFCE', knobLeft: s.notifPrefs[n.key] ? '22px' : '3px' })),
      notifChannelRows: [
        { key: 'push', label: 'Push' },
        { key: 'email', label: 'Email' },
      ].map(n => ({ label: n.label, toggle: () => this.toggleNotifChannel(n.key), trackBg: s.notifChannels[n.key] ? '#16A34A' : '#E4DFCE', knobLeft: s.notifChannels[n.key] ? '22px' : '3px' })),

      unreadNotifCount: s.notifications.filter(n => !n.read).length,
      goNotifCenterFromMap: () => this.goNotifCenter('map'),
      goNotifCenterFromProfile: () => this.goNotifCenter('profile'),
      markAllNotifsRead: () => this.markAllNotifsRead(),
      notifFilterTabs: [
        { key: 'all', label: 'Toutes' },
        { key: 'unread', label: 'Non lues' },
        { key: 'read', label: 'Lues' },
      ].map(f => ({ label: f.label, select: () => this.setState({ notifFilter: f.key }), bg: s.notifFilter === f.key ? '#16A34A' : (s.darkMode ? '#252B29' : '#F1ECE0'), color: s.notifFilter === f.key ? '#fff' : (s.darkMode ? '#F1EEE4' : '#5B5648') })),
      notifCenterRows: s.notifications.filter(n => s.notifFilter === 'unread' ? !n.read : s.notifFilter === 'read' ? n.read : true).map(n => ({
        id: n.id, title: n.title, desc: n.desc, time: n.time, unread: !n.read,
        rowBg: !n.read ? (s.darkMode ? '#333B37' : '#EFEDE6') : (s.darkMode ? '#252B29' : '#fff'),
        iconBg: NOTIF_TINTS[n.type].bg, iconColor: NOTIF_TINTS[n.type].color,
        iconSetting: { __html: NOTIF_ICONS[n.type] },
        open: () => this.openNotification(n.id),
        markRead: (e) => this.markNotifRead(n.id, e),
      })),
      notifCenterEmpty: !s.notifications.some(n => s.notifFilter === 'unread' ? !n.read : s.notifFilter === 'read' ? n.read : true),
      notifResolvedPark: (() => {
        const rn = s.notifications.find(n => n.id === s.notifResolvedId) || s.notifications[0];
        const p = s.parks.find(pk => pk.id === (rn && rn.parkId)) || s.parks[6] || s.parks[0];
        return { ...p, photoUrl: photoUrl(p.id + '-a', 160, 160), title: rn ? rn.title : '', desc: rn ? rn.desc : '', open: () => this.openDetail(p.id, 'notifResolved') };
      })(),

      privacyRows: [
        { key: 'shareLocation', label: 'Partager ma position' },
        { key: 'publicProfile', label: 'Profil visible publiquement' },
      ].map(n => ({ label: n.label, toggle: () => this.togglePrivacy(n.key), trackBg: s.privacyPrefs[n.key] ? '#16A34A' : '#E4DFCE', knobLeft: s.privacyPrefs[n.key] ? '22px' : '3px' })),
      displayRows: [
        { label: 'Mode hors-ligne (carte enregistrée)', toggle: () => this.toggleOffline(), trackBg: s.offlineMode ? '#16A34A' : '#E4DFCE', knobLeft: s.offlineMode ? '22px' : '3px' },
        { label: 'Mode sombre', toggle: () => this.toggleDarkMode(), trackBg: s.darkMode ? '#16A34A' : '#E4DFCE', knobLeft: s.darkMode ? '22px' : '3px' },
      ],
      downloadDataStub: () => this.downloadDataStub(),
      openDeleteConfirm: () => this.openDeleteConfirm(),
      closeDeleteConfirm: () => this.closeDeleteConfirm(),
      confirmDeleteAccount: () => this.confirmDeleteAccount(),
      isDeleteConfirm: s.showDeleteConfirm,
      goPrivacyPolicy: () => this.goPrivacyPolicy(),
      goTerms: () => this.goTerms(),
      goMentions: () => this.goMentions(),
      isLegal: s.screen === 'legal',
      legalTitle: s.legalDoc === 'terms' ? "Conditions d'utilisation" : s.legalDoc === 'mentions' ? 'Mentions légales' : 'Politique de confidentialité',
      legalSections: s.legalDoc === 'terms' ? [
        { h: 'Objet', p: "Ces conditions régissent l'utilisation de l'application Toboggo. En créant un compte ou en continuant en invité, vous les acceptez." },
        { h: 'Contenu des utilisateurs', p: "Vous restez responsable des avis, photos et signalements que vous publiez. Ils doivent être exacts, respectueux et ne pas divulguer d'informations privées sur des tiers." },
        { h: 'Utilisation raisonnable', p: "L'application est fournie à titre informatif : vérifiez toujours l'état et la sécurité d'un parc sur place, en particulier pour de jeunes enfants." },
        { h: 'Suspension', p: "Un compte publiant du contenu abusif, faux ou dangereux peut être suspendu ou supprimé." },
        { h: 'Contact', p: "Pour toute question, utilisez la section Aide > Contacter le support." },
      ] : s.legalDoc === 'mentions' ? [
        { h: 'Éditeur', p: 'Toboggo SAS, application de découverte de parcs et aires de jeux pour familles.' },
        { h: 'Contact', p: 'Pour toute question légale, écrivez-nous via Aide > Contacter le support.' },
        { h: 'Hébergement', p: "Les données sont hébergées au sein de l'Union européenne." },
        { h: 'Propriété intellectuelle', p: "Les textes, marques et éléments graphiques de Toboggo sont protégés ; le contenu des avis reste la propriété de leurs auteurs." },
      ] : [
        { h: 'Données collectées', p: "Nom, e-mail, âge des enfants (optionnel), position géographique (si activée), avis, photos et signalements que vous publiez." },
        { h: 'Données concernant vos enfants', p: "Le prénom et l'âge de vos enfants sont saisis par vous, le parent titulaire du compte, à des fins de recommandation d'aires de jeux adaptées. Ces informations ne sont jamais rendues publiques ni partagées avec d'autres utilisateurs, et peuvent être modifiées ou supprimées à tout moment depuis votre profil." },
        { h: 'Utilisation', p: "Ces données servent à afficher les parcs proches, personnaliser votre expérience et vous notifier des réponses à vos avis. Nous ne les vendons jamais à des tiers." },
        { h: 'Position géographique', p: "Utilisée uniquement pour trier les parcs par distance. Vous pouvez la désactiver à tout moment dans Réglages > Confidentialité." },
        { h: 'Conservation', p: "Vos données sont conservées tant que votre compte est actif. En cas de suppression du compte, elles sont effacées dans un délai de 30 jours." },
        { h: 'Vos droits (RGPD)', p: "Vous pouvez accéder, corriger, exporter ('Télécharger mes données') ou supprimer vos données à tout moment depuis Confidentialité." },
        { h: 'Partage', p: "Votre pseudo et vos avis sont visibles publiquement si votre profil est réglé sur public. Votre position précise n'est jamais partagée avec d'autres utilisateurs." },
      ],

      helpTopics: [
        { q: 'Comment ajouter un parc ?', a: "Depuis l'onglet Ajouter, indiquez le nom, l'adresse et les équipements présents (WC, ombre, clôture, PMR...). Votre ajout est vérifié par la communauté avant d'apparaître sur la carte." },
        { q: 'Comment fonctionne la note ?', a: 'Chaque parc est noté sur 5 étoiles par les familles qui l\u2019ont visité. Ouvrez la fiche du parc, appuyez sur "Noter ce parc" et partagez votre expérience.' },
        { q: 'Comment sont calculées les distances ?', a: 'Nous utilisons la position GPS de votre téléphone et les coordonnées de chaque parc pour calculer la distance et trier les résultats les plus proches.' },
        { q: 'Signaler un problème', a: 'Sur la fiche d\u2019un parc, utilisez "Noter ce parc" pour décrire un souci (jeu cassé, manque d\u2019entretien...). Notre équipe est alertée dès qu\u2019un signalement remonte régulièrement.' },
        { q: 'Comment supprimer mon compte ?', a: 'Rendez-vous dans Profil > Confidentialité > Supprimer mon compte.' },
      ].map((f, i) => ({ q: f.q, a: f.a, open: s.helpOpenIndex === i, chevronRotate: s.helpOpenIndex === i ? 'rotate(90deg)' : 'rotate(0deg)', toggle: () => this.toggleHelp(i) })),
      goContact: () => this.goContact(),
      contactSent: s.contactSent,
      contactSentNot: !s.contactSent,
      contactSubjects: ['Question générale', 'Problème technique', 'Signaler un contenu'].map(sub => ({
        label: sub, select: () => this.setContactSubject(sub),
        bg: s.contactSubject === sub ? '#16A34A' : '#F1ECE0', color: s.contactSubject === sub ? '#fff' : '#5B5648',
      })),
      contactMessage: s.contactMessage,
      onContactMessage: (e) => this.setState({ contactMessage: e.target.value }),
      contactDisabled: !s.contactMessage.trim(),
      submitContact: () => this.submitContact(),

      goMap: () => this.go('map'), goFavorites: () => this.go('favorites'),
      goAdd: () => this.openAdd(), goProfile: () => this.go('profile'),

      greetingName: (s.profileName.trim().split(/\s+/)[0]) || 'vous',
      chipEnfants: () => this.applyChildrenAgeFilter(),
      chipRecherche: () => this.goFilters(),
      ideaTiles: [
        { label: 'À l\'ombre', bg: 'linear-gradient(135deg,#2E9A5A,#7ABF8E)', action: () => this.applyIdea('shade') },
        { label: 'Tout-petits (0-3 ans)', bg: 'linear-gradient(135deg,#FF8800,#FFC98A)', action: () => this.applyIdea('toddlers') },
        { label: 'Beaucoup de jeux', bg: 'linear-gradient(135deg,#4C9EEB,#8FC2F2)', action: () => this.applyIdea('equipped') },
        { label: 'Top parcs', bg: 'linear-gradient(135deg,#FFC107,#FFD37A)', action: () => this.applyIdea('top') },
      ],
      ideasParks: s.parks.slice().sort((a, b) => b.rating - a.rating).slice(0, 6).map(withPark),
      homeRecentParks: s.recentIds.slice(0, 4).map(id => s.parks.find(p => p.id === id)).filter(Boolean).map(withPark),
      hasHomeRecent: s.recentIds.length > 0,

      homePoints: addedCount * 30 + reviewsGivenCount * 15 + favoriteParks.length * 5,
      homeLevel: Math.floor((addedCount * 30 + reviewsGivenCount * 15 + favoriteParks.length * 5) / 100) + 1,
      homeLevelProgress: (addedCount * 30 + reviewsGivenCount * 15 + favoriteParks.length * 5) % 100,
      homePointsToNext: 100 - ((addedCount * 30 + reviewsGivenCount * 15 + favoriteParks.length * 5) % 100),

      childrenList: s.children.map((c, i) => ({ age: c.age, remove: () => this.removeChild(i) })),
      hasChildren: s.children.length > 0,
      newChildAge: s.newChildAge,
      onNewChildAge: (e) => this.setState({ newChildAge: e.target.value }),
      addChildAction: () => this.addChild(),

      contribTab: s.contribTab,
      setContribAdded: () => this.setContribTab('added'),
      setContribReviews: () => this.setContribTab('reviews'),
      setContribReports: () => this.setContribTab('reports'),
      isContribAdded: s.contribTab === 'added', isContribReviews: s.contribTab === 'reviews', isContribReports: s.contribTab === 'reports',
      contribAddedBg: s.contribTab === 'added' ? '#16A34A' : '#F1ECE0', contribAddedColor: s.contribTab === 'added' ? '#fff' : '#5B5648',
      contribReviewsBg: s.contribTab === 'reviews' ? '#16A34A' : '#F1ECE0', contribReviewsColor: s.contribTab === 'reviews' ? '#fff' : '#5B5648',
      contribReportsBg: s.contribTab === 'reports' ? '#16A34A' : '#F1ECE0', contribReportsColor: s.contribTab === 'reports' ? '#fff' : '#5B5648',
      myReportsList: s.myReports,
      noMyReports: s.myReports.length === 0,

      allCriteriaRows: CRITERIA.map(c => ({ label: c.label, color: c.color, iconSetting: { __html: c.icon }, on: !!selectedParkRaw[c.key], off: !selectedParkRaw[c.key] })),
      ratingBreakdown: (() => {
        const n = selectedParkRaw.reviewCount || 0;
        const w = [0.55, 0.28, 0.11, 0.04, 0.02];
        return [5, 4, 3, 2, 1].map((star, i) => {
          const count = Math.round(n * w[i]);
          return { star, count, pct: n ? Math.min(100, Math.round((count / n) * 100)) : 0 };
        });
      })(),
      reviewAvatarInitial: (r) => (r && r.name ? r.name[0].toUpperCase() : '?'),
      reviewsWithInitial: selectedParkRaw.reviews.map((r, i) => ({ ...r, starsArr: starsArray(r.stars), tagsText: (r.tags || []).join(' · '), initial: r.name ? r.name[0].toUpperCase() : '?', flag: () => this.flagReview(selectedParkRaw.id, i), flagLabel: s.flaggedReviews[selectedParkRaw.id + '-' + i] ? 'Signalé' : 'Signaler', photoUrl: r.hasPhoto ? photoUrl(selectedParkRaw.id + '-r' + r.name, 200, 200) : null })),
      scoreBreakdown: (() => {
        const p = selectedParkRaw;
        const equipCount = CRITERIA.filter(c => p[c.key]).length;
        return [
          { label: 'Propreté', pct: Math.max(10, Math.min(100, Math.round(p.rating * 17 + 12))) },
          { label: 'Sécurité', pct: Math.max(10, Math.min(100, Math.round(p.rating * 15 + (p.fenced ? 20 : 5)))) },
          { label: 'Équipements', pct: Math.max(10, Math.min(100, Math.round(equipCount * 14 + 10))) },
          { label: 'Accessibilité', pct: Math.max(10, Math.min(100, Math.round((p.pmr ? 45 : 15) + p.rating * 8))) },
        ];
      })(),

      scoreInfoOpen: s.scoreInfoOpen,
      toggleScoreInfo: () => this.toggleScoreInfo(),
      scoreInfoChevron: s.scoreInfoOpen ? 'rotate(90deg)' : 'rotate(0deg)',
      scoreFactors: [
        { color: '#16A34A', label: 'Avis des parents', desc: 'Notes et retours de la communauté', iconSetting: { __html: '<circle cx="12" cy="8" r="6"></circle><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"></path>' } },
        { color: '#3B82F6', label: 'Caractéristiques du parc', desc: 'Équipements, sécurité, ombrage, accessibilité…', iconSetting: { __html: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9h18"></path>' } },
        { color: '#EF4444', label: 'Signalements en cours', desc: 'Problèmes signalés et état de leur résolution', iconSetting: { __html: '<path d="M4 21V4h14l-3 4 3 4H4"></path>' } },
        { color: '#3B82F6', label: 'Fraîcheur des informations', desc: 'Plus les infos sont récentes, plus le score est fiable.', iconSetting: { __html: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path>' } },
      ],
      offlineMode: s.offlineMode,
      weatherAlertVisible: !s.weatherAlertDismissed,
      weatherAlertTop: s.groupActive ? 152 : 108,
      weatherAlertIcon: WEATHER_CONDITIONS[s.weatherCondition].icon,
      weatherTemp: WEATHER_TEMPS[s.weatherCondition],
      recenterMap: () => this.locateStub(),
      weatherAlertText: WEATHER_CONDITIONS[s.weatherCondition].text,
      weatherAlertActionLabel: WEATHER_CONDITIONS[s.weatherCondition].actionLabel,
      dismissWeatherAlert: () => this.setState({ weatherAlertDismissed: true }),
      cycleWeather: () => this.cycleWeather(),
      applyShadeFilter: () => WEATHER_CONDITIONS[s.weatherCondition].apply(this),

      visitPromptVisible: !!s.visitPromptParkId,
      visitPromptText: s.visitPromptParkId ? ('Vous étiez peut-être à ' + (s.parks.find(p => p.id === s.visitPromptParkId) || {}).name + ' ? Donnez votre avis.') : '',
      visitPromptRate: () => this.setState({ selectedParkId: s.visitPromptParkId, visitPromptParkId: null, screen: 'rate', rateStep: 2, rateStars: 0, rateComment: '', ratePhotoAdded: false, rateTags: { clean: false, safe: false, shade: false }, detailFrom: 'map' }),
      visitPromptDismiss: () => this.setState({ visitPromptParkId: null }),

      quickGo: () => this.quickGo(),

      isShareOpen: s.isShareOpen,
      shareParkPreview: { ...shareParkRaw, photoUrl: photoUrl(shareParkRaw.id + '-a', 160, 160) },
      shareLink: 'toboggo.app/p/' + slugify(shareParkRaw.name),
      waShareHref: 'https://wa.me/?text=' + encodeURIComponent('Regarde ce parc : ' + shareParkRaw.name + ' — toboggo.app/p/' + slugify(shareParkRaw.name)),
      smsShareHref: 'sms:?body=' + encodeURIComponent('Regarde ce parc : ' + shareParkRaw.name + ' — toboggo.app/p/' + slugify(shareParkRaw.name)),
      mailShareHref: 'mailto:?subject=' + encodeURIComponent(shareParkRaw.name + ' sur Toboggo') + '&body=' + encodeURIComponent('Regarde ce parc : ' + shareParkRaw.name + ' — toboggo.app/p/' + slugify(shareParkRaw.name)),
      instagramShareHref: 'https://instagram.com/direct/inbox/',
      openShare: () => this.openShare(s.selectedParkId),
      closeShare: () => this.closeShare(),
      copyShareLink: () => this.copyShareLink(),

      ratePhotoAdded: s.ratePhotoAdded,
      ratePhotoUrl: photoUrl(selectedParkRaw.id + '-rate', 200, 200),
      toggleRatePhoto: () => this.setState(s2 => ({ ratePhotoAdded: !s2.ratePhotoAdded })),
      ratePhotoLabel: s.ratePhotoAdded ? 'Photo ajoutée ✓' : 'Ajouter une photo',
      ratePhotoBorder: s.ratePhotoAdded ? '#16A34A' : '#D8D1BF',
      ratePhotoBg: s.ratePhotoAdded ? '#E7F6EC' : '#fff',
      ratePhotoColor: s.ratePhotoAdded ? '#059669' : '#5B5648',

      isGroup: (s.loggedIn || s.guestMode) && s.screen === 'group',
      groupActive: s.groupActive,
      noGroupActive: !s.groupActive,
      groupCode: s.groupCode,
      groupParkName: (s.parks.find(p => p.id === s.groupParkId) || selectedParkRaw).name,
      groupMembersList: s.groupMembers.map(m => ({ ...m, initials: m.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() })),
      groupJoinCode: s.groupJoinCode,
      onGroupJoinCode: (e) => this.setState({ groupJoinCode: e.target.value }),
      createGroup: () => this.createGroup(),
      joinGroup: () => this.joinGroup(),
      leaveGroup: () => this.leaveGroup(),
      goGroup: () => this.go('group'),
      groupBannerText: s.groupActive ? ('Sortie avec ' + s.groupMembers.filter(m => !m.name.includes('(vous)')).map(m => m.name).join(', ') + ' · ' + (s.parks.find(p => p.id === s.groupParkId) || selectedParkRaw).name) : '',
      waGroupShareHref: 'https://wa.me/?text=' + encodeURIComponent('Rejoins notre sortie sur Toboggo, parc ' + (s.parks.find(p => p.id === s.groupParkId) || selectedParkRaw).name + ' — code : ' + s.groupCode),

      notifBannerVisible: !!s.notifBanner,
      notifBannerText: s.notifBanner || '',

      booting: s.booting,
      mapReady: !s.booting,

      gpsFailed: s.gpsFailed,
      toggleGpsFailed: () => this.toggleGpsFailed(),
      gpsBadgeBg: s.gpsFailed ? '#FFE3B8' : '#EAF7F0',
      gpsBadgeColor: s.gpsFailed ? '#8A5A00' : '#059669',
      gpsStatusLabel: s.gpsFailed ? 'GPS perdu' : 'GPS actif',

      darkMode: s.darkMode,
      toggleDarkMode: () => this.toggleDarkMode(),
      darkTrackBg: s.darkMode ? '#16A34A' : '#E4DFCE',
      darkKnobLeft: s.darkMode ? '22px' : '3px',
      themeBg: s.darkMode ? '#1B211F' : '#FFF8EC',
      themeCardBg: s.darkMode ? '#252B29' : '#fff',
      themeText: s.darkMode ? '#F1EEE4' : '#24303A',
      themeSubText: s.darkMode ? '#9BA69E' : '#8A8578',
      themeBorder: s.darkMode ? '#333936' : '#F1ECE0',

      compareMode: s.compareMode,
      toggleCompareMode: () => this.toggleCompareMode(),
      compareModeLabel: s.compareMode ? 'Annuler' : 'Comparer',
      compareCount: s.compareIds.length,
      canCompare: s.compareIds.length >= 2,
      canCompareDisabled: s.compareIds.length < 2,
      compareCtaBg: s.compareIds.length >= 2 ? '#16A34A' : '#4B565F',
      compareCtaColor: s.compareIds.length >= 2 ? '#fff' : '#9BA69E',
      goCompare: () => { if (s.compareIds.length >= 2) this.setState({ screen: 'compare' }); },
      isCompare: (s.loggedIn || s.guestMode) && s.screen === 'compare',
      compareParks: s.compareIds.map(id => s.parks.find(p => p.id === id)).filter(Boolean).map(withPark),
      compareRows: (() => {
        const chosen = s.compareIds.map(id => s.parks.find(p => p.id === id)).filter(Boolean);
        const rows = [
          { label: 'Note', get: p => p.rating + ' ★ (' + p.reviewCount + ')' },
          { label: 'Âge conseillé', get: p => p.age },
          { label: 'Sol', get: p => p.surface },
          { label: 'Distance', get: p => p.distanceLabel },
        ].concat(CRITERIA.map(c => ({ label: c.label, get: p => (p[c.key] ? '✓' : '—') })));
        return rows.map(r => ({ label: r.label, values: chosen.map(p => r.get(p)) }));
      })(),

      recentParks: s.recentIds.filter(id => id !== s.selectedParkId).slice(0, 5).map(id => s.parks.find(p => p.id === id)).filter(Boolean).map(withPark),
      hasRecent: s.recentIds.length > 0,

      sheetHeightPx: s.sheetHeight,
      sheetTransition: s.dragging ? 'none' : 'height .25s ease',
      onSheetDown: this.onSheetPointerDown,
      cycleSheet: () => this.cycleSheet(),
      hasPreview: !!s.previewParkId,
      noPreview: !s.previewParkId,
      previewPark: s.previewParkId ? (() => {
        const p = s.parks.find(pk => pk.id === s.previewParkId);
        if (!p) return null;
        return {
          ...p, starsArr: starsArray(p.rating), photoUrl: photoUrl(p.id + '-a', 160, 160),
          photoGallery: [0, 1, 2].map(i => photoUrl(p.id + '-g' + i, 200, 200)),
          walkMinutes: Math.max(1, Math.round((p.distanceM / 1000) / 4.5 * 60)),
          activeCriteria: CRITERIA.filter(c => p[c.key]).slice(0, 2).map(c => ({ ...c, iconSetting: { __html: c.icon } })),
          favBg: s.favorites[p.id] ? '#FFE8EC' : '#fff', favFill: s.favorites[p.id] ? '#EF4444' : 'none',
          toggleFav: () => this.toggleFavorite(p.id),
          topReview: p.reviews && p.reviews[0] ? { ...p.reviews[0], starsArr: starsArray(p.reviews[0].stars) } : null,
        };
      })() : null,
      previewBottom: s.sheetHeight + 92 + 12,
      closePreview: () => this.closePreview(),
      openFromPreview: () => this.openFromPreview(),

      toast: s.toast,
    };
  }
}

