// Admin visual skin: brand-navy look aligned with the landing motion board (motion-01-home). Tokens live in :root only.
// CSP is `style-src 'self'; script-src 'self'`, so CSS and JS are served as files (no inline style/script anywhere).
export const CSS = `:root{--navy-950:#0a1522;--navy-900:#0f1c2b;--navy-800:#16293f;--navy-700:#213d5c;--brand:#0b5fa5;--brand-hover:#0a5392;--brand-bright:#6db3ec;
--paper:#fff;--surface:#f3f6fa;--line:#d3dce6;--ink:#0f1c2b;--muted:#4b5b6b;--on-navy:#fff;--on-navy-muted:#b9c7d6;
--danger:#b3261e;--danger-bg:#fdeceb;--ok:#14733a;--ok-bg:#dcf3e4;--warn-bg:#fdf0d5;--warn:#7a5200;
--font-display:"Segoe UI Variable Display","Avenir Next","Trebuchet MS","Segoe UI",system-ui,sans-serif;--ring:0 0 0 3px #0f1c2b,0 0 0 6px #6db3ec;--r-card:16px;--r-field:10px;--r-pill:999px;
--ease-out:cubic-bezier(.16,1,.3,1);--d-ui:.25s;--d-reveal:.7s;--stagger:.07s;--shadow:0 18px 50px rgba(3,10,20,.45);
--hover-dur:160ms;--hover-ease:cubic-bezier(.2,.8,.2,1);--active-dur:80ms;--brand-lift:#2271b8;--brand-active:#084a82;--ghost-hover:rgba(255,255,255,.08);--ghost-active:rgba(255,255,255,.14);--card-ring:0 0 0 2px #a9d3f7}
[hidden]{display:none!important}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font:16px/1.55 system-ui,"Segoe UI",Roboto,sans-serif;color:var(--on-navy);min-height:100vh;
background:var(--navy-900)}
h1,h2{font-family:var(--font-display);letter-spacing:-.03em;line-height:1.1}h1{margin:0 0 8px;font-size:clamp(30px,4.4vw,46px);font-weight:800;color:#fff}
@supports((-webkit-background-clip:text) or (background-clip:text)){h1{background:linear-gradient(100deg,#fff 30%,#a9d3f7 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;padding-bottom:.08em}}
@media(forced-colors:active){h1{background:none;-webkit-text-fill-color:currentColor;color:CanvasText}}h2{font-size:20px;margin:12px 0 4px}
p{margin:0 0 12px}a{color:var(--brand-bright)}small{color:inherit;opacity:.85}
:focus-visible{outline:none;box-shadow:var(--ring);border-radius:8px}
.shell{display:flex;min-height:100vh}
nav.side{width:240px;flex:none;background:var(--navy-900);border-right:1px solid rgba(255,255,255,.08);padding:22px 14px;display:flex;flex-direction:column;gap:4px}
.brand{display:flex;align-items:center;gap:10px;padding:2px 8px 18px;font-weight:800;letter-spacing:.06em;font-size:15px}
.brand img{width:36px;height:36px;border-radius:10px;display:block}.brand small{display:block;font-weight:500;letter-spacing:0;opacity:.7;font-size:12px}
nav.side a,nav.side span.off{display:block;color:var(--on-navy);padding:11px 14px;border-radius:var(--r-pill);text-decoration:none;font-weight:600}
nav.side a{--b:transparent;--b-hover:var(--ghost-hover);--b-active:var(--ghost-active);background-color:var(--b)}
nav.side a.on{--b:var(--brand);--b-hover:var(--brand-lift);--b-active:var(--brand-active)}
nav.side span.off{color:var(--on-navy-muted);cursor:default;font-weight:500}
nav.side form{margin-top:auto;padding-top:16px}nav.side form button{width:100%}
main{flex:1;min-width:0;padding:32px clamp(16px,4vw,48px) 56px;max-width:1180px;animation:rise var(--d-reveal) var(--ease-out) both}
main>p,main>nav{color:var(--on-navy-muted)}
.card{background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:var(--r-card);padding:20px;box-shadow:var(--shadow)}
.card a{color:var(--brand)}.card small{color:var(--muted);opacity:1}
.toast{border-left:6px solid var(--ok);margin-bottom:20px;font-weight:600;animation:rise var(--d-reveal) var(--ease-out) both}
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));margin-top:20px}
.grid .card{display:flex;flex-direction:column;transition:box-shadow var(--hover-dur) var(--hover-ease);animation:rise var(--d-reveal) var(--ease-out) both}
.grid .card:nth-child(2){animation-delay:var(--stagger)}.grid .card:nth-child(3){animation-delay:calc(var(--stagger)*2)}.grid .card:nth-child(n+4){animation-delay:calc(var(--stagger)*3)}
.grid .card .row{margin-top:auto}
.thumb{width:100%;aspect-ratio:1/1;object-fit:contain;background:var(--surface);border-radius:12px}
.badge{display:inline-block;padding:3px 12px;border-radius:var(--r-pill);font-size:13px;font-weight:700;background:#e3e9f0;color:var(--ink)}
.badge.pub{background:var(--ok-bg);color:var(--ok)}.badge.draft{background:var(--warn-bg);color:var(--warn)}.badge.arch{background:#e3e9f0;color:var(--muted)}.badge.sched{background:#dce9f8;color:#0a4a85}.badge.exp{background:var(--danger-bg);color:var(--danger)}
label{display:block;font-weight:650;margin:16px 0 6px;font-size:15px}
input,select,textarea{width:100%;min-height:48px;padding:11px 14px;border:1.5px solid #8697a8;border-radius:var(--r-field);font:inherit;font-size:16px;background:#fff;color:var(--ink);transition:border-color var(--d-ui),box-shadow var(--d-ui)}
input:hover,select:hover,textarea:hover{border-color:var(--brand)}input:focus-visible,select:focus-visible,textarea:focus-visible{border-color:var(--brand);box-shadow:0 0 0 4px rgba(11,95,165,.28)}
input[type=file]{padding:9px 12px}
/* Buttons: each variant only declares its resting/hover/active shades (--b, --b-hover, --b-active); the shared rules below apply them.
   Hover feedback is a soft fill change (no lift, no shadow), same family as the public navbar; every hover/active rule skips disabled buttons. */
button,.btn{--b:var(--brand);--b-hover:var(--brand-hover);--b-active:var(--brand-active);display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 22px;border:0;border-radius:var(--r-pill);background-color:var(--b);color:#fff;font:inherit;font-weight:650;cursor:pointer;text-decoration:none}
button,.btn,nav.side a,details summary{transition:background-color var(--hover-dur) var(--hover-ease),color var(--hover-dur) var(--hover-ease),border-color var(--hover-dur) var(--hover-ease)}
button.sec,.btn.sec{--b:#e3e9f0;--b-hover:#d3dce6;--b-active:#c4d0dd;color:var(--ink)}
nav.side button.sec,main>nav .btn.sec{--b:rgba(255,255,255,.1);--b-hover:rgba(255,255,255,.18);--b-active:rgba(255,255,255,.26);color:#fff}
main>.row>.btn:not(.sec),main>nav .btn:not(.sec){--b-hover:var(--brand-lift);--b-active:var(--brand-active)}
button.danger{--b:var(--danger);--b-hover:#951d17;--b-active:#7f1813}
button[disabled]{opacity:.7;cursor:progress}
@media(hover:hover) and (pointer:fine){
button:not([disabled]):hover,.btn:hover,nav.side a:hover{background-color:var(--b-hover)}
.grid .card:hover{box-shadow:var(--card-ring),var(--shadow)}
details summary:hover{color:var(--brand-active)}}
button:not([disabled]):active,.btn:active,nav.side a:active{background-color:var(--b-active);transition-duration:var(--active-dur)}
.err{background:var(--danger-bg);color:#6b1510;border:1px solid #e9a8a3;border-left:6px solid var(--danger);padding:12px 14px;border-radius:12px;margin:12px 0}.err ul{margin:6px 0 0;padding-left:20px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.row.head{justify-content:space-between;margin-bottom:6px}.row.head h1{flex:1;min-width:0}
form.inline{display:inline}details summary{cursor:pointer;font-weight:600;padding:8px 0;color:var(--brand)}details{flex-basis:100%}
form.card{max-width:760px}.empty{text-align:center;padding:40px 20px;margin-top:20px}.empty strong{display:block;font-size:20px;margin-bottom:6px}
/* login */
.auth{min-height:100vh;display:grid;place-items:center;padding:24px 16px;position:relative;overflow:hidden}
.auth::before{content:"";position:absolute;right:-6vw;top:50%;width:min(70vw,760px);aspect-ratio:1.05;transform:translateY(-50%);background:url(__BASE__/admin-assets/render.webp) center/cover;opacity:.3;pointer-events:none;filter:saturate(.6);-webkit-mask-image:radial-gradient(closest-side,#000 30%,transparent 100%);mask-image:radial-gradient(closest-side,#000 30%,transparent 100%)}
.auth-box{position:relative;width:100%;max-width:420px;animation:rise var(--d-reveal) var(--ease-out) both}
.auth-brand{display:flex;align-items:center;gap:14px;margin-bottom:26px}.auth-brand img{width:56px;height:56px;border-radius:16px;box-shadow:0 8px 28px rgba(11,95,165,.6)}
.auth-brand b{display:block;font-size:20px;letter-spacing:.14em}.auth-brand span{color:var(--on-navy-muted);font-size:14px}
.auth-box h1{font-size:clamp(32px,8vw,44px);animation:rise var(--d-reveal) var(--ease-out) calc(var(--stagger)*2) both}
.auth-box .lead{color:var(--on-navy-muted);margin-bottom:22px;animation:rise var(--d-reveal) var(--ease-out) calc(var(--stagger)*3) both}
.auth-box .card{padding:26px;animation:rise var(--d-reveal) var(--ease-out) calc(var(--stagger)*4) both}.auth-box .card form>label:first-child{margin-top:0}
.auth-box button[type=submit]{width:100%;min-height:52px;font-size:17px;margin-top:22px}
.auth-foot{color:var(--on-navy-muted);font-size:14px;margin-top:18px}
.pw{position:relative}.pw input{padding-right:92px}.pw button{position:absolute;right:6px;top:6px;min-height:36px;padding:4px 14px;font-size:14px}
.spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:720px){.shell{flex-direction:column}nav.side{width:auto;flex-direction:row;flex-wrap:wrap;align-items:center;gap:4px;padding:10px 12px;border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}
.brand{padding:0 8px 0 0;width:100%}nav.side form{margin:0;padding:0;margin-left:auto}nav.side form button{width:auto}main{padding:24px 16px 40px}.auth::before{right:auto;left:50%;top:auto;bottom:-14vw;width:110vw;transform:translateX(-50%);opacity:.22}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}`;

export const JS = `(()=>{const f=document.querySelector('form[data-login]');if(!f)return;
const i=f.querySelector('#p'),t=f.querySelector('[data-toggle]'),s=f.querySelector('button[type=submit]');
if(t&&i){t.hidden=false;t.addEventListener('click',()=>{const h=i.type==='password';i.type=h?'text':'password';t.textContent=h?'Ocultar':'Mostrar';t.setAttribute('aria-pressed',String(h));});}
const label=s.textContent;
f.addEventListener('submit',()=>{s.disabled=true;s.setAttribute('aria-busy','true');s.innerHTML='<span class="spin" aria-hidden="true"></span> Verificando…';});
addEventListener('pageshow',()=>{s.disabled=false;s.removeAttribute('aria-busy');s.textContent=label;});})();`;
