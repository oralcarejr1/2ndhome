import { Lock } from 'lucide-react';
import { useState } from 'react';
import { serverLogin } from '../store/server';

/** Shown when the server deployment says this device isn't signed in (or the session ran out). */
export function LoginScreen() {
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
      location.reload(); // unsaved edits are kept on this device and uploaded after sign-in
      return;
    }
    setBusy(false);
    setErr(r === 'wrong' ? '비밀번호가 맞지 않아요.' : r === 'not_configured' ? '서버에 비밀번호가 아직 설정되지 않았어요.' : '연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
  };
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">2nd</div>
        <h1>2ndhome Studio</h1>
        <p>비밀번호를 입력하면 들어갈 수 있어요. 이 기기에서는 120일 동안 다시 묻지 않아요.</p>
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
