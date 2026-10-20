<?php
declare(strict_types=1);
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0d1019"><meta name="robots" content="noindex,nofollow">
<title>ScopeFlux — Domain Radar (staging)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;--bg:#0d1019;--surface:#151a27;--raised:#1c2233;--ink:#f0f2fa;--muted:#a2adc5;--line:#2b3246;--violet:#b09aff;--cyan:#7ee1ce;--gradient:linear-gradient(115deg,#b09aff,#7ee1ce)}
*{box-sizing:border-box}body{margin:0;font:14px 'DM Sans',sans-serif;background:radial-gradient(ellipse 850px 520px at 85% 0%,#22203a77,transparent),var(--bg);color:var(--ink);min-height:100vh}
.top{height:74px;padding:0 max(22px,calc((100vw - 1180px)/2));display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:#111521b3}.brand{font:800 21px Manrope;letter-spacing:-1px}.brand span,.gradient{background:var(--gradient);-webkit-background-clip:text;background-clip:text;color:transparent}.tag{font-size:10px;border:1px solid #60547a;color:#c6b8f9;border-radius:6px;padding:7px 9px;letter-spacing:1px}
main{max-width:1180px;margin:0 auto;padding:54px 24px 90px}.eyebrow{font-size:11px;letter-spacing:2px;font-weight:700;color:#bdaeff;margin:0 0 14px}h1{font:700 clamp(32px,5vw,54px)/1.14 Manrope;letter-spacing:-2px;margin:0 0 15px}.lead{color:var(--muted);max-width:650px;line-height:1.8;margin:0 0 30px}
.notice{background:#231c35;border:1px solid #4b3b65;border-radius:10px;padding:13px 16px;color:#d1c5ef;font-size:12px;margin-bottom:26px;line-height:1.7}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px}.tabs button,.tlds button,.pagination button{border:1px solid #394159;background:#1c2334;color:#c5cde0;border-radius:8px;padding:10px 14px;cursor:pointer}.tabs button.active,.tlds button.active{color:#eedfff;background:#3b2e56;border-color:#9280c0}
.controls{display:flex;gap:15px;flex-wrap:wrap;margin-bottom:19px}.search{flex:1;min-width:180px;background:#171c2a;border:1px solid #394057;border-radius:9px;color:var(--ink);padding:13px}.tlds{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:23px}.tlds button{font-size:12px;padding:8px 11px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:13px;overflow:hidden}.panel-header{padding:20px 22px;display:flex;justify-content:space-between;gap:12px;align-items:center}.panel-header h2{font:700 16px Manrope;margin:0}.small{color:var(--muted);font-size:11px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th{font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:#8997b5;padding:14px 22px;border-top:1px solid var(--line);background:#1a2030}td{padding:16px 22px;border-top:1px solid #2b32464d;font-size:12px}td strong{font-size:13px;color:#e5ecfb}td small{font-size:10px;color:var(--muted)}.empty{padding:40px 25px;text-align:center;color:var(--muted);line-height:1.8}.pagination{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:22px}.pagination button:disabled{opacity:.4;cursor:not-allowed}footer{border-top:1px solid var(--line);padding:30px 24px;color:var(--muted);text-align:center;font-size:11px}
@media(max-width:650px){.top{padding:0 20px}main{padding:35px 16px 60px}.panel-header{padding:18px}.search{width:100%}td,th{padding:13px}}
</style></head><body>
<header class="top"><div class="brand">scope<span>flux</span><span style="color:var(--cyan)">.</span></div><span class="tag">MIGRATION PREVIEW</span></header>
<main>
<p class="eyebrow">DOMAINS ON THE HORIZON</p>
<h1>Discover domains <span class="gradient">before they drop.</span></h1>
<p class="lead">Track upcoming domain releases and recent estimates. A streamlined preview of the new PHP-powered radar.</p>
<div class="notice">This is a migration preview. Live availability is not guaranteed, and some data sources may still be unavailable. The account and watchlist features are not enabled yet.</div>
<div class="tabs"><button data-view="upcoming" class="active">Expiring soon</button><button data-view="recent">Recently expired</button></div>
<div class="controls"><input class="search" id="search" placeholder="Search domains..." aria-label="Search domains"></div>
<div class="tlds" id="tlds"><button data-tld="all" class="active">All</button></div>
<section class="panel"><div class="panel-header"><h2 id="heading">Upcoming domains</h2><span id="count" class="small">Loading…</span></div>
<div class="scroll"><table><thead><tr><th>Domain</th><th>Status</th><th>Expected release</th><th>Source</th></tr></thead><tbody id="results"></tbody></table></div><div id="empty" class="empty" hidden></div></section>
<div class="pagination"><button id="prev" disabled>Previous</button><span id="page-number" class="small">1</span><button id="next" disabled>Next</button></div>
</main><footer>ScopeFlux · Release dates are estimates, not guarantees of availability.</footer>
<script>
(()=>{
const supported=['com','net','org','io','app','co','xyz','info','me','biz','us','pro','cc','tv','cz','sk'];
const state={view:'upcoming',tld:'all',records:[],page:0};
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('tlds').insertAdjacentHTML('beforeend',supported.map(t=>'<button data-tld="'+t+'">.'+t+'</button>').join(''));
function render(){
 const q=$('search').value.trim().toLowerCase();
 let rows=state.records.filter(r=>(state.tld==='all'||r.tld===state.tld)&&String(r.domain).includes(q));
 rows.sort((a,b)=>state.view==='recent'?String(b.drop??'').localeCompare(String(a.drop??'')):String(a.drop??'').localeCompare(String(b.drop??'')));
 const size=25,pages=Math.max(1,Math.ceil(rows.length/size));state.page=Math.max(0,Math.min(state.page,pages-1));
 const page=rows.slice(state.page*size,(state.page+1)*size);
 $('results').innerHTML=page.map(r=>'<tr><td><strong>'+escape(r.domain)+'</strong></td><td>'+escape(r.status||'Unverified')+'</td><td>'+escape(r.drop?String(r.drop).replace('T',' ').slice(0,19):'Unknown')+'</td><td><small>'+escape(r.source||'')+'</small></td></tr>').join('');
 $('empty').hidden=rows.length>0;$('empty').textContent=state.records.length?'No domains match your filters.':'No imported records available yet. Sources are being configured.';
 $('count').textContent=rows.length.toLocaleString()+' domains';$('page-number').textContent=(state.page+1)+' / '+pages;
 $('prev').disabled=state.page===0;$('next').disabled=state.page>=pages-1;
 $('heading').textContent=state.view==='recent'?'Recently expired domains':'Upcoming domains';
}
async function load(){
 $('count').textContent='Loading…';state.records=[];render();
 try{const res=await fetch('/api/domains'+(state.view==='recent'?'?view=recent':''),{credentials:'same-origin'});const data=await res.json();if(!res.ok)throw new Error(data.error||'Unavailable');
 state.records=Array.isArray(data.records)?data.records:[];render();
 }catch(error){$('count').textContent='Unavailable';$('empty').hidden=false;$('empty').textContent='The catalogue is temporarily unavailable. Please try later.';}
}
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===el));state.view=el.dataset.view;state.page=0;load();}));
$('tlds').addEventListener('click',e=>{const button=e.target.closest('[data-tld]');if(!button)return;$('tlds').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));state.tld=button.dataset.tld;state.page=0;render();});
$('search').addEventListener('input',()=>{state.page=0;render();});$('prev').addEventListener('click',()=>{state.page--;render();});$('next').addEventListener('click',()=>{state.page++;render();});load();
})();
</script></body></html>