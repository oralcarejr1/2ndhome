// All lengths are centimetres in plan/data space. Plan (x, y) maps to three.js (x, z).
// Rotations are degrees around the vertical axis (three.js rotation.y).

export type Vec2 = [number, number];

export type MatKind =
  | 'fabric'
  | 'boucle'
  | 'velvet'
  | 'leather'
  | 'wood'
  | 'woodDark'
  | 'lacquer'
  | 'metal'
  | 'chrome'
  | 'brass'
  | 'glass'
  | 'plastic'
  | 'stone'
  | 'marble'
  | 'rattan'
  | 'paper'
  | 'emissive'
  | 'mirror'
  | 'foliage'
  | 'ceramic';

export interface MatSpec {
  kind: MatKind;
  color: string; // #rrggbb
}

export type ParamValue = number | string | boolean;

export interface ParamDef {
  key: string;
  label: string;
  type: 'number' | 'select' | 'bool' | 'color';
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
}

export type Mount = 'floor' | 'wall' | 'ceiling' | 'surface';

export type CategoryId =
  | 'sofa'
  | 'chair'
  | 'table'
  | 'desk'
  | 'bed'
  | 'storage'
  | 'shelf'
  | 'lighting'
  | 'textile'
  | 'plant'
  | 'decor'
  | 'appliance'
  | 'electronics'
  | 'kitchen'
  | 'bath'
  | 'kids'
  | 'fitness'
  | 'misc';

/** Ergonomic role used by the human-scale checks. */
export type ErgoRole =
  | 'desk'
  | 'standingDesk'
  | 'diningTable'
  | 'coffeeTable'
  | 'chair'
  | 'officeChair'
  | 'sofa'
  | 'bed'
  | 'counter'
  | 'vanity'
  | 'tv'
  | 'pendant'
  | 'mirror'
  | 'tallStorage'
  | 'wardrobe'
  | 'upperCabinet'
  | 'lowTable'
  | 'none';

export interface Clearance {
  front?: number;
  back?: number;
  left?: number;
  right?: number;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: CategoryId;
  sub?: string; // sub-category label, e.g. '3인용 소파'
  model: string; // generator type key
  dims: { w: number; d: number; h: number };
  params?: Record<string, ParamValue>;
  mats?: Record<string, MatSpec>;
  variants?: { name: string; mats: Record<string, MatSpec> }[];
  price?: number; // KRW, approximate
  url?: string;
  mount?: Mount;
  clearance?: Clearance;
  ergo?: ErgoRole;
  /** e.g. seat height for chairs/sofas, top height for tables (cm) */
  seatH?: number;
  /** height adjustable range (desks/chairs) */
  adjust?: [number, number];
  /** sold flat-packed → can pass narrow doors */
  flatpack?: boolean;
  /** dimensions are approximations — verify on the product page */
  approx?: boolean;
  notes?: string;
  tags?: string[];
  custom?: boolean;
  /** user-imported 3D model blob id (GLB/GLTF/OBJ/FBX/STL) */
  asset?: ModelAsset;
  /** for user products: id of the built-in product it was derived from */
  baseId?: string;
  /** default bottom elevation for wall/surface mounted items (cm) */
  elev?: number;
  /** fixed part of the home (붙박이) */
  builtin?: boolean;
}

export interface ModelAsset {
  blobId: string;
  format: 'glb' | 'gltf' | 'obj' | 'fbx' | 'stl';
  fileName: string;
  fit: 'stretch' | 'uniform';
  rotX: number; // degrees, to fix Z-up models
  rotY: number; // degrees, to fix front direction
  keepMaterials: boolean;
}

export interface PlacedItem {
  id: string;
  productId: string;
  x: number;
  z: number;
  y: number; // bottom elevation (cm)
  rot: number; // degrees
  dims?: { w: number; d: number; h: number }; // override
  params?: Record<string, ParamValue>; // override
  mats?: Record<string, MatSpec>; // override per slot
  label?: string;
  locked?: boolean;
  hidden?: boolean;
  mirror?: boolean;
  groupId?: string;
  /** alternative product ids to quickly cycle ("후보") */
  alts?: string[];
  status?: 'candidate' | 'decided' | 'bought' | 'owned';
  imageRef?: string; // for frames/art: moodboard ref id
}

export type Pose = 'stand' | 'sit' | 'lie' | 'reach' | 'walk';

export interface PersonProfile {
  id: string;
  name: string;
  height: number; // cm
  color: string;
  /** optional overrides of anthropometric estimates */
  shoulder?: number;
}

export interface PlacedPerson {
  id: string;
  profileId: string;
  x: number;
  z: number;
  y: number;
  rot: number;
  pose: Pose;
}

export type OpeningType = 'door' | 'slidingDoor' | 'doubleDoor' | 'window' | 'balcony' | 'opening';

export interface Opening {
  id: string;
  wallId: string;
  type: OpeningType;
  pos: number; // centre distance from wall start (cm)
  width: number;
  height: number;
  sill: number; // bottom elevation (cm)
  hinge?: 'start' | 'end';
  side?: 1 | -1; // which side of the wall the door swings into
  isEntry?: boolean;
}

export interface Wall {
  id: string;
  a: Vec2;
  b: Vec2;
  thickness: number;
  height?: number; // default = plan.ceiling
}

export interface Room {
  id: string;
  name: string;
  points: Vec2[];
}

export interface Underlay {
  blobId: string;
  x: number; // top-left in plan cm
  y: number;
  scale: number; // cm per image pixel
  opacity: number;
  rotation: number;
}

export interface FloorPlan {
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  ceiling: number; // cm
  underlay?: Underlay;
}

export type FloorKind = 'oak' | 'walnut' | 'ash' | 'herringbone' | 'tile' | 'bigtile' | 'concrete' | 'terrazzo' | 'carpet' | 'vinyl';

export interface FloorFinish {
  kind: FloorKind;
  color: string;
}

export interface Finishes {
  wallColor: string;
  ceilingColor: string;
  floor: FloorFinish;
  roomFloors: Record<string, FloorFinish>;
  wallColors: Record<string, string>;
  /** 0..24 hour for sun simulation */
  hour: number;
  /** opening id → door shown open */
  doorsOpen?: Record<string, boolean>;
  lampsOn: boolean;
  ceilingLights: boolean;
}

export interface Version {
  id: string;
  name: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  items: PlacedItem[];
  people: PlacedPerson[];
  finishes: Finishes;
  thumb?: string; // jpeg data URL
}

export type RefKind = 'image' | 'color' | 'note' | 'link';

export interface RefItem {
  id: string;
  kind: RefKind;
  blobId?: string;
  url?: string; // remote image or link
  title: string;
  note: string;
  tags: string[];
  palette?: string[];
  color?: string;
  createdAt: number;
  productId?: string;
  favorite?: boolean;
}

export interface MoveInSettings {
  entryW: number;
  entryH: number;
  elevator?: { w: number; h: number; d: number } | null;
  stairs?: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  plan: FloorPlan;
  versions: Version[];
  activeVersionId: string;
  customProducts: Product[];
  shortlist: string[];
  moodboard: RefItem[];
  profiles: PersonProfile[];
  activeProfileId: string;
  moveIn: MoveInSettings;
  budget?: number;
  /** listing info shown in the header (area in ㎡, a short note) */
  info?: { area?: number; note?: string; /** how the plan was measured, what still needs checking */ planNote?: string };
}

export type AppMode = 'plan' | 'layout' | 'mood' | 'compare';
export type ViewMode = '3d' | 'top' | 'walk' | '2d' | 'mood';
