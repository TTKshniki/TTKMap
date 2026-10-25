export type Language = 'ru' | 'en';

export type ViewType = 'spaces' | 'map' | 'cabinet' | 'auth';

export type SpaceKey = 'plaza' | 'expo' | 'hotel' | 'hub' | 'center';

export type CategoryFilter = 'all' | 'meeting' | 'entrance' | 'service';

export type CabinetTab = 'favorites';

export interface LocalizedText {
  ru: string;
  en: string;
}

export interface PoiItem {
  id: number;
  building: string;
  name: LocalizedText;
  floor: number;
  category: string;
  categoryName: LocalizedText;
  x: number;
  y: number;
  status: 'free' | 'busy' | 'bookable';
  statusText: LocalizedText;
  capacity: string;
  equipment: string;
  wifi: string;
  image: string;
  icon: string;
}

export interface BuildingInfo {
  name: LocalizedText;
  floors: number[];
}

export interface SpaceItem {
  id: SpaceKey;
  name: LocalizedText;
  type: LocalizedText;
  price: string;
  desc: LocalizedText;
  rating: number;
  reviewsCount: number;
  image: string;
  buildings: Record<string, BuildingInfo>;
  pois: PoiItem[];
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
}

export interface AuthFormState {
  email: string;
  password: string;
  confirmPassword?: string;
  mode?: 'login' | 'register';
}

export interface FavoriteItem {
  id: SpaceKey | number;
  name: LocalizedText;
  desc: LocalizedText;
  image: string;
  type: 'space' | 'poi';
  parentSpaceKey?: SpaceKey;
  rawPoi?: PoiItem;
}

export interface TranslationDictionary {
  routeCalcTitle: string;
  routeFromLabel: string;
  routeToLabel: string;
  routeParamsTitle: string;
  paramLength: string;
  paramTime: string;
  paramAccessible: string;
  showOnMapBtn: string;
  stepInstructionTitle: string;
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step3Title: string;
  step3Desc: string;
  navSpaces: string;
  navMap: string;
  navCabinet: string;
  navAdmin: string;
  navLogin: string;
  searchPlaceholder: string;
  heroTitle: string;
  heroDesc: string;
  openMapBtn: string;
  searchPhotoBtn: string;
  spacesTitle: string;
  spacesSub: string;
  buildingLabel: string;
  floorLabel: string;
  routeTitle: string;
  routeFrom: string;
  routeTo: string;
  buildRouteBtn: string;
  resetBtn: string;
  panoBtn: string;
  capacity: string;
  equipment: string;
  wifi: string;
  statusFree: string;
  statusBusy: string;
  statusBookable: string;
  routeHere: string;
  analyticsTitle: string;
  analyticsSub: string;
  editorTitle: string;
  authTitle: string;
  loginBtn: string;
  offlineModeOn: string;
  offlineModeOff: string;
  privacyApi: string;
  termsLink: string;
  footerCopy: string;
  adminLinkTitle: string;
  changeObject: string;
  officialPartner: string;
  floorPlan: string;
  filterAll: string;
  filterMeeting: string;
  filterEntrance: string;
  filterService: string;
  routeBuildingHeader: string;
  timeText: string;
  distanceText: string;
  routeDescText: string;
  walkPanoBtn: string;
  capacityText: string;
  equipmentText: string;
  statusTextTitle: string;
  wifiText: string;
  shareRouteQrBtn: string;
  editorToolsTitle: string;
  drawWallBtn: string;
  addPoiBtn: string;
  wifiZoneBtn: string;
  entranceExitBtn: string;
  phoneCamMasterTitle: string;
  phoneCamMasterDesc: string;
  startCamAssistantBtn: string;
  interactiveCanvasTitle: string;
  uploadBlueprintBtn: string;
  favoritesHeader: string;
  savedObjectDesc: string;
  goToMapBtn: string;
  footerServiceText: string;
  aiCreatePlan: string;
  saveChanges: string;
  editorTabTitle: string;
  moreVenuesTitle: string;
  moreVenuesDesc: string;
  viewMoreBtn: string;
}
