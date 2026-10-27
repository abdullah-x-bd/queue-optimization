import {normalizeConfig, solveScenario} from './engine.js';

const $ = id => document.getElementById(id);
const ns = (val, digits=0) => Number(val).toFixed(digits);
const clamp = (n,a,b)=>Math.min(b,Math.max(a,n));
const speedChoices=[0.5,1,2,4];
let model,selected,position=0,playing=true,speedIndex=1,lastFrame=0,pulseEnd=0,toastTimer=0,receiving='strict';
let times=Array(5).fill(4),zoomed=false,autoRunTimer=0;
const attributions={dedicated:'Independent access',shared:'Single shared approach',dual:'Two distributed feeders'};
const fmt=t=>String(Math.floor(t)).padStart(3,'0');

function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3000)}
function drawSlider(el){const min=+el.min,max=+el.max,value=+el.value;el.style.setProperty('--fill',`${100*(value-min)/(max-min||1)}%`)}
function setTimesForCount(){const m=clamp(+$('counters').value||1,1,12);times=Array.from({length:m},(_,i)=>times[i]??times.at(-1)??4);$('counters').value=m;renderDurations()}
function renderDurations(){
  const m=clamp(+$('counters').value||1,1,12),host=$('individual-panel');
  host.innerHTML=Array.from({length:m},(_,i)=>`<div class="individual-row"><label for="duration-${i}">COUNTER ${String(i+1).padStart(2,'0')}</label><input type="range" min="1" max="30" value="${times[i]??4}" data-duration="${i}" id="duration-${i}"><input type="number" min="1" max="30" value="${times[i]??4}" data-duration-number="${i}" aria-label="Counter ${i+1} service duration"></div>`).join('');
  host.querySelectorAll('input[type="range"]').forEach(drawSlider);
}
function syncUniform(){const u=$('uniform').checked;$('uniform-panel').hidden=!u;$('individual-panel').hidden=u;drawSlider($('uniform-time'))}
function queryScenario(){
  const q=new URLSearchParams(location.search);
  const n=clamp(+(q.get('n')||36),1,180),m=clamp(+(q.get('m')||5),1,12),p=clamp(+(q.get('p')||4),1,30),ps=q.get('ps')?.split(',').map(v=>clamp(+v,1,30));
  $('population').value=n;$('population-range').value=n;$('counters').value=m;$('uniform-time').value=p;$('uniform-value').textContent=p;
  times=Array.from({length:m},(_,i)=>ps?.[i]??p);
  $('uniform').checked=!ps;
  $('source-rate').value=clamp(+(q.get('q')||2),1,12);
  $('merge-storage').value=clamp(+(q.get('k')||2),1,6);
  receiving=q.get('r')==='turnover'?'turnover':'strict';
  document.querySelectorAll('[data-receiving]').forEach(el=>{const active=el.dataset.receiving===receiving;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active))});
  drawSlider($('population-range'));renderDurations();syncUniform();
}
function readConfig(){
  const m=clamp(+$('counters').value||1,1,12),N=clamp(+$('population').value||1,1,180);
  $('population').value=N;$('population-range').value=N;$('counters').value=m;
  setTimesForCount();const uniform=$('uniform').checked,p=clamp(+$('uniform-time').value||1,1,30);
  return normalizeConfig({N,m,times:uniform?Array(m).fill(p):times,KM: $('merge-storage').value,Q0:$('source-rate').value,receiving});
}
function run(initial=false,silent=false){
  clearTimeout(autoRunTimer);
  const btn=$('optimize');btn.disabled=true;btn.querySelector('span:nth-child(2)').textContent='Computing layouts…';
  const cfg=readConfig();
  try{
    model=solveScenario(cfg);selected=model.best;position=0;playing=true;pulseEnd=0;
    updateResults();if(!initial&&!silent)toast(`Evaluated ${model.candidatesCount} feasible layouts`);
  }catch(err){console.error(err);toast(`Model error: ${err.message}`)}
  finally{btn.disabled=false;btn.querySelector('span:nth-child(2)').textContent='Recompute';btn.classList.remove('pending')}
}
function showMetric(id,txt){$(id).textContent=txt}
function updateResults(){
  if(!model||!selected)return;
  const cfg=model.config,trace=selected.trace,cert=model.theoretical&&trace.clearance===model.theoretical.clearance;
  showMetric('clearance',trace.clearance);showMetric('portals',selected.layout.portals);
  $('used').innerHTML=`${trace.served.filter(Boolean).length}<span class="metric-divider">/${cfg.m}</span>`;
  const bound=model.theoretical;
  const exitLimited=Boolean(bound && bound.clearance===cfg.times[0]+5+bound.delta*(cfg.N-1) && bound.minCounters<cfg.m);
  $('clearance-context').textContent=cert
    ? exitLimited
      ? `Exit-limited · ${bound.minCounters} counters suffice; additional counters cannot shorten clearance`
      : 'Mathematically proven minimum for this row model'
    : 'Shortest verified schedule found across tested layouts';
  const pill=$('solution-status');pill.classList.toggle('feasible',!cert);pill.innerHTML=`<span class="status-indicator"></span> ${cert?'PROVEN OPTIMAL':'VERIFIED FEASIBLE'}`;
  $('topology-label').textContent=selected.layout.label;
  $('timeline-slider').max=trace.clearance;drawSlider($('timeline-slider'));
  $('finished').innerHTML=`0 <small>/ ${cfg.N}</small>`;
  renderComparison();paint();
}
function comparisonGlyph(layout,m){
  const y=j=>7+38*(m===1?.5:j/(m-1));
  let shapes=`<path d="M7 26H18M93 26H108" class="mini-rail"/><circle cx="7" cy="26" r="3.3" class="mini-terminal"/><circle cx="108" cy="26" r="3.3" class="mini-terminal"/>`;
  const active=new Set(layout.active),roots=new Set(layout.roots),lanes=new Set(layout.lanes);
  for(let j=0;j<m;j++){
    const cy=y(j),opacity=active.has(j)?1:.15;
    if(roots.has(j))shapes+=`<path d="M7 26 Q17 26 23 ${cy}" class="mini-rail"/>`;
    if(lanes.has(j))shapes+=`<path d="M23 ${cy}H43" class="mini-rail"/>`;
    if(active.has(j))shapes+=`<path d="M43 ${cy}H69M82 ${cy}Q93 ${cy} 108 26" class="mini-rail"/>`;
    shapes+=`<rect x="${active.has(j)?69:72}" y="${cy-3.1}" width="${active.has(j)?13:7}" height="6.2" rx="1.5" class="mini-station" opacity="${opacity}"/>`;
  }
  for(let j=0;j<m-1;j++)if(layout.links.includes(`B${j}:${j+1}`))shapes+=`<path d="M43 ${y(j)}V${y(j+1)}" class="mini-rail"/>`;
  return `<svg viewBox="0 0 115 52" class="comparison-mini" role="img" aria-label="Miniature network layout">${shapes}</svg>`;
}
function renderComparison(){
  if(!model)return;
  const min=Math.min(...model.comparisons.map(x=>x.trace.clearance)),max=Math.max(...model.comparisons.map(x=>x.trace.clearance));
  const all=[selected,...model.comparisons.filter(x=>x!==selected)];
  $('comparison-list').innerHTML=all.slice(0,4).map((x,i)=>{
    const active=x===selected,tag=x===model.best?'BEST FOUND':x.layout.family.toUpperCase();
    const width=100*min/x.trace.clearance;
    const compare=x.trace.clearance-min;
    return `<button type="button" class="comparison-item ${active?'current':''}" data-comparison="${i}" aria-pressed="${active}" title="Replay ${x.layout.label}">
      <span class="comparison-label">${tag}<span class="compare-status"></span></span>
      ${comparisonGlyph(x.layout,model.config.m)}
      <h3>${x.layout.label}</h3>
      <div class="comparison-number">${x.trace.clearance}<span>TICKS</span></div>
      <div class="bar-track"><div style="width:${width.toFixed(1)}%"></div></div>
      <div class="comparison-detail"><span>${x.layout.portals} PORTALS</span><span>${compare===0?'FASTEST':'+'+compare+' TICKS'}</span></div>
    </button>`;
  }).join('');
  $('comparison-list').querySelectorAll('[data-comparison]').forEach((button)=>button.addEventListener('click',()=>{
    const i=+button.dataset.comparison;const next=all[i];if(!next)return;
    selected=next;position=0;playing=true;updateResults();
  }));
}
function coords(cfg){
  const step=cfg.m<=4?99:cfg.m<=7?84:71,top=111,height=top*2+(cfg.m-1)*step;
  const at=j=>top+j*step,mid=(at(0)+at(cfg.m-1))/2;
  return {height,mid,at,point:(s)=>{
    if(s==='X0')return [83,mid];if(s==='X1')return [984,mid];if(s==='M')return [869,mid];
    const j=+s.slice(1);return [{A:252,B:405,C:569,E:748}[s[0]]??569,at(j)];
  }};
}
const path=(a,b)=>`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
const bez=(a,b,s=0.56)=>`M ${a[0]} ${a[1]} C ${a[0]+(b[0]-a[0])*s} ${a[1]} ${b[0]-(b[0]-a[0])*s} ${b[1]} ${b[0]} ${b[1]}`;
const circle=(x,y,r,cls)=>`<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`;
// Only A/B buffers contribute to the mathematical four-place lane capacity.
// The two extra visible positions are people staged from the source awaiting
// their scheduled admission. They remain in X0 until their recorded move.
const admissionCache=new WeakMap();
function admissionsByRoot(trace){
  let cached=admissionCache.get(trace);
  if(cached)return cached;
  cached=new Map();
  for(const batch of trace.events){
    for(const ev of batch||[]){
      if(ev.from!=='X0'||!ev.to.startsWith('A'))continue;
      const row=Number(ev.to.slice(1));
      if(!cached.has(row))cached.set(row,[]);
      cached.get(row).push({id:ev.id,t:ev.t});
    }
  }
  admissionCache.set(trace,cached);
  return cached;
}
function sourceStaging(trace,positions,roots){
  const placements=new Map(),count=new Map(),all=admissionsByRoot(trace);
  for(const row of roots){
    const pending=(all.get(row)||[]).filter(ev=>positions[ev.id]==='X0').slice(0,2);
    count.set(row,pending.length);
    pending.forEach((ev,i)=>placements.set(ev.id,[i===0?218:179,row]));
  }
  return {placements,count};
}
// Each A/B person is positioned directly from the independently verified trace.
function laneSlot(node,id,positions,c){
  const type=node[0],j=+node.slice(1);
  const neighbors=[];
  positions.forEach((place,pid)=>{if(place===node)neighbors.push(pid)});
  neighbors.sort((a,b)=>a-b);
  const index=Math.max(0,neighbors.indexOf(id));
  if(type==='A')return [index===0?294:255,c.at(j)];
  if(type==='B')return [index===0?449:410,c.at(j)];
  return c.point(node);
}
function actorPosition(node,id,c,positions){
  if(node.startsWith('A')||node.startsWith('B'))return laneSlot(node,id,positions,c);
  const p=c.point(node);
  if(node.startsWith('C'))return [p[0]+50,p[1]-12];
  return p;
}
function pipelineSegment(x1,x2,y,full,n){
  // Root feeder lanes have two source-staging positions plus four finite
  // approach-buffer places. Branch-only lanes retain their two B places.
  const seats=full?[179,218,255,294,410,449]:[410,449];
  return `<g class="pipeline ${full?'':'pipeline-partial'}">
    <rect x="${x1}" y="${y-17}" width="${x2-x1}" height="34" rx="17" class="pipe-shell"/>
    <path d="M${x1+15} ${y-11}H${x2-15}" class="pipe-highlight"/>
    <path d="M${x1+15} ${y+11}H${x2-15}" class="pipe-lowlight"/>
    ${seats.map((x,i)=>`<circle cx="${x}" cy="${y}" r="5.2" class="pipe-position${full&&i<2?' pipe-staging':''}"/>`).join('')}
    <text x="${x2-12}" y="${y-24}" text-anchor="end" class="pipe-occupancy">${n} IN LINE</text>
  </g>`;
}
function paint(){
  if(!model||!selected)return;
  const cfg=model.config,lo=selected.layout,trace=selected.trace,H=trace.clearance;
  position=clamp(position,0,H);const tick=Math.min(H-1,Math.floor(position)),frac=position>=H?0:position-tick;
  const state=trace.snaps[Math.min(H,Math.floor(position))],events=position>=H?[]:(trace.events[tick]||[]),c=coords(cfg),at=c.at,point=c.point;
  const out=trace.snaps[Math.min(H,Math.floor(position))].positions;
  const positions=state.positions;
  const occupancy={},startsByCounter={};
  for(let id=0;id<positions.length;id++){
    const node=positions[id];occupancy[node]=(occupancy[node]||0)+1;
    if(node.startsWith('C'))startsByCounter[+node.slice(1)]={id,age:position-state.starts[id]};
  }
  const moving=new Map(events.map(e=>[e.id,e]));
  const staging=sourceStaging(trace,positions,lo.roots);
  const rows=Array.from({length:cfg.m},(_,i)=>i),html=[];
  html.push(`<defs><pattern id="dotGrid" x="0" y="0" width="29" height="29" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#41645e" opacity=".22"/></pattern><linearGradient id="pipeSurface" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1d3035"/><stop offset=".51" stop-color="#16262d"/><stop offset="1" stop-color="#101e25"/></linearGradient><linearGradient id="stationSurface" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#24343b"/><stop offset="1" stop-color="#1b292f"/></linearGradient></defs>`);
  html.push(`<rect width="1040" height="${c.height}" class="grid-backdrop"/>`);
  html.push(`<text x="83" y="38" class="axis-label" text-anchor="middle">SOURCE</text><text x="340" y="38" class="axis-label" text-anchor="middle">QUEUE PIPELINES</text><text x="569" y="38" class="axis-label" text-anchor="middle">COUNTERS</text><text x="866" y="38" class="axis-label" text-anchor="middle">EXIT FLOW</text>`);
  for(const j of rows){
    const y=at(j),pB=point(`B${j}`),pC=point(`C${j}`),pE=point(`E${j}`);
    const hasEntry=lo.roots.includes(j),hasLane=lo.lanes.includes(j),isActive=lo.active.includes(j);
    const pA=point(`A${j}`),waiting=(occupancy[`A${j}`]||0)+(occupancy[`B${j}`]||0);
    html.push(`<text x="145" y="${y+4}" class="row-number" text-anchor="end">${String(j+1).padStart(2,'0')}</text>`);
    // Feeder lanes include two staged source people and four A/B buffer places.
    if(hasEntry&&hasLane){
      html.push(`<path d="${bez(point('X0'),[163,y])}" class="pipe-feeder"/>`);
      html.push(pipelineSegment(162,504,y,true,waiting+(staging.count.get(j)||0)));
    } else if(isActive){
      html.push(pipelineSegment(367,504,y,false,waiting));
    } else {
      html.push(`<path d="M367 ${y}H503" class="unused-route"/>`);
    }
    if(isActive){
      // The open right end of a lane feeds the service counter.
      html.push(`<path d="M504 ${y}H${pC[0]-65}" class="pipe-feeder"/>`);
    }
    html.push(`<path d="${path(pC,pE)}" class="service-link"/>`);
    html.push(`<path d="${bez(pE,point('M'))}" class="depart-link"/>`);
    const busy=!!startsByCounter[j];
    const stationX=pC[0]-65,stationY=y-31;
    html.push(`<g class="station-assembly ${isActive?'':'station-unused'}"><rect x="${stationX}" y="${stationY}" width="130" height="62" rx="8" class="counter-node ${busy?'busy':'idle'}"/><rect x="${stationX+12}" y="${stationY+8}" width="103" height="18" class="station-etch"/>`);
    html.push(`<text x="${stationX+16}" y="${y-11}" class="station-serial">SERVICE / ${String(j+1).padStart(2,'0')}</text>`);
    html.push(`<text x="${stationX+16}" y="${y+7}" class="counter-title">COUNTER ${String(j+1).padStart(2,'0')}</text>`);
    html.push(`<text x="${stationX+16}" y="${y+22}" class="counter-time">${busy?'PROCESSING':`${cfg.times[j]} TICKS / PERSON`}</text>`);
    html.push(`<circle cx="${stationX+114}" cy="${stationY+13}" r="3.2" class="station-light ${busy?'on':''}"/><title>Counter ${j+1}: ${cfg.times[j]} ticks per person; ${busy?'processing':'idle'}</title></g>`);
    // A departure cell still stores one person; it is shown as a slim gate.
    html.push(`<rect x="${pE[0]-5}" y="${y-13}" width="10" height="26" rx="4" class="departure-gate"/><title>Departure storage ${j+1}: ${occupancy[`E${j}`]||0}/1</title>`);
  }
  // Junctions between feeder pipelines represent the original B-to-B portals.
  for(let j=0;j<cfg.m-1;j++){
    const p1=point(`B${j}`),p2=point(`B${j+1}`),yes=lo.links.includes(`B${j}:${j+1}`);
    if(yes)html.push(`<path d="M${p1[0]+22} ${p1[1]}V${p2[1]}" class="pipe-junction"/>`);
  }
  html.push(`<path d="${path(point('M'),point('X1'))}" class="pipe-feeder"/>`);
  const [sx,sy]=point('X0'),[mx,my]=point('M'),[ex,ey]=point('X1');
  html.push(`${circle(sx,sy,48,'source-beacon')}${circle(sx,sy,41,'central-node')}${circle(sx,sy,35,'node-inner-ring')}${circle(mx,my,32,'central-node')}${circle(mx,my,26,'node-inner-ring')}${circle(ex,ey,41,'central-node out')}${circle(ex,ey,35,'node-inner-ring')}`);
  const seenExit=positions.filter(x=>x==='X1').length,inside=cfg.N-(occupancy.X0||0)-seenExit;
  html.push(`<text x="${sx}" y="${sy-7}" class="central-count">${occupancy.X0||0}</text><text x="${sx}" y="${sy+11}" class="central-title">LEFT</text>`);
  html.push(`<text x="${mx}" y="${my-2}" class="central-count" style="font-size:17px">${occupancy.M||0}</text><text x="${mx}" y="${my+12}" class="central-title" style="font-size:9px">MERGE</text>`);
  html.push(`<text x="${ex}" y="${ey-7}" class="central-count">${seenExit}</text><text x="${ex}" y="${ey+11}" class="central-title">OUT</text>`);
  if(inside>0)html.push(`<text x="${520}" y="${c.height-35}" class="axis-decoration" text-anchor="middle">${inside} PEOPLE INSIDE THE NETWORK</text>`);
  const drawPeople=[];
  for(let id=0;id<cfg.N;id++){
    const where=positions[id];if(where==='X1')continue;
    // Staged people are still counted at the source by the replay and all metrics.
    const sourcePosition=where==='X0'?staging.placements.get(id):null;
    if(where==='X0'&&!sourcePosition)continue;
    const ev=moving.get(id),a=sourcePosition?[sourcePosition[0],at(sourcePosition[1])]:actorPosition(where,id,c,positions),
      b=ev?actorPosition(ev.to,id,c,positions):a;
    const ease=frac*frac*(3-2*frac),x=a[0]+(b[0]-a[0])*ease,y=a[1]+(b[1]-a[1])*ease;
    const kind=where.startsWith('C')?'agent-in-service':'agent-dot';
    const place=sourcePosition?'staged at source':where;
    drawPeople.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${kind==='agent-in-service'?5:5.6}" class="${kind}"><title>Person ${id+1} · ${ev?ev.from+' → '+ev.to:place}</title></circle>`);
  }
  html.push(`<g class="agents">${drawPeople.join('')}</g>`);
  $('network-svg').setAttribute('viewBox',`0 0 1040 ${c.height}`);
  $('network-svg').innerHTML=html.join('');
  $('tick-label').innerHTML=`${fmt(position)} <span>/ ${fmt(H)}</span>`;
  $('timeline-slider').value=position;drawSlider($('timeline-slider'));
  const wait=positions.filter(v=>v==='X0'||v.startsWith('A')||v.startsWith('B')).length;
  const work=positions.filter(v=>v.startsWith('C')).length;
  showMetric('waiting',wait);showMetric('processing',work);
  $('finished').innerHTML=`${seenExit} <small>/ ${cfg.N}</small>`;
  $('completion-bar').style.width=`${(seenExit/cfg.N*100).toFixed(2)}%`;
  $('network-phase').textContent=position>=H?'CLEARANCE COMPLETE':work?'PROCESSING & ROUTING':'ROUTING IN PROGRESS';
  $('play-svg').innerHTML=playing?'<path d="M7 5h3v14H7zm7 0h3v14h-3z"/>':'<path d="m8 5 12 7-12 7z"/>';
  $('play').setAttribute('aria-label',playing?'Pause simulation':'Play simulation');
}
function animate(now){
  if(!lastFrame)lastFrame=now;const delta=Math.min(now-lastFrame,120);lastFrame=now;
  if(playing&&selected){position+=delta/(390/speedChoices[speedIndex]);if(position>=selected.trace.clearance){position=selected.trace.clearance;playing=false;pulseEnd=now+1350}}
  if(!playing&&pulseEnd&&now>pulseEnd){pulseEnd=0;position=0;playing=true}
  paint();requestAnimationFrame(animate);
}
function setTick(next){playing=false;pulseEnd=0;position=clamp(next,0,selected?.trace.clearance??0);paint()}
function share(){
  const cfg=readConfig(),u=new URL(location.href);u.search='';u.searchParams.set('n',cfg.N);u.searchParams.set('m',cfg.m);
  if(cfg.times.every(t=>t===cfg.times[0]))u.searchParams.set('p',cfg.times[0]);else u.searchParams.set('ps',cfg.times.join(','));
  u.searchParams.set('k',cfg.KM);u.searchParams.set('q',cfg.Q0);if(cfg.receiving==='turnover')u.searchParams.set('r','turnover');
  const link=u.toString();
  if(navigator.clipboard?.writeText){navigator.clipboard.writeText(link).then(()=>toast('Scenario link copied')).catch(()=>toast('Copy this link: '+link))}
  else {const field=document.createElement('textarea');field.value=link;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();const copied=document.execCommand('copy');field.remove();toast(copied?'Scenario link copied':'Copy this link: '+link)}
}
function exportData(){
  if(!selected||!model)return;
  const payload={schema:'queue-lab-v1',parameters:model.config,design:selected.layout,clearance:selected.trace.clearance,status:model.theoretical&&selected.trace.clearance===model.theoretical.clearance?'proved-uniform-clearance':'replay-verified-feasible',portal_claim:selected.portalClaim??null,events:selected.trace.events.flat(),metrics:{departures:selected.trace.departures,counter_services:selected.trace.served,average_approach_ticks:selected.trace.avgWait},research:'https://github.com/abdullah-x-bd/queue-optimization'};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`queue-lab-N${model.config.N}-m${model.config.m}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Verified movement trace exported');
}
function markPending(){
  if(!model)return;
  $('optimize').classList.add('pending');
  clearTimeout(autoRunTimer);
  autoRunTimer=setTimeout(()=>run(false,true),420);
}
function attachControls(){
  $('settings').addEventListener('submit',e=>{e.preventDefault();run()});
  document.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{
    const [key,d]=b.dataset.step.split(':'),el=$(key),min=+el.min,max=+el.max;
    el.value=clamp((+el.value||min)+Number(d),min,max);
    if(key==='population'){$('population-range').value=el.value;drawSlider($('population-range'))}
    if(key==='counters')setTimesForCount();markPending();
  }));
  $('population').addEventListener('change',()=>{$('population-range').value=$('population').value;drawSlider($('population-range'));markPending()});
  $('population-range').addEventListener('input',e=>{$('population').value=e.target.value;drawSlider(e.target);markPending()});
  $('counters').addEventListener('change',()=>{setTimesForCount();markPending()});
  $('uniform').addEventListener('change',()=>{syncUniform();markPending()});
  $('uniform-time').addEventListener('input',e=>{$('uniform-value').textContent=e.target.value;drawSlider(e.target);markPending()});
  $('individual-panel').addEventListener('input',e=>{
    const ix=e.target.dataset.duration??e.target.dataset.durationNumber;
    if(ix===undefined)return;
    const i=+ix,n=clamp(+e.target.value||1,1,30);times[i]=n;
    const row=e.target.closest('.individual-row');row.querySelectorAll('input').forEach(inp=>{if(inp!==e.target)inp.value=n;if(inp.type==='range')drawSlider(inp)});markPending();
  });
  $('source-rate').addEventListener('input',markPending);$('merge-storage').addEventListener('input',markPending);
  document.querySelectorAll('[data-receiving]').forEach(b=>b.addEventListener('click',()=>{
    receiving=b.dataset.receiving;document.querySelectorAll('[data-receiving]').forEach(el=>{const hit=el===b;el.classList.toggle('selected',hit);el.setAttribute('aria-pressed',String(hit))});markPending();
  }));
  $('play').addEventListener('click',()=>{if(!selected)return;if(position>=selected.trace.clearance)position=0;playing=!playing;pulseEnd=0;paint()});
  $('restart').addEventListener('click',()=>{position=0;playing=true;pulseEnd=0;paint()});
  $('previous').addEventListener('click',()=>setTick(Math.ceil(position)-1));
  $('next').addEventListener('click',()=>setTick(Math.floor(position)+1));
  $('timeline-slider').addEventListener('input',e=>setTick(+e.target.value));
  $('zoom').addEventListener('click',()=>{zoomed=!zoomed;$('network-frame').classList.toggle('zoomed',zoomed);$('zoom').textContent=zoomed?'Fit view':'Zoom +';$('zoom').setAttribute('aria-pressed',String(zoomed));});
  $('speed').addEventListener('click',()=>{speedIndex=(speedIndex+1)%speedChoices.length;$('speed').textContent=speedChoices[speedIndex]+'×'});
  $('share').addEventListener('click',share);$('export').addEventListener('click',exportData);
  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;
    if(e.key==='ArrowLeft')setTick(Math.ceil(position)-1);if(e.key==='ArrowRight')setTick(Math.floor(position)+1);if(e.key===' '){e.preventDefault();playing=!playing;pulseEnd=0}
  });
}
function attachDefinitions(){
  const bubble=$('definition-popover');let active=null,pinned=false;
  const place=target=>{
    const rect=target.getBoundingClientRect(),width=272,margin=12;
    bubble.style.left=`${clamp(rect.left+rect.width/2-width/2,margin,innerWidth-width-margin)}px`;
    const top=rect.bottom+12;
    if(top+bubble.offsetHeight>innerHeight-12){bubble.style.top=`${Math.max(10,rect.top-bubble.offsetHeight-12)}px`;bubble.dataset.placement='top'}
    else{bubble.style.top=`${top}px`;bubble.dataset.placement='bottom'}
  };
  const hide=()=>{bubble.hidden=true;if(active)active.setAttribute('aria-expanded','false');active=null;pinned=false};
  const show=el=>{if(active&&active!==el)active.setAttribute('aria-expanded','false');active=el;bubble.textContent=el.dataset.definition;bubble.hidden=false;el.setAttribute('aria-expanded','true');place(el)};
  document.querySelectorAll('.info-trigger').forEach(el=>{
    el.setAttribute('aria-expanded','false');
    el.setAttribute('aria-describedby','definition-popover');
    el.addEventListener('click',e=>{e.stopPropagation();if(active===el&&pinned)hide();else{pinned=true;show(el)}});
    el.addEventListener('mouseenter',()=>{if(!pinned)show(el)});
    el.addEventListener('mouseleave',()=>{if(!pinned&&!el.matches(':focus'))hide()});
    el.addEventListener('focus',()=>{if(!pinned)show(el)});
    el.addEventListener('blur',()=>{if(!pinned)hide()});
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.info-trigger'))hide()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide()});
  window.addEventListener('resize',()=>{if(active)place(active)});
  window.addEventListener('scroll',()=>{if(active)place(active)},true);
}
queryScenario();attachControls();attachDefinitions();run(true);requestAnimationFrame(animate);
