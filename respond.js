/* =========================================================
   FireSight — Detect & respond module
   Live incident pins, full incident window, manual actions.
   Nothing is sent without an officer pressing Confirm.
   ========================================================= */
(function(){
'use strict';

/* ---------- responder registry (mock) ---------- */
const AREAS = {
  old_city:{name:'Old City (Charminar)', lat:17.3616, lon:78.4747, pin:'500002', locality:'Charminar', code:'CHR', speed:11,
    fire:[{id:'F1',name:'Moghalpura Fire Station',x:-260,y:-180,tenders:2,bikes:4,ladder:false},
          {id:'F2',name:'Gowliguda Fire Station',x:470,y:340,tenders:3,bikes:2,ladder:true}],
    fireJur:(x,y)=> y<60?'F1':'F2',
    police:[{id:'P1',name:'Charminar Police Station',x:-40,y:-30},{id:'P2',name:'Mirchowk Police Station',x:330,y:-230}],
    polJur:(x,y)=> x<140?'P1':'P2',
    traffic:'Charminar Traffic Police Station', power:'TGSPDCL Charminar section',
    hospitals:[{id:'H1',name:'Area General Hospital, Afzalgunj',x:-520,y:520,burn:true,beds:14,type:'Government'},
               {id:'H2',name:'Shalibanda Multispeciality Hospital',x:380,y:-420,burn:false,beds:6,type:'Private'},
               {id:'H3',name:'Purani Haveli Burns and Trauma Centre',x:560,y:120,burn:true,beds:5,type:'Private'}],
    streets:['Gulzar Houz Road','Pathergatti Road','Laad Bazaar Road','Shalibanda Road','Moghalpura Road','Mitti Ka Sher Road','Kali Kaman Road','Madina Road','Hussaini Alam Road','Chowk Road']},
  ameerpet:{name:'Ameerpet', lat:17.4375, lon:78.4482, pin:'500016', locality:'Ameerpet', code:'AMP', speed:17,
    fire:[{id:'F1',name:'Ameerpet Fire Station',x:330,y:260,tenders:3,bikes:4,ladder:true},
          {id:'F2',name:'Sanathnagar Fire Station',x:-470,y:-330,tenders:2,bikes:2,ladder:false}],
    fireJur:(x,y)=> x>-80?'F1':'F2',
    police:[{id:'P1',name:'SR Nagar Police Station',x:-200,y:150},{id:'P2',name:'Punjagutta Police Station',x:420,y:-250}],
    polJur:(x,y)=> y>-60?'P1':'P2',
    traffic:'SR Nagar Traffic Police Station', power:'TGSPDCL Ameerpet section',
    hospitals:[{id:'H1',name:'Ameerpet General Hospital',x:120,y:-520,burn:false,beds:10,type:'Government'},
               {id:'H2',name:'Begumpet Burns and Trauma Centre',x:-560,y:430,burn:true,beds:7,type:'Private'},
               {id:'H3',name:'SR Nagar Nursing Home',x:-260,y:330,burn:false,beds:4,type:'Private'}],
    streets:['Ameerpet Main Road','Mythrivanam Road','SR Nagar Main Road','Begumpet Road','Balkampet Road','Satyam Theatre Road','Leelanagar Road','Kumar Basti Road','Yellareddyguda Road','Dharam Karan Road']},
};
const M = 111320;
const kx = A => M*Math.cos(A.lat*Math.PI/180);
const toLL = (A,x,y) => [A.lon + x/kx(A), A.lat + y/M];
const toXY = (A,lon,lat) => [(lon-A.lon)*kx(A), (lat-A.lat)*M];
const areaOf = id => id.startsWith('OL') ? 'old_city' : 'ameerpet';
const dist = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
const fmtKm = m => m<1000 ? `${Math.round(m/10)*10} m` : `${(m/1000).toFixed(1)} km`;
const hash = s => { let h=2166136261; for(const c of String(s)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619);} return h>>>0; };
const rng = seed => () => { seed = (seed*1664525 + 1013904223)>>>0; return seed/4294967296; };
const esc = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hhmm = d => d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false});
const hhmmss = d => d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const ago = d => { const s=Math.max(0,Math.floor((Date.now()-d)/1000)); if(s<60) return `${s}s ago`; const m=Math.floor(s/60); return m<60?`${m}m ${String(s%60).padStart(2,'0')}s ago`:`${Math.floor(m/60)}h ${m%60}m ago`; };
const wait = ms => new Promise(r=>setTimeout(r, reduce?0:ms));
const srcTxt = s => ({'CCTV camera':'CCTV camera','Caller photo':'caller photo','Patrol report':'patrol report'})[s]||s;
const lbl = u => ({residential:'Residential building',mixed:'Shops below, homes above',commercial:'Commercial building',coaching:'Coaching centre',godown:'Godown or storage',educational:'School'})[u]||u;

const ICON = {
  truck:'<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  route:'<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 18h6a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h6"/>',
  megaphone:'<path d="M4 10v4h3l7 4V6L7 10H4z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5"/>',
  alert:'<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  cross:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  shield:'<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z"/>',
  bolt:'<path d="M13 3 5 13.5h6L10 21l9-11h-6l1-7z"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.6L16.5 9"/>',
  pin:'<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>',
  station:'<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
  signal:'<rect x="8" y="3" width="8" height="16" rx="2.5"/><circle cx="12" cy="7" r="1.3"/><circle cx="12" cy="11" r="1.3"/><circle cx="12" cy="15" r="1.3"/>',
};
const svg = (k, c='currentColor') => `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

/* ---------- geometry from data ---------- */
let ROADS = {}, BLD = [], BLDI = {};
function prepGeometry(){
  for(const f of data.r.features){
    const a=f.properties.area, A=AREAS[a]; if(!A) continue;
    const [p,q]=f.geometry.coordinates.map(c=>toXY(A,c[0],c[1]));
    ROADS[a] ||= {V:[],H:[]};
    if(Math.abs(p[0]-q[0])<1) ROADS[a].V.push({x:p[0],w:f.properties.width}); else ROADS[a].H.push({y:p[1],w:f.properties.width});
  }
  for(const a in ROADS){
    const A=AREAS[a], main=w=>w>=(a==='old_city'?9:15);
    ROADS[a].V.sort((m,n)=>m.x-n.x); ROADS[a].H.sort((m,n)=>m.y-n.y);
    let i=0;
    [...ROADS[a].V.filter(r=>main(r.w)), ...ROADS[a].H.filter(r=>main(r.w))].forEach(r=>{ r.name=A.streets[i++%A.streets.length]; r.main=true; });
  }
  for(const f of data.b.features){
    const p=f.properties, a=areaOf(p.id), A=AREAS[a], c=f.geometry.coordinates[0];
    let lon=0,lat=0; for(let k=0;k<4;k++){lon+=c[k][0];lat+=c[k][1];} lon/=4; lat/=4;
    const o={id:p.id,a,ll:[lon,lat],xy:toXY(A,lon,lat),p};
    BLD.push(o); BLDI[p.id]=o;
  }
}
function nearestRoad(a,[x,y]){
  const R=ROADS[a]; let best=null, bd=1e9, nm=null, nd=1e9;
  for(const v of R.V){ const d=Math.abs(v.x-x); if(d<bd){bd=d;best=v;} if(v.name&&d<nd){nd=d;nm=v;} }
  for(const h of R.H){ const d=Math.abs(h.y-y); if(d<bd){bd=d;best=h;} if(h.name&&d<nd){nd=d;nm=h;} }
  return best.name ? best.name : `Lane off ${nm?nm.name:'main road'}`;
}
function roadName(r){ return r.name || 'Inner lane'; }

/* route along the street grid: station -> main road -> building */
function planRoute(a, S, B){
  const R=ROADS[a], main=w=>w>=(a==='old_city'?9:15);
  const nearH=(y,list=R.H)=>list.reduce((m,h)=>Math.abs(h.y-y)<Math.abs(m.y-y)?h:m, list[0]);
  const nearV=(x,list=R.V)=>list.reduce((m,v)=>Math.abs(v.x-x)<Math.abs(m.x-x)?v:m, list[0]);
  const mH=R.H.filter(h=>main(h.w)), mV=R.V.filter(v=>main(v.w));
  const H1=nearH(S[1], mH.length?mH:R.H), V1=nearV(B[0], mV.length?mV:R.V), H2=nearH(B[1]);
  const raw=[S,[S[0],H1.y],[V1.x,H1.y],[V1.x,H2.y],[B[0],H2.y],B];
  const pts=raw.filter((p,i)=>i===0||dist(p,raw[i-1])>0.5);
  const legs=[{along:H1,axis:'H',from:raw[1],to:raw[2]},{along:V1,axis:'V',from:raw[2],to:raw[3]},{along:H2,axis:'H',from:raw[3],to:raw[4]}];
  const sig=(w1,w2)=>Math.max(w1,w2)>=9&&Math.min(w1,w2)>=5.5;
  const J=[];
  for(const L of legs){
    if(L.axis==='H'){ const [x0,x1]=[L.from[0],L.to[0]].sort((m,n)=>m-n);
      for(const v of R.V) if(v.x>x0+2&&v.x<x1-2&&sig(L.along.w,v.w)) J.push({xy:[v.x,L.along.y],a:L.along,b:v,order:Math.abs(v.x-L.from[0])+J.length*1e-3,leg:L}); }
    else { const [y0,y1]=[L.from[1],L.to[1]].sort((m,n)=>m-n);
      for(const h of R.H) if(h.y>y0+2&&h.y<y1-2&&sig(L.along.w,h.w)) J.push({xy:[L.along.x,h.y],a:L.along,b:h,order:Math.abs(h.y-L.from[1]),leg:L}); }
  }
  if(sig(H1.w,V1.w)&&dist(raw[1],raw[2])>2&&dist(raw[2],raw[3])>2) J.push({xy:raw[2],a:H1,b:V1,order:1e6,leg:legs[0]});
  if(sig(V1.w,H2.w)&&dist(raw[2],raw[3])>2&&dist(raw[3],raw[4])>2) J.push({xy:raw[3],a:V1,b:H2,order:1e6,leg:legs[1]});
  const legIdx=L=>legs.indexOf(L);
  J.sort((m,n)=>legIdx(m.leg)-legIdx(n.leg)||m.order-n.order);
  const types=['remote','remote','remote','adaptive','adaptive','manual','remote','manual','adaptive','remote'];
  const juncs=J.slice(0,8).map((j,i)=>({id:`J${i+1}`,xy:j.xy,ll:toLL(AREAS[a],...j.xy),name:`${roadName(j.a)} and ${roadName(j.b)}`,type:types[hash(a+Math.round(j.xy[0])+':'+Math.round(j.xy[1]))%types.length],status:'planned'}));
  let len=0; for(let i=1;i<pts.length;i++) len+=dist(pts[i],pts[i-1]);
  const v=AREAS[a].speed*1000/60;
  return {pts, ll:pts.map(p=>toLL(AREAS[a],...p)), juncs, len, eta:len*1.15/v+1, etaFast:len/(v*1.6)+0.6,
    roads:[...new Set([H1,V1,H2].map(roadName))].filter(n=>n!=='Inner lane')};
}
function distToPolyline(p, pts){
  let best=1e9;
  for(let i=1;i<pts.length;i++){
    const [ax,ay]=pts[i-1],[bx,by]=pts[i], dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy;
    const t=L?Math.max(0,Math.min(1,((p[0]-ax)*dx+(p[1]-ay)*dy)/L)):0;
    best=Math.min(best, Math.hypot(p[0]-(ax+t*dx), p[1]-(ay+t*dy)));
  }
  return best;
}
function circle(A,[x,y],r,n=56){ const c=[]; for(let i=0;i<=n;i++){const t=i/n*Math.PI*2; c.push(toLL(A,x+r*Math.cos(t),y+r*Math.sin(t)));} return {type:'Feature',geometry:{type:'Polygon',coordinates:[c]},properties:{}}; }

/* ---------- severity ---------- */
function peopleNow(p){ return getTime()==='night'?p.p_night:p.p_day; }
function assess(p, vis){
  const people=peopleNow(p);
  const visual = vis ? Math.min(40, vis.fire*2.2 + vis.smoke*0.5) : 22;
  const life = Math.min(35, Math.log1p(people)/Math.log1p(200)*24 + Math.min(11, p.floors*1.6));
  const spread = Math.min(25, (p.cluster>=6?8:p.cluster>=3?4:0) + (p.gap<2?5:0) + (p.access?0:6) + Math.min(6,p.hazards*3));
  const s = visual+life+spread;
  return {score:Math.round(s), level: s>=62?3:s>=38?2:1};
}
function reasonsFor(inc){
  const p=inc.p, r=[];
  r.push(`About ${peopleNow(p)} people inside at this hour (${p.floors} floors)`);
  if(inc.vis) r.push(`Photo analysis: flames cover ${inc.vis.fire.toFixed(0)}% of the frame, smoke ${inc.vis.smoke.toFixed(0)}%`);
  if(p.cluster>=3) r.push(`Joined to ${p.cluster-1} neighbouring buildings, so the fire can spread`);
  else if(p.gap<2) r.push(`Only ${p.gap} m from the next building`);
  if(!p.access) r.push(`Access road is ${p.road} m wide, too narrow for a fire tender`);
  if(p.hazards) r.push(`${p.hazards} hazard site${p.hazards>1?'s':''} within 100 m`);
  if(p.noc==='missing'||p.noc==='expired') r.push(`Fire NOC ${p.noc==='missing'?'required but not found':'expired'}`);
  if(['mixed','godown'].includes(p.use)) r.push('Goods stored on the premises');
  return r.slice(0,5);
}

/* ---------- simulated camera frames ---------- */
function frame(level, seed, cam, when, growth, night){
  const R=rng(seed), W=640, H=360, g=Math.max(.35,growth)*level;
  let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${night?'#0A1220':'#7E8EA3'}"/><stop offset="1" stop-color="${night?'#1C2638':'#C9D1DB'}"/></linearGradient>
  <linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFF3B0"/><stop offset=".35" stop-color="#FFB627"/><stop offset=".75" stop-color="#F2542D"/><stop offset="1" stop-color="#B3201F" stop-opacity=".2"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#FF9A3C" stop-opacity="${night?.75:.45}"/><stop offset="1" stop-color="#FF9A3C" stop-opacity="0"/></radialGradient>
  <filter id="blur"><feGaussianBlur stdDeviation="14"/></filter><filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  let x=-10;
  while(x<W){ const w=60+R()*90, h=120+R()*150, isT = x<300 && x+w>300;
    const bw=isT?150:w, bh=isT?200:h, bx=isT?245:x;
    s+=`<rect x="${bx}" y="${H-40-bh}" width="${bw}" height="${bh}" fill="${night?'#151C28':'#4A5363'}"/>`;
    for(let wy=H-40-bh+14; wy<H-56; wy+=22) for(let wx=bx+10; wx<bx+bw-14; wx+=18)
      if(R()<(night?.32:.12)) s+=`<rect x="${wx}" y="${wy}" width="8" height="11" fill="${night?'#E9C46A':'#8FA3B8'}" opacity="${night?.65:.5}"/>`;
    x = isT? 400 : x+w+4;
  }
  s+=`<rect y="${H-40}" width="${W}" height="40" fill="${night?'#0E131B':'#3B4250'}"/>`;
  const cx=320, base=H-40-120+30*R();
  s+=`<circle cx="${cx}" cy="${base}" r="${90+g*45}" fill="url(#glow)"/>`;
  for(let i=0;i<5+level*4;i++){ const sx=cx-60-g*10+R()*(120+g*20), sy=base-60-R()*(60+g*40), sr=30+R()*25+g*12;
    s+=`<circle cx="${sx}" cy="${sy}" r="${sr}" fill="${night?'#3A3F49':'#5B6170'}" opacity="${.35+R()*.3}" filter="url(#blur)"/>`; }
  for(let i=0;i<4+level*4;i++){ const fx=cx-50-g*8+R()*(100+g*16), fh=30+R()*40+g*22, fw=8+R()*10+g*3;
    s+=`<path d="M${fx} ${base+20} Q${fx-fw} ${base+20-fh*.5} ${fx+R()*6-3} ${base+20-fh} Q${fx+fw} ${base+20-fh*.5} ${fx} ${base+20}Z" fill="url(#fl)" filter="url(#soft)" opacity="${.75+R()*.25}"/>`; }
  s+=`<rect width="${W}" height="${H}" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="18"/>
  <circle cx="22" cy="22" r="5" fill="#E23B3B"/><text x="34" y="27" font-family="IBM Plex Mono,monospace" font-size="13" fill="#fff" font-weight="600">REC  ${cam}</text>
  <text x="${W-14}" y="${H-12}" text-anchor="end" font-family="IBM Plex Mono,monospace" font-size="13" fill="#fff">${when}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
}
function analyzeImage(src){
  return new Promise(res=>{
    const img=new Image(); img.onload=()=>{
      const c=document.createElement('canvas'), w=160, h=Math.max(1,Math.round(img.height/img.width*160)); c.width=w; c.height=h;
      const x=c.getContext('2d'); x.drawImage(img,0,0,w,h);
      let d; try{ d=x.getImageData(0,0,w,h).data; }catch(e){ return res(null); }
      let f=0,sm=0,n=w*h;
      for(let i=0;i<d.length;i+=4){ const r=d[i],g=d[i+1],b=d[i+2];
        if(r>170&&r>g&&g>b&&r-b>70&&g>50) f++;
        else if(Math.abs(r-g)<18&&Math.abs(g-b)<18&&r>55&&r<175) sm++; }
      res({fire:f/n*100, smoke:Math.min(60,sm/n*100)});
    }; img.onerror=()=>res(null); img.src=src;
  });
}

/* ---------- alert delivery ---------- */
const NB = {ok:false, roles:{}, keyRequired:false};
let demoKey=''; try{ demoKey=localStorage.getItem('fs_demo_key')||''; }catch(e){}
async function checkBackend(){
  try{ const r=await fetch('api/notify',{cache:'no-store'}); if(!r.ok) throw 0; const j=await r.json(); if(!j||!j.service) throw 0; Object.assign(NB,j,{ok:true}); }
  catch(e){ NB.ok=false; }
  const pill=$('#backendPill'), any=NB.ok && Object.values(NB.roles||{}).some(v=>v.length);
  pill.classList.toggle('on', !!any); pill.classList.toggle('part', NB.ok && !any);
  pill.querySelector('span').textContent = any ? 'Live alerts' : NB.ok ? 'Alerts: no contacts set' : 'Simulated alerts';
}
function deliveryLine(role){
  if(!NB.ok) return 'Simulated in this demo. Nothing leaves the browser.';
  const ch=(NB.roles&&NB.roles[role])||[];
  if(!ch.length) return `No demo phone is set for ${role.toLowerCase()} yet, so this will only be logged.`;
  const c={call:'voice call',sms:'SMS',tg:'Telegram message'};
  const counts={}; ch.forEach(k=>counts[k]=(counts[k]||0)+1);
  return 'Goes to the demo phones: '+Object.entries(counts).map(([k,n])=>`${n} ${c[k]||k}${n>1?'s':''}`).join(', ')+'.';
}
async function send(role, text, lang, extra={}){
  if(!NB.ok){ await wait(650); return {sim:true}; }
  try{
    const r=await fetch('api/notify',{method:'POST',headers:{'content-type':'application/json','x-demo-key':demoKey},body:JSON.stringify({role,text,lang,...extra})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) return {err: j.error || `Alert service returned ${r.status}`};
    return j;
  }catch(e){ return {err:'Could not reach the alert service'}; }
}
function logResult(inc, what, res){
  if(res.sim) addLog(inc, `${what}: simulated, logged only`, 'sim');
  else if(res.err) addLog(inc, `${what}: failed. ${res.err}`, 'err');
  else if(!res.results || !res.results.length) addLog(inc, `${what}: logged, no demo phone set for this role`, 'sim');
  else res.results.forEach(x=> addLog(inc, `${what}: ${x.ok?'sent':'failed'} by ${({call:'voice call',sms:'SMS',tg:'Telegram'})[x.channel]||x.channel} to ${x.to}${x.ok?'':'. '+(x.error||'')}`, x.ok?'okc':'err'));
}

/* ---------- incidents ---------- */
const INC=[]; let seq=4100, current=null, markers={};
function responders(inc){
  const A=AREAS[inc.a], B=inc.xy;
  const stations=A.fire.map(s=>({...s, d:Math.abs(s.x-B[0])+Math.abs(s.y-B[1])})).sort((m,n)=>m.d-n.d);
  const v=A.speed*1000/60;
  stations.forEach(s=>{ s.eta=s.d*1.15/v+1; });
  const jur=A.fire.find(s=>s.id===A.fireJur(...B));
  const pol=A.police.find(s=>s.id===A.polJur(...B));
  const polNear=A.police.map(s=>({...s,d:dist([s.x,s.y],B)})).sort((m,n)=>m.d-n.d)[0];
  const hosp=A.hospitals.map(h=>({...h, d:dist([h.x,h.y],B)})).sort((m,n)=>m.d-n.d).map(h=>({...h, eta:h.d*1.2/v+1}));
  return {nearest:stations[0], stations, jur:{...jur, d:Math.abs(jur.x-B[0])+Math.abs(jur.y-B[1])}, pol, polNear, traffic:A.traffic, power:A.power, hosp};
}
function createIncident({bid, level, minutesAgo=0, source='CCTV camera', images=null, vis=null, isNew=true}){
  const b=BLDI[bid], A=AREAS[b.a];
  const t=new Date(Date.now()-minutesAgo*60000);
  const id=`FS-${++seq}`;
  const inc={id, bid, a:b.a, A, p:b.p, xy:b.xy, ll:b.ll, level, t, source, vis, status:'active', done:{}, log:[], loaded:false,
    road: nearestRoad(b.a,b.xy), images:[], stations:null, route:null};
  inc.address = `${inc.road}, ${A.locality}, Hyderabad ${A.pin}`;
  inc.resp = responders(inc);
  const cam = source==='CCTV camera' ? `CAM-${String(hash(bid)%40+1).padStart(2,'0')}` : 'PHOTO';
  if(images) inc.images = images;
  else { const night=getTime()==='night';
    inc.images = [2,1,0].map((m,i)=>({src:frame(level, hash(bid)+i*7, cam, `${hhmmss(new Date(t.getTime()-m*45000))}`, .55+i*.25, night), cap:`${source==='CCTV camera'?'CCTV '+cam:'Caller photo'}`, at:new Date(t.getTime()-m*45000)})); }
  inc.log.push({t, text:`Reported by ${srcTxt(source)}. Assessed as level ${level}.`, cls:''});
  INC.unshift(inc);
  map.setFeatureState({source:'bld',id:bid},{inc:true});
  addMarker(inc); renderLive();
  if(isNew){
    if($('#inc').classList.contains('open') && current!==inc) toast(`New level ${level} fire: ${inc.road}, ${A.locality}. Tap to open.`, ()=>openIncident(inc));
    else setTimeout(()=>openIncident(inc), reduce?0:300);
  }
  return inc;
}
function addMarker(inc){
  const el=document.createElement('button');
  el.className=`ipin L${inc.level}`; el.setAttribute('aria-label',`Level ${inc.level} fire at ${inc.road}`);
  el.innerHTML=`<span class="pulse"></span><span class="b">L${inc.level} fire</span>`;
  el.onclick=e=>{ e.stopPropagation(); openIncident(inc); };
  markers[inc.id]=new maplibregl.Marker({element:el,anchor:'bottom',offset:[0,-14]}).setLngLat(inc.ll).addTo(map);
}
function refreshMarker(inc){ const m=markers[inc.id]; if(!m) return; const el=m.getElement(); el.className=`ipin ${inc.status==='resolved'?'R':'L'+inc.level}`; el.querySelector('.b').textContent = inc.status==='resolved'?'Resolved':`L${inc.level} fire`; }
function activeCount(){ return INC.filter(i=>i.status==='active').length; }
function renderLive(){
  const n=activeCount(), c=$('#liveCount'); c.textContent=n; c.hidden=!n;
  const list=$('#liveList'); if(!list) return;
  if(!INC.length){ list.innerHTML=`<p class="empty">No live incidents. Report one to see the response tools.</p>`; return; }
  list.innerHTML=INC.map(i=>`<button class="li" data-id="${i.id}"><span class="lvl ${i.status==='resolved'?'R':'L'+i.level}">${i.status==='resolved'?'Done':'L'+i.level}</span><span><b>${esc(i.road)}</b><small>${esc(i.A.locality)}, ${lbl(i.p.use).toLowerCase()}. <span data-ago="${i.t.getTime()}">${ago(i.t)}</span></small></span></button>`).join('');
  $$('#liveList .li').forEach(b=>b.onclick=()=>openIncident(INC.find(i=>i.id===b.dataset.id)));
}

/* ---------- toast ---------- */
let toastTimer=null;
function toast(text, onClick, ok){
  const t=$('#toast'); t.textContent=text; t.classList.toggle('okt',!!ok); t.classList.add('show');
  t.style.pointerEvents=onClick?'auto':'none'; t.style.cursor=onClick?'pointer':'default'; t.onclick=onClick?()=>{t.classList.remove('show'); onClick();}:null;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'), onClick?6000:3200);
}

/* ---------- incident window ---------- */
const ACTIONS = [
  {k:'dispatch', icon:'truck', title:'Dispatch fire station', sub:'Choose stations and call them'},
  {k:'corridor', icon:'route', title:'Create green corridor', sub:'Turn signals green along the route'},
  {k:'giveway', icon:'megaphone', title:'Give-way alert', sub:'People within 75 m of the route'},
  {k:'evac', icon:'alert', title:'Evacuation alert', sub:'People within 100 m of the fire'},
  {k:'hospital', icon:'cross', title:'Alert hospitals', sub:'Send casualty details'},
  {k:'police', icon:'shield', title:'Inform police station', sub:'Cordon and crowd control'},
  {k:'power', icon:'bolt', title:'Cut power supply', sub:'Isolate the building line'},
  {k:'resolve', icon:'check', title:'Mark as resolved', sub:'Close and send all clear'},
];
const REQUIRED = {1:['dispatch'], 2:['dispatch','corridor','giveway'], 3:['dispatch','corridor','giveway','evac','hospital','police','power']};
const DONE_TXT = {dispatch:'Stations alerted', corridor:'Corridor active', giveway:'Alert sent', evac:'Alert sent', hospital:'Hospitals alerted', police:'Station informed', power:'Request sent', resolve:'Resolved'};

function openIncident(inc){
  if(!inc) return;
  current=inc;
  if(window.setAppMode && document.body.dataset.mode!=='detect') setAppMode('detect');
  const o=$('#inc'); o.classList.add('open'); o.setAttribute('aria-hidden','false');
  renderIncident(inc);
}
function closeIncident(){
  const o=$('#inc'); o.classList.remove('open'); o.setAttribute('aria-hidden','true');
  if(current) map.flyTo({center:current.ll, zoom:16.6, pitch:55, duration:reduce?0:1400});
  closePane(); current=null;
}
function hdr(inc){
  const res=inc.status==='resolved';
  return `<button class="back" id="incBack">${'←'} Back to map</button>
  <span class="sevtag ${res?'R':'L'+inc.level}">Level ${inc.level}</span>
  <div><h1>Fire at ${lbl(inc.p.use).toLowerCase()}, ${esc(inc.road)}</h1>
  <div class="meta"><span>Reported ${hhmm(inc.t)} by ${esc(srcTxt(inc.source))}</span><span class="clock" data-ago="${inc.t.getTime()}">${ago(inc.t)}</span><span class="mono">${inc.id}</span></div></div>
  <span class="stat ${res?'res':''}">${res?'Resolved':'Active'}</span>`;
}
function renderIncident(inc){
  const first=!inc.loaded;
  const o=$('#inc');
  o.innerHTML=`<header>${hdr(inc)}</header>
  <div class="incbody"><div class="incmain" id="incMain"></div><aside class="incside" id="incSide"></aside></div>`;
  $('#incBack').onclick=closeIncident;
  const main=$('#incMain');
  main.innerHTML=`
   <section class="box wide"><h2>Images</h2><div class="imgs" id="imgs">${inc.images.map(im=>`<figure><img src="${im.src}" alt="${esc(im.cap)} at ${hhmmss(im.at)}"><figcaption><span>${esc(im.cap)}</span><span class="mono">${hhmmss(im.at)}</span></figcaption></figure>`).join('')}
     <label class="add" tabindex="0">Add a photo<br>from camera or caller<input type="file" accept="image/*" hidden id="addPhoto"></label></div></section>
   <section class="box"><h2>Location</h2><div class="kvs">
     <div class="kv"><span>GPS coordinates</span><div class="row"><b class="mono" id="gps">${inc.ll[1].toFixed(6)}, ${inc.ll[0].toFixed(6)}</b><button class="copy" id="copyGps">Copy</button></div></div>
     <div class="kv"><span>Address, approximate</span><div id="addr">${first?'<div class="sk t w80"></div><div class="sk t w40"></div>':`<b>${esc(inc.address)}</b>`}</div></div>
     <div class="kv"><span>Building</span><b>${lbl(inc.p.use)}, ${inc.p.floors} floors</b> <span class="mono" style="color:var(--mute);font-size:12px">${inc.bid}</span></div>
   </div></section>
   <section class="box"><h2>Severity</h2><div class="sevline"><div class="sevbig L${inc.level}"><b>L${inc.level}</b><span>of 3</span></div><ul>${reasonsFor(inc).map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div></section>
   <section class="box"><h2>Who covers this location</h2><div class="resp" id="resp">${first?'<div class="sk blk"></div><div class="sk blk"></div><div class="sk blk"></div>':respHTML(inc)}</div></section>
   <section class="box"><h2>Nearest hospitals</h2><div class="resp" id="hosp">${first?'<div class="sk blk"></div><div class="sk blk"></div><div class="sk blk"></div>':hospHTML(inc)}</div></section>
   <section class="box wide"><h2>Response map</h2><div id="imapSlot">${'<div class="sk map"></div>'}</div>
     <div class="legend2"><span><i style="background:#E23B3B"></i>Fire</span><span><i style="background:#47C4E8"></i>Fire station</span><span><i style="background:#27B26B"></i>Hospital</span><span><i style="background:#F0B93B"></i>Route, planned</span><span><i style="background:#27B26B"></i>Route, green corridor</span><span><i style="background:rgba(226,59,59,.35)"></i>100 m evacuation zone</span></div></section>
   <section class="box wide"><h2>Activity</h2><div class="log" id="log"></div></section>`;
  renderLog(inc); renderSide(inc);
  $('#copyGps').onclick=()=>copyText($('#gps').textContent);
  $('#addPhoto').onchange=e=>addPhoto(inc, e.target.files[0]);
  $('.imgs .add').onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); $('#addPhoto').click(); } };
  if(first){
    (async()=>{
      await wait(420); if(current!==inc) return; $('#addr').innerHTML=`<b class="fadein">${esc(inc.address)}</b>`;
      await wait(320); if(current!==inc) return; $('#resp').innerHTML=respHTML(inc); $('#resp').classList.add('fadein');
      await wait(300); if(current!==inc) return; $('#hosp').innerHTML=hospHTML(inc); $('#hosp').classList.add('fadein');
      inc.loaded=true;
    })();
  }
  mountMiniMap(inc, first);
}
function respHTML(inc){
  const r=inc.resp, n=r.nearest, j=r.jur, same=n.id===j.id;
  const row=(ic,title,sub,right,tags='')=>`<div class="ritem"><span class="ic">${svg(ic)}</span><span><b>${esc(title)}</b><small>${sub}</small>${tags}</span><span class="r">${right}</span></div>`;
  return row('shield', r.pol.name, `Police jurisdiction for this address`, '', '') +
    row('station', n.name, same?'Nearest station, and covers this area':'Nearest fire station', `<b>${n.eta.toFixed(0)} min</b><br>${fmtKm(n.d)}`) +
    (same?'':row('station', j.name, 'Covers this area (municipal jurisdiction)', `<b>${(j.d*1.15/(inc.A.speed*1000/60)+1).toFixed(0)} min</b><br>${fmtKm(j.d)}`)) +
    row('signal', r.traffic, 'Traffic signals on the route', '');
}
function hospHTML(inc){
  return inc.resp.hosp.map(h=>`<div class="ritem"><span class="ic">${svg('cross','#27B26B')}</span><span><b>${esc(h.name)}</b><small>${h.type}, ${h.beds} emergency beds free</small><div style="margin-top:4px">${h.burn?'<span class="tagx g">Burns unit</span>':'<span class="tagx">No burns unit</span>'}</div></span><span class="r"><b>${h.eta.toFixed(0)} min</b><br>${fmtKm(h.d)}</span></div>`).join('') + `<p class="note" style="margin:2px 0 0">Bed counts are demo data.</p>`;
}
function renderLog(inc){
  const el=$('#log'); if(!el) return;
  el.innerHTML=[...inc.log].reverse().map(l=>`<div><time>${hhmmss(l.t)}</time><span class="${l.cls}">${esc(l.text)}</span></div>`).join('');
}
function addLog(inc, text, cls=''){ inc.log.push({t:new Date(), text, cls}); if(current===inc) renderLog(inc); }

function renderSide(inc){
  const side=$('#incSide'); const req=REQUIRED[inc.level];
  side.innerHTML=`
   <div class="side-sec"><h2>Required for level ${inc.level}</h2><div class="reqlist">${req.map(k=>{const a=ACTIONS.find(x=>x.k===k);return `<button class="req ${inc.done[k]?'done':''}" data-k="${k}"><i></i>${a.title}</button>`}).join('')}</div></div>
   <div class="side-sec"><h2>Actions</h2><div class="actions">${ACTIONS.map(a=>{
      const st = inc.done[a.k] ? `<span class="tagx g st">${DONE_TXT[a.k]}</span>` : req.includes(a.k) && inc.status==='active' ? `<span class="tagx a st">Required</span>` : '';
      return `<button class="act" data-k="${a.k}" ${inc.status==='resolved'&&a.k!=='resolve'?'disabled style="opacity:.5"':''}><span class="ic">${svg(a.icon, a.k==='evac'?'#FF9B93':a.k==='corridor'?'#7FE0AE':'currentColor')}</span><span><b>${a.title}</b><small>${a.sub}</small></span>${st}</button>`;}).join('')}</div></div>
   <div class="pane" id="pane" aria-live="polite"></div>`;
  $$('#incSide .act, #incSide .req').forEach(b=>b.onclick=()=>{ if(inc.status==='resolved'&&b.dataset.k!=='resolve') return; openPane(inc,b.dataset.k); });
}
function refreshSide(inc){ if(current!==inc) return; const open=$('#pane')&&$('#pane').classList.contains('show'); if(!open) renderSide(inc); }

/* ---------- mini map ---------- */
let imap=null, imapEl=null, imapReady=false, imapMarkers=[];
function mountMiniMap(inc, first){
  if(!imapEl){ imapEl=document.createElement('div'); imapEl.id='imap'; }
  const slot=$('#imapSlot');
  const place=()=>{ if(current!==inc||!$('#imapSlot')) return; $('#imapSlot').innerHTML=''; $('#imapSlot').appendChild(imapEl); imap&&imap.resize(); drawIncidentOnMini(inc); };
  if(!imap){
    imapEl.style.visibility='hidden'; slot.appendChild(imapEl);
    imap=new maplibregl.Map({container:imapEl, style:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#0B1320'}}]},
      center:inc.ll, zoom:16, pitch:40, attributionControl:false, maxPitch:60});
    imap.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
    imap.on('load',()=>{
      imap.addSource('roads',{type:'geojson',data:data.r});
      imap.addSource('bld',{type:'geojson',data:data.b});
      ['evac','buffer','route','jn'].forEach(s=>imap.addSource(s,{type:'geojson',data:{type:'FeatureCollection',features:[]}}));
      imap.addLayer({id:'roads',type:'line',source:'roads',paint:{'line-color':'#1A2A42','line-width':['interpolate',['exponential',2],['zoom'],12,['*',['get','width'],1/mpp(12)],20,['*',['get','width'],1/mpp(20)]]}});
      imap.addLayer({id:'evac',type:'fill',source:'evac',paint:{'fill-color':'#E23B3B','fill-opacity':.14}});
      imap.addLayer({id:'evacL',type:'line',source:'evac',paint:{'line-color':'#E23B3B','line-width':1.5,'line-dasharray':[2,2]}});
      imap.addLayer({id:'buffer',type:'line',source:'buffer',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#F0B93B','line-opacity':.13,'line-width':['interpolate',['exponential',2],['zoom'],12,150/mpp(12),20,150/mpp(20)]}});
      imap.addLayer({id:'bld',type:'fill-extrusion',source:'bld',paint:{'fill-extrusion-color':['case',['==',['get','id'],''],'#E23B3B','#24344D'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':.92}});
      imap.addLayer({id:'route',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['get','c'],'line-width':5}});
      imap.addLayer({id:'jn',type:'circle',source:'jn',paint:{'circle-radius':7,'circle-color':['match',['get','status'],'green','#27B26B','requested','#47C4E8','#F0B93B'],'circle-stroke-color':'#0B1320','circle-stroke-width':2}});
      const pop=new maplibregl.Popup({closeButton:false,offset:10,className:'tip'});
      imap.on('mouseenter','jn',e=>pop.setLngLat(e.lngLat).setHTML(esc(e.features[0].properties.name)).addTo(imap));
      imap.on('mouseleave','jn',()=>pop.remove());
      imapReady=true;
      setTimeout(()=>{ imapEl.style.visibility=''; place(); }, first?(reduce?0:900):0);
    });
  } else if(imapReady) setTimeout(place, first?(reduce?0:700):0);
}
function drawIncidentOnMini(inc){
  if(!imapReady) return;
  imap.setPaintProperty('bld','fill-extrusion-color',['case',['==',['get','id'],inc.bid],'#E23B3B','#24344D']);
  imapMarkers.forEach(m=>m.remove()); imapMarkers=[];
  const mk=(ll,html,cls)=>{ const el=document.createElement('div'); el.className='rmk '+cls; el.innerHTML=html; imapMarkers.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(ll).addTo(imap)); };
  const pin=document.createElement('div'); pin.className=`ipin L${inc.level}`; pin.innerHTML=`<span class="pulse"></span><span class="b">L${inc.level}</span>`;
  imapMarkers.push(new maplibregl.Marker({element:pin,anchor:'bottom',offset:[0,-14]}).setLngLat(inc.ll).addTo(imap));
  inc.A.fire.forEach(s=>mk(toLL(inc.A,s.x,s.y),`${esc(s.name)}<small>${s.tenders} tenders, ${s.bikes} fire bikes</small>`,'fire'));
  inc.resp.hosp.slice(0,2).forEach(h=>mk(toLL(inc.A,h.x,h.y),`${esc(h.name)}<small>${h.burn?'Burns unit':'Emergency'}</small>`,'hosp'));
  mk(toLL(inc.A,inc.resp.pol.x,inc.resp.pol.y),`${esc(inc.resp.pol.name)}`,'ps');
  updateMiniOverlays(inc);
  const pts=[inc.ll, toLL(inc.A,inc.resp.nearest.x,inc.resp.nearest.y)];
  if(inc.route) pts.push(...inc.route.ll);
  const b=new maplibregl.LngLatBounds(pts[0],pts[0]); pts.forEach(p=>b.extend(p));
  imap.fitBounds(b,{padding:60,maxZoom:17,duration:0,pitch:40});
}
function updateMiniOverlays(inc){
  if(!imapReady) return;
  const fc=f=>({type:'FeatureCollection',features:f});
  imap.getSource('evac').setData(fc(inc.showEvac||inc.done.evac?[circle(inc.A,inc.xy,100)]:[]));
  const r=inc.route;
  imap.getSource('route').setData(fc(r?[{type:'Feature',geometry:{type:'LineString',coordinates:r.ll},properties:{c:inc.done.corridor?'#27B26B':'#F0B93B'}}]:[]));
  imap.getSource('buffer').setData(fc(r&&(inc.showBuffer||inc.done.giveway)?[{type:'Feature',geometry:{type:'LineString',coordinates:r.ll},properties:{}}]:[]));
  imap.getSource('jn').setData(fc(r?r.juncs.map(j=>({type:'Feature',geometry:{type:'Point',coordinates:j.ll},properties:{status:j.status,name:`${j.name}: ${jTypeTxt(j)}`}})):[]));
}
function ensureRoute(inc){
  const st = inc.stations && inc.stations.length ? inc.A.fire.find(s=>s.id===inc.stations[0]) : inc.resp.nearest;
  if(!inc.route || inc.route.from!==st.id){ inc.route=planRoute(inc.a,[st.x,st.y],inc.xy); inc.route.from=st.id; inc.route.fromName=st.name; }
  return inc.route;
}
function jTypeTxt(j){ return {remote:'switch to green remotely',adaptive:'adaptive signal, give priority',manual:'not connected, send a constable'}[j.type]; }
function zone(inc, r){ // people + buildings within r metres of the fire (or of the route if r is 'route')
  let n=0, people=0, sensitive=0; const t=getTime();
  for(const b of BLD){ if(b.a!==inc.a||b.id===inc.bid) continue;
    const d = r==='route' ? distToPolyline(b.xy, inc.route.pts) : dist(b.xy, inc.xy);
    if(d <= (r==='route'?75:r)){ n++; people += t==='night'?b.p.p_night:b.p.p_day; if(['coaching','educational'].includes(b.p.use)) sensitive++; } }
  return {n, people, sensitive};
}

/* ---------- panes ---------- */
function openPane(inc,k){
  const pane=$('#pane'); const a=ACTIONS.find(x=>x.k===k);
  pane.innerHTML=`<div class="ph"><button id="paneBack">← Actions</button><h2>${a.title}</h2></div><div class="pb" id="pb"></div>`;
  $('#paneBack').onclick=()=>closePane(true);
  PANES[k](inc, $('#pb'));
  pane.classList.add('show'); pane.scrollTop=0;
}
function closePane(rerender){
  const p=$('#pane'); if(!p) return; p.classList.remove('show');
  if(current){ current.showEvac=false; current.showBuffer=false; updateMiniOverlays(current); if(rerender) setTimeout(()=>renderSide(current), reduce?0:280); }
}
function people(inc){ return peopleNow(inc.p); }
function msg(inc){ return {L:inc.level, addr:inc.address, use:lbl(inc.p.use).toLowerCase(), people:people(inc), gps:`${inc.ll[1].toFixed(5)}, ${inc.ll[0].toFixed(5)}`}; }
function markDone(inc,k){ inc.done[k]=true; refreshSide(inc); updateMiniOverlays(inc); renderLive(); }
function showOnMap(){ closePane(true); setTimeout(()=>{ const s=$('#imapSlot'); s&&s.scrollIntoView({behavior:reduce?'auto':'smooth',block:'center'}); }, 300); }

const PANES = {
  dispatch(inc, el){
    const r=inc.resp, need=inc.p.floors>=5;
    const pre=new Set(inc.stations || (inc.level>=3 ? [r.nearest.id, r.jur.id] : [r.nearest.id]));
    el.innerHTML=`<p>Pick which stations respond. The fire officer at each gets a voice call with the address and GPS.</p>
    ${r.stations.map(s=>`<label class="choice"><input type="checkbox" value="${s.id}" ${pre.has(s.id)?'checked':''}><span><b>${esc(s.name)}</b><small>${s.tenders} tenders, ${s.bikes} fire bikes${s.ladder?', ladder truck':''}</small>
      <div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap">${s.id===r.nearest.id?'<span class="tagx b">Nearest</span>':''}${s.id===r.jur.id?'<span class="tagx">Covers this area</span>':''}${need&&s.ladder?'<span class="tagx g">Has ladder for this height</span>':''}</div></span>
      <span class="r"><b class="mono">${s.eta.toFixed(0)} min</b><br>${fmtKm(s.d)}</span></label>`).join('')}
    ${need && !r.stations.some(s=>s.ladder&&pre.has(s.id))?`<div class="callout">The building has ${inc.p.floors} floors. Consider adding a station with a ladder truck.</div>`:''}
    <div class="sticky-cta"><button class="btn primary full" id="go">Review and call stations</button></div>`;
    el.querySelector('#go').onclick=async()=>{
      const ids=[...el.querySelectorAll('input:checked')].map(i=>i.value); if(!ids.length) return toast('Select at least one station.');
      const names=ids.map(id=>inc.A.fire.find(s=>s.id===id).name), m=msg(inc);
      const out=await confirmSend({title:'Call fire stations', lead:`Level ${m.L} fire at ${m.addr}`, role:'FIRE',
        rows:names.map(n=>['Fire officer', n]),
        en:`CipherCop demo alert. Level ${m.L} fire at ${m.addr}. ${m.use}, about ${m.people} people inside. Respond from ${names.join(' and ')}. GPS ${m.gps}.`,
        te:`సైఫర్‌కాప్ డెమో హెచ్చరిక. ${m.addr} వద్ద లెవల్ ${m.L} అగ్ని ప్రమాదం. లోపల సుమారు ${m.people} మంది ఉన్నారు. ${names.join(', ')} నుండి వెంటనే స్పందించండి.`,
        cta:'Call stations'});
      if(!out) return;
      inc.stations=ids; ensureRoute(inc);
      addLog(inc, `Dispatch confirmed: ${names.join(', ')}`);
      const res=await send('FIRE', out.text, out.lang); logResult(inc,'Fire station call',res);
      markDone(inc,'dispatch'); closePane(true); toast(`Stations alerted: ${names.join(', ')}`,null,true);
    };
  },
  corridor(inc, el){
    const r=ensureRoute(inc); updateMiniOverlays(inc);
    const remote=r.juncs.filter(j=>j.type!=='manual'), manual=r.juncs.filter(j=>j.type==='manual');
    el.innerHTML=`<p>Route from <b>${esc(r.fromName)}</b> to the fire. Connected signals switch from the control room. For signals that are not connected, ${esc(inc.resp.traffic)} is asked to send a constable.</p>
    <div class="sum"><div><span>Route length</span><b>${fmtKm(r.len)}</b></div><div><span>Signals on route</span><b>${r.juncs.length}</b></div><div><span>Normal travel time</span><b>${r.eta.toFixed(0)} min</b></div><div><span>With corridor</span><b style="color:#7FE0AE">${r.etaFast.toFixed(0)} min</b></div></div>
    <div class="resp">${r.juncs.length?r.juncs.map(j=>`<div class="ritem"><span class="ic">${svg('signal', j.status==='green'?'#27B26B':j.status==='requested'?'#47C4E8':'#F0B93B')}</span><span><b>${esc(j.name)}</b><small>${jTypeTxt(j)}</small></span><span class="r">${j.status==='green'?'<span class="tagx g">Green</span>':j.status==='requested'?'<span class="tagx b">Constable asked</span>':`<span class="tagx ${j.type==='manual'?'a':''}">${j.type==='manual'?'Manual':j.type==='adaptive'?'Adaptive':'Remote'}</span>`}</span></div>`).join(''):'<p class="empty">No signals on this route. The tender uses inner lanes only.</p>'}</div>
    <button class="btn ghost" id="see">Show route on map</button>
    <div class="sticky-cta"><button class="btn go full" id="go" ${inc.done.corridor?'disabled':''}>${inc.done.corridor?'Corridor is active':'Review and confirm corridor'}</button></div>`;
    el.querySelector('#see').onclick=showOnMap;
    el.querySelector('#go').onclick=async()=>{
      const list=manual.map(j=>j.name);
      const out=await confirmSend({title:'Confirm green corridor', lead:`${r.juncs.length} signals between ${r.fromName} and the fire`, role:'TRAFFIC',
        rows:[['Switch to green from control room', `${remote.length} signal${remote.length===1?'':'s'}`],['Ask for a constable', manual.length?`${manual.length} junction${manual.length===1?'':'s'}, via ${inc.resp.traffic}`:'None needed']],
        en:`CipherCop demo alert. Green corridor for a fire tender from ${r.fromName} to ${inc.address}. ${list.length?`Please send constables to: ${list.join('; ')}.`:'All signals on the route are switched remotely.'} Hold cross traffic until the tender passes.`,
        te:`సైఫర్‌కాప్ డెమో హెచ్చరిక. ${r.fromName} నుండి ${inc.address} వరకు అగ్నిమాపక వాహనానికి గ్రీన్ కారిడార్. ${list.length?`ఈ జంక్షన్లకు కానిస్టేబుళ్లను పంపండి: ${list.join('; ')}.`:''} వాహనం వెళ్లే వరకు ఇతర ట్రాఫిక్‌ను ఆపండి.`,
        cta:'Confirm corridor', note:'Signal commands are simulated. The message below goes to the traffic police station.'});
      if(!out) return;
      addLog(inc,'Green corridor confirmed');
      for(const j of r.juncs){ await wait(320); j.status = j.type==='manual'?'requested':'green'; updateMiniOverlays(inc);
        addLog(inc, j.type==='manual'?`${j.name}: constable requested from ${inc.resp.traffic}`:`${j.name}: signal switched to green (${j.type==='adaptive'?'adaptive priority':'remote command'}, simulated)`, j.type==='manual'?'':'okc'); }
      const res=await send('TRAFFIC', out.text, out.lang); logResult(inc,'Traffic police station message',res);
      markDone(inc,'corridor'); PANES.corridor(inc, el); toast('Green corridor is active',null,true);
    };
  },
  giveway(inc, el){
    const r=ensureRoute(inc); inc.showBuffer=true; updateMiniOverlays(inc);
    const z=zone(inc,'route');
    el.innerHTML=`<p>Alerts people within 75 m of the fire tender's route to keep the road clear.</p>
    <div class="sum"><div><span>Buildings in zone</span><b>${z.n}</b></div><div><span>People, estimated</span><b>${z.people.toLocaleString('en-IN')}</b></div></div>
    <p>Roads: ${esc(r.roads.join(', ')||inc.road)}</p>
    <button class="btn ghost" id="see">Show zone on map</button>
    <div class="callout">In a real rollout this goes as a cell broadcast through SACHET to every phone in the zone. In this demo it reaches the demo phones only.</div>
    <div class="sticky-cta"><button class="btn primary full" id="go">${inc.done.giveway?'Send again':'Review alert'}</button></div>`;
    el.querySelector('#see').onclick=()=>{ showOnMap(); inc.showBuffer=true; setTimeout(()=>updateMiniOverlays(inc),320); };
    el.querySelector('#go').onclick=async()=>{
      const roads=r.roads.join(', ')||inc.road;
      const out=await confirmSend({title:'Send give-way alert', lead:`About ${z.people.toLocaleString('en-IN')} people within 75 m of the route`, role:'PUBLIC',
        rows:[['Zone','75 m either side of the route'],['Buildings',String(z.n)]],
        en:`DEMO ALERT: A fire engine is coming along ${roads}. Please give way and keep the road clear.`,
        te:`డెమో హెచ్చరిక: ${roads} మీదుగా అగ్నిమాపక వాహనం వస్తోంది. దయచేసి దారి ఇవ్వండి, రోడ్డును ఖాళీగా ఉంచండి.`,
        cta:'Send alert'});
      if(!out) return;
      addLog(inc,`Give-way alert confirmed for ${z.n} buildings near the route`);
      const res=await send('PUBLIC', out.text, out.lang); logResult(inc,'Give-way alert',res);
      markDone(inc,'giveway'); closePane(true); toast('Give-way alert sent',null,true);
    };
  },
  evac(inc, el){
    inc.showEvac=true; updateMiniOverlays(inc);
    const z=zone(inc,100);
    el.innerHTML=`<p>Asks everyone within 100 m to leave and stay away from the fire.</p>
    <div class="sum"><div><span>Buildings in zone</span><b>${z.n}</b></div><div><span>People, estimated</span><b>${z.people.toLocaleString('en-IN')}</b></div><div><span>Schools and coaching centres</span><b>${z.sensitive}</b></div><div><span>Radius</span><b>100 m</b></div></div>
    <button class="btn ghost" id="see">Show zone on map</button>
    <div class="callout">In a real rollout this goes as a cell broadcast through SACHET. In this demo it reaches the demo phones only.</div>
    <div class="sticky-cta"><button class="btn danger full" id="go">${inc.done.evac?'Send again':'Review evacuation alert'}</button></div>`;
    el.querySelector('#see').onclick=()=>{ showOnMap(); inc.showEvac=true; setTimeout(()=>updateMiniOverlays(inc),320); };
    el.querySelector('#go').onclick=async()=>{
      const out=await confirmSend({title:'Send evacuation alert', lead:`About ${z.people.toLocaleString('en-IN')} people in ${z.n} buildings`, role:'PUBLIC', danger:true,
        rows:[['Zone','100 m around the fire'],['Schools and coaching centres', String(z.sensitive)]],
        en:`DEMO ALERT: Fire at ${inc.address}. If you are within 100 m, leave the area now and move away from the fire. Do not go near the incident.`,
        te:`డెమో హెచ్చరిక: ${inc.address} వద్ద అగ్ని ప్రమాదం. మీరు 100 మీటర్ల లోపల ఉంటే వెంటనే ఆ ప్రాంతాన్ని ఖాళీ చేయండి. ప్రమాద స్థలానికి దగ్గరగా వెళ్లవద్దు.`,
        cta:'Send evacuation alert'});
      if(!out) return;
      addLog(inc,`Evacuation alert confirmed for ${z.n} buildings within 100 m`);
      const res=await send('PUBLIC', out.text, out.lang); logResult(inc,'Evacuation alert',res);
      markDone(inc,'evac'); closePane(true); toast('Evacuation alert sent',null,true);
    };
  },
  hospital(inc, el){
    inc.customH ||= [];
    const est=Math.max(1,Math.round(people(inc)*0.12)), burns=Math.max(1,Math.round(est*0.5));
    const list=()=>[...inc.resp.hosp.map(h=>({...h,custom:false})), ...inc.customH];
    const draw=()=>{
      el.innerHTML=`<p>Choose hospitals to alert with expected casualties.</p>
      ${list().map((h,i)=>`<label class="choice"><input type="checkbox" data-i="${i}" ${h.custom||i<2?'checked':''}><span><b>${esc(h.name)}</b><small>${h.custom?`Added by you, ${esc(h.phoneMasked)}${h.notes?', '+esc(h.notes):''}`:`${h.type}, ${h.beds} beds free`}</small>${h.custom?'':`<div style="margin-top:5px">${h.burn?'<span class="tagx g">Burns unit</span>':'<span class="tagx">No burns unit</span>'}</div>`}</span><span class="r">${h.custom?'':`<b class="mono">${h.eta.toFixed(0)} min</b><br>${fmtKm(h.d)}`}</span></label>`).join('')}
      <div class="sum"><div class="field"><label for="cas">Expected casualties</label><input class="inp" id="cas" type="number" min="0" value="${inc.cas??est}"></div><div class="field"><label for="burn">Possible burn cases</label><input class="inp" id="burn" type="number" min="0" value="${inc.burns??burns}"></div></div>
      <details><summary>Add another hospital</summary>
        <div class="pb" style="padding:10px 0 0"><div class="field"><label for="hn">Hospital name</label><input class="inp" id="hn" placeholder="For example, Gandhi Hospital"></div>
        <div class="field"><label for="hp">Phone number</label><input class="inp" id="hp" placeholder="+91 98xxxxxxxx" inputmode="tel"></div>
        <div class="field"><label for="hd">Details, optional</label><input class="inp" id="hd" placeholder="Burns ward, contact person"></div>
        <button class="btn" id="addH">Add hospital</button>
        <p class="note">The number gets an SMS. It must be one of your verified demo numbers.</p></div></details>
      <div class="sticky-cta"><button class="btn primary full" id="go">Review hospital alert</button></div>`;
      el.querySelector('#addH').onclick=()=>{
        const name=el.querySelector('#hn').value.trim(), ph=el.querySelector('#hp').value.replace(/[\s-]/g,'');
        if(!name) return toast('Enter the hospital name.');
        if(!/^\+?\d{10,13}$/.test(ph)) return toast('Enter a phone number with country code, for example +919800000000.');
        const phone = ph.startsWith('+')?ph:(ph.length===10?'+91'+ph:'+'+ph);
        inc.customH.push({name, phone, phoneMasked:'ending '+phone.slice(-4), notes:el.querySelector('#hd').value.trim(), custom:true});
        inc.cas=+el.querySelector('#cas').value; inc.burns=+el.querySelector('#burn').value; draw();
      };
      el.querySelector('#go').onclick=async()=>{
        const L=list(), pick=[...el.querySelectorAll('input[type=checkbox]:checked')].map(i=>L[+i.dataset.i]);
        if(!pick.length) return toast('Select at least one hospital.');
        const n=+el.querySelector('#cas').value||0, b=+el.querySelector('#burn').value||0; inc.cas=n; inc.burns=b;
        const out=await confirmSend({title:'Alert hospitals', lead:`${pick.length} hospital${pick.length>1?'s':''}`, role:'HOSPITAL',
          rows:pick.map(h=>[h.custom?'SMS':'Hospital', h.name+(h.custom?`, ${h.phoneMasked}`:'')]),
          en:`CipherCop demo alert. Level ${inc.level} fire at ${inc.address}. Expected casualties: ${n}, possible burn cases: ${b}. Please prepare the emergency and burns team.`,
          te:`సైఫర్‌కాప్ డెమో హెచ్చరిక. ${inc.address} వద్ద లెవల్ ${inc.level} అగ్ని ప్రమాదం. గాయపడినవారు సుమారు ${n}, కాలిన గాయాలు ${b}. అత్యవసర విభాగాన్ని సిద్ధం చేయండి.`,
          cta:'Send to hospitals'});
        if(!out) return;
        addLog(inc,`Hospital alert confirmed: ${pick.map(h=>h.name).join(', ')}`);
        if(pick.some(h=>!h.custom)){ const res=await send('HOSPITAL', out.text, out.lang); logResult(inc,'Hospital alert',res); }
        for(const h of pick.filter(h=>h.custom)){ const res=await send('HOSPITAL', out.text, out.lang, {to:h.phone, channel:'sms'}); logResult(inc,`SMS to ${h.name}`,res); }
        markDone(inc,'hospital'); closePane(true); toast('Hospitals alerted',null,true);
      };
    };
    draw();
  },
  police(inc, el){
    const r=inc.resp, same=r.pol.id===r.polNear.id;
    el.innerHTML=`<p>Asks the police station for a cordon, crowd control and a clear access road.</p>
    <label class="choice"><input type="radio" name="ps" value="${r.pol.id}" checked><span><b>${esc(r.pol.name)}</b><small>Jurisdiction for this address</small></span></label>
    ${same?'':`<label class="choice"><input type="radio" name="ps" value="${r.polNear.id}"><span><b>${esc(r.polNear.name)}</b><small>Nearest station, ${fmtKm(r.polNear.d)} away</small></span></label>`}
    <div class="sticky-cta"><button class="btn primary full" id="go">Review message</button></div>`;
    el.querySelector('#go').onclick=async()=>{
      const id=el.querySelector('input:checked').value, ps=inc.A.police.find(p=>p.id===id).name;
      const out=await confirmSend({title:'Inform police station', lead:ps, role:'POLICE', rows:[['Station',ps]],
        en:`CipherCop demo alert. Level ${inc.level} fire at ${inc.address}. Please send a team for cordon and crowd control, and keep the access road clear for fire tenders.`,
        te:`సైఫర్‌కాప్ డెమో హెచ్చరిక. ${inc.address} వద్ద లెవల్ ${inc.level} అగ్ని ప్రమాదం. రక్షణ వలయం, జనసమూహ నియంత్రణ కోసం బృందాన్ని పంపండి. అగ్నిమాపక వాహనాల కోసం దారిని ఖాళీగా ఉంచండి.`,
        cta:'Send to police station'});
      if(!out) return;
      addLog(inc,`Police station informed: ${ps}`);
      const res=await send('POLICE', out.text, out.lang); logResult(inc,'Police station message',res);
      markDone(inc,'police'); closePane(true); toast(`${ps} informed`,null,true);
    };
  },
  power(inc, el){
    const feeder=`11 kV feeder ${inc.A.code}-${String(hash(inc.bid)%24+1).padStart(2,'0')}`;
    el.innerHTML=`<p>Fire crews cannot use water near live wires. This asks the power company to isolate the line.</p>
    <div class="sum"><div><span>Power company</span><b style="font-family:var(--f);font-size:13px">${esc(inc.A.power)}</b></div><div><span>Line</span><b style="font-size:13px">${feeder}</b></div></div>
    <p class="note">Feeder mapping is demo data.</p>
    <div class="sticky-cta"><button class="btn primary full" id="go">Review request</button></div>`;
    el.querySelector('#go').onclick=async()=>{
      const out=await confirmSend({title:'Ask to cut power', lead:inc.A.power, role:'POWER', rows:[['Line',feeder]],
        en:`CipherCop demo alert. Fire at ${inc.address}. Please isolate power on ${feeder} so fire crews can use water safely.`,
        te:`సైఫర్‌కాప్ డెమో హెచ్చరిక. ${inc.address} వద్ద అగ్ని ప్రమాదం. అగ్నిమాపక సిబ్బంది సురక్షితంగా పని చేయడానికి ${feeder} విద్యుత్ సరఫరాను నిలిపివేయండి.`,
        cta:'Send request'});
      if(!out) return;
      addLog(inc,`Power isolation requested: ${feeder}`);
      const res=await send('POWER', out.text, out.lang); logResult(inc,'Power company request',res);
      markDone(inc,'power'); closePane(true); toast('Power isolation requested',null,true);
    };
  },
  resolve(inc, el){
    const alerted=inc.done.evac||inc.done.giveway;
    el.innerHTML=`<p>Closes the incident and returns signals to normal.</p>
    <div class="resp">${ACTIONS.filter(a=>a.k!=='resolve').map(a=>`<div class="ritem"><span class="ic">${svg(a.icon)}</span><span><b>${a.title}</b></span><span class="r">${inc.done[a.k]?'<span class="tagx g">Done</span>':'<span class="tagx">Not used</span>'}</span></div>`).join('')}</div>
    ${alerted?`<label class="choice"><input type="checkbox" id="ac" checked><span><b>Send all clear</b><small>To the people who got the give-way or evacuation alert</small></span></label>`:''}
    <div class="sticky-cta"><button class="btn go full" id="go" ${inc.status==='resolved'?'disabled':''}>${inc.status==='resolved'?'Incident is resolved':'Mark as resolved'}</button></div>`;
    el.querySelector('#go').onclick=async()=>{
      const ac=alerted && el.querySelector('#ac').checked;
      if(ac){
        const out=await confirmSend({title:'Send all clear', lead:'Then mark the incident as resolved', role:'PUBLIC', rows:[['Recipients','Everyone who got an alert']],
          en:`DEMO: The fire at ${inc.address} is under control. Roads are reopening. Thank you for your cooperation.`,
          te:`డెమో: ${inc.address} వద్ద అగ్ని ప్రమాదం అదుపులోకి వచ్చింది. రోడ్లు తిరిగి తెరుచుకుంటున్నాయి. మీ సహకారానికి ధన్యవాదాలు.`, cta:'Send and resolve'});
        if(!out) return;
        const res=await send('PUBLIC', out.text, out.lang); logResult(inc,'All clear',res);
      }
      inc.status='resolved'; inc.done.resolve=true;
      if(inc.route) inc.route.juncs.forEach(j=>j.status='planned');
      map.setFeatureState({source:'bld',id:inc.bid},{inc:false});
      addLog(inc,'Incident marked as resolved. Signals returned to normal.','okc');
      refreshMarker(inc); renderLive(); $('#inc header').innerHTML=hdr(inc); $('#incBack').onclick=closeIncident;
      closePane(true); toast('Incident resolved',null,true);
    };
  },
};

/* ---------- confirm modal ---------- */
function confirmSend({title, lead, role, rows=[], en, te, cta='Send', note, danger}){
  return new Promise(resolve=>{
    const m=$('#modal'); let lang='en';
    m.innerHTML=`<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mt"><div><h2 id="mt">${esc(title)}</h2><p class="lead">${esc(lead||'')}</p></div>
      <div class="resp">${rows.map(([k,v])=>`<div class="ritem" style="padding:8px 10px"><span><small>${esc(k)}</small><b>${esc(v)}</b></span></div>`).join('')}</div>
      <div class="field"><label>Message</label><div class="tabs" role="tablist"><button class="on" data-l="en">English</button><button data-l="te" class="te">తెలుగు</button></div>
      <textarea class="inp" id="mtext" aria-label="Message text">${esc(en)}</textarea></div>
      <p class="note" style="margin:0">${esc(deliveryLine(role))}${note?' '+esc(note):''}</p>
      <div class="mbtns"><button class="btn ghost" id="mno">Cancel</button><button class="btn ${danger?'danger':'go'}" id="myes">Yes, ${esc(cta.charAt(0).toLowerCase()+cta.slice(1))}</button></div></div>`;
    const texts={en, te}, ta=m.querySelector('#mtext');
    m.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ texts[lang]=ta.value; lang=b.dataset.l; ta.value=texts[lang]; ta.classList.toggle('te',lang==='te'); m.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b)); });
    const close=v=>{ m.classList.remove('show'); document.removeEventListener('keydown',key); resolve(v); };
    const key=e=>{ if(e.key==='Escape') close(null); };
    document.addEventListener('keydown',key);
    m.querySelector('#mno').onclick=()=>close(null);
    m.onclick=e=>{ if(e.target===m) close(null); };
    m.querySelector('#myes').onclick=async e=>{ texts[lang]=ta.value; const b=e.currentTarget; b.disabled=true; b.textContent='Sending…'; close({lang, text:texts[lang]}); };
    m.classList.add('show'); setTimeout(()=>m.querySelector('#myes').focus(),50);
  });
}

/* ---------- photos ---------- */
function addPhoto(inc, file){
  if(!file) return;
  const fr=new FileReader();
  fr.onload=async()=>{
    const src=fr.result; inc.images.push({src, cap:'Photo added', at:new Date()});
    const vis=await analyzeImage(src);
    if(vis){ inc.vis=vis; const a=assess(inc.p, vis);
      addLog(inc, `Photo analysed: flames ${vis.fire.toFixed(0)}% of frame, smoke ${vis.smoke.toFixed(0)}%. Suggested level ${a.level}.`);
      if(a.level>inc.level){ inc.level=a.level; addLog(inc, `Raised to level ${a.level} from the photo.`,'err'); refreshMarker(inc); renderLive(); }
    }
    renderIncident(inc);
  };
  fr.readAsDataURL(file);
}
async function copyText(t){ try{ await navigator.clipboard.writeText(t); toast('Coordinates copied',null,true); }catch(e){ toast('Copy is blocked here. Select the coordinates and copy them.'); } }

/* ---------- report incident ---------- */
function startReport(){
  $('#pickBar').classList.add('show');
  window.pickingBuilding = p => { window.pickingBuilding=null; $('#pickBar').classList.remove('show'); reportForm(p); };
}
function reportForm(p){
  const m=$('#modal'); let vis=null, img=null;
  const draw=()=>{
    const a=assess(p, vis);
    m.innerHTML=`<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="rt"><div><h2 id="rt">Report a fire</h2><p class="lead">${lbl(p.use)}, ${esc(nearestRoad(areaOf(p.id), BLDI[p.id].xy))}</p></div>
      <div class="field"><label for="src">Source</label><select class="inp" id="src"><option>CCTV camera</option><option>Caller photo</option><option>Patrol report</option></select></div>
      <div class="field"><label>Photo, optional</label><label class="btn" style="text-align:center">${img?'Change photo':'Choose a photo'}<input type="file" accept="image/*" hidden id="rp"></label>
        ${img?`<img src="${img}" alt="Uploaded photo" style="width:100%;border-radius:10px;aspect-ratio:16/9;object-fit:cover">`:''}
        ${vis?`<p class="note" style="margin:0">Flames cover ${vis.fire.toFixed(0)}% of the frame, smoke ${vis.smoke.toFixed(0)}%. This is a colour check, not a trained model.</p>`:''}</div>
      <div class="field"><label>Severity</label><div class="seg" role="radiogroup" id="lv">${[1,2,3].map(l=>`<button role="radio" data-l="${l}" aria-pressed="${l===a.level}">Level ${l}</button>`).join('')}</div>
        <p class="note" style="margin:0">Suggested level ${a.level}, from the photo, people inside, spread risk and access.</p></div>
      <div class="mbtns"><button class="btn ghost" id="rno">Cancel</button><button class="btn primary" id="ryes">Create incident</button></div></div>`;
    let level=a.level;
    m.querySelectorAll('#lv button').forEach(b=>b.onclick=()=>{ level=+b.dataset.l; m.querySelectorAll('#lv button').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); });
    m.querySelector('#rp').onchange=e=>{ const f=e.target.files[0]; if(!f) return; const fr=new FileReader(); fr.onload=async()=>{ img=fr.result; vis=await analyzeImage(img); draw(); }; fr.readAsDataURL(f); };
    m.querySelector('#rno').onclick=()=>m.classList.remove('show');
    m.querySelector('#ryes').onclick=()=>{ const src=m.querySelector('#src').value; m.classList.remove('show');
      createIncident({bid:p.id, level, source:src, vis, images: img?[{src:img,cap:src,at:new Date()}]:null}); };
  };
  draw(); m.classList.add('show');
}

/* ---------- backend dialog ---------- */
function backendDialog(){
  const m=$('#modal');
  const rows=NB.ok ? Object.entries(NB.roles||{}).map(([r,ch])=>`<div class="ritem" style="padding:8px 10px"><span><b>${r.charAt(0)+r.slice(1).toLowerCase()}</b><small>${ch.length?ch.join(', '):'Not set'}</small></span></div>`).join('') : '';
  m.innerHTML=`<div class="mbox" role="dialog" aria-modal="true"><div><h2>Alert delivery</h2><p class="lead">${NB.ok?'The alert service is reachable.':'No alert service found, so every alert is simulated and logged.'}</p></div>
    ${NB.ok?`<div class="resp">${rows}</div>`:`<p class="note" style="margin:0">To ring real phones, deploy this app to Vercel with the Twilio keys set. The README lists each setting.</p>`}
    ${NB.ok&&NB.keyRequired?`<div class="field"><label for="dk">Demo key</label><input class="inp" id="dk" type="password" value="${esc(demoKey)}" autocomplete="off"></div>`:''}
    <div class="mbtns">${NB.ok?'<button class="btn" id="test">Test call to fire officer</button>':''}<button class="btn primary" id="bok">Done</button></div></div>`;
  m.querySelector('#bok').onclick=()=>{ const k=m.querySelector('#dk'); if(k){ demoKey=k.value; try{localStorage.setItem('fs_demo_key',demoKey);}catch(e){} } m.classList.remove('show'); };
  const t=m.querySelector('#test'); if(t) t.onclick=async()=>{ const k=m.querySelector('#dk'); if(k) demoKey=k.value; t.disabled=true; t.textContent='Calling…';
    const r=await send('FIRE','This is a FireSight test call. If you can hear this, voice alerts are working.','en');
    t.textContent = r.err?'Failed: '+r.err : (r.results&&r.results.some(x=>x.ok))?'Call placed':'No fire officer number set'; };
  m.classList.add('show');
}

/* ---------- boot ---------- */
window.initRespond = function(done){
  prepGeometry();
  document.body.insertAdjacentHTML('beforeend',`
   <section id="live" class="float only-detect" aria-label="Live incidents"><div class="lhead"><h2><span class="rec"></span>Live incidents</h2><button class="btn primary" id="reportBtn">Report fire</button></div><div id="liveList"></div>
     <p class="note">Tap a building in Detect mode to see its details, or report a fire on it.</p></section>
   <div id="pickBar" class="float"><span>Tap the building that is on fire</span><button class="btn ghost" id="pickCancel">Cancel</button></div>
   <div id="inc" aria-hidden="true"></div><div id="modal"></div><div id="toast" role="status"></div>`);
  $('#reportBtn').onclick=startReport;
  $('#pickCancel').onclick=()=>{ window.pickingBuilding=null; $('#pickBar').classList.remove('show'); };
  $('#backendPill').onclick=backendDialog;
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && $('#inc').classList.contains('open') && !$('#modal').classList.contains('show')){ if($('#pane')&&$('#pane').classList.contains('show')) closePane(true); else closeIncident(); }});
  window.onDetectBuildingClick = p => { const i=INC.find(x=>x.bid===p.id&&x.status==='active'); if(i) return openIncident(i); toast(`${lbl(p.use)}, ${p.id}. Use Report fire to log an incident here.`); };
  window.onTimeChange = () => { if(current) renderIncident(current); };
  // fire station markers on the main map
  for(const a in AREAS){ const A=AREAS[a]; A.fire.forEach(s=>{ const el=document.createElement('div'); el.className='rmk fire'; el.innerHTML=`${esc(s.name)}<small>${s.tenders} tenders, ${s.bikes} fire bikes${s.ladder?', ladder':''}</small>`; stationMarkers.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(toLL(A,s.x,s.y)).addTo(map)); }); }
  // seed: two ongoing incidents, then a new one arrives
  const pick=(a,f,away=[])=>BLD.filter(b=>b.a===a&&f(b.p)&&away.every(o=>dist(o.xy,b.xy)>250)).sort((m,n)=>n.p.sn-m.p.sn)[0];
  const b1=pick('ameerpet',p=>p.use==='residential'&&p.rn<=6);
  const b3=pick('old_city',p=>p.use==='mixed'&&p.access);
  const b2=pick('old_city',p=>p.use==='godown',[b3]);
  if(b1) createIncident({bid:b1.id, level:1, minutesAgo:14, source:'Caller photo', isNew:false});
  if(b2) createIncident({bid:b2.id, level:2, minutesAgo:6, source:'CCTV camera', isNew:false});
  checkBackend().finally(()=>{ done && done(); });
  setInterval(()=>{ $$('[data-ago]').forEach(el=>el.textContent=ago(+el.dataset.ago)); }, 1000);
  if(b3) setTimeout(()=>createIncident({bid:b3.id, level:3, source:'CCTV camera'}), reduce?1500:7000);
};
})();
