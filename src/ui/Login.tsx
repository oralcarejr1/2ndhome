import { Lock, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { serverLogin } from '../store/server';
import { useStore } from '../store/store';

/** Shown when the server deployment says this device isn't signed in (or the session ran out). */
export function LoginScreen() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setErr('');
    const r = await serverLogin(pw);
    if (r === 'ok') {
      location.reload();
      return;
    }
    setBusy(false);
    setErr(r === 'wrong' ? '비밀번호가 맞지 않아요.' : r === 'not_configured' ? '서버에 비밀번호가 아직 설정되지 않았어요.' : '연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
  };
  return (
    <div className="login-wrap">
      <button
        type="button"
        className="login-theme-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        aria-label="테마 전환"
      >
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M5 16 16 6l11 10v11H5z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
              <rect x="13" y="18" width="6" height="9" fill="var(--accent)" />
            </svg>
          </div>
          <div>
            <h1>2ndhome Studio</h1>
            <span className="login-sub">3D 공간 인테리어 플래너</span>
          </div>
        </div>
        <p>비밀번호를 입력하면 들어갈 수 있어요. 이 기기에서는 120일 동안 유지됩니다.</p>
        <label htmlFor="pw">비밀번호</label>
        <input id="pw" className="inp" type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn-primary" type="submit" disabled={busy || !pw}>
          <Lock size={14} /> {busy ? '확인 중…' : '들어가기'}
        </button>
        {err && (
          <div className="callout bad" role="alert">
            {err}
          </div>
        )}
      </form>
    </div>
  );
}
