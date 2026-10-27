import {normalizeConfig, solveScenario} from './engine.js';

const $ = id => document.getElementById(id);
const ns = (val, digits=0) => Number(val).toFixed(digits);
const clamp = (n,a,b)=>Math.min(b,Math.max(a,n));
const speedChoices=[0.5,1,2,4];
let model,selected,position=0,playing=true,speedIndex=1,lastFrame=0,pulseEnd=0,toastTimer=0,receiving='strict';
let times=Array(5).fill(4),zoomed=false;
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
function run(initial=false){
  const btn=$('optimize');btn.disabled=true;btn.querySelector('span:nth-child(2)').textContent='Computing layouts…';
  const cfg=readConfig();
  try{
    model=solveScenario(cfg);selected=model.best;position=0;playing=true;pulseEnd=0;
    updateResults();if(!initial)toast(`Evaluated ${model.candidatesCount} feasible layouts`);
  }catch(err){console.error(err);toast(`Model error: ${err.message}`)}
  finally{btn.disabled=false;btn.querySelector('span:nth-child(2)').textContent='Optimize topology';btn.classList.remove('pending')}
}
function showMetric(id,txt){$(id).textContent=txt}
function updateResults(){
  if(!model||!selected)return;
  const cfg=model.config,trace=selected.trace,cert=model.theoretical&&trace.clearance===model.theoretical.clearance;
  showMetric('clearance',trace.clearance);showMetric('portals',selected.layout.portals);
  $('used').innerHTML=`${trace.served.filter(Boolean).length}<span class="metric-divider">/${cfg.m}</span>`;
  $('clearance-context').textContent=cert? 'Mathematically proven minimum for this row model' : 'Shortest verified schedule found across tested layouts';
  const pill=$('solution-status');pill.classList.toggle('feasible',!cert);pill.innerHTML=`<span class="status-indicator"></span> ${cert?'PROVEN OPTIMAL':'VERIFIED FEASIBLE'}`;
  $('topology-label').textContent=selected.layout.label;
  $('timeline-slider').max=trace.clearance;drawSlider($('timeline-slider'));
  $('finished').innerHTML=`0 <small>/ ${cfg.N}</small>`;
  renderComparison();paint();
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
    if(s==='X0')return [91,mid];if(s==='X1')return [958,mid];if(s==='M')return [840,mid];
    const j=+s.slice(1);return [{A:252,B:404,C:550,E:678}[s[0]]??550,at(j)];
  }};
}
const path=(a,b)=>`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
const bez=(a,b,s=0.56)=>`M ${a[0]} ${a[1]} C ${a[0]+(b[0]-a[0])*s} ${a[1]} ${b[0]-(b[0]-a[0])*s} ${b[1]} ${b[0]} ${b[1]}`;
const circle=(x,y,r,cls)=>`<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`;
const posOffset=(id,node)=>{
  if(node.startsWith('C'))return [0,0];
  if(node==='X0'||node==='X1')return [0,0];
  const k=(id*17+3)%7;return [((k%3)-1)*8, (Math.floor(k/3)-1)*6];
};
function actorPosition(node,id,c){const p=c.point(node),o=posOffset(id,node);return [p[0]+o[0],p[1]+o[1]]}
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
  const rows=Array.from({length:cfg.m},(_,i)=>i),html=[];
  html.push(`<defs><pattern id="dotGrid" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".75" fill="#29444e" opacity=".72"/></pattern><filter id="subtleGlow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`);
  html.push(`<rect width="1040" height="${c.height}" class="grid-backdrop"/>`);
  html.push(`<text x="91" y="36" class="axis-label" text-anchor="middle">SOURCE</text><text x="327" y="36" class="axis-label" text-anchor="middle">APPROACH</text><text x="550" y="36" class="axis-label" text-anchor="middle">SERVICE</text><text x="742" y="36" class="axis-label" text-anchor="middle">DEPARTURE</text><text x="958" y="36" class="axis-label" text-anchor="middle">EXIT</text>`);
  for(const j of rows){
    const y=at(j),pB=point(`B${j}`),pC=point(`C${j}`),pE=point(`E${j}`);
    html.push(`<line x1="176" y1="${y}" x2="754" y2="${y}" class="empty-row-dash"/>`);
    html.push(`<text x="166" y="${y+4}" class="row-number" text-anchor="end">${String(j+1).padStart(2,'0')}</text>`);
    const hasEntry=lo.roots.includes(j),hasLane=lo.lanes.includes(j);
    const pA=point(`A${j}`);
    html.push(`<path d="${bez(point('X0'),pA)}" class="${hasEntry?'gate-active':'gate-inactive'}" ${hasEntry?'':'opacity=".2"'}/>`);
    html.push(`<path d="${path(pA,pB)}" class="${hasLane?'gate-active':'gate-inactive'}" ${hasLane?'':'opacity=".32"'}/>`);
    html.push(`<path d="${path(pB,pC)}" class="service-link"/>`);
    html.push(`<path d="${path(pC,pE)}" class="service-link"/>`);
    html.push(`<path d="${bez(pE,point('M'))}" class="depart-link"/>`);
    html.push(`<g><rect x="${pA[0]-18}" y="${y-17}" width="36" height="34" rx="8" class="node-shell ${occupancy[`A${j}`]===2?'full':''}" opacity="${hasEntry?1:.42}"/><title>Approach A${j+1}: ${occupancy[`A${j}`]||0}/2</title></g>`);
    html.push(`<g><rect x="${pB[0]-18}" y="${y-17}" width="36" height="34" rx="8" class="node-shell ${occupancy[`B${j}`]===2?'full':''}" opacity="${lo.active.includes(j)?1:.65}"/><title>Approach B${j+1}: ${occupancy[`B${j}`]||0}/2</title></g>`);
    const busy=!!startsByCounter[j],age=busy?Math.max(0,startsByCounter[j].age):0,remaining=busy?Math.max(0,cfg.times[j]-age):0;
    html.push(`<rect x="${pC[0]-42}" y="${y-26}" width="84" height="52" rx="12" class="counter-node ${busy?'busy':'idle'}"/><title>Counter ${j+1}; ${cfg.times[j]} ticks per person${busy?'; '+remaining+' ticks left':''}</title>`);
    html.push(`<text x="${pC[0]}" y="${y-5}" class="counter-title">COUNTER ${j+1}</text><text x="${pC[0]}" y="${y+12}" class="counter-time">${busy?`IN SERVICE · ${Math.ceil(remaining)}`:`${cfg.times[j]} TICKS`}</text>`);
    if(busy){const r=32,circ=2*Math.PI*r,progress=clamp(age/cfg.times[j],0,1);html.push(`<circle cx="${pC[0]}" cy="${y}" r="${r}" class="progress-ring" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ*(1-progress)).toFixed(2)}" transform="rotate(-90 ${pC[0]} ${y})" opacity=".6"/>`)}
    html.push(`<rect x="${pE[0]-17}" y="${y-16}" width="34" height="32" rx="7" class="node-shell"/><title>Departure E${j+1}: ${occupancy[`E${j}`]||0}/1</title>`);
  }
  for(let j=0;j<cfg.m-1;j++){
    const p1=point(`B${j}`),p2=point(`B${j+1}`),yes=lo.links.includes(`B${j}:${j+1}`);
    html.push(`<path d="${path(p1,p2)}" class="${yes?'gate-active':'gate-inactive'}" opacity="${yes?'1':'.28'}"/>`);
  }
  html.push(`<path d="${path(point('M'),point('X1'))}" class="gate-active"/>`);
  const [sx,sy]=point('X0'),[mx,my]=point('M'),[ex,ey]=point('X1');
  html.push(`${circle(sx,sy,52,'source-beacon')}${circle(sx,sy,41,'central-node')}${circle(mx,my,32,'central-node')}${circle(ex,ey,41,'central-node out')}`);
  const seenExit=positions.filter(x=>x==='X1').length,inside=cfg.N-(occupancy.X0||0)-seenExit;
  html.push(`<text x="${sx}" y="${sy-7}" class="central-count">${occupancy.X0||0}</text><text x="${sx}" y="${sy+11}" class="central-title">LEFT</text>`);
  html.push(`<text x="${mx}" y="${my-2}" class="central-count" style="font-size:17px">${occupancy.M||0}</text><text x="${mx}" y="${my+12}" class="central-title" style="font-size:9px">MERGE</text>`);
  html.push(`<text x="${ex}" y="${ey-7}" class="central-count">${seenExit}</text><text x="${ex}" y="${ey+11}" class="central-title">OUT</text>`);
  if(inside>0)html.push(`<text x="${520}" y="${c.height-35}" class="axis-decoration" text-anchor="middle">${inside} PEOPLE INSIDE THE NETWORK</text>`);
  for(const ev of events){
    const a=point(ev.from),b=point(ev.to),d=ev.from==='X0'||ev.to==='M'?bez(a,b):path(a,b);
    html.push(`<path d="${d}" class="gate-flow" opacity="${(1-frac)*.38+.19}"/>`);
  }
  const drawPeople=[];
  for(let id=0;id<cfg.N;id++){
    const where=positions[id];if(where==='X0'||where==='X1')continue;
    const ev=moving.get(id),a=actorPosition(where,id,c),b=ev?actorPosition(ev.to,id,c):a;
    const ease=frac*frac*(3-2*frac),x=a[0]+(b[0]-a[0])*ease,y=a[1]+(b[1]-a[1])*ease;
    const kind=where.startsWith('C')?'agent-in-service':'agent-dot';
    drawPeople.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${kind==='agent-in-service'?5:5.6}" class="${kind}"><title>Person ${id+1} · ${ev?ev.from+' → '+ev.to:where}</title></circle>`);
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
  navigator.clipboard?.writeText(u.toString()).then(()=>toast('Scenario link copied')).catch(()=>toast('Link: '+u.toString()));
}
function exportData(){
  if(!selected||!model)return;
  const payload={schema:'queue-lab-v1',parameters:model.config,design:selected.layout,clearance:selected.trace.clearance,status:model.theoretical&&selected.trace.clearance===model.theoretical.clearance?'proved-uniform-clearance':'replay-verified-feasible',portal_claim:selected.portalClaim??null,events:selected.trace.events.flat(),metrics:{departures:selected.trace.departures,counter_services:selected.trace.served,average_approach_ticks:selected.trace.avgWait},research:'https://github.com/abdullah-x-bd/queue-optimization'};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`queue-lab-N${model.config.N}-m${model.config.m}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Verified movement trace exported');
}
function markPending(){if(model)$('optimize').classList.add('pending')}
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
queryScenario();attachControls();run(true);requestAnimationFrame(animate);
