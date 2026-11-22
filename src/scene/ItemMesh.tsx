import { memo, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { getMaterial } from '../lib/materials';
import { fitModel, loadRaw } from '../lib/modelLoader';
import { buildProcedural, disposeObject, itemDims, resolveMats } from '../models';
import { blobUrl } from '../store/persistence';
import type { PlacedItem, Product, RefItem } from '../types';

export function useImageUrl(ref: RefItem | undefined) {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    if (!ref) return setUrl(undefined);
    if (ref.blobId) void blobUrl(ref.blobId).then((u) => alive && setUrl(u));
    else setUrl(ref.url);
    return () => {
      alive = false;
    };
  }, [ref?.blobId, ref?.url]);
  return url;
}

function AssetModel({ prod, item }: { prod: Product; item?: PlacedItem }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const [err, setErr] = useState(false);
  const dims = itemDims(item, prod);
  const mats = resolveMats(prod, item);
  const firstSlot = Object.values(mats)[0];
  const asset = prod.asset!;
  useEffect(() => {
    let alive = true;
    setErr(false);
    loadRaw(asset)
      .then((raw) => {
        if (!alive) return;
        const tint = firstSlot ? getMaterial(firstSlot) : undefined;
        const o = fitModel(raw, asset, dims, tint);
        o.scale.multiplyScalar(100);
        setObj(o);
      })
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [asset.blobId, asset.fit, asset.rotX, asset.rotY, asset.keepMaterials, dims.w, dims.d, dims.h, firstSlot?.kind, firstSlot?.color]);
  if (err || !obj) {
    return (
      <mesh position={[0, dims.h / 2, 0]}>
        <boxGeometry args={[dims.w, dims.h, dims.d]} />
        <meshStandardMaterial color={err ? '#e5484d' : '#cfcac2'} transparent opacity={0.5} />
      </mesh>
    );
  }
  return <primitive object={obj} />;
}

interface Props {
  item?: PlacedItem;
  prod: Product;
  ghost?: boolean;
  imageRef?: RefItem;
}

/** Model only (cm units, local origin = footprint centre on the floor). */
export const ItemModel = memo(
  function ItemModel({ item, prod, ghost, imageRef }: Props) {
    const imageUrl = useImageUrl(imageRef);
    const key = useMemo(
      () => JSON.stringify([prod.id, prod.model, prod.dims, prod.params, prod.mats, item?.dims, item?.params, item?.mats, ghost, imageUrl]),
      [prod.id, prod.model, prod.dims, prod.params, prod.mats, item?.dims, item?.params, item?.mats, ghost, imageUrl],
    );
    const obj = useMemo(() => (prod.asset ? null : buildProcedural(prod, item, { ghost, imageUrl })), [key]);
    useEffect(() => () => (obj ? disposeObject(obj) : undefined), [obj]);
    if (prod.asset) return <AssetModel prod={prod} item={item} />;
    return obj ? <primitive object={obj} /> : null;
  },
  (prev, next) =>
    prev.prod === next.prod &&
    prev.ghost === next.ghost &&
    prev.item?.dims === next.item?.dims &&
    prev.item?.params === next.item?.params &&
    prev.item?.mats === next.item?.mats &&
    prev.imageRef?.id === next.imageRef?.id &&
    prev.imageRef?.blobId === next.imageRef?.blobId &&
    prev.imageRef?.url === next.imageRef?.url,
);

export function OutlineBox({ w, d, h, color, y0 = 0, pad = 1.5 }: { w: number; d: number; h: number; color: string; y0?: number; pad?: number }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w + pad * 2, h + pad, d + pad * 2)), [w, d, h, pad]);
  return (
    <lineSegments geometry={geo} position={[0, y0 + h / 2, 0]} raycast={() => null}>
      <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
    </lineSegments>
  );
}

export function Footprint({ w, d, color, opacity = 0.18, y = 0.8 }: { w: number; d: number; color: string; opacity?: number; y?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} raycast={() => null} renderOrder={2}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
