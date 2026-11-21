// Self-contained pages served by the middleware before the app loads. Nothing about the home
// (name, plan, furniture) appears here: this is what a visitor without the password sees.

const BASE_CSS = `
:root{--bg:#f5f2ec;--surface:#fff;--border:#e5dfd5;--ink:#1e1c19;--ink-2:#57524b;--ink-3:#8c857b;--accent:#2b62d9;--bad:#dc2626;--bad-bg:#fef0f0}
@media (prefers-color-scheme:dark){:root{--bg:#171614;--surface:#211f1c;--border:#34312c;--ink:#f1ede6;--ink-2:#c4bdb2;--ink-3:#8f887d;--accent:#6c95f0;--bad:#f87171;--bad-bg:#3a1f1f}}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR","Segoe UI",sans-serif}
main{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px 16px}
.card{width:100%;max-width:360px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px 24px;box-shadow:0 6px 24px rgba(30,28,25,.08)}
.mark{width:40px;height:40px;border-radius:10px;background:var(--ink);color:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;letter-spacing:.02em;margin-bottom:16px}
h1{font-size:18px;margin:0 0 4px}
p{margin:0 0 18px;color:var(--ink-2);font-size:14px}
label{display:block;font-size:12px;color:var(--ink-3);margin-bottom:6px}
input{width:100%;font:inherit;padding:11px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg);color:var(--ink);outline:none}
input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 20%,transparent)}
button{margin-top:12px;width:100%;font:inherit;font-weight:600;padding:11px;border:0;border-radius:9px;background:var(--ink);color:var(--bg);cursor:pointer}
button:disabled{opacity:.6;cursor:default}
.err{display:none;margin-top:12px;padding:9px 11px;border-radius:8px;background:var(--bad-bg);color:var(--bad);font-size:13px}
.err.on{display:block}
code{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:1px 5px}
ol{margin:0;padding-left:18px;color:var(--ink-2);font-size:14px}
ol li{margin:6px 0}
`;

function shell(title: string, body: string, script = '') {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><style>${BASE_CSS}</style></head><body><main>${body}</main>${script}</body></html>`;
}

export function loginPage() {
  return shell(
    '2ndhome Studio',
    `<form class="card" id="f" autocomplete="on">
  <div class="mark">2nd</div>
  <h1>2ndhome Studio</h1>
  <p>비밀번호를 입력하면 들어갈 수 있어요.</p>
  <label for="pw">비밀번호</label>
  <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
  <button id="b" type="submit">들어가기</button>
  <div class="err" id="e" role="alert"></div>
</form>`,
    `<script>
const f=document.getElementById('f'),pw=document.getElementById('pw'),b=document.getElementById('b'),e=document.getElementById('e');
f.addEventListener('submit',async(ev)=>{ev.preventDefault();b.disabled=true;e.className='err';
try{const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json','x-2ndhome':'1'},body:JSON.stringify({password:pw.value})});
if(r.ok){location.reload();return}
e.textContent=r.status===401?'비밀번호가 맞지 않아요.':r.status===503?'서버에 비밀번호가 아직 설정되지 않았어요.':'잠시 후 다시 시도해 주세요.';e.className='err on';pw.select()}
catch(_){e.textContent='연결할 수 없어요. 네트워크를 확인해 주세요.';e.className='err on'}
b.disabled=false});
</script>`,
  );
}

export function setupPage() {
  return shell(
    '2ndhome Studio — 설정 필요',
    `<div class="card">
  <div class="mark">2nd</div>
  <h1>비밀번호 설정이 필요해요</h1>
  <p>비밀번호가 정해지기 전까지는 아무도 들어올 수 없게 잠가 두었어요.</p>
  <ol>
    <li>Vercel 프로젝트 → <b>Settings → Environment Variables</b></li>
    <li><code>APP_PASSWORD</code> 이름으로 원하는 비밀번호를 추가</li>
    <li><b>Deployments</b>에서 최신 배포를 <b>Redeploy</b></li>
  </ol>
</div>`,
  );
}
