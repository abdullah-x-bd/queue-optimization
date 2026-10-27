/* Finite-space queue topology engine. Time and space constraints follow the
   27 October 2026 research note. See research/CLAIM_STATUS.md. */

const cap = (v, cfg) => v === 'X0' || v === 'X1' ? cfg.N : v === 'M' ? cfg.KM : v.startsWith('C') || v.startsWith('E') ? 1 : 2;
const rate = (v, cfg) => v === 'X0' ? cfg.Q0 : v === 'X1' ? cfg.N : 1;
const sorted = (a) => [...new Set(a)].sort((x, y) => x - y);
const edgeKey = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;
const bEdgeKey = (a, b) => `B${edgeKey(a, b)}`;

export function normalizeConfig(raw = {}) {
  const clampInt = (v, lo, hi, fallback) => {
    const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback;
  };
  const N = clampInt(raw.N, 1, 180, 36);
  const m = clampInt(raw.m, 1, 12, 5);
  const times = Array.from({length: m}, (_, i) => clampInt(raw.times?.[i] ?? raw.p, 1, 30, 3));
  return { N, m, times, KM: clampInt(raw.KM, 1, 6, 2), Q0: clampInt(raw.Q0, 1, 12, 2), receiving: raw.receiving === 'turnover' ? 'turnover' : 'strict' };
}

export function uniformBound(cfg) {
  if (!cfg.times.every(x => x === cfg.times[0])) return null;
  const p = cfg.times[0], strict = cfg.receiving === 'strict';
  const delta = strict && cfg.KM === 1 ? 2 : 1;
  const b = strict ? Math.max(p, 2) : p;
  const period = Math.max(b, cfg.m * delta);
  const clearance = p + 5 + period * Math.floor((cfg.N - 1) / cfg.m) + delta * ((cfg.N - 1) % cfg.m);
  return {delta, b, period, clearance, minCounters: Math.min(cfg.N, cfg.m, Math.ceil(b / delta))};
}

function layout(label, m, roots, lanes, links, family, active = null) {
  const o = {label, family, m, roots: sorted(roots), lanes: sorted(lanes), links: [...new Set(links)].sort(), active: sorted(active ?? Array.from({length:m}, (_,i)=>i))};
  o.portals = o.roots.length + o.lanes.length + o.links.length;
  return o;
}
function direct(cfg, active = null) {
  const rows = active || Array.from({length: cfg.m},(_,i)=>i);
  return layout('Dedicated lanes', cfg.m, rows, rows, [], 'dedicated', rows);
}
function shared(cfg, active = null, root = null) {
  const rows = active || Array.from({length:cfg.m},(_,i)=>i);
  const lo = Math.min(...rows), hi = Math.max(...rows), r = root ?? Math.floor((lo+hi)/2);
  const links=[]; for(let j=lo;j<hi;j++)links.push(bEdgeKey(j,j+1));
  return layout('Shared feeder',cfg.m,[r],[r],links,'shared',rows);
}
function dual(cfg, active = null, roots = null) {
  const rows = active || Array.from({length:cfg.m},(_,i)=>i);
  const lo = Math.min(...rows), hi = Math.max(...rows);
  if (lo === hi) return direct(cfg,rows);
  const a = roots?.[0] ?? Math.floor((lo+hi-1)/2);
  const b = roots?.[1] ?? a+1;
  const links=[];
  for(let j=lo;j<hi;j++)if(!(j>=a && j<b))links.push(bEdgeKey(j,j+1));
  return layout('Split feeders',cfg.m,[a,b],[a,b],links,'dual',rows);
}
function adj(layout) {
  const out=Array.from({length:layout.m},()=>[]);
  for(const s of layout.links){const [a,b]=s.slice(1).split(':').map(Number);out[a].push(b);out[b].push(a)}
  return out;
}
function shortestB(graph,start,target){
  if(start===target)return [start];
  const q=[[start]],seen=new Set([start]);
  while(q.length){const p=q.shift();for(const v of graph[p.at(-1)])if(!seen.has(v)){const n=[...p,v];if(v===target)return n;seen.add(v);q.push(n)}}
  return null;
}
function pathsFor(layout) {
  const g=adj(layout), routes=[];
  for(const root of layout.roots)for(const target of layout.active){
    if(!layout.lanes.includes(root))continue;
    const b=shortestB(g,root,target);
    if(b) routes.push({root,target,path:['X0',`A${root}`,...b.map(i=>`B${i}`),`C${target}`,`E${target}`,'M','X1'],distance:2+b.length-1});
  }
  return routes;
}

function action(id,from,to,t,kind='move'){return {id,from,to,t,kind};}
function addExactJob(events,id,route,dispatch,p) {
  const toC=route.path.indexOf(`C${route.target}`);
  for(let i=0;i<toC;i++){
    const kind=i===toC-1?'start':'move';
    const ev=action(id,route.path[i],route.path[i+1],dispatch+i,kind);
    (events[ev.t] ||= []).push(ev);
  }
  const start=dispatch+toC-1, release=start+p;
  for(const [a,b,t,k] of [[`C${route.target}`,`E${route.target}`,release,'release'],[`E${route.target}`,'M',release+1,'move'],['M','X1',release+2,'move']]){
    (events[t] ||= []).push(action(id,a,b,t,k));
  }
}
function exactUniform(cfg) {
  const b=uniformBound(cfg), p=cfg.times[0], r=b.minCounters;
  if(!b)throw Error('Uniform service is required for exact construction');
  let candidate, jobs=[];
  if(cfg.receiving==='strict' && cfg.KM===1) {
    candidate=shared(cfg, Array.from({length:r},(_,i)=>i), 0);
    const period=Math.max(b.b,2*r);
    for(let i=0;i<cfg.N;i++){
      const round=Math.floor(i/r),h=i%r;
      jobs.push({target:h,root:0,dispatch:round*period+h});
    }
  } else if(cfg.receiving==='strict' && cfg.KM>=2 && cfg.Q0>=2 && r>=2) {
    const rows=Array.from({length:r},(_,i)=>i),left=Math.ceil(r/2)-1,right=left+1;
    candidate=dual(cfg,rows,[left,right]);
    const period=Math.max(b.b,r);
    for(let i=0;i<cfg.N;i++){
      const round=Math.floor(i/r),phase=i%r,side=phase%2;
      const h=Math.floor(phase/2),root=side?right:left;
      const target=side?right+h:left-h;
      jobs.push({target,root,dispatch:round*period+h+side});
    }
  } else {
    candidate=direct(cfg,Array.from({length:r},(_,i)=>i));
    const period=Math.max(b.b,r*b.delta);
    for(let i=0;i<cfg.N;i++){
      const round=Math.floor(i/r),row=i%r;
      jobs.push({target:row,root:row,dispatch:round*period+row*b.delta});
    }
  }
  const routes=pathsFor(candidate),events=[];
  for(let i=0;i<jobs.length;i++){
    const j=jobs[i],route=routes.find(x=>x.root===j.root&&x.target===j.target);
    if(!route)throw Error('A required exact route is absent');
    addExactJob(events,i,route,j.dispatch,p);
  }
  const trace=replayTrace(cfg,candidate,events);
  if(trace.clearance!==b.clearance)throw Error(`Exact constructor mismatch: ${trace.clearance} != ${b.clearance}`);
  let portalClaim='Feasible portal construction';
  if(cfg.receiving==='strict' && cfg.KM===1)portalClaim='Minimum portals proven';
  else if(cfg.receiving==='strict' && cfg.KM>=2 && cfg.Q0>=2){
    const exitLimited=b.clearance===p+5+cfg.N-1;
    const h=(cfg.N-1)%cfg.m+1;
    const serviceLimited=b.b>cfg.m&&cfg.N>cfg.m&&h>=2;
    if(r===1 || exitLimited || serviceLimited)portalClaim='Minimum portals proven';
    else portalClaim='Within one portal of minimum';
  }
  return {layout:candidate,trace,kind:'proven',portalClaim};
}

function allowed(lo,ev) {
  const a=ev.from,b=ev.to;
  if(a==='X0'&&b.startsWith('A'))return lo.roots.includes(+b.slice(1));
  if(a.startsWith('A')&&b.startsWith('B'))return a.slice(1)===b.slice(1)&&lo.lanes.includes(+a.slice(1));
  if(a.startsWith('B')&&b.startsWith('B'))return lo.links.includes(bEdgeKey(+a.slice(1),+b.slice(1)));
  if(a.startsWith('B')&&b.startsWith('C'))return ev.kind==='start'&&a.slice(1)===b.slice(1);
  if(a.startsWith('C')&&b.startsWith('E'))return ev.kind==='release'&&a.slice(1)===b.slice(1);
  if(a.startsWith('E')&&b==='M')return true;
  if(a==='M'&&b==='X1')return true;
  return false;
}
const isSpecialC = s => s.startsWith('C');

export function replayTrace(cfg,lo,rawEvents){
  const evts=Array.from({length:rawEvents.length},(_,t)=>rawEvents[t]||[]);
  const pos=Array(cfg.N).fill('X0'),starts=Array(cfg.N).fill(null),services=Array(cfg.N).fill(0);
  const snaps=[{positions:[...pos],starts:[...starts]}];
  const flow=[], departures=[], completed=[];
  for(let t=0;t<evts.length;t++){
    const list=evts[t],occ={},incoming={},outgoing={},gates={},moved=new Set(),ending=new Set(),beginning=new Set();
    for(const where of pos)occ[where]=(occ[where]||0)+1;
    for(const ev of list){
      if(moved.has(ev.id))throw Error(`Person ${ev.id} moves twice during tick ${t}`);
      if(ev.t!==t || pos[ev.id]!==ev.from || !allowed(lo,ev))throw Error(`Invalid movement at tick ${t}: ${JSON.stringify(ev)}`);
      moved.add(ev.id);outgoing[ev.from]=(outgoing[ev.from]||0)+1;incoming[ev.to]=(incoming[ev.to]||0)+1;
      if(ev.kind==='start')beginning.add(+ev.to.slice(1));
      if(ev.kind==='release'){
        if(starts[ev.id]===null || t-starts[ev.id]<cfg.times[+ev.from.slice(1)])throw Error('Service released before completion');
        ending.add(+ev.from.slice(1));
      }
      if(ev.from.startsWith('B')&&ev.to.startsWith('B')){
        const k=bEdgeKey(+ev.from.slice(1),+ev.to.slice(1));gates[k]=(gates[k]||0)+1;
      }
      if(ev.kind==='start'){
        if(services[ev.id]!==0)throw Error('Person started service twice');
      }
    }
    for(let j=0;j<cfg.m;j++){
      const c=`C${j}`,count=occ[c]||0,enter=beginning.has(j)?1:0,leave=ending.has(j)?1:0;
      if(count+enter-leave>1 || leave>count || (count&&enter&&!leave))throw Error('Counter occupancy violation');
    }
    for(const [v,n] of Object.entries(outgoing)){
      if(n>(occ[v]||0)||n>rate(v,cfg))throw Error(`Sending limit at ${v}, tick ${t}`);
    }
    for(const [v,n] of Object.entries(incoming)){
      if(isSpecialC(v))continue;
      const room=cap(v,cfg)-(occ[v]||0)+(cfg.receiving==='turnover'?(outgoing[v]||0):0);
      if(n>rate(v,cfg)||n>room)throw Error(`Receiving/storage limit at ${v}, tick ${t}`);
    }
    if(Object.values(gates).some(n=>n>1))throw Error('Lateral gate over capacity');
    for(const ev of list){
      pos[ev.id]=ev.to;
      if(ev.kind==='start'){starts[ev.id]=t;services[ev.id]++}
      if(ev.kind==='release')completed.push([t,ev.id]);
      if(ev.to==='X1')departures.push({t:t+1,id:ev.id});
    }
    snaps.push({positions:[...pos],starts:[...starts]});
    flow.push(list);
  }
  if(pos.some(x=>x!=='X1')||services.some(n=>n!==1))throw Error('Incomplete clearance or unserved person');
  const clearance=snaps.length-1;
  const admissions=Array(cfg.N).fill(0),exitTimes=Array(cfg.N).fill(0);
  for(const list of flow)for(const ev of list){if(ev.from==='X0')admissions[ev.id]=ev.t;if(ev.to==='X1')exitTimes[ev.id]=ev.t+1}
  const waits=starts.map((s,i)=>s-admissions[i]);
  const served=Array(cfg.m).fill(0),occupied=Array(cfg.m).fill(0);
  for(let i=0;i<cfg.N;i++){
    for(const list of flow)for(const ev of list)if(ev.id===i&&ev.kind==='start'){const j=+ev.to.slice(1);served[j]++;occupied[j]+=cfg.times[j]}
  }
  return {clearance, snaps, events:flow,departures,completed,served,avgWait:waits.reduce((a,b)=>a+b,0)/cfg.N,utilization:occupied.reduce((a,b)=>a+b,0)/(cfg.m*clearance),exitTimes};
}

function greedy(cfg, lo, policy='earliest') {
  const routes=pathsFor(lo);
  const pos=Array(cfg.N).fill('X0'),targets=Array(cfg.N).fill(-1),paths=Array(cfg.N).fill(null),starts=Array(cfg.N).fill(null);
  const events=[], limit=cfg.N*(cfg.m+Math.max(...cfg.times)+17)*3+80;
  let next=0,finish=0,rotor=0;
  const rootRoutes=routes.filter(r=>r.root>=0);
  function itemAt(node){const o=[];for(let i=0;i<next;i++)if(pos[i]===node)o.push(i);return o;}
  for(let t=0;t<limit;t++){
    const occ={};for(const node of pos.slice(0,next))occ[node]=(occ[node]||0)+1;
    occ.X0=cfg.N-next;
    const inn={},out={},used=new Set(),gates=new Set(),selected=[];
    const remaining=(node)=>cfg.receiving==='turnover'?cap(node,cfg)-(occ[node]||0)+(out[node]||0)-(inn[node]||0):cap(node,cfg)-(occ[node]||0)-(inn[node]||0);
    const can=(id,to,kind='move')=>{
      if(used.has(id))return false;
      const from=pos[id];if((out[from]||0)>=rate(from,cfg))return false;
      if(to.startsWith('C')){
        const occupant=(occ[to]||0),releasing=selected.some(e=>e.from===to&&e.kind==='release');
        if(occupant&&!releasing)return false;
        if((inn[to]||0)>=1)return false;
      }else if(to!=='X1'&&((inn[to]||0)>=rate(to,cfg)||remaining(to)<=0))return false;
      if(from.startsWith('B')&&to.startsWith('B')&&gates.has(bEdgeKey(+from.slice(1),+to.slice(1))))return false;
      if(kind==='release'&&(starts[id]===null||t-starts[id]<cfg.times[+from.slice(1)]))return false;
      return true;
    };
    const move=(id,to,kind='move')=>{
      if(!can(id,to,kind))return false;
      const from=pos[id]; const ev=action(id,from,to,t,kind);
      selected.push(ev);used.add(id);out[from]=(out[from]||0)+1;inn[to]=(inn[to]||0)+1;
      if(from.startsWith('B')&&to.startsWith('B'))gates.add(bEdgeKey(+from.slice(1),+to.slice(1)));
      return true;
    };
    const inMerge=itemAt('M');if(inMerge.length)move(inMerge[0],'X1');
    const departures=[];
    for(let j=0;j<cfg.m;j++)for(const id of itemAt(`E${j}`))departures.push(id);
    departures.sort((a,b)=>cfg.times[+pos[a].slice(1)]-cfg.times[+pos[b].slice(1)]||a-b);
    for(const id of departures){if(move(id,'M'))break}
    for(let j=0;j<cfg.m;j++)for(const id of itemAt(`C${j}`))move(id,`E${j}`,'release');
    const cells=[];
    for(let j=0;j<cfg.m;j++){
      const ids=itemAt(`B${j}`);
      const atHome=ids.filter(i=>targets[i]===j);
      if(atHome.length)for(const id of atHome)if(move(id,`C${j}`,'start'))break;
      for(const id of ids.filter(i=>targets[i]!==j).sort((a,b)=>a-b)){
        const route=paths[id];const k=route.indexOf(pos[id]);
        if(k>=0)cells.push({id,to:route[k+1],left:route.length-k});
      }
    }
    cells.sort((a,b)=>a.left-b.left || a.id-b.id);
    for(const c of cells)move(c.id,c.to);
    for(let j=0;j<cfg.m;j++)for(const id of itemAt(`A${j}`))move(id,`B${j}`);
    let reserved=0;
    while(next<cfg.N&&reserved<cfg.Q0){
      const available=rootRoutes.filter(r=>(inn[`A${r.root}`]||0)<1&&remaining(`A${r.root}`)>0);
      if(!available.length)break;
      const pending=Array(cfg.m).fill(0);
      for(let i=0;i<next;i++)if(pos[i]!=='X1'&&targets[i]>=0)pending[targets[i]]++;
      for(const e of selected)if(e.from==='X0')pending[targets[e.id]]++;
      const busyUntil=Array(cfg.m).fill(t);
      for(let i=0;i<next;i++)if(pos[i].startsWith('C')){
        const j=targets[i];busyUntil[j]=Math.max(busyUntil[j],(starts[i]||t)+cfg.times[j]);
      }
      const variants=available.map(r=>{
        const p=cfg.times[r.target],backlog=pending[r.target];
        const earliest=Math.max(t+r.distance,busyUntil[r.target]);
        let score=earliest+ p + Math.max(0,backlog-(busyUntil[r.target]>t?1:0))*Math.max(p,cfg.receiving==='strict'?2:1);
        score+=r.distance*0.32;
        if(policy==='balanced')score+=backlog*0.7+p*0.3;
        if(policy==='shortest')score+=p*0.55;
        if(policy==='roundrobin')score=backlog*0.5+ ((r.target-rotor+cfg.m)%cfg.m)*2+r.distance*0.7;
        return {...r,score};
      }).sort((a,b)=>a.score-b.score||cfg.times[a.target]-cfg.times[b.target]||a.root-b.root);
      if(!variants.length)break;
      const best=variants[0],id=next;
      pos[id]='X0';targets[id]=best.target;paths[id]=best.path;
      if(!move(id,`A${best.root}`)){targets[id]=-1;paths[id]=null;break}
      next++;reserved++;rotor=(best.target+1)%cfg.m;
    }
    if(!selected.length && next===cfg.N && pos.slice(0,next).every(p=>p!=='X0')){
      throw Error('Simulation stalled in a blocked network');
    }
    for(const ev of selected){pos[ev.id]=ev.to;if(ev.kind==='start')starts[ev.id]=t;if(ev.to==='X1')finish++}
    events[t]=selected;
    if(finish===cfg.N){return replayTrace(cfg,lo,events)}
  }
  throw Error('Simulation did not finish within safety horizon');
}

function genericCandidates(cfg){
  const all=Array.from({length:cfg.m},(_,i)=>i), options=[direct(cfg)];
  if(cfg.m===1)return options;
  for(let k=1;k<=cfg.m;k++){
    const fast=[...all].sort((a,b)=>cfg.times[a]-cfg.times[b]||a-b).slice(0,k).sort((a,b)=>a-b);
    if(k<cfg.m)options.push(direct(cfg,fast));
  }
  for(let r=0;r<cfg.m;r++)options.push(shared(cfg,all,r));
  for(let a=0;a<cfg.m-1;a++)options.push(dual(cfg,all,[a,a+1]));
  return [...new Map(options.map(o=>[`${o.roots.join(',')}|${o.lanes.join(',')}|${o.links.join(',')}`,o])).values()];
}
function rank(a,b){return a.trace.clearance-b.trace.clearance || a.layout.portals-b.layout.portals || a.trace.avgWait-b.trace.avgWait}
const shortCaption = r => r?.kind==='proven' ? 'Exact clearance theorem' : 'Best verified schedule found';

export function solveScenario(input){
  const cfg=normalizeConfig(input), bound=uniformBound(cfg);
  const candidates=[], failures=[];
  const add=(lo,trace,kind='feasible',portalClaim='')=>candidates.push({layout:lo,trace,kind,portalClaim});
  if(bound){
    try{candidates.push(exactUniform(cfg));}catch(e){failures.push('Exact constructor: '+e.message)}
  }
  for(const lo of genericCandidates(cfg)){
    let best=null;
    for(const policy of ['earliest','shortest','balanced','roundrobin']){
      try{const trial=greedy(cfg,lo,policy);if(!best||trial.clearance<best.clearance||trial.clearance===best.clearance&&trial.avgWait<best.avgWait)best=trial}
      catch(e){failures.push(`${lo.family}: ${e.message}`)}
    }
    if(best)add(lo,best);
  }
  candidates.sort(rank);
  if(!candidates.length)throw Error('No feasible schedule could be constructed for these settings');
  let best=candidates[0];
  if(bound){const matched=candidates.filter(x=>x.trace.clearance===bound.clearance);if(matched.length)best=matched.sort((a,b)=>a.layout.portals-b.layout.portals || (a.kind==='proven'?-1:1))[0]}
  const byFamily={};
  for(const candidate of candidates){let f=candidate.layout.family;if(!byFamily[f]||rank(candidate,byFamily[f])<0)byFamily[f]=candidate}
  const comparisons=[best];
  for(const f of ['dedicated','shared','dual'])if(byFamily[f]&&byFamily[f]!==best)comparisons.push(byFamily[f]);
  const dedup=[...new Map(comparisons.map(x=>[`${x.layout.family}:${x.layout.roots}:${x.layout.links}`,x])).values()];
  return {config:cfg, theoretical:bound, best, comparisons:dedup, candidatesCount:candidates.length, failures:failures.length, caption:shortCaption(best), status:bound&&best.trace.clearance===bound.clearance?'proven':'feasible'};
}
