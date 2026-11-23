import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { ChevronDown, ChevronUp, Image as ImageIcon, Sparkles, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES } from '../catalog/categories';
import { fmtWon, uid } from '../lib/geometry';
import { detectFormat, loadRaw, measureRaw } from '../lib/modelLoader';
import {
  extractProductUrl,
  MODEL_FOR_CATEGORY,
  normalizeProductUrl,
  type ImportedProduct,
  type ImportedProductOption,
} from '../lib/productImport';
import { MODELS, paramVisible, resolveMats, resolveParams } from '../models';
import { STAGE_COLORS } from '../lib/theme';
import { buildPerson } from '../models/person';
import { ItemModel } from '../scene/ItemMesh';
import { storeFile } from '../store/persistence';
import { useStore } from '../store/store';
import type { CategoryId, ModelAsset, Mount, Product } from '../types';
import { Field, MatInput, Modal, Num, ParamInput } from './common';

type ImportPayload = { url?: string; text?: string; image?: string };

async function resizeImageToDataUrl(file: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image_load_failed'));
      el.src = objectUrl;
    });
    const maxEdge = 2048;
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function Preview({ p, height }: { p: Product; height: number }) {
  const theme = useStore((s) => s.theme);
  const st = STAGE_COLORS[theme];
  const span = Math.max(p.dims.w, p.dims.d, p.dims.h, 120) / 100;
  const person = useMemo(() => buildPerson(height, 'stand', '#e8a17a'), [height]);
  return (
    <Canvas camera={{ position: [span * 1.2, span * 0.9, span * 1.6], fov: 40 }} shadows>
      <color attach="background" args={[st.canvasDay]} />
      <hemisphereLight args={['#ffffff', '#b9a98f', 0.9]} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} castShadow />
      <group scale={0.01}>
        <ItemModel prod={p} />
        <primitive object={person} position={[p.dims.w / 2 + 35, 0, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[1000, 1000]} />
          <meshStandardMaterial color={st.previewFloor} />
        </mesh>
        <gridHelper key={theme} args={[1000, 20, st.previewGridMajor, st.previewGridMinor]} position={[0, 0.2, 0]} />
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
      : {
          id: uid('c-'),
          name: '',
          brand: '',
          category: 'sofa',
          model: 'sofa',
          dims: { w: 200, d: 90, h: 80 },
          custom: true,
          params: resolveParams({ model: 'sofa' } as Product),
          mats: resolveMats({ model: 'sofa' } as Product),
        },
  );
  const [raw, setRaw] = useState<{ x: number; y: number; z: number } | null>(null);
  const [err, setErr] = useState('');
  const [pageUrl, setPageUrl] = useState(importUrl ?? base?.url ?? '');
  const [pasteText, setPasteText] = useState('');
  const [showFallback, setShowFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importNote, setImportNote] = useState('');
  const [aiUsed, setAiUsed] = useState(false);
  const [importedOptions, setImportedOptions] = useState<ImportedProductOption[]>([]);
  const [activeOptionIdx, setActiveOptionIdx] = useState<number | null>(null);
  const [needsDimensionCheck, setNeedsDimensionCheck] = useState(false);
  const [dimensionChecked, setDimensionChecked] = useState(false);
  const [importRequest, setImportRequest] = useState<ImportPayload | undefined>(() =>
    importUrl ? { url: importUrl } : undefined,
  );
  const def = MODELS[p.model];
  const height = project.profiles.find((x) => x.id === project.activeProfileId)?.height ?? 170;

  useEffect(() => {
    if (!importRequest) return;
    const controller = new AbortController();
    setLoading(true);
    setErr('');
    setImportNote('');
    setAiUsed(false);
    setImportedOptions([]);
    setActiveOptionIdx(null);
    setNeedsDimensionCheck(false);
    setDimensionChecked(false);
    if (importRequest.url) setP((x) => ({ ...x, url: importRequest.url }));

    (async () => {
      try {
        const response = await fetch('/api/product', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-2ndhome': '1' },
          body: JSON.stringify(importRequest),
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;

        if (!response.ok) {
          setShowFallback(true);
          setNeedsDimensionCheck(true);
          if (body?.error === 'ai_required') {
            setImportNote('이미지 치수 자동 읽기가 아직 연결되지 않았어요. 상품 페이지 텍스트를 복사해 아래에 붙여넣으면 바로 분석할 수 있어요.');
          } else {
            setImportNote('판매처에서 자동으로 페이지를 읽지 못했어요. 아래에 페이지 텍스트나 사이즈표 캡처를 붙여넣거나 치수를 직접 입력해 저장하세요.');
          }
          return;
        }

        const data = body as ImportedProduct;
        if (data.blocked) {
          setShowFallback(true);
          setNeedsDimensionCheck(true);
          if (data.aiError === 'timeout') {
            setImportNote('판매처 응답 시간이 초과되었어요. 다시 시도하거나 페이지 텍스트·사이즈표 캡처를 이 창에 붙여넣어(Ctrl+V) 보세요.');
          } else {
            setImportNote('이 판매처는 자동 접근이 막혀 있어요. 상품 페이지 텍스트를 아래에 붙여넣거나 사이즈표 캡처를 이 창에 Ctrl+V 해보세요.');
          }
          return;
        }

        const usedAi = data.source === 'page+ai' || data.source === 'ai-web' || data.source === 'text+ai' || data.source === 'image+ai';
        setAiUsed(usedAi);

        setP((x) => {
          const nextCategory = data.category ?? x.category;
          const nextModel = !base
            ? data.model && MODELS[data.model]
              ? data.model
              : data.category
                ? MODEL_FOR_CATEGORY[data.category] ?? x.model
                : x.model
            : x.model;
          const dims = { ...x.dims };
          for (const axis of ['w', 'd', 'h'] as const) {
            if (data.dims?.[axis] !== undefined) dims[axis] = data.dims[axis]!;
          }
          const modelChanged = nextModel !== x.model;
          let mats = modelChanged ? resolveMats({ model: nextModel } as Product) : { ...(x.mats ?? {}) };
          // form parameters chosen by the importer (drawer rows, seats, mattress size, …)
          const importedParams = !base && data.params && nextModel === data.model ? data.params : undefined;
          if (!base && (data.color || data.material)) {
            const slots = Object.keys(MODELS[nextModel]?.slots ?? {});
            const firstSlot = importedParams?.style === 'mattress' && slots.includes('mattress') ? 'mattress' : slots[0];
            if (firstSlot) {
              const cur = mats[firstSlot] ?? MODELS[nextModel].slots[firstSlot].def;
              mats = {
                ...mats,
                [firstSlot]: {
                  kind: data.material ?? cur.kind,
                  color: data.color ?? cur.color,
                },
              };
            }
          }
          return {
            ...x,
            url: data.url ?? x.url,
            name: data.name ?? x.name,
            brand: data.brand ?? x.brand,
            price: data.price ?? x.price,
            category: nextCategory,
            dims,
            model: nextModel,
            mount: data.mount ?? x.mount,
            ergo: data.ergo ?? x.ergo,
            notes: data.notes ?? x.notes,
            sub: data.sub ?? x.sub,
            seatH: data.seatH ?? x.seatH,
            approx: data.dimsEstimated?.length ? true : x.approx,
            mats,
            ...(modelChanged || importedParams
              ? { params: { ...resolveParams({ model: nextModel } as Product), ...(importedParams ?? {}) } }
              : {}),
          };
        });

        if (data.options?.length) {
          setImportedOptions(data.options);
        }

        const estimatedAxes = data.dimsEstimated ?? [];
        const hasAllDims = (['w', 'd', 'h'] as const).every((a) => data.dims?.[a] !== undefined && !estimatedAxes.includes(a));
        const missing = [
          !data.name && '제품명',
          !data.brand && '브랜드',
          data.price === undefined && '가격',
          !data.category && '분류',
          !hasAllDims && '치수',
        ].filter(Boolean);

        // Only require manual dimension confirmation when some axis is missing or estimated
        setNeedsDimensionCheck(!hasAllDims);
        if (!hasAllDims) setShowFallback(true);

        const aiTag = usedAi ? ' (AI 분석 포함)' : '';
        if (missing.length) {
          const axisName = { w: '가로', d: '깊이', h: '높이' } as const;
          const estTip = estimatedAxes.length
            ? ` 판매처가 글로 밝히지 않은 ${estimatedAxes.map((a) => axisName[a]).join('·')}는 같은 종류 가구의 보통 크기로 임시 입력했어요.`
            : '';
          const dimTip =
            estTip +
            (!hasAllDims
              ? ' 치수가 상세 이미지에 있다면 사이즈표 영역을 캡처해 이 창에 붙여넣어(Ctrl+V) 보세요.'
              : '');
          setImportNote(`불러왔어요${aiTag}. ${missing.join('·')} 정보는 직접 확인해 주세요.${dimTip}`);
        } else {
          setImportNote(`상품 정보를 모두 불러왔어요${aiTag}. 선택한 옵션의 치수와 가격이 맞는지 확인해 주세요.`);
        }
      } catch {
        if (!controller.signal.aborted) {
          setShowFallback(true);
          setNeedsDimensionCheck(true);
          setImportNote('판매처에서 정보를 읽지 못했어요. 아래에 페이지 텍스트나 사이즈표 캡처를 붙여넣거나 직접 입력해 저장할 수 있어요.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [importRequest]);

  const importPage = () => {
    try {
      const url = extractProductUrl(pageUrl);
      setPageUrl(url);
      setErr('');
      setImportRequest({ url });
    } catch {
      setErr('판매 페이지의 주소(http 또는 https)를 입력하세요');
    }
  };

  const optionalNormalizedUrl = () => {
    if (!pageUrl.trim()) return undefined;
    try {
      return extractProductUrl(pageUrl);
    } catch {
      return undefined;
    }
  };

  const importFromText = () => {
    const t = pasteText.trim();
    if (!t) return setErr('붙여넣은 상품 설명이나 치수 텍스트를 입력하세요');
    setErr('');
    setImportRequest({ text: t, url: optionalNormalizedUrl() });
  };

  const importFromImageFile = async (file: Blob) => {
    setErr('');
    setLoading(true);
    try {
      const image = await resizeImageToDataUrl(file);
      setImportRequest({
        image,
        text: pasteText.trim() || undefined,
        url: optionalNormalizedUrl(),
      });
    } catch {
      setLoading(false);
      setErr('이미지를 읽지 못했어요. PNG 또는 JPG 이미지로 시도해 주세요');
    }
  };

  useEffect(() => {
    const onWindowPaste = (e: globalThis.ClipboardEvent) => {
      if (loading) return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find((it) => it.type.startsWith('image/'));
      if (!imgItem) return;
      const blob = imgItem.getAsFile();
      if (!blob) return;
      e.preventDefault();
      void importFromImageFile(blob);
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [loading, pageUrl, pasteText]);

  const applyOption = (opt: ImportedProductOption, idx: number) => {
    setActiveOptionIdx(idx);
    setP((x) => {
      const dims = { ...x.dims };
      for (const axis of ['w', 'd', 'h'] as const) {
        if (opt.dims?.[axis] !== undefined) dims[axis] = opt.dims[axis]!;
      }
      return {
        ...x,
        dims,
        ...(opt.params ? { params: { ...resolveParams(x), ...opt.params } } : {}),
        ...(opt.price !== undefined ? { price: opt.price } : {}),
      };
    });
  };

  useEffect(() => {
    if (!p.asset) return setRaw(null);
    loadRaw(p.asset)
      .then((r) => setRaw(measureRaw(r, p.asset!.rotX, p.asset!.rotY)))
      .catch(() => setErr('3D 파일을 읽지 못했어요'));
  }, [p.asset?.blobId, p.asset?.rotX, p.asset?.rotY]);

  const setModel = (model: string) =>
    setP((x) => ({ ...x, model, params: resolveParams({ model } as Product), mats: resolveMats({ model } as Product) }));
  const setCat = (category: CategoryId) => {
    setP((x) => ({ ...x, category }));
    if (!base) setModel(MODEL_FOR_CATEGORY[category] ?? 'block');
  };

  const onFile = async (f: File) => {
    const fmt = detectFormat(f.name);
    if (!fmt) return setErr('GLB, GLTF(단일 파일), OBJ, FBX, STL 파일을 지원해요');
    setErr('');
    const { id: blobId, synced } = await storeFile(f);
    if (!synced && useStore.getState().sync === 'server') {
      notify('4MB가 넘는 3D 파일은 이 기기에만 저장돼요 — 다른 기기에서는 기본 모양으로 보여요');
    }
    const asset: ModelAsset = { blobId, format: fmt, fileName: f.name, fit: 'stretch', rotX: 0, rotY: 0, keepMaterials: true };
    setP((x) => ({ ...x, asset }));
  };

  const save = (place: boolean) => {
    if (loading) return;
    if (!p.name.trim()) return setErr('제품 이름을 입력하세요');
    if (needsDimensionCheck && !dimensionChecked) return setErr('판매 페이지에서 치수를 확인하고 확인란을 체크하세요');
    if (Object.values(p.dims).some((n) => !Number.isFinite(n) || n < 0.5)) return setErr('치수는 0.5cm 이상으로 입력하세요');
    try {
      if (p.url) normalizeProductUrl(p.url);
    } catch {
      return setErr('판매 링크 주소를 확인하세요');
    }
    upsertProduct({ ...p, name: p.name.trim(), brand: p.brand.trim() || '직접 입력' });
    if (!editing) {
      useStore.getState().mutate((draft) => {
        if (!draft.shortlist.includes(p.id)) draft.shortlist.push(p.id);
      }, false);
    }
    notify(editing ? '제품을 수정했어요' : '내 제품으로 저장했어요 — 카탈로그 "내가 추가"에 있어요');
    if (place) {
      const st = useStore.getState();
      if (st.view === 'mood' || st.view === 'walk') st.setView('3d');
      startPlacing(p.id);
    }
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
      sub="판매 페이지 링크나 사이즈표를 넣으면 같은 비례의 3D 가구가 만들어져요"
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
            <label htmlFor="editor-product-url">
              판매 페이지에서 정보 불러오기
              {aiUsed && (
                <span className="import-ai-badge">
                  <Sparkles size={11} /> AI 분석
                </span>
              )}
            </label>
            <div className="product-link-row">
              <input
                id="editor-product-url"
                className="inp"
                type="text"
                inputMode="url"
                placeholder="오늘의집·이케아·네이버 등 판매 페이지 주소 붙여넣기"
                value={pageUrl}
                disabled={loading}
                onChange={(e) => setPageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    importPage();
                  }
                }}
              />
              <button className="btn-secondary" disabled={loading || !pageUrl.trim()} onClick={importPage}>
                {loading ? '읽는 중…' : '불러오기'}
              </button>
            </div>
            <p className="note" role="status">
              {loading
                ? '판매 페이지에서 상품명·가격·치수 정보를 분석하고 있어요…'
                : importNote || '오늘의집·스마트스토어·이케아 등 어떤 판매 링크든 제품명·브랜드·가격·치수를 가능한 만큼 채워요.'}
            </p>

            {importedOptions.length > 0 && (
              <div className="import-options">
                <div className="import-options-label">감지된 사이즈 옵션 (눌러서 적용)</div>
                <div className="import-option-chips">
                  {importedOptions.map((opt, idx) => {
                    const dimLabel = [opt.dims?.w, opt.dims?.d, opt.dims?.h].some((v) => v !== undefined)
                      ? `${opt.dims?.w ?? '?'}×${opt.dims?.d ?? '?'}×${opt.dims?.h ?? '?'}cm${opt.estimated?.length ? '(표준 규격)' : ''}`
                      : '';
                    return (
                      <button
                        key={`${opt.label}-${idx}`}
                        type="button"
                        className={'chip sm' + (activeOptionIdx === idx ? ' active' : '')}
                        onClick={() => applyOption(opt, idx)}
                      >
                        {opt.label}
                        {dimLabel ? ` · ${dimLabel}` : ''}
                        {opt.price ? ` · ${fmtWon(opt.price)}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              className="import-fallback-toggle"
              onClick={() => setShowFallback((x) => !x)}
              aria-expanded={showFallback}
            >
              <span>페이지가 막혔거나 치수가 상세 이미지에 있나요? 텍스트 · 캡처로 불러오기</span>
              {showFallback ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {showFallback && (
              <div
                className="import-fallback-box"
                onDragOver={(e) => {
                  if (Array.from(e.dataTransfer?.items ?? []).some((it) => it.type.startsWith('image/'))) {
                    e.preventDefault();
                  }
                }}
                onDrop={(e) => {
                  const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
                  if (file && !loading) {
                    e.preventDefault();
                    void importFromImageFile(file);
                  }
                }}
              >
                <textarea
                  className="inp"
                  rows={3}
                  disabled={loading}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="상품 페이지 내용을 복사해 붙여넣거나(Ctrl+A→C→V), 상품·사이즈표 캡처 이미지를 이 창 아무 곳에서나 붙여넣으세요(Ctrl+V)"
                />
                <div className="import-fallback-acts">
                  <button type="button" className="btn-secondary" disabled={loading || !pasteText.trim()} onClick={importFromText}>
                    텍스트 분석
                  </button>
                  <label className={'btn-secondary' + (loading ? ' disabled' : '')}>
                    <ImageIcon size={13} /> 사이즈표 캡처 올리기
                    <input
                      type="file"
                      hidden
                      disabled={loading}
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) void importFromImageFile(f);
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
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
          {needsDimensionCheck && (
            <label className="check">
              <input type="checkbox" checked={dimensionChecked} onChange={(e) => setDimensionChecked(e.target.checked)} />
              판매 페이지에서 선택한 옵션의 가로·깊이·높이를 확인했어요
            </label>
          )}
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
                      <button
                        key={u.l}
                        className="btn-xs"
                        onClick={() =>
                          setP({
                            ...p,
                            dims: {
                              w: Math.round(raw.x * u.f * 10) / 10,
                              d: Math.round(raw.z * u.f * 10) / 10,
                              h: Math.round(raw.y * u.f * 10) / 10,
                            },
                          })
                        }
                      >
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
                {def.params
                  .filter((pd) => paramVisible(pd, resolveParams(p)))
                  .map((pd) => (
                    <ParamInput
                      key={pd.key}
                      def={pd}
                      value={p.params?.[pd.key] ?? pd.default}
                      onChange={(v) => setP({ ...p, params: { ...(p.params ?? {}), [pd.key]: v } })}
                    />
                  ))}
              </div>
            </>
          )}
          {def && Object.keys(def.slots).length > 0 && (
            <>
              <div className="insp-label" style={{ marginTop: 12 }}>색 · 재질</div>
              <div className="grid2">
                {Object.entries(def.slots).map(([k, s]) => (
                  <MatInput
                    key={k}
                    label={s.label}
                    value={p.mats?.[k] ?? s.def}
                    onChange={(m) => setP({ ...p, mats: { ...(p.mats ?? {}), [k]: m } })}
                  />
                ))}
              </div>
            </>
          )}
          <div className="insp-label" style={{ marginTop: 12 }}>메모</div>
          <textarea
            className="inp"
            value={p.notes ?? ''}
            onChange={(e) => setP({ ...p, notes: e.target.value || undefined })}
            placeholder="색상 옵션, 배송일, 할인 정보 등"
          />
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
