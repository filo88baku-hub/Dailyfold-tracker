/* Dayfold: intentionally dependency-free. All journal data lives in IndexedDB. */
const DB_NAME = 'dayfold-private-v1';
const STORAGE_KEY = 'journal';
const ONE_HOUR = 3600000;
const ONE_DAY = 86400000;
const COLORS = ['#4B82C3','#7CA6D8','#4A916B','#8BAF7E','#D89F58','#BC8B9F','#807CAC','#779A9B','#CF7A68','#839299','#536EA6','#9E8B6D'];
const DEFAULT_PERIODS = [
  {id:'night',name:'Night',start:'22:00',end:'07:00'},
  {id:'morning',name:'Morning',start:'07:00',end:'12:00'},
  {id:'postlunch',name:'Post-lunch',start:'12:00',end:'15:00'},
  {id:'afternoon',name:'Afternoon',start:'15:00',end:'18:00'},
  {id:'evening',name:'Evening',start:'18:00',end:'22:00'}
];
const viewTitles = {journal:'Journal',insights:'Insights',labels:'Labels & tags',settings:'Settings'};
const ui = {view:'journal',journalDate:localYMD(new Date()),statsAnchor:localYMD(new Date()),period:'week',customStart:localYMD(new Date()),customEnd:localYMD(new Date()),focus:'all',breakdown:'main',denom:'shown',timePeriod:'all',tagFilter:'all',hidden:new Set(),advanced:false,showArchived:false,searchOpen:false,searchTerm:''};
let state;
let db;
let storageOK = true;
let toastTimer;

function uid() {return globalThis.crypto?.randomUUID?.() || 'id_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);}
function seed() {
  const study=uid(),sleep=uid(),leisure=uid(),meals=uid(),movement=uid(),work=uid();
  return {schema:1,labels:[
    {id:study,name:'Study',parentId:null,color:'#4B82C3',archived:false},
    {id:uid(),name:'Exercises',parentId:study,color:'#3472BD',archived:false},
    {id:uid(),name:'Classes',parentId:study,color:'#7CA6D8',archived:false},
    {id:uid(),name:'Independent study',parentId:study,color:'#B0CAE7',archived:false},
    {id:sleep,name:'Sleep',parentId:null,color:'#807CAC',archived:false},
    {id:leisure,name:'Leisure',parentId:null,color:'#D89F58',archived:false},
    {id:meals,name:'Meals',parentId:null,color:'#CF7A68',archived:false},
    {id:movement,name:'Exercise / movement',parentId:null,color:'#4A916B',archived:false},
    {id:work,name:'Work',parentId:null,color:'#779A9B',archived:false}
  ],tags:[{id:uid(),name:'Music',archived:false},{id:uid(),name:'YouTube',archived:false}],entries:[],settings:{periods:structuredClone(DEFAULT_PERIODS)}};
}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('data'))req.result.createObjectStore('data');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function readDB(){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readonly');const req=tx.objectStore('data').get(STORAGE_KEY);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function writeDB(snapshot){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(snapshot,STORAGE_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function commit(mutator, successText){
  const next=structuredClone(state);
  mutator(next);
  try {await writeDB(next); state=next; render(); if(successText) toast(successText); return true;}
  catch(e){toast('Saving failed. Your previous data is unchanged.');console.error('Storage error:',e);return false;}
}
function esc(v=''){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeColor(c){return /^#[0-9a-fA-F]{6}$/.test(c)?c:'#879C92';}
function localYMD(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dateFromYMD(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);}
function addDays(d,n){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);}
function formatTime(ms){return new Date(ms).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false});}
function formatDate(ms,opts={weekday:'long',month:'long',day:'numeric',year:'numeric'}){return new Date(ms).toLocaleDateString(undefined,opts);}
function dateTimeLocal(ms){const d=new Date(ms);return `${localYMD(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function mins(s){if(!/^\d{2}:\d{2}$/.test(s))return NaN;const [h,m]=s.split(':').map(Number);return h<24&&m<60?h*60+m:NaN;}
function labelById(id){return state.labels.find(x=>x.id===id);}
function tagById(id){return state.tags.find(x=>x.id===id);}
function rootLabel(id){let x=labelById(id);if(!x)return null;return x.parentId?labelById(x.parentId)||x:x;}
function labelPath(id){const x=labelById(id);if(!x)return 'Unknown label';const p=x.parentId?labelById(x.parentId):null;return p?`${p.name} / ${x.name}`:x.name;}
function isWithinLabel(id,focus){if(focus==='all')return true;const x=labelById(id);return !!x&&(x.id===focus||x.parentId===focus);}
function duration(ms){const m=Math.round(ms/60000);if(m<60)return `${m} min`;const h=Math.floor(m/60),r=m%60;return r?`${h} h ${r} min`:`${h} h`;}
function hoursNumber(hours){return Number(hours.toFixed(1)).toLocaleString(undefined,{maximumFractionDigits:1});}
function percentage(n,d){return d>0?`${(n*100/d).toFixed(1).replace(/\.0$/,'')}%`:'—';}
function monthDay(d){return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});}
function sortedEntries(){return [...state.entries].sort((a,b)=>a.start-b.start);}
function toast(message){const t=document.querySelector('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3000);}
function setView(v){if(!viewTitles[v])return;ui.view=v;render();window.scrollTo({top:0});}
function updateNav(){document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===ui.view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});}
function heading(name,description,action=''){return `<div class="page-top"><div><div class="eyebrow">DAYFOLD / ${esc(name)}</div><h1>${esc(name)}</h1>${description?`<div class="page-desc">${description}</div>`:''}</div>${action}</div>`;}
function cardMetric(title,value,detail=''){return `<div class="card stat-card"><div class="stat-caption">${title}</div><div class="stat-number">${value}</div><div class="stat-detail">${detail}</div></div>`;}
function options(rows,selected){return rows.map(([value,name])=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(name)}</option>`).join('');}
function activeLabels(){return state.labels.filter(x=>!x.archived&&!x.parentId||!x.archived&&(!labelById(x.parentId)?.archived));}
function labelOptions(includeArchivedId=null){return state.labels.filter(l=>!l.archived&&!labelById(l.parentId)?.archived ||l.id===includeArchivedId).sort((a,b)=>{if(a.parentId===b.id)return 1;if(b.parentId===a.id)return -1;const an=rootLabel(a.id)?.name||a.name,bn=rootLabel(b.id)?.name||b.name;return an.localeCompare(bn)||Number(!!a.parentId)-Number(!!b.parentId)||a.name.localeCompare(b.name)}).map(l=>`<option value="${esc(l.id)}">${esc(l.parentId?'　↳ '+l.name:l.name)}</option>`).join('');}

function render(){updateNav();const el=document.querySelector('#app-content');if(ui.view==='journal')el.innerHTML=renderJournal();if(ui.view==='insights')el.innerHTML=renderInsights();if(ui.view==='labels')el.innerHTML=renderLabels();if(ui.view==='settings')el.innerHTML=renderSettings();}

function journalDayEntries(){const start=dateFromYMD(ui.journalDate).getTime(),end=addDays(dateFromYMD(ui.journalDate),1).getTime();return sortedEntries().filter(x=>x.start<end&&x.end>start).map(x=>({...x,shownStart:Math.max(x.start,start),shownEnd:Math.min(x.end,end)}));}
function renderJournal(){
  const day=dateFromYMD(ui.journalDate),dayStart=day.getTime(),dayEnd=addDays(day,1).getTime();
  const entries=journalDayEntries();const recorded=entries.reduce((s,x)=>s+x.shownEnd-x.shownStart,0);
  const roots=new Map();for(const e of entries){const r=rootLabel(e.labelId);if(r)roots.set(r.id,(roots.get(r.id)||0)+(e.shownEnd-e.shownStart));}
  const top=[...roots].sort((a,b)=>b[1]-a[1]).slice(0,5);
  let prev=dayStart;let blocks='';
  for(const e of entries){if(e.shownStart>prev)blocks+=gapBlock(prev,e.shownStart);blocks+=entryBlock(e);prev=Math.max(prev,e.shownEnd);}
  const isToday=ui.journalDate===localYMD(new Date());
  if(prev<dayEnd){
    const now=Date.now();
    if(isToday&&now<dayEnd){
      if(prev<now)blocks+=gapBlock(prev,now);
      if(Math.max(prev,now)<dayEnd)blocks+=`<div class="time-block"><div class="time-stamp">${formatTime(Math.max(prev,now))}</div><div class="timeline-track"><div class="gap-block" style="border-style:solid;opacity:.6"><span>Later today</span></div></div></div>`;
    }else blocks+=gapBlock(prev,dayEnd);
  }
  return `<div class="page">${heading('Journal','Record your day when convenient. No timer or continuous tracking required.','<button class="btn primary" data-action="add-entry">＋ Add activity</button>')}
    <div class="card toolbar-card"><div class="date-nav"><button class="btn icon-only" aria-label="Previous day" data-action="prev-day">‹</button><div class="date-display"><div>${esc(day.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'}))}</div><input class="jump-date" type="date" data-filter="journalDate" aria-label="Jump to a date" value="${esc(ui.journalDate)}"></div><button class="btn icon-only" aria-label="Next day" data-action="next-day">›</button></div>${isToday?'<span class="soft-badge">Today</span>':'<button class="btn mini" data-action="today">Go to today</button>'}</div>
    <div class="grid-3 mb-18">${cardMetric('Recorded',duration(recorded), 'Of this day')}${cardMetric('Activities',`${entries.length}`,'Intervals on this day')}${cardMetric('Different labels',`${roots.size}`,'Main categories used')}</div>
    <div class="two-area"><section class="card"><div class="display-flex space-between"><div><h2 class="section-title">Daily timeline</h2><div class="section-sub">Tap a record to edit; tap a gap to fill it.</div></div><span class="soft-badge">00:00–24:00</span></div><div class="timeline">${blocks}</div></section>
    <aside><div class="card mb-18"><h2 class="section-title">Activity summary</h2><div class="section-sub">Based only on entries you recorded.</div><div style="margin-top:14px">${top.length?top.map(([id,ms])=>{const l=labelById(id);return `<div class="info-line"><span class="legend-name"><i class="dot" style="background:${safeColor(l?.color)}"></i><span>${esc(l?.name)}</span></span><strong>${duration(ms)}</strong></div>`}).join(''):'<div class="empty-state">No activity recorded yet for this date.</div>'}</div></div>
    <div class="card mb-18"><div class="display-flex space-between"><h2 class="section-title">Find past records</h2><button class="btn mini" data-action="toggle-search">${ui.searchOpen?'Hide':'Search'}</button></div>${ui.searchOpen?`<div class="field mt-16"><input type="search" id="journal-search" value="${esc(ui.searchTerm)}" placeholder="Notes, labels, tags…" aria-label="Search past activity records"></div><div id="journal-search-results">${renderSearchResults()}</div>`:''}</div>
    <div class="card quick-card"><h3>Record at your pace</h3><p>Start and end times are editable. Missing time is left unrecorded—not assigned to an activity automatically.</p><button class="btn mini" data-action="add-entry">＋ New interval</button></div></aside></div></div>`;
}
function renderSearchResults(){
 const query=ui.searchTerm.toLowerCase().trim();
 if(!query)return '<div class="hint mt-16">Search across past descriptions, activity labels, and secondary tags.</div>';
 const results=sortedEntries().reverse().filter(e=>[labelPath(e.labelId),e.note,...e.tags.map(id=>tagById(id)?.name||'')].join(' ').toLowerCase().includes(query));
 if(!results.length)return '<div class="hint mt-16">No matching activity records.</div>';
 return `<div class="compact-list mt-16">${results.slice(0,30).map(e=>`<button class="search-result" data-action="jump-to-entry" data-id="${esc(e.id)}"><strong>${esc(labelPath(e.labelId))}</strong><span class="muted tiny">${esc(monthDay(new Date(e.start)))} · ${formatTime(e.start)} · ${duration(e.end-e.start)}</span>${e.note?`<span class="small muted">${esc(e.note.slice(0,120))}</span>`:''}</button>`).join('')}</div>${results.length>30?`<div class="hint mt-16">Showing 30 of ${results.length} matches.</div>`:''}`;
}
function gapBlock(a,b){return `<div class="time-block"><div class="time-stamp">${formatTime(a)}</div><div class="timeline-track"><button class="gap-block" data-action="gap-entry" data-start="${a}" data-end="${b}"><span>Unrecorded · ${duration(b-a)}</span><span>＋ Fill</span></button></div></div>`;}
function entryBlock(e){const l=labelById(e.labelId);const tagNames=(e.tags||[]).map(id=>tagById(id)?.name).filter(Boolean);return `<div class="time-block"><div class="time-stamp">${formatTime(e.shownStart)}</div><div class="timeline-track"><button class="activity-block" data-action="edit-entry" data-id="${esc(e.id)}" style="--cat-color:${safeColor(l?.color)}"><div style="min-width:0"><div class="activity-title">${esc(labelPath(e.labelId))}</div>${e.note?`<div class="activity-note">${esc(e.note)}</div>`:''}${tagNames.length?`<div>${tagNames.map(n=>`<span class="tag-pill">${esc(n)}</span>`).join('')}</div>`:''}</div><div class="activity-right"><div class="duration">${duration(e.shownEnd-e.shownStart)}</div><div class="activity-end">${formatTime(e.shownEnd)}</div></div></button></div></div>`;}

function periodRange(){
  const d=dateFromYMD(ui.statsAnchor);let start,end,description;
  if(ui.period==='day'){start=d;end=addDays(d,1);description=monthDay(d);}
  else if(ui.period==='week'){start=addDays(d,-(d.getDay()+6)%7);end=addDays(start,7);description=`${monthDay(start)} – ${monthDay(addDays(end,-1))}`;}
  else if(ui.period==='month'){start=new Date(d.getFullYear(),d.getMonth(),1);end=new Date(d.getFullYear(),d.getMonth()+1,1);description=start.toLocaleDateString(undefined,{month:'long',year:'numeric'});}
  else if(ui.period==='year'){start=new Date(d.getFullYear(),0,1);end=new Date(d.getFullYear()+1,0,1);description=String(d.getFullYear());}
  else if(ui.period==='custom'){start=dateFromYMD(ui.customStart);end=addDays(dateFromYMD(ui.customEnd),1);description=`${monthDay(start)} – ${monthDay(addDays(end,-1))}`;}
  else {const first=state.entries.reduce((m,x)=>Math.min(m,x.start),Date.now());start=dateFromYMD(localYMD(new Date(first)));end=addDays(dateFromYMD(localYMD(new Date())),1);description='Since first record';}
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)return {start:0,end:0,description:'Invalid dates'};
  return {start:start.getTime(),end:end.getTime(),description};
}
function periodWindows(start,end,timePeriod){
  if(end<=start)return [];
  if(timePeriod==='all')return [[start,end]];
  const period=state.settings.periods.find(x=>x.id===timePeriod);if(!period)return [[start,end]];
  const s=mins(period.start),e=mins(period.end);if(!Number.isFinite(s)||!Number.isFinite(e))return [[start,end]];
  const windows=[];let d=addDays(new Date(start),-1);const limit=addDays(new Date(end),1);
  while(d<limit){const a=new Date(d.getFullYear(),d.getMonth(),d.getDate(),Math.floor(s/60),s%60).getTime();const bDay=e<=s?addDays(d,1):d;const b=new Date(bDay.getFullYear(),bDay.getMonth(),bDay.getDate(),Math.floor(e/60),e%60).getTime();if(b>start&&a<end)windows.push([Math.max(a,start),Math.min(b,end)]);d=addDays(d,1);}
  windows.sort((a,b)=>a[0]-b[0]);const merged=[];
  for(const win of windows){if(!merged.length||win[0]>merged.at(-1)[1])merged.push([...win]);else merged.at(-1)[1]=Math.max(merged.at(-1)[1],win[1]);}
  return merged;
}
function segmentByDay(a,b,labelId,tags){const res=[];let cursor=a;while(cursor<b){const dt=new Date(cursor);const next=addDays(dt,1).getTime();const stop=Math.min(next,b);if(stop<=cursor)break;res.push({start:cursor,end:stop,hours:(stop-cursor)/ONE_HOUR,labelId,tags});cursor=stop;}return res;}
function segmentsFromEntries(entries,windows){if(!windows.length)return [];const pieces=[];
  for(const en of entries){let low=0,high=windows.length;while(low<high){const mid=(low+high)>>1;if(windows[mid][1]<=en.start)low=mid+1;else high=mid;}
    for(let i=low;i<windows.length&&windows[i][0]<en.end;i++){const a=Math.max(en.start,windows[i][0]),b=Math.min(en.end,windows[i][1]);if(b>a)pieces.push(...segmentByDay(a,b,en.labelId,en.tags||[]));}}
  return pieces;
}
function bucketFor(labelId,breakdown){const l=labelById(labelId);if(!l)return {key:'missing',name:'Unknown',color:'#9da9a0'};if(breakdown==='main'){const r=rootLabel(labelId)||l;return {key:'root:'+r.id,name:r.name,color:safeColor(r.color)};}if(l.parentId)return {key:'label:'+l.id,name:l.name,color:safeColor(l.color)};return {key:'direct:'+l.id,name:`${l.name} (unspecified)`,color:safeColor(l.color)};}
function collectStats(){
 const range=periodRange(),end=Math.min(range.end,Date.now());const windows=periodWindows(range.start,Math.max(range.start,end),ui.timePeriod);
 const all=segmentsFromEntries(state.entries,windows);
 const focus=all.filter(s=>isWithinLabel(s.labelId,ui.focus));
 const filtered=focus.filter(s=>ui.tagFilter==='all'||s.tags.includes(ui.tagFilter));
 const buckets=new Map();
 for(const s of filtered){const b=bucketFor(s.labelId,ui.breakdown);const existing=buckets.get(b.key)||{...b,hours:0};existing.hours+=s.hours;buckets.set(b.key,existing);}
 const allBuckets=[...buckets.values()].sort((a,b)=>b.hours-a.hours||a.name.localeCompare(b.name));
 const visibleBuckets=allBuckets.filter(x=>!ui.hidden.has(x.key));
 const visibleKeys=new Set(visibleBuckets.map(x=>x.key));
 const visible=filtered.filter(x=>visibleKeys.has(bucketFor(x.labelId,ui.breakdown).key));
 const sum=a=>a.reduce((s,x)=>s+x.hours,0);
 const shownH=sum(visible),focusH=sum(focus),allH=sum(all),elapsedH=windows.reduce((s,[a,b])=>s+(b-a)/ONE_HOUR,0);
 const denomH={shown:shownH,focus:focusH,recorded:allH,elapsed:elapsedH}[ui.denom]??shownH;
 const usedTags=state.tags.filter(t=>focus.some(s=>s.tags.includes(t.id))).map(tag=>({...tag,hours:sum(focus.filter(x=>x.tags.includes(tag.id)))})).sort((a,b)=>b.hours-a.hours);
 return {range,windows,all,focus,filtered,visible,allBuckets,visibleBuckets,shownH,focusH,allH,elapsedH,denomH,usedTags};
}
function ringGradient(stat){
 if(stat.denomH<=0)return '#eef1ed';
 let value=0;const segments=[];
 for(const b of stat.visibleBuckets){const pct=Math.min(100-value,b.hours/stat.denomH*100);if(pct>0.00001){segments.push(`${b.color} ${value.toFixed(4)}% ${(value+pct).toFixed(4)}%`);value+=pct;}}
 if(value<99.999)segments.push(`#edf0ed ${value.toFixed(4)}% 100%`);
 return `conic-gradient(${segments.join(',')})`;
}
function makeHistogram(st){
 const range=st.range;let group,makeKey,makeLabel;
 const days=(range.end-range.start)/ONE_DAY;
 if(ui.period==='day'||ui.period==='week'||(ui.period==='custom'&&days<=16)){group='day';makeKey=d=>localYMD(d);makeLabel=d=>`${d.getDate()} ${d.toLocaleDateString(undefined,{month:'short'})}`;}
 else if(ui.period==='month'||(ui.period==='custom'&&days<=90)){group='week';makeKey=d=>{const monday=addDays(d,-(d.getDay()+6)%7);return localYMD(monday);};makeLabel=d=>monthDay(d);}
 else if(ui.period==='all'&&days>900){group='year';makeKey=d=>`${d.getFullYear()}`;makeLabel=d=>`${d.getFullYear()}`;}
 else{group='month';makeKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;makeLabel=d=>d.toLocaleDateString(undefined,{month:'short'});}
 const bars=new Map();const end=Math.min(range.end,Date.now());
 let cursor=dateFromYMD(localYMD(new Date(range.start)));
 if(group==='week')cursor=addDays(cursor,-(cursor.getDay()+6)%7);
 if(group==='month')cursor=new Date(cursor.getFullYear(),cursor.getMonth(),1);
 if(group==='year')cursor=new Date(cursor.getFullYear(),0,1);
 let guard=0;
 while(cursor.getTime()<end&&guard++<60){const key=makeKey(cursor);if(!bars.has(key))bars.set(key,{key,label:makeLabel(cursor),values:new Map(),hours:0});
  if(group==='day')cursor=addDays(cursor,1);
  else if(group==='week')cursor=addDays(cursor,7);
  else if(group==='month')cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1);
  else cursor=new Date(cursor.getFullYear()+1,0,1);
 }
 if(cursor.getTime()<end)return '<div class="empty-state">This range contains too many groups for the chart. Choose a shorter range.</div>';
 for(const s of st.visible){const d=new Date(s.start),key=makeKey(d),bar=bars.get(key);if(!bar)continue;const bucket=bucketFor(s.labelId,ui.breakdown);bar.values.set(bucket.key,(bar.values.get(bucket.key)||0)+s.hours);bar.hours+=s.hours;}
 const ordered=[...bars.values()];if(ordered.length>55)return '<div class="empty-state">This range contains too many groups for the chart. Choose a shorter date range.</div>';
 const max=Math.max(1,...ordered.map(b=>b.hours));const colors=new Map(st.visibleBuckets.map(x=>[x.key,x.color]));
 return `<div class="hist-chart" role="img" aria-label="Recorded activity hours by ${group}">${ordered.map(b=>{const px=Math.max(0,174*b.hours/max);const inner=[...b.values.entries()].map(([key,value])=>`<div class="hist-segment" style="height:${100*value/Math.max(b.hours,.001)}%;background:${colors.get(key)||'#9da9a0'}"></div>`).join('');return `<div class="hist-col" title="${esc(b.label)}: ${hoursNumber(b.hours)} hours"><span class="hist-top">${b.hours?hoursNumber(b.hours):''}</span><div class="hist-stack-wrap">${b.hours?`<div class="hist-stack" style="height:${Math.max(px,2)}px">${inner}</div>`:'<div class="hist-empty"></div>'}</div><span class="hist-label">${esc(b.label)}</span></div>`}).join('')}</div>`;
}
function renderInsights(){
 const st=collectStats(),active=state.labels;
 const currentFocus=labelById(ui.focus);
 const denomNames={shown:'Shown activities',focus:'Focused activity (before filters)',recorded:'All recorded time',elapsed:'Elapsed clock time'};
 return `<div class="page">${heading('Insights','Explore where your recorded time goes. By default, unrecorded time is excluded.')}
 <section class="card filters-card"><div class="display-flex space-between mb-18"><h2 class="section-title">Choose what to analyze</h2><span class="soft-badge">${esc(st.range.description)}</span></div>
 ${!['all','custom'].includes(ui.period)?`<div class="display-flex space-between mb-18"><div class="date-nav"><button class="btn icon-only mini" data-action="prev-stats-period" aria-label="Previous period">‹</button><div class="field"><label for="stats-anchor">Period containing date</label><input type="date" id="stats-anchor" data-filter="statsAnchor" value="${esc(ui.statsAnchor)}"></div><button class="btn icon-only mini" data-action="next-stats-period" aria-label="Next period">›</button></div><button class="btn mini" data-action="today-stats">Current</button></div>`:''}
 <div class="filter-layout">
  <div class="field"><label for="stat-period">Date range</label><select id="stat-period" data-filter="period">${options([['day','Day'],['week','Week'],['month','Month'],['year','Year'],['all','All time'],['custom','Custom dates']],ui.period)}</select></div>
  <div class="field"><label for="stat-focus">Focus</label><select id="stat-focus" data-filter="focus"><option value="all">All activities</option>${active.map(l=>`<option value="${esc(l.id)}" ${ui.focus===l.id?'selected':''}>${esc(l.parentId?'↳ '+l.name:l.name)}${l.archived?' (archived)':''}</option>`).join('')}</select></div>
  <div class="field"><label for="stat-breakdown">Group by</label><select id="stat-breakdown" data-filter="breakdown">${options([['main','Main labels'],['detail','Individual sublabels']],ui.breakdown)}</select></div>
  <div class="field"><label for="stat-denom">Percentage of</label><select id="stat-denom" data-filter="denom">${options(Object.entries(denomNames),ui.denom)}</select></div>
 </div>
 ${ui.period==='custom'?`<div class="date-custom"><div class="field"><label for="custom-start">From</label><input type="date" id="custom-start" data-filter="customStart" value="${esc(ui.customStart)}"></div><div class="field"><label for="custom-end">To (inclusive)</label><input type="date" id="custom-end" data-filter="customEnd" value="${esc(ui.customEnd)}"></div></div>`:''}
 <div class="filter-actions"><button class="advanced-toggle" data-action="toggle-advanced">${ui.advanced?'▾ Hide additional filters':'▸ Time-of-day & secondary tag filters'}</button><button class="btn mini" data-action="reset-stats">Reset filters</button></div>
 ${ui.advanced?`<div class="advanced-panel"><div class="grid-2"><div class="field"><label for="stat-daypart">Time of day</label><select id="stat-daypart" data-filter="timePeriod"><option value="all">Entire day</option>${state.settings.periods.map(p=>`<option value="${esc(p.id)}" ${ui.timePeriod===p.id?'selected':''}>${esc(p.name)} (${esc(p.start)}–${esc(p.end)})</option>`).join('')}</select></div><div class="field"><label for="stat-tag">Only records tagged with</label><select id="stat-tag" data-filter="tagFilter"><option value="all">Any / no secondary tag</option>${state.tags.filter(t=>!t.archived).map(t=>`<option value="${esc(t.id)}" ${ui.tagFilter===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div></div><p class="form-note">Time-of-day filters split intervals automatically. Tag filters include the full interval carrying that tag.</p></div>`:''}</section>
 <div class="grid-3 mb-18">${cardMetric('Time shown',`${hoursNumber(st.shownH)} h`,'After selected filters')}${cardMetric('Focus total',`${hoursNumber(st.focusH)} h`,'Before tag and visibility filters')}${cardMetric('Denominator',`${hoursNumber(st.denomH)} h`,denomNames[ui.denom])}</div>
 <div class="grid-2 mb-18"><section class="card chart-card"><div class="display-flex space-between"><h2 class="section-title">Activity distribution</h2><span class="soft-badge">${esc(denomNames[ui.denom])}</span></div><div class="section-sub">Tap categories below to include or exclude them.</div>
  ${st.visibleBuckets.length&&st.denomH?`<div class="chart-wrap"><div class="donut" role="img" aria-label="Activity percentage doughnut chart" style="background:${ringGradient(st)}"><div class="donut-center"><div class="donut-main">${hoursNumber(st.shownH)} h</div><div class="donut-sub">shown time</div></div></div><div class="chart-key">${st.visibleBuckets.map(b=>`<div class="info-line"><span class="legend-name"><i class="dot" style="background:${b.color}"></i><span>${esc(b.name)}</span></span><strong>${percentage(b.hours,st.denomH)}</strong></div>`).join('')}${st.denomH>st.shownH+.0001?`<div class="info-line"><span class="legend-name"><i class="dot" style="background:#edf0ed"></i><span>Outside selection</span></span><strong>${percentage(st.denomH-st.shownH,st.denomH)}</strong></div>`:''}</div></div>`:`<div class="empty-state"><div class="empty-symbol">◌</div>No matching activity recorded for this selection.</div>`}
  <div class="chart-footer"><div class="small-head">Include / exclude from this chart</div><div class="checkbox-row">${st.allBuckets.length?st.allBuckets.map(b=>`<label class="check-chip"><input type="checkbox" data-bucket="${esc(b.key)}" ${ui.hidden.has(b.key)?'':'checked'}><span class="label-dot" style="background:${b.color}"></span>${esc(b.name)}</label>`).join(''):'<span class="hint">No categories in the selected period.</span>'}</div></div>
 </section><section class="card chart-card"><h2 class="section-title">Activity over time</h2><div class="section-sub">Stacked recorded hours, using the same category and time filters.</div>${makeHistogram(st)}<div class="hint">Bar height represents hours, not percent of the calendar period.</div></section></div>
 <section class="card"><div class="display-flex space-between"><div><h2 class="section-title">Secondary tags</h2><div class="section-sub">Percentage of ${esc(currentFocus?.name||'recorded time')} that included each tag. Tags may overlap.</div></div><span class="soft-badge">Optional</span></div><div class="mt-16">${st.usedTags.length?st.usedTags.map(t=>`<div class="info-line"><span>${esc(t.name)}</span><span><strong>${hoursNumber(t.hours)} h</strong> <span class="muted small"> · ${percentage(t.hours,st.focusH)}</span></span></div>`).join(''):'<div class="empty-state">No secondary tags were used within this focus and date/time range.</div>'}</div><div class="hint mt-16">Tags count only when attached to a record; their hours never increase the total recorded time.</div></section>
 </div>`;
}

function renderLabels(){
 const roots=state.labels.filter(x=>!x.parentId&&(ui.showArchived||!x.archived));
 const labelsHtml=roots.map(p=>{const children=state.labels.filter(x=>x.parentId===p.id&&(ui.showArchived||!x.archived));return `<div class="label-group"><div class="label-row ${p.archived?'label-archived':''}"><div class="color-row"><span class="label-dot" style="background:${safeColor(p.color)}"></span><span class="label-title">${esc(p.name)}</span>${p.archived?'<span class="group-badge">Archived</span>':''}</div><div class="btnrow"><button class="btn mini" data-action="new-child" data-id="${esc(p.id)}" ${p.archived?'disabled':''}>＋ Sublabel</button><button class="btn mini" data-action="edit-label" data-id="${esc(p.id)}">Edit</button></div></div>${children.length?`<div class="label-children">${children.map(c=>`<div class="label-row ${c.archived?'label-archived':''}"><div class="color-row"><span class="label-dot" style="background:${safeColor(c.color)}"></span><span class="small">${esc(c.name)}</span>${c.archived?'<span class="group-badge">Archived</span>':''}</div><button class="btn mini" data-action="edit-label" data-id="${esc(c.id)}">Edit</button></div>`).join('')}</div>`:''}</div>`}).join('');
 const tags=state.tags.filter(x=>ui.showArchived||!x.archived);
 return `<div class="page">${heading('Labels & tags','Set up your categories once, then use them for every activity. You can always rename or archive them.','<button class="btn primary" data-action="new-label">＋ New label</button>')}
 <div class="grid-2"><section class="card"><div class="display-flex space-between mb-18"><h2 class="section-title">Primary labels</h2><span class="soft-badge">Two levels</span></div>${labelsHtml||'<div class="empty-state">No labels yet. Add a main label to start.</div>'}<div class="hint mt-16">You may log directly under a main label without choosing a sublabel. Old records follow renamed labels automatically.</div></section>
 <section><div class="card mb-18"><div class="display-flex space-between mb-18"><h2 class="section-title">Secondary tags</h2><button class="btn mini" data-action="new-tag">＋ New tag</button></div><div class="compact-list">${tags.map(t=>`<div class="display-flex space-between item"><span>${esc(t.name)} ${t.archived?'<span class="group-badge">Archived</span>':''}</span><button class="btn mini" data-action="edit-tag" data-id="${esc(t.id)}">Edit</button></div>`).join('')||'<div class="empty-state">No tags configured.</div>'}</div><div class="hint mt-16">A tag describes something happening alongside an activity, such as listening to music. It does not add extra recorded hours.</div></div>
 <div class="card"><h2 class="section-title">Historical records stay intact</h2><p class="hint">Archiving hides a label from new entries but keeps existing records and statistics. Deleting is only possible for unused labels and tags.</p><label class="check-chip"><input type="checkbox" data-setting="showArchived" ${ui.showArchived?'checked':''}>Show archived labels and tags</label></div></section></div></div>`;
}
function renderSettings(){const periods=state.settings.periods;return `<div class="page">${heading('Settings','Your journal stays on this device unless you choose to export it.')}
 <div class="settings-grid"><section class="card"><h2 class="section-title">Daily time periods</h2><div class="section-sub">Customize the time-of-day filter. The five periods must cover the entire 24-hour clock without overlap.</div><form id="periods-form"><div class="period-line period-head"><span>Period</span><span>Starts</span><span>Ends</span></div>${periods.map((p,i)=>`<div class="period-line"><input type="text" name="name${i}" maxlength="40" aria-label="Name of period ${i+1}" value="${esc(p.name)}" required><input type="time" name="start${i}" aria-label="Start of ${esc(p.name)}" value="${esc(p.start)}" required><input type="time" name="end${i}" aria-label="End of ${esc(p.name)}" value="${esc(p.end)}" required></div>`).join('')}<p class="form-note">A period can cross midnight, e.g. Night 22:00–07:00.</p><div class="form-error" id="period-error"></div><div class="btnrow"><button class="btn primary" type="submit">Save periods</button><button class="btn" type="button" data-action="reset-periods">Use defaults</button></div></form></section>
 <section class="card"><h2 class="section-title">Backups and exports</h2><div class="section-sub">The complete backup preserves entries, colors, labels, tags, and settings. CSV exports are meant for analysis.</div><div class="compact-list mt-20"><button class="btn w-100" data-action="backup">↓ Export complete JSON backup</button><button class="btn w-100" data-action="csv">↓ Export activity CSV</button><label class="file-upload"><input type="file" accept=".json,application/json" id="restore-file" aria-label="Restore JSON backup"><span class="btn w-100">↑ Restore JSON backup</span></label></div><div class="callout mt-16">Keep a copy of your JSON backup outside the browser, especially before resetting your phone or clearing browsing data. Restoring replaces the current journal after confirmation.</div></section>
 <section class="card"><h2 class="section-title">Storage and privacy</h2><div class="key-value"><span>Activity data</span><strong>On this device</strong></div><div class="key-value"><span>Accounts and analytics</span><strong>None</strong></div><div class="key-value"><span>Internet needed to log</span><strong>No</strong></div><div class="key-value"><span>Records</span><strong>${state.entries.length}</strong></div><div class="key-value"><span>Browser database</span><strong>${storageOK?'Available':'Unavailable'}</strong></div><div class="btnrow mt-16"><button class="btn" data-action="persist">Request persistent storage</button><button class="btn" data-action="check-storage">Check storage status</button></div><p class="form-note" id="persist-status">Browser storage can be removed when you clear this site's data. Export backups regularly.</p></section>
 <section class="card"><h2 class="section-title">About Dayfold</h2><p class="hint">Dayfold is a self-contained, offline-capable activity journal. No accounts, ads, telemetry, network APIs, or external libraries are used. After the initial installation and caching of application files, you can record and analyze activities offline.</p><div class="callout">For installation as a phone app, these files must first be served from an HTTPS address (or localhost). A downloaded HTML file alone cannot install a service worker.</div><div class="btnrow mt-16"><button class="btn" data-action="install">Install app</button></div><p class="form-note">If installation does not appear, use your Android browser's menu → Install app or Add to Home screen.</p></section></div></div>`;}

function closeModal(){document.querySelector('#modal-root').innerHTML='';}
function showModal(html){document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;const first=document.querySelector('.modal input:not([type=hidden]),.modal select');first?.focus();}
function modalHeader(title){return `<div class="modal-head"><h2>${esc(title)}</h2><button class="btn icon-only mini" data-action="close-modal" aria-label="Close">×</button></div>`;}
function openEntryModal(existing=null,suggest=null){
 const current=state.entries.find(x=>x.id===existing);const date=dateFromYMD(ui.journalDate),startDay=date.getTime();
 let start,end;
 if(current){start=current.start;end=current.end;}
 else if(suggest){start=suggest.start;end=suggest.end;}
 else {
   const dayEntries=journalDayEntries();const latest=dayEntries.length?Math.max(...dayEntries.map(x=>x.shownEnd)):startDay;
   const now=Date.now(),dayEnd=addDays(date,1).getTime();
   if(latest>startDay&&latest<dayEnd){start=latest;end=Math.min(dayEnd,Math.max(start+30*60000,ui.journalDate===localYMD(new Date())?now:start+ONE_HOUR));}
   else {end=ui.journalDate===localYMD(new Date())?Math.floor(now/300000)*300000:Math.min(dayEnd,startDay+10*ONE_HOUR);start=Math.max(startDay,end-ONE_HOUR);}
   if(end<=start)end=start+ONE_HOUR;
 }
 const available=state.labels.filter(l=>!l.archived&&!labelById(l.parentId)?.archived);
 if(!available.length){toast('Create a label before recording an activity.');setView('labels');return;}
 const currentLabel=current?.labelId||available[0].id;
 showModal(`${modalHeader(current?'Edit activity':'Add activity')}<form id="entry-form" class="modal-fields">
  <div class="form-row"><div class="field"><label for="entry-start">Start</label><input id="entry-start" type="datetime-local" name="start" value="${dateTimeLocal(start)}" required></div><div class="field"><label for="entry-end">End</label><input id="entry-end" type="datetime-local" name="end" value="${dateTimeLocal(end)}" required></div></div>
  <div class="field"><label for="entry-label">Primary activity</label><select id="entry-label" name="label" required>${labelOptions(currentLabel)}</select><div class="form-note">Choosing a main label without a sublabel is fine.</div></div>
  <div class="field"><label for="entry-note">Optional description</label><textarea id="entry-note" name="note" maxlength="4000" placeholder="What did you do?">${esc(current?.note||'')}</textarea></div>
  <div class="field"><span class="field-label">Secondary tags (optional)</span><div class="tag-selector">${state.tags.filter(t=>!t.archived||current?.tags?.includes(t.id)).map(t=>`<label class="tag-option"><input type="checkbox" name="tag" value="${esc(t.id)}" ${current?.tags?.includes(t.id)?'checked':''}> ${esc(t.name)}</label>`).join('')||'<span class="hint">Create tags in Labels & tags if you need them.</span>'}</div><div class="form-note">Each tag applies to the entire interval; it never adds extra time.</div></div>
  <div class="form-error" id="entry-error"></div>
  <div class="modal-foot">${current?`<button class="btn danger push-left" type="button" data-action="delete-entry" data-id="${esc(current.id)}">Delete</button>`:'<span class="push-left"></span>'}<button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">${current?'Save changes':'Save activity'}</button></div>
 </form>`);
 document.querySelector('#entry-label').value=currentLabel;
 document.querySelector('#entry-form').dataset.existing=existing||'';
}
async function saveEntry(form){const f=new FormData(form);const start=Date.parse(String(f.get('start'))),end=Date.parse(String(f.get('end'))),id=form.dataset.existing;
 const labelId=String(f.get('label'));const note=String(f.get('note')||'').trim();const tags=f.getAll('tag').filter(tag=>state.tags.some(x=>x.id===tag));
 const error=document.querySelector('#entry-error');
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){error.textContent='End must be after start.';return;}
 if(end-start>72*ONE_HOUR){error.textContent='Please keep an individual interval under 72 hours.';return;}
 if(!labelById(labelId)){error.textContent='Please select a valid label.';return;}
 if(state.entries.some(x=>x.id!==id&&start<x.end&&end>x.start)){error.textContent='This interval overlaps an existing activity. Adjust the times or edit the existing interval.';return;}
 const record={id:id||uid(),start,end,labelId,note,tags};
 const ok=await commit(next=>{if(id){const i=next.entries.findIndex(x=>x.id===id);if(i<0)throw new Error('Entry not found');next.entries[i]=record;}else next.entries.push(record);},id?'Activity updated':'Activity saved');
 if(ok){ui.journalDate=localYMD(new Date(start));closeModal();render();}
}
function openLabelModal(id=null,parentId=null){const label=id?labelById(id):null;const parent=label?labelById(label.parentId):labelById(parentId);
 const archived=label?.archived;
 showModal(`${modalHeader(label?'Edit label':parent?'New sublabel':'New main label')}<form id="label-form" class="modal-fields">
 <div class="field"><label for="label-name">Label name</label><input id="label-name" name="name" maxlength="70" value="${esc(label?.name||'')}" placeholder="e.g. Study" required></div>
 <div class="field"><label for="label-parent">Parent</label><select name="parentId" id="label-parent"><option value="">None — main label</option>${state.labels.filter(x=>!x.parentId&&(!x.archived||x.id===label?.parentId)&&x.id!==id).map(x=>`<option value="${esc(x.id)}" ${x.id===(label?.parentId||parentId)?'selected':''}>${esc(x.name)}</option>`).join('')}</select><div class="form-note">Only two levels are used. Main labels can be recorded directly.</div></div>
 <div class="field"><span class="field-label">Color</span><div class="color-picker">${COLORS.map(c=>`<button type="button" class="color-option ${c===(label?.color||parent?.color||COLORS[0])?'selected':''}" data-action="pick-color" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div><input type="hidden" name="color" id="label-color" value="${safeColor(label?.color||parent?.color||COLORS[0])}"></div>
 <div class="form-error" id="label-error"></div>
 <div class="modal-foot">${label?`<button type="button" class="btn mini push-left" data-action="archive-label" data-id="${esc(id)}">${archived?'Unarchive':'Archive'}</button><button type="button" class="btn danger mini" data-action="delete-label" data-id="${esc(id)}">Delete</button>`:'<span class="push-left"></span>'}<button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn primary">Save label</button></div>
 </form>`);
 document.querySelector('#label-form').dataset.existing=id||'';
}
async function saveLabel(form){const f=new FormData(form);const id=form.dataset.existing;const name=String(f.get('name')||'').trim();const parentId=String(f.get('parentId')||'')||null;const color=safeColor(String(f.get('color')||''));const error=document.querySelector('#label-error');
 if(!name){error.textContent='Enter a name.';return;}
 if(parentId&&(parentId===id||!labelById(parentId)||labelById(parentId).parentId)){error.textContent='Choose a main label as parent.';return;}
 if(id&&parentId&&state.labels.some(x=>x.parentId===id)){error.textContent='Move or archive sublabels before making this a sublabel.';return;}
 if(state.labels.some(x=>x.id!==id&&x.parentId===parentId&&x.name.toLowerCase()===name.toLowerCase())){error.textContent='A label with that name already exists at this level.';return;}
 const ok=await commit(next=>{if(id){Object.assign(next.labels.find(x=>x.id===id),{name,parentId,color});}else next.labels.push({id:uid(),name,parentId,color,archived:false});},'Label saved');if(ok)closeModal();
}
function openTagModal(id=null){const tag=id?tagById(id):null;showModal(`${modalHeader(tag?'Edit secondary tag':'New secondary tag')}<form id="tag-form" class="modal-fields"><div class="field"><label for="tag-name">Tag name</label><input id="tag-name" name="name" maxlength="70" value="${esc(tag?.name||'')}" placeholder="e.g. Music" required></div><div class="form-error" id="tag-error"></div><div class="modal-foot">${tag?`<button class="btn mini push-left" type="button" data-action="archive-tag" data-id="${esc(id)}">${tag.archived?'Unarchive':'Archive'}</button><button class="btn danger mini" type="button" data-action="delete-tag" data-id="${esc(id)}">Delete</button>`:'<span class="push-left"></span>'}<button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Save tag</button></div></form>`);document.querySelector('#tag-form').dataset.existing=id||'';}
async function saveTag(form){const id=form.dataset.existing;const name=String(new FormData(form).get('name')||'').trim();const error=document.querySelector('#tag-error');if(!name){error.textContent='Enter a name.';return;}if(state.tags.some(x=>x.id!==id&&x.name.toLowerCase()===name.toLowerCase())){error.textContent='That tag already exists.';return;}
 const ok=await commit(next=>{if(id)next.tags.find(x=>x.id===id).name=name;else next.tags.push({id:uid(),name,archived:false});},'Tag saved');if(ok)closeModal();}
function validPeriods(periods){const covered=new Uint8Array(1440);for(const p of periods){const a=mins(p.start),b=mins(p.end);if(!p.name.trim()||!Number.isFinite(a)||!Number.isFinite(b)||a===b)return false;let t=a;do{covered[t]++;t=(t+1)%1440;}while(t!==b);}return covered.every(x=>x===1);}
async function savePeriods(form){const f=new FormData(form);const periods=state.settings.periods.map((p,i)=>({id:p.id,name:String(f.get('name'+i)||'').trim(),start:String(f.get('start'+i)||''),end:String(f.get('end'+i)||'')}));if(!validPeriods(periods)){document.querySelector('#period-error').textContent='Periods must be nonempty, nonoverlapping, and cover the entire day exactly once.';return;}await commit(s=>{s.settings.periods=periods;},'Time periods saved');}

function downloadText(text,filename,type){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function exportBackup(){downloadText(JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2),`dayfold-backup-${localYMD(new Date())}.json`,'application/json;charset=utf-8');toast('Complete backup exported');}
function csvSafe(value){let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return `"${text.replace(/"/g,'""')}"`;}
function exportCSV(){const header=['start_local','end_local','start_utc','end_utc','duration_hours','main_label','sublabel','secondary_tags','description'];const rows=sortedEntries().map(e=>{const l=labelById(e.labelId),r=rootLabel(e.labelId);return [dateTimeLocal(e.start),dateTimeLocal(e.end),new Date(e.start).toISOString(),new Date(e.end).toISOString(),((e.end-e.start)/ONE_HOUR).toFixed(4),r?.name||'',l?.parentId?l.name:'',(e.tags||[]).map(id=>tagById(id)?.name||'').join('; '),e.note];});downloadText('\ufeff'+[header,...rows].map(r=>r.map(csvSafe).join(',')).join('\r\n'),`dayfold-activities-${localYMD(new Date())}.csv`,'text/csv;charset=utf-8');toast('CSV exported');}
function validateBackup(x){
 if(!x||x.schema!==1||!Array.isArray(x.entries)||!Array.isArray(x.labels)||!Array.isArray(x.tags)||!Array.isArray(x.settings?.periods))throw Error('This is not a supported Dayfold backup.');
 if(x.entries.length>1000000||x.labels.length>10000||x.tags.length>10000)throw Error('Backup is too large.');
 const labelIds=new Set(),tagIds=new Set(),entryIds=new Set();
 for(const l of x.labels){if(typeof l.id!=='string'||typeof l.name!=='string'||l.name.length>70||!/^#[a-fA-F0-9]{6}$/.test(l.color)||labelIds.has(l.id)||!['string','object'].includes(typeof l.parentId)||typeof l.archived!=='boolean')throw Error('Invalid labels in backup.');labelIds.add(l.id);}
 for(const l of x.labels)if(l.parentId!==null&&(!labelIds.has(l.parentId)||x.labels.find(p=>p.id===l.parentId)?.parentId!==null))throw Error('Invalid label hierarchy in backup.');
 for(const t of x.tags){if(typeof t.id!=='string'||typeof t.name!=='string'||t.name.length>70||tagIds.has(t.id)||typeof t.archived!=='boolean')throw Error('Invalid tags in backup.');tagIds.add(t.id);}
 for(const e of x.entries){if(typeof e.id!=='string'||entryIds.has(e.id)||!Number.isFinite(e.start)||!Number.isFinite(e.end)||!Number.isFinite(new Date(e.start).getTime())||!Number.isFinite(new Date(e.end).getTime())||e.end<=e.start||e.end-e.start>72*ONE_HOUR||!labelIds.has(e.labelId)||typeof e.note!=='string'||e.note.length>4000||!Array.isArray(e.tags)||e.tags.some(t=>!tagIds.has(t)))throw Error('Invalid activity records in backup.');entryIds.add(e.id);}
 const sorted=[...x.entries].sort((a,b)=>a.start-b.start);for(let i=1;i<sorted.length;i++)if(sorted[i].start<sorted[i-1].end)throw Error('Backup contains overlapping activity records.');
 if(x.settings.periods.length!==5||x.settings.periods.some(p=>typeof p.id!=='string'||typeof p.name!=='string'||typeof p.start!=='string'||typeof p.end!=='string')||new Set(x.settings.periods.map(p=>p.id)).size!==5||!validPeriods(x.settings.periods))throw Error('Invalid time-of-day configuration in backup.');
 return {schema:1,labels:x.labels.map(l=>({id:l.id,name:l.name,parentId:l.parentId,color:l.color,archived:l.archived})),tags:x.tags.map(t=>({id:t.id,name:t.name,archived:t.archived})),entries:x.entries.map(e=>({id:e.id,start:e.start,end:e.end,labelId:e.labelId,note:e.note,tags:e.tags})),settings:{periods:x.settings.periods}};
}
async function restoreFile(file){if(!file)return;try{const text=await file.text();if(text.length>30000000)throw Error('File is too large.');const incoming=validateBackup(JSON.parse(text));if(!confirm(`Replace your current ${state.entries.length} records with ${incoming.entries.length} records from this backup? Export your current data first if needed.`))return;await writeDB(incoming);state=incoming;ui.focus='all';ui.tagFilter='all';ui.timePeriod='all';ui.hidden.clear();closeModal();render();toast('Backup restored');}catch(e){console.error(e);toast(e.message||'Could not restore backup');}}
async function persistenceStatus(request=false){const target=document.querySelector('#persist-status');if(!navigator.storage?.persisted){if(target)target.textContent='This browser does not expose persistent storage controls.';return;}
 try{if(request)await navigator.storage.persist();const persisted=await navigator.storage.persisted();const estimate=await navigator.storage.estimate();const usage=estimate.usage?` Estimated site storage: ${(estimate.usage/1024).toFixed(0)} KB.`:'';if(target)target.textContent=(persisted?'Persistent storage granted.':'Persistent storage not granted. Export periodic backups.')+usage;if(request)toast(persisted?'Persistent storage enabled':'Browser did not grant persistent storage');}catch(e){if(target)target.textContent='Storage status could not be checked.';}}
let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;});
async function installApp(){if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;}else toast('Use browser menu → Install app or Add to Home screen.');}

function shiftStatsDate(delta){const d=dateFromYMD(ui.statsAnchor);if(ui.period==='day')ui.statsAnchor=localYMD(addDays(d,delta));if(ui.period==='week')ui.statsAnchor=localYMD(addDays(d,delta*7));if(ui.period==='month')ui.statsAnchor=localYMD(new Date(d.getFullYear(),d.getMonth()+delta,Math.min(d.getDate(),28)));if(ui.period==='year')ui.statsAnchor=localYMD(new Date(d.getFullYear()+delta,d.getMonth(),d.getDate()));render();}
async function handleAction(action,el){
 const id=el.dataset.id;
 if(action==='prev-day'){ui.journalDate=localYMD(addDays(dateFromYMD(ui.journalDate),-1));render();}
 if(action==='next-day'){ui.journalDate=localYMD(addDays(dateFromYMD(ui.journalDate),1));render();}
 if(action==='today'){ui.journalDate=localYMD(new Date());render();}
 if(action==='toggle-search'){ui.searchOpen=!ui.searchOpen;render();}
 if(action==='jump-to-entry'){const e=state.entries.find(e=>e.id===id);if(e){ui.journalDate=localYMD(new Date(e.start));render();openEntryModal(id);}}
 if(action==='add-entry')openEntryModal();
 if(action==='gap-entry'){let start=Number(el.dataset.start),end=Number(el.dataset.end);const today=ui.journalDate===localYMD(new Date());if(today)end=Math.min(end,Date.now());if(end-start>6*ONE_HOUR){if(today){start=Math.max(start,end-ONE_HOUR);}else{start=Math.max(start,dateFromYMD(ui.journalDate).getTime()+9*ONE_HOUR);end=Math.min(end,start+ONE_HOUR);}}if(end>start)openEntryModal(null,{start,end});else toast('There is no elapsed gap to fill.');}
 if(action==='edit-entry')openEntryModal(id);
 if(action==='close-modal')closeModal();
 if(action==='delete-entry'&&confirm('Delete this activity record?')){const ok=await commit(s=>{s.entries=s.entries.filter(x=>x.id!==id);},'Activity deleted');if(ok)closeModal();}
 if(action==='new-label')openLabelModal();
 if(action==='new-child')openLabelModal(null,id);
 if(action==='edit-label')openLabelModal(id);
 if(action==='pick-color'){document.querySelectorAll('.color-option').forEach(b=>b.classList.toggle('selected',b===el));document.querySelector('#label-color').value=el.dataset.color;}
 if(action==='archive-label'){
  const l=labelById(id),children=state.labels.filter(x=>x.parentId===id);
  const archived=!l.archived;
  if(archived&&children.some(x=>!x.archived)&&!confirm('Archiving this main label will also archive its sublabels. Continue?'))return;
  const ok=await commit(s=>{const x=s.labels.find(x=>x.id===id);x.archived=archived;if(archived)for(const ch of s.labels.filter(x=>x.parentId===id))ch.archived=true;if(!archived&&x.parentId){const p=s.labels.find(z=>z.id===x.parentId);if(p)p.archived=false;}},archived?'Label archived':'Label restored');if(ok)closeModal();
 }
 if(action==='delete-label'){
  if(state.entries.some(x=>x.labelId===id)||state.labels.some(x=>x.parentId===id)){toast('Archive the label instead: it has records or sublabels.');return;}
  if(!confirm('Permanently delete this unused label?'))return;
  const ok=await commit(s=>{s.labels=s.labels.filter(x=>x.id!==id);},'Unused label deleted');if(ok)closeModal();
 }
 if(action==='new-tag')openTagModal();
 if(action==='edit-tag')openTagModal(id);
 if(action==='archive-tag'){const t=tagById(id);const ok=await commit(s=>{s.tags.find(x=>x.id===id).archived=!t.archived;},t.archived?'Tag restored':'Tag archived');if(ok)closeModal();}
 if(action==='delete-tag'){
  if(state.entries.some(x=>x.tags.includes(id))){toast('Archive the tag instead: it is used in past records.');return;}
  if(!confirm('Permanently delete this unused tag?'))return;
  const ok=await commit(s=>{s.tags=s.tags.filter(x=>x.id!==id);},'Unused tag deleted');if(ok)closeModal();
 }
 if(action==='toggle-advanced'){ui.advanced=!ui.advanced;render();}
 if(action==='prev-stats-period')shiftStatsDate(-1);
 if(action==='next-stats-period')shiftStatsDate(1);
 if(action==='today-stats'){ui.statsAnchor=localYMD(new Date());render();}
 if(action==='reset-stats'){ui.focus='all';ui.breakdown='main';ui.denom='shown';ui.timePeriod='all';ui.tagFilter='all';ui.hidden.clear();render();}
 if(action==='reset-periods'&&confirm('Reset the five daily periods to their default times?'))await commit(s=>{s.settings.periods=structuredClone(DEFAULT_PERIODS);},'Time periods reset');
 if(action==='backup')exportBackup();
 if(action==='csv')exportCSV();
 if(action==='persist')await persistenceStatus(true);
 if(action==='check-storage')await persistenceStatus();
 if(action==='install')await installApp();
}

document.addEventListener('click',async e=>{
 const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
 const btn=e.target.closest('[data-action]');if(btn){e.preventDefault();try{await handleAction(btn.dataset.action,btn);}catch(err){console.error(err);toast('Something went wrong; changes were not saved.');}return;}
 if(e.target.classList.contains('modal-backdrop'))closeModal();
});
document.addEventListener('change',async e=>{
 const el=e.target;
 if(el.matches('[data-filter]')){
  const key=el.dataset.filter;ui[key]=el.value;
  if(key==='period'&&el.value==='custom'&&ui.customStart===ui.customEnd){ui.customStart=localYMD(addDays(new Date(),-6));}
  if(key==='focus')ui.hidden.clear();
  if(key==='breakdown')ui.hidden.clear();
  render();return;
 }
 if(el.matches('[data-bucket]')){if(el.checked)ui.hidden.delete(el.dataset.bucket);else ui.hidden.add(el.dataset.bucket);render();return;}
 if(el.matches('[data-setting="showArchived"]')){ui.showArchived=el.checked;render();return;}
 if(el.id==='restore-file'){await restoreFile(el.files?.[0]);}
});
document.addEventListener('submit',async e=>{if(['entry-form','label-form','tag-form','periods-form'].includes(e.target.id)){e.preventDefault();const f=e.target;try{if(f.id==='entry-form')await saveEntry(f);if(f.id==='label-form')await saveLabel(f);if(f.id==='tag-form')await saveTag(f);if(f.id==='periods-form')await savePeriods(f);}catch(err){console.error(err);toast('Could not save; check the input.');}}});
document.addEventListener('input',e=>{if(e.target.id==='journal-search'){ui.searchTerm=e.target.value;const results=document.querySelector('#journal-search-results');if(results)results.innerHTML=renderSearchResults();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

async function init(){
 try{db=await openDB();state=await readDB();if(!state){state=seed();await writeDB(state);}storageOK=true;render();}
 catch(e){storageOK=false;console.error('Cannot open local data storage:',e);document.querySelector('#app-content').innerHTML='<div class="page"><h1>Storage unavailable</h1><p>Dayfold needs browser local database access to avoid losing your records. Open the app in Chrome over HTTPS, and check whether private browsing or storage restrictions are enabled.</p></div>';return;}
 if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')){
   try{await navigator.serviceWorker.register('./sw.js');}catch(e){console.warn('Offline install was not registered:',e);}
 }
}
init();
