import { uid } from '../lib/geometry';
import type { Finishes, FloorPlan, PersonProfile, PlacedItem, PlacedPerson, Project, Version } from '../types';

// Generic starting points only. A real home (its plan, measurements, furniture shortlist and
// layouts) is personal data: it lives on the password-protected server or in a backup file,
// never in this repository.

export const DEFAULT_FINISHES: Finishes = {
  wallColor: '#f4f1ec',
  ceilingColor: '#fbfaf8',
  floor: { kind: 'oak', color: '#d8bf98' },
  roomFloors: {},
  wallColors: {},
  hour: 14,
  lampsOn: false,
  ceilingLights: true,
  doorsOpen: {},
};

const it = (productId: string, x: number, z: number, rot = 0, extra: Partial<PlacedItem> = {}): PlacedItem => ({
  id: uid('i'),
  productId,
  x,
  z,
  y: 0,
  rot,
  ...extra,
});

export function defaultProfiles(): PersonProfile[] {
  return [{ id: 'p-me', name: '나', height: 170, color: '#e8a17a' }];
}

const avatar = (x = 300, z = 250): PlacedPerson => ({ id: uid('h'), profileId: 'p-me', x, z, y: 0, rot: 180, pose: 'stand' });

function mkVersion(name: string, items: PlacedItem[], notes = '', fin: Partial<Finishes> = {}): Version {
  const now = Date.now();
  return {
    id: uid('v'),
    name,
    notes,
    createdAt: now,
    updatedAt: now,
    items,
    people: [avatar()],
    finishes: { ...JSON.parse(JSON.stringify(DEFAULT_FINISHES)), ...fin },
  };
}

/** One rectangular room (inner size w × d cm) with an entry door on the left and a window on the right. */
function roomPlan(w: number, d: number): FloorPlan {
  const t = 15;
  const plan: FloorPlan = {
    ceiling: 240,
    walls: [
      { id: 'w-top', a: [-t / 2, -t / 2], b: [w + t / 2, -t / 2], thickness: t },
      { id: 'w-right', a: [w + t / 2, -t / 2], b: [w + t / 2, d + t / 2], thickness: t },
      { id: 'w-bottom', a: [w + t / 2, d + t / 2], b: [-t / 2, d + t / 2], thickness: t },
      { id: 'w-left', a: [-t / 2, d + t / 2], b: [-t / 2, -t / 2], thickness: t },
    ],
    openings: [
      { id: 'o-entry', wallId: 'w-left', type: 'door', pos: d / 2, width: 90, height: 210, sill: 0, hinge: 'start', side: 1, isEntry: true },
      { id: 'o-window', wallId: 'w-right', type: 'window', pos: d / 2, width: 180, height: 150, sill: 80 },
    ],
    rooms: [{ id: 'r-main', name: '방', points: [[0, 0], [w, 0], [w, d], [0, d]] }],
  };
  return plan;
}

function baseProject(name: string, plan: FloorPlan, versions: Version[]): Project {
  const now = Date.now();
  return {
    id: uid('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    plan,
    versions,
    activeVersionId: versions[0].id,
    customProducts: [],
    shortlist: [],
    moodboard: [],
    profiles: defaultProfiles(),
    activeProfileId: 'p-me',
    moveIn: { entryW: 90, entryH: 210, elevator: null },
  };
}

export function blankProject(name: string, w = 600, d = 450): Project {
  return baseProject(name, roomPlan(w, d), [mkVersion('A안', [])]);
}

/** A furnished 6 × 4.5 m sample room: what a brand-new install opens on (and what tests use). */
export function sampleProject(): Project {
  const a = mkVersion('A안: 침대 + 책상', [
    it('gen-bed-q', 450, 105, 0),
    it('gen-wardrobe-200', 450, 420, 180),
    it('gen-desk-120', 150, 30, 0),
    it('gen-office', 150, 95, 180),
    it('gen-sofa-2', 190, 406, 180),
    it('gen-coffee', 190, 300, 0),
  ]);
  const b = mkVersion(
    'B안: 슈퍼싱글 + 식탁',
    [
      it('gen-bed-ss', 480, 105, 0),
      it('gen-wardrobe-100', 490, 420, 180),
      it('gen-desk-120', 150, 30, 0),
      it('gen-office', 150, 95, 180),
      it('gen-table-2', 250, 330, 0),
      it('gen-dining-chair', 250, 395, 180),
      it('gen-dining-chair', 250, 265, 0),
    ],
    '',
    { floor: { kind: 'walnut', color: '#8a6448' } },
  );
  return { ...baseProject('샘플 원룸', roomPlan(600, 450), [a, b]), info: { note: '샘플 — 내 집 도면은 2D 평면에서 그리거나 백업 파일로 가져오세요' } };
}
