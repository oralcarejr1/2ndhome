import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES } from '../catalog/categories';
import { uid } from '../lib/geometry';
import { detectFormat, loadRaw, measureRaw } from '../lib/modelLoader';
import { MODEL_FOR_CATEGORY, normalizeProductUrl, type ImportedProduct } from '../lib/productImport';
import { MODELS, resolveMats, resolveParams } from '../models';
import { buildPerson } from '../models/person';
import { ItemModel } from '../scene/ItemMesh';
import { storeFile } from '../store/persistence';
import { useStore } from '../store/store';
import type { CategoryId, ModelAsset, Mount, Product } from '../types';
import { Field, MatInput, Modal, Num, ParamInput } from './common';

const MODEL_FOR_CAT: Record<string, string> = {
  sofa: 'sofa',
  chair: 'chair',
  table: 'table',
  desk: 'table',
  bed: 'bed',
  storage: 'case',
  shelf: 'shelf',
  lighting: 'lamp',
  textile: 'rug',
  plant: 'plant',
  decor: 'decor',
  appliance: 'appliance',
  electronics: 'screen',
  kitchen: 'kitchen',
  bath: 'bath',
  fitness: 'activity',
  kids: 'activity',
  misc: 'block',
};

function Preview({ p, height }: { p: Product; height: number }) {
  const theme = useStore((s) => s.theme);
  const dark = theme === 'dark';
  const span = Math.max(p.dims.w, p.dims.d, p.dims.h, 120) / 100;
  const person = useMemo(() => buildPerson(height, 'stand', '#e8a17a'), [height]);
  return (
    <Canvas camera={{ position: [span * 1.2, span * 0.9, span * 1.6], fov: 40 }} shadows>
      <color attach="background" args={[dark ? '#1f2126' : '#ece8e0']} />
      <hemisphereLight args={['#ffffff', '#b9a98f', 0.9]} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} castShadow />
      <group scale={0.01}>
        <ItemModel prod={p} />
        <primitive object={person} position={[p.dims.w / 2 + 35, 0, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[1000, 1000]} />
          <meshStandardMaterial color={dark ? '#262930' : '#e2ddd5'} />
        </mesh>
        <gridHelper key={theme} args={[1000, 20, dark ? '#3e424c' : '#c9c1b5', dark ? '#2e323a' : '#d8d1c7']} position={[0, 0.2, 0]} />
      </group>
      <OrbitControls target={[0, (p.dims.h / 200) * 0.9, 0]} makeDefault />
    </Canvas>
  );
}

export function ProductEditor({ base, importUrl, onClose }: { base?: Product; importUrl?: string; onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const upsertProduct = useStore((s) => s.upsertProduct);
  const startPlacing = useStore((s) => s.startPlacing);
  const notify = useStore((s) => s.notify);
  const editing = base?.custom;
  const [p, setP] = useState<Product>(() =>
    base
      ? {
          ...JSON.parse(JSON.stringify(base)),
          id: editing ? base.id : uid('c-'),
          name: editing ? base.name : base.name + ' (내 수정)',
          custom: true,
          baseId: editing ? base.baseId : base.id,
          approx: false,
          builtin: false,
          params: resolveParams(base),
          mats: resolveMats(base),
        }
      : { id: uid('c-'), name: '', brand: '', category: 'sofa', model: 'sofa', dims: { w: 200, d: 90, h: 80 }, custom: true, params: resolveParams({ model: 'sofa' } as Product), mats: resolveMats({ model: 'sofa' } as Product) },
  );
  const [raw, setRaw] = useState<{ x: number; y: number; z: number } | null>(null);
  const [err, setErr] = useState('');
  const [pageUrl, setPageUrl] = useState(importUrl ?? base?.url ?? '');
  const [loading, setLoading] = useState(false);
  const [importNote, setImportNote] = useState('');
  const [needsDimensionCheck, setNeedsDimensionCheck] = useState(false);
  const [dimensionChecked, setDimensionChecked] = useState(false);
  const [importRequest, setImportRequest] = useState(() => importUrl ? { url: importUrl } : undefined);
  const def = MODELS[p.model];
  const height = project.profiles.find((x) => x.id === project.activeProfileId)?.height ?? 170;

  useEffect(() => {
    if (!importRequest) return;
    const requestUrl = importRequest.url;
    const controller = new AbortController();
    setLoading(true);
    setErr('');
    setImportNote('');
    setNeedsDimensionCheck(true);
    setDimensionChecked(false);
    setP((x) => ({ ...x, url: requestUrl }));
    (async () => {
      try {
        const response = await fetch('/api/product', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-2ndhome': '1' },
          body: JSON.stringify({ url: requestUrl }), signal: controller.signal,
        });
        if (!response.ok) throw new Error('import_failed');
        const data: ImportedProduct = await response.json();
        if (controller.signal.aborted) return;
        setP((x) => {
          const model = !base && data.category ? MODEL_FOR_CATEGORY[data.category] ?? x.model : x.model;
          const dims = { ...x.dims };
          for (const axis of ['w', 'd', 'h'] as const) if (data.dims?.[axis] !== undefined) dims[axis] = data.dims[axis]!;
          return { ...x, url: data.url, name: data.name ?? x.name, brand: data.brand ?? x.brand,
            price: data.price ?? x.price, category: data.category ?? x.category, dims, model,
            ...(model !== x.model ? { params: resolveParams({ model } as Product), mats: resolveMats({ model } as Product) } : {}) };
        });
        const missing = [!data.name && '제품명', !data.brand && '브랜드', data.price === undefined && '가격',
          !data.category && '분류', !(['w', 'd', 'h'] as const).every((a) => data.dims?.[a] !== undefined) && '치수'].filter(Boolean);
        setImportNote(missing.length ? `불러왔어요. ${missing.join('·')} 정보는 직접 확인해 주세요. 읽지 못한 치수에는 현재 입력값이 남아 있어요.` : '상품 정보를 불러왔어요. 선택한 옵션의 치수와 가격이 맞는지 확인해 주세요.');
      } catch {
        if (!controller.signal.aborted) setImportNote('판매처에서 정보를 읽지 못했어요. 링크는 입력했으니 제품명과 치수를 직접 입력해 후보로 저장할 수 있어요.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [importRequest]);

  const importPage = () => {
    try {
      const url = normalizeProductUrl(pageUrl);
      setErr('');
      setImportRequest({ url });
    } catch { setErr('판매 페이지의 전체 주소(http 또는 https)를 입력하세요'); }
  };

  useEffect(() => {
    if (!p.asset) return setRaw(null);
    loadRaw(p.asset)
      .then((r) => setRaw(measureRaw(r, p.asset!.rotX, p.asset!.rotY)))
      .catch(() => setErr('3D 파일을 읽지 못했어요'));
  }, [p.asset?.blobId, p.asset?.rotX, p.asset?.rotY]);

  const setModel = (model: string) => setP((x) => ({ ...x, model, params: resolveParams({ model } as Product), mats: resolveMats({ model } as Product) }));
  const setCat = (category: CategoryId) => {
    setP((x) => ({ ...x, category }));
    if (!base) setModel(MODEL_FOR_CAT[category] ?? 'block');
  };

  const onFile = async (f: File) => {
    const fmt = detectFormat(f.name);
    if (!fmt) return setErr('GLB, GLTF(단일 파일), OBJ, FBX, STL 파일을 지원해요');
    setErr('');
    const { id: blobId, synced } = await storeFile(f);
    if (!synced && useStore.getState().sync === 'server') notify('4MB가 넘는 3D 파일은 이 기기에만 저장돼요 — 다른 기기에서는 기본 모양으로 보여요');
    const asset: ModelAsset = { blobId, format: fmt, fileName: f.name, fit: 'stretch', rotX: 0, rotY: 0, keepMaterials: true };
    setP((x) => ({ ...x, asset }));
  };

  const save = (place: boolean) => {
    if (loading) return;
    if (!p.name.trim()) return setErr('제품 이름을 입력하세요');
    if (needsDimensionCheck && !dimensionChecked) return setErr('판매 페이지에서 치수를 확인하고 확인란을 체크하세요');
    if (Object.values(p.dims).some((n) => !Number.isFinite(n) || n < 0.5)) return setErr('치수는 0.5cm 이상으로 입력하세요');
    try { if (p.url) normalizeProductUrl(p.url); } catch { return setErr('판매 링크 주소를 확인하세요'); }
    upsertProduct({ ...p, name: p.name.trim(), brand: p.brand.trim() || '직접 입력' });
    if (!editing) useStore.getState().mutate((draft) => {
      if (!draft.shortlist.includes(p.id)) draft.shortlist.push(p.id);
    }, false);
    notify(editing ? '제품을 수정했어요' : '내 제품으로 저장했어요 — 카탈로그 "내가 추가"에 있어요');
    if (place) startPlacing(p.id);
    onClose();
  };

  const unitGuess = raw
    ? [
        { l: 'm', f: 100 },
        { l: 'cm', f: 1 },
        { l: 'mm', f: 0.1 },
        { l: 'inch', f: 2.54 },
      ]
    : [];

  return (
    <Modal
      title={editing ? '구매 후보 수정' : base ? `"${base.name}" 바탕으로 내 후보 만들기` : '실제 구매 후보 직접 등록'}
      sub="판매 페이지의 치수·형태·색을 넣으면 같은 비례의 3D 가구가 만들어져요"
      onClose={onClose}
      wide
      foot={
        <>
          {err && <span style={{ color: 'var(--bad)', marginRight: 'auto' }}>{err}</span>}
          <button className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button className="btn-secondary" disabled={loading} onClick={() => save(false)}>
            저장
          </button>
          <button className="btn-primary" disabled={loading} onClick={() => save(true)}>
            저장하고 배치
          </button>
        </>
      }
    >
      <div className="pe-grid">
        <div>
          <div className="product-link-form">
            <label htmlFor="editor-product-url">판매 페이지에서 정보 불러오기</label>
            <div className="product-link-row">
              <input id="editor-product-url" className="inp" type="url" placeholder="https://판매 페이지 주소" value={pageUrl} disabled={loading} onChange={(e) => setPageUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); importPage(); } }} />
              <button className="btn-secondary" disabled={loading || !pageUrl.trim()} onClick={importPage}>{loading ? '불러오는 중…' : '불러오기'}</button>
            </div>
            <p className="note" role="status">{loading ? '판매 페이지에서 상품 정보를 읽고 있어요…' : importNote || '제품명·브랜드·원화 가격·치수를 가능한 만큼 채워요.'}</p>
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <Field label="제품 이름 *">
              <input className="inp" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="예: 클레어 3인 패브릭 소파" />
            </Field>
            <Field label="브랜드">
              <input className="inp" value={p.brand} onChange={(e) => setP({ ...p, brand: e.target.value })} placeholder="예: 한샘" />
            </Field>
            <Field label="판매 링크">
              <input className="inp" value={p.url ?? ''} onChange={(e) => setP({ ...p, url: e.target.value || undefined })} placeholder="https://" />
            </Field>
            <Field label="가격">
              <Num value={p.price ?? 0} unit="원" step={10000} onChange={(v) => setP({ ...p, price: v || undefined })} />
            </Field>
            <Field label="분류">
              <select className="inp" value={p.category} onChange={(e) => setCat(e.target.value as CategoryId)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="3D 형태">
              <select className="inp" value={p.model} onChange={(e) => setModel(e.target.value)}>
                {Object.values(MODELS).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="insp-label" style={{ marginTop: 12 }}>크기 (판매 페이지 기준)</div>
          <div className="grid3">
            <Field label="가로 W">
              <Num value={p.dims.w} unit="cm" min={0.5} onChange={(w) => setP({ ...p, dims: { ...p.dims, w } })} />
            </Field>
            <Field label="깊이 D">
              <Num value={p.dims.d} unit="cm" min={0.5} onChange={(d) => setP({ ...p, dims: { ...p.dims, d } })} />
            </Field>
            <Field label="높이 H">
              <Num value={p.dims.h} unit="cm" min={0.5} onChange={(h) => setP({ ...p, dims: { ...p.dims, h } })} />
            </Field>
          </div>
          {needsDimensionCheck && <label className="check">
            <input type="checkbox" checked={dimensionChecked} onChange={(e) => setDimensionChecked(e.target.checked)} />
            판매 페이지에서 선택한 옵션의 가로·깊이·높이를 확인했어요
          </label>}
          <div className="grid3" style={{ marginTop: 6 }}>
            <Field label="설치">
              <select className="inp" value={p.mount ?? 'floor'} onChange={(e) => setP({ ...p, mount: e.target.value as Mount })}>
                <option value="floor">바닥</option>
                <option value="wall">벽걸이</option>
                <option value="ceiling">천장</option>
                <option value="surface">가구 위</option>
              </select>
            </Field>
            <Field label="앞 사용공간">
              <Num value={p.clearance?.front ?? 0} unit="cm" onChange={(f) => setP({ ...p, clearance: { ...(p.clearance ?? {}), front: f || undefined } })} />
            </Field>
            <Field label="체크 역할">
              <select className="inp" value={p.ergo ?? 'none'} onChange={(e) => setP({ ...p, ergo: e.target.value as Product['ergo'] })}>
                {[
                  ['none', '없음'],
                  ['sofa', '소파'],
                  ['chair', '의자'],
                  ['officeChair', '사무용 의자'],
                  ['desk', '책상'],
                  ['standingDesk', '모션데스크'],
                  ['diningTable', '식탁'],
                  ['coffeeTable', '커피테이블'],
                  ['bed', '침대'],
                  ['counter', '조리대'],
                  ['tv', 'TV'],
                  ['pendant', '펜던트'],
                  ['mirror', '거울'],
                  ['wardrobe', '옷장'],
                  ['tallStorage', '높은 수납'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {p.ergo === 'standingDesk' || p.ergo === 'officeChair' ? (
            <div className="grid2" style={{ marginTop: 6 }}>
              <Field label="조절 최소">
                <Num value={p.adjust?.[0] ?? 60} unit="cm" onChange={(a) => setP({ ...p, adjust: [a, p.adjust?.[1] ?? 120] })} />
              </Field>
              <Field label="조절 최대">
                <Num value={p.adjust?.[1] ?? 120} unit="cm" onChange={(b) => setP({ ...p, adjust: [p.adjust?.[0] ?? 60, b] })} />
              </Field>
            </div>
          ) : null}
          <label className="check">
            <input type="checkbox" checked={!!p.flatpack} onChange={(e) => setP({ ...p, flatpack: e.target.checked })} />
            조립식(상자로 배송) — 현관 반입 체크에서 제외
          </label>

          <div className="insp-label" style={{ marginTop: 12 }}>3D 파일 (선택)</div>
          <label className="btn-secondary">
            <Upload size={14} /> {p.asset ? p.asset.fileName : 'GLB · GLTF · OBJ · FBX · STL 올리기'}
            <input type="file" hidden accept=".glb,.gltf,.obj,.fbx,.stl" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {p.asset && (
            <div className="tool-card" style={{ marginTop: 8 }}>
              <div className="grid2">
                <Field label="크기 맞추기">
                  <select className="inp" value={p.asset.fit} onChange={(e) => setP({ ...p, asset: { ...p.asset!, fit: e.target.value as 'stretch' | 'uniform' } })}>
                    <option value="stretch">입력한 W×D×H에 정확히</option>
                    <option value="uniform">비율 유지(가장 작은 쪽에 맞춤)</option>
                  </select>
                </Field>
                <label className="check" style={{ marginTop: 18 }}>
                  <input type="checkbox" checked={p.asset.keepMaterials} onChange={(e) => setP({ ...p, asset: { ...p.asset!, keepMaterials: e.target.checked } })} />
                  파일의 재질 유지
                </label>
                <Field label="세우기(X축 회전)">
                  <select className="inp" value={p.asset.rotX} onChange={(e) => setP({ ...p, asset: { ...p.asset!, rotX: +e.target.value } })}>
                    <option value={0}>그대로</option>
                    <option value={-90}>Z-up → Y-up (-90°)</option>
                    <option value={90}>+90°</option>
                  </select>
                </Field>
                <Field label="정면 방향(Y축 회전)">
                  <select className="inp" value={p.asset.rotY} onChange={(e) => setP({ ...p, asset: { ...p.asset!, rotY: +e.target.value } })}>
                    {[0, 90, 180, 270].map((r) => (
                      <option key={r} value={r}>
                        {r}°
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {raw && (
                <div className="note" style={{ marginTop: 6 }}>
                  파일 원래 크기 {raw.x.toFixed(2)} × {raw.z.toFixed(2)} × {raw.y.toFixed(2)} (단위 불명) — 파일 단위로 치수 채우기:
                  <div className="row">
                    {unitGuess.map((u) => (
                      <button key={u.l} className="btn-xs" onClick={() => setP({ ...p, dims: { w: Math.round(raw.x * u.f * 10) / 10, d: Math.round(raw.z * u.f * 10) / 10, h: Math.round(raw.y * u.f * 10) / 10 } })}>
                        {u.l}
                      </button>
                    ))}
                    <button className="btn-xs" onClick={() => setP({ ...p, asset: undefined })}>
                      파일 빼기
                    </button>
                  </div>
                </div>
              )}
              <p className="note">3D 파일은 이 기기에만 저장돼요(계정 동기화 안 됨). 다른 기기에선 상자로 보여요.</p>
            </div>
          )}

          {!p.asset && def && (
            <>
              <div className="insp-label" style={{ marginTop: 12 }}>형태 세부</div>
              <div className="grid2">
                {def.params.map((pd) => (
                  <ParamInput key={pd.key} def={pd} value={p.params?.[pd.key] ?? pd.default} onChange={(v) => setP({ ...p, params: { ...(p.params ?? {}), [pd.key]: v } })} />
                ))}
              </div>
            </>
          )}
          {def && Object.keys(def.slots).length > 0 && (
            <>
              <div className="insp-label" style={{ marginTop: 12 }}>색 · 재질</div>
              <div className="grid2">
                {Object.entries(def.slots).map(([k, s]) => (
                  <MatInput key={k} label={s.label} value={p.mats?.[k] ?? s.def} onChange={(m) => setP({ ...p, mats: { ...(p.mats ?? {}), [k]: m } })} />
                ))}
              </div>
            </>
          )}
          <div className="insp-label" style={{ marginTop: 12 }}>메모</div>
          <textarea className="inp" value={p.notes ?? ''} onChange={(e) => setP({ ...p, notes: e.target.value || undefined })} placeholder="색상 옵션, 배송일, 할인 정보 등" />
        </div>
        <div>
          <div className="pe-preview" style={{ position: 'sticky', top: 0, height: 420 }}>
            <Preview p={p} height={height} />
          </div>
          <p className="note">옆의 사람은 기준 인물({height}cm) — 크기 감을 잡는 용도예요. 끌어서 돌려보세요.</p>
        </div>
      </div>
    </Modal>
  );
}

