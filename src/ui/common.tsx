import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { MatKind, MatSpec, ParamDef, ParamValue } from '../types';
import { MAT_KINDS } from '../lib/materials';

export function Num({
  value,
  onChange,
  unit,
  step = 1,
  min,
  max,
  title,
}: {
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  title?: string;
}) {
  const [txt, setTxt] = useState(fmt(value));
  useEffect(() => setTxt(fmt(value)), [value]);
  const commit = () => {
    const v = parseFloat(txt.replace(',', '.'));
    if (isFinite(v)) {
      let c = v;
      if (min != null) c = Math.max(min, c);
      if (max != null) c = Math.min(max, c);
      onChange(c);
      setTxt(fmt(c));
    } else setTxt(fmt(value));
  };
  return (
    <div className="numwrap" title={title}>
      <input
        inputMode="decimal"
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? step * 10 : step);
            let v = (parseFloat(txt) || 0) + d;
            if (min != null) v = Math.max(min, v);
            if (max != null) v = Math.min(max, v);
            onChange(v);
          }
          e.stopPropagation();
        }}
      />
      {unit && <em>{unit}</em>}
    </div>
  );
}

function fmt(v: number) {
  if (!isFinite(v)) return '';
  return String(Math.round(v * 10) / 10);
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, sub, onClose, children, foot, wide, size }: { title: string; sub?: string; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean; size?: 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const cls = size ?? (wide ? 'xl' : 'md');
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal-card modal-' + cls}>
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            {sub && <p className="modal-sub">{sub}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-footer">{foot}</div>}
      </div>
    </div>
  );
}

export function ParamInput({ def, value, onChange }: { def: ParamDef; value: ParamValue; onChange: (v: ParamValue) => void }) {
  if (def.type === 'bool')
    return (
      <label className="check">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {def.label}
      </label>
    );
  if (def.type === 'select')
    return (
      <Field label={def.label}>
        <select className="inp" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    );
  if (def.type === 'color')
    return (
      <Field label={def.label}>
        <input type="color" value={String(value)} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  return (
    <Field label={def.label}>
      <Num value={Number(value)} onChange={onChange} unit={def.unit} step={def.step ?? 1} min={def.min} max={def.max} />
    </Field>
  );
}

export function MatInput({ label, value, onChange, palette }: { label: string; value: MatSpec; onChange: (v: MatSpec) => void; palette?: string[] }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row" style={{ margin: 0 }}>
        <input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} />
        <select className="inp" style={{ flex: 1 }} value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as MatKind })}>
          {MAT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {palette && palette.length > 0 && (
        <div className="swatches" style={{ marginTop: 4 }}>
          {palette.map((c, i) => (
            <button key={c + i} style={{ background: c }} title={c} className={c === value.color ? 'on' : ''} onClick={() => onChange({ ...value, color: c })} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Confirm({ label, onConfirm, className = 'btn-xs danger' }: { label: ReactNode; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={className}
      style={armed ? { background: 'var(--bad)', color: '#fff', borderColor: 'var(--bad)' } : undefined}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? '한 번 더 누르면 실행' : label}
    </button>
  );
}

/** Save a file: through the claude.ai viewer's `downloads` capability when available, else a plain link. */
export async function download(name: string, data: Blob | string, type = 'application/octet-stream') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  try {
    const dl = (await window.claude?.use?.('downloads')) as { save(o: { filename: string; data: Blob }): Promise<unknown> } | null | undefined;
    if (dl) {
      await dl.save({ filename: name, data: blob });
      return;
    }
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code && code !== 'unavailable' && code !== 'not_granted') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function dataUrlToBlob(u: string) {
  const [h, b] = u.split(',');
  const mime = /:(.*?);/.exec(h)?.[1] ?? 'image/png';
  const bin = atob(b);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
