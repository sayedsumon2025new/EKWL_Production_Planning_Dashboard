
const SUPABASE_URL = new URL("api/index.php",document.baseURI).href;

// Auth writes must not fail login when Firefox/browser storage is full or blocked.
function createResilientAuthStorage(root){
  const memory=new Map();
  const fallbackKeys=new Set();
  const read=(name,key)=>{try{return root[name].getItem(key)}catch(_){return null}};
  const write=(name,key,value)=>{try{root[name].setItem(key,value);return true}catch(_){return false}};
  const remove=(name,key)=>{try{root[name].removeItem(key)}catch(_){}};
  return {
    getItem(key){
      if(fallbackKeys.has(key))return memory.get(key)??null;
      // A session fallback from a prior refresh takes priority over stale local data.
      const session=read('sessionStorage',key);
      if(session!==null){fallbackKeys.add(key);memory.set(key,session);return session}
      return read('localStorage',key);
    },
    setItem(key,value){
      memory.set(key,value);
      if(write('localStorage',key,value)){
        remove('sessionStorage',key);fallbackKeys.delete(key);return;
      }
      fallbackKeys.add(key);
      remove('localStorage',key);
      if(!write('sessionStorage',key,value)){
        console.warn('Auth storage unavailable; session lasts until this page closes or reloads.');
      }
    },
    removeItem(key){
      memory.delete(key);fallbackKeys.add(key);
      remove('localStorage',key);remove('sessionStorage',key);
    }
  };
}
const SB = EKWLData.createClient();

const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monthTime(m){const [name,y]=m.split('-');return Date.UTC(2000+Number(y),monthNames.indexOf(name),1)}
function sortedMonths(data){return unique(data,'month').sort((a,b)=>monthTime(a)-monthTime(b))}
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s}
function parseRecords(text,preserveBlankRows=false,preserveCellWhitespace=false){
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,closed=false;
  const pushField=()=>{row.push(preserveCellWhitespace?field:field.trim());field='';closed=false};
  const pushRow=()=>{pushField();if(row.some(v=>v!=='')||(preserveBlankRows&&row.length>1))rows.push(row);row=[]};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=c;continue}
    if(c==='"'){if(field.trim()||closed)throw Error('Invalid quote in CSV');field='';quoted=true}
    else if(c===',')pushField();
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;pushRow()}
    else if(closed){if(!/\s/.test(c))throw Error('Unexpected text after a quoted field')}
    else field+=c;
  }
  if(quoted)throw Error('Unclosed quoted CSV field');
  if(field||row.length||closed)pushRow();return rows;
}
function chassisOf(s){const aliases={Hoody:'Hoody/Jacket',Jacket:'Hoody/Jacket','Sweat Pant':'Bottom','Long Pant':'Bottom',Shorts:'Bottom','Short Pant':'Bottom',Jogger:'Bottom',Pants:'Bottom',Tops:"TOP's",'RUGBY POLO':'Polo','Rugby Polo':'Polo'};return Object.hasOwn(aliases,s)?aliases[s]:(['T-Shirt','Hoody/Jacket','Sweat Shirt','Polo',"TOP's",'Bottom'].includes(s)?s:'Other')}
function strengths(){
  const defaults={TShirt:12,HoodyJacket:13,SweatShirt:3,Polo:12,Tops:1,Bottom:6};
  return Object.fromEntries([['T-Shirt','TShirt'],['Hoody/Jacket','HoodyJacket'],['Sweat Shirt','SweatShirt'],['Polo','Polo'],["TOP's",'Tops'],['Bottom','Bottom']].map(([name,id])=>{
    const el=document.getElementById('hw-'+id);
    return [name,Math.max(0,N(el?el.value:defaults[id]))];
  }));
}
function csvCell(v){const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}

/* ══════════════════════════════════════════════════
   GLOBALS
══════════════════════════════════════════════════ */
let DATA = [];
let FABRIC_CUTTING_DATA = [];
let SEWING_IO_DATA = [];
let DATE_WISE_PRODUCTION_DATA = [];
let PLAN_UPLOAD_CATALOG=[];
let ACTIVE_PLAN_UPLOAD=null;
const PLAN_VERSION_CACHE=new Map();
let PLANNING_CACHE_VALIDATION=null;
let PLAN_FILTER_TOKEN=0;
let DAILY_PLAN = [];
let SAH_DATA = [];
let SAH_DAILY = [];
let BUYER_PLAN_DATA = [];
let CLOCK_HOUR_DATA = [];
let CLOCK_HOUR_DAILY = [];
let MONTHS = [];
let CURRENT_SLIDE = 0;

const ITEM_KEY = s => (s||'').replace(/[\s\/]/g,'').replace(/&/g,'');
const ITEM_CLASS = s => 'ic-' + ITEM_KEY(s);

const ITEM_COLORS_HEX = {
  'T-Shirt':'#4fc3f7','SweatShirt':'#ce93d8','Hoody':'#ffb74d',
  'Polo':'#81c784','SweatPant':'#4db6ac','LongPant':'#26a69a',
  'Dress':'#f48fb1','Tanktop':'#a1887f','Cardigan':'#ff8a65',
  'Jogger':'#dce775','Shorts':'#4dd0e1','ShortPant':'#aed581',
  'Tops':'#fff176','Leggings':'#f06292','Tracksuit':'#66bb6a',
  'Pants':'#8d6e63','Jacket':'#ef5350','Bottom':'#78909c',
  'HoodyJacket':'#ffb74d'
};

function itemColor(s){const k=ITEM_KEY(s);return Object.hasOwn(ITEM_COLORS_HEX,k)?ITEM_COLORS_HEX[k]:'#607d8b'}
function itemChip(s){
  const c=itemColor(s);
  const isLight=['#fff176','#dce775','#aed581','#4fc3f7','#81c784','#4dd0e1','#4db6ac','#f48fb1','#ffb74d','#ff8a65','#ce93d8','#f06292'].includes(c);
  return `<span class="ichip" style="background:${c};color:${isLight?'#000':'#fff'}">${esc(s||'—')}</span>`;
}

const N = v => Number.isFinite(Number(v))?Number(v):0;
const fmt = v => N(v).toLocaleString();
const pct = (a,b) => b?Math.round(a/b*100)+'%':'0%';

/* ══ SLIDE NAV ══════════════════════════════════ */

const ADMIN_SETTING_NAMES={
  efficiency:'Efficiency & Run Day Ladder',
  chassis:'Line Wise Chassis Priority',
  abp:'ABP Target',
  master:'Master Analysis',
  slide4strength:slideLabel(10)+' · HW Line Strength'
};
const DEFAULT_EFF_LADDER=[
 ['T-Shirt',45,50,55,58,60,65],
 ['Hoody',40,45,50,55,58,60],
 ['Jacket',40,45,50,55,58,60],
 ['Long Pant',40,45,50,55,58,60],
 ['Sweat Pant',40,45,48,50,55,60],
 ['Sweat Shirt',40,45,50,55,60,60],
 ['Polo',40,45,50,55,60,60],
 ['Dress',40,45,50,55,60,62],
 ['Jogger',40,45,50,55,58,60],
 ['Jumpsuit',30,35,40,43,45,50],
 ['Leggings',40,50,55,55,60,60],
 ['Skirt',40,45,48,50,55,60],
 ['Tanktop',40,45,50,55,60,62],
 ['Tops',40,45,50,55,60,62],
 ['Neck Gaiter',40,43,45,47,50,52],
 ['Scarf',40,43,45,47,50,52],
 ['Rugby Polo',40,45,48,50,53,55],
 ['Shorts',40,45,50,55,60,60],
 ['Vest',45,50,55,55,60,60],
 ['Pants',40,45,50,55,58,60],
 ['Cardigan',40,45,50,55,60,62],
 ['Tracksuit',35,40,45,50,55,55],
 ['Trousers',40,45,48,50,55,60]
];

let EFF_LADDER_CACHE=null;

function getEfficiencyLadder(){
  if(Array.isArray(EFF_LADDER_CACHE)&&EFF_LADDER_CACHE.length)
    return EFF_LADDER_CACHE.map(r=>[...r]);
  return DEFAULT_EFF_LADDER.map(r=>[...r]);
}

async function loadEfficiencyLadderFromSQL(render=true){
  try{
    const {data,error}=await readTinySetting('ladder',()=>SB.from('efficiency_run_day_ladder')
      .select('item,day_1,day_2,day_3,day_4,day_5,day_6_plus')
      .order('item'));
    if(error)throw error;
    if(Array.isArray(data)&&data.length){
      EFF_LADDER_CACHE=data.map(r=>[
        r.item,N(r.day_1),N(r.day_2),N(r.day_3),N(r.day_4),N(r.day_5),N(r.day_6_plus)
      ]);
    }else{
      EFF_LADDER_CACHE=DEFAULT_EFF_LADDER.map(r=>[...r]);
    }
    if(render && document.getElementById('eff-ladder-body')) renderEfficiencyLadder();
    return EFF_LADDER_CACHE;
  }catch(e){
    console.error('Efficiency ladder SQL load failed',e);
    const msg=document.getElementById('eff-save-msg');
    if(msg)msg.textContent='SQL load failed: '+(e?.message||e);
    return getEfficiencyLadder();
  }
}

async function saveEfficiencyLadder(){
  const msg=document.getElementById('eff-save-msg');
  try{
    const rows=[...document.querySelectorAll('#eff-ladder-body tr')].map((tr,idx)=>{
      const item=tr.querySelector('.eff-item').value.trim();
      const vals=[...tr.querySelectorAll('.eff-val')].map(i=>{
        const n=Number(i.value);
        if(!Number.isFinite(n)||n<0||n>100)throw Error(`Row ${idx+1}: efficiency must be 0–100`);
        i.value=n;
        return n;
      });
      return [item,...vals];
    }).filter(r=>r[0]);
    if(!rows.length)throw Error('At least one Item is required');
    const keys=new Set();
    rows.forEach(r=>{
      const k=r[0].toLowerCase();
      if(keys.has(k))throw Error('Duplicate Item: '+r[0]);
      keys.add(k);
    });
    if(msg)msg.textContent='Saving to SQL…';

    // Upsert current rows, then remove items deleted from the UI.
    const payload=rows.map(r=>({
      item:r[0],day_1:r[1],day_2:r[2],day_3:r[3],
      day_4:r[4],day_5:r[5],day_6_plus:r[6],
      updated_at:new Date().toISOString()
    }));
    invalidateTinySettings(['ladder']);
    const {error:upErr}=await SB.from('efficiency_run_day_ladder').upsert(payload,{onConflict:'item'});
    if(upErr)throw upErr;

    const {data:existing,error:readErr}=await SB.from('efficiency_run_day_ladder').select('item');
    if(readErr)throw readErr;
    const keep=new Set(rows.map(r=>r[0].toLowerCase()));
    const deleted=(existing||[]).map(x=>x.item).filter(x=>!keep.has(String(x).toLowerCase()));
    if(deleted.length){
      const {error:delErr}=await SB.from('efficiency_run_day_ladder').delete().in('item',deleted);
      if(delErr)throw delErr;
    }
    invalidateTinySettings(['ladder']);
    EFF_LADDER_CACHE=rows.map(r=>[...r]);
    if(msg)msg.textContent='✓ Saved to SQL';
    setTimeout(()=>{if(msg)msg.textContent=''},2200);
  }catch(e){
    if(msg)msg.textContent='Save failed: '+(e?.message||e);
  }
}

function addEfficiencyLadderItem(){
  const tbody=document.getElementById('eff-ladder-body');
  if(!tbody) return;
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td>
      <div class="eff-item-cell">
        <input class="eff-item" type="text" value="" placeholder="New Item">
        <button class="eff-delete-btn" type="button" onclick="deleteEfficiencyLadderItem(this)" title="Delete item">✕</button>
      </div>
    </td>
    ${[40,45,50,55,60,60].map(v=>`<td><div class="eff-input-wrap"><input class="eff-val" type="text" inputmode="decimal" value="${v}"><span>%</span></div></td>`).join('')}`;
  tbody.appendChild(tr);
  tr.querySelector('.eff-item').focus();
}
function deleteEfficiencyLadderItem(btn){
  const tr=btn.closest('tr');
  if(tr) tr.remove();
}
async function resetEfficiencyLadder(){
  if(!confirm('Efficiency & Run Day Ladder default values-এ reset করবেন?')) return;
  EFF_LADDER_CACHE=DEFAULT_EFF_LADDER.map(r=>[...r]);
  renderEfficiencyLadder();
  await saveEfficiencyLadder();
}
function renderEfficiencyLadder(){
  const rows=getEfficiencyLadder();
  document.getElementById('admin-setting-panel-title').textContent='📈 Efficiency & Run Day Ladder';
  document.getElementById('admin-setting-panel-body').innerHTML=`
    <div class="eff-toolbar">
      <div>
        <div class="eff-note">Item-wise running day efficiency target (%)</div>
        <div class="eff-note2">Value edit করে Save Changes চাপুন। Data centralized MySQL SQL-এ save হবে এবং সব device একই value ব্যবহার করবে।</div>
      </div>
      <div class="eff-actions">
        <span id="eff-save-msg"></span>
        <button class="top-btn" onclick="addEfficiencyLadderItem()">＋ Add Item</button>
        <button class="top-btn" onclick="resetEfficiencyLadder()">↺ Reset Default</button>
        <button class="top-btn primary" onclick="saveEfficiencyLadder()">💾 Save Changes</button>
      </div>
    </div>
    <div class="tbl-wrap">
      <table class="dt eff-ladder-table">
        <thead><tr>
          <th>Item</th><th>Day-1</th><th>Day-2</th><th>Day-3</th>
          <th>Day-4</th><th>Day-5</th><th>Day-6 &amp; 6+</th>
        </tr></thead>
        <tbody id="eff-ladder-body">
          ${rows.map(r=>`<tr>
            <td><div class="eff-item-cell"><input class="eff-item" type="text" value="${esc(r[0])}"><button class="eff-delete-btn" type="button" onclick="deleteEfficiencyLadderItem(this)" title="Delete item">✕</button></div></td>
            ${r.slice(1).map(v=>`<td><div class="eff-input-wrap"><input class="eff-val" type="text" inputmode="decimal" value="${Number(v)}"><span>%</span></div></td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}


const EKWL_VALID_LINE_SET=new Set([...Array.from({length:45},(_,i)=>i+1),47,48]);
const DEFAULT_CHASSIS_PRIORITY=[[1, "T-Shirt", "T-Shirt"], [2, "Polo / T-Shirt", "Hoody"], [3, "Polo", "Bottom"], [4, "Hoody", "Polo"], [5, "T-Shirt", "Sweat Shirt"], [6, "T-Shirt", "Sweat Shirt"], [7, "T-Shirt", "Sweat Shirt"], [8, "Bottom", "SHORTS / JOGGER"], [9, "Polo", "Hoody"], [10, "T-Shirt", "Sweat Shirt"], [11, "Polo", "Sweat Shirt"], [12, "Polo", "Sweat Shirt"], [13, "Polo", "Hoody"], [14, "T-Shirt", "Tanktop"], [15, "Polo", "Sweat Shirt"], [16, "T-Shirt", "Sweat Shirt"], [17, "Bottom", "SHORTS / JOGGER"], [18, "POLO", "Sweat Shirt"], [19, "Hoody", "Sweat Shirt"], [20, "Hoody", "Polo"], [21, "T-Shirt", "LEGGINGS"], [22, "T-Shirt", "TANKTOP"], [23, "T-Shirt", "LEGGINGS"], [24, "Pant", "Sweat Shirt"], [25, "Hoody", "Polo"], [26, "Hoody", "Polo"], [27, "Pant", "Sweat Shirt"], [28, "Pant", "Hoody"], [29, "Hoody", "Hoody"], [30, "Sweat Shirt", "T-Shirt"], [31, "Hoody", "Hoody"], [32, "T-Shirt", "Sweat Shirt"], [33, "Hoody", "Sweat Shirt"], [34, "Polo", "Polo"], [35, "T-Shirt", "Hoody"], [36, "Polo", "T-Shirt"], [37, "Polo", "Polo"], [38, "T-Shirt", "Sweat Shirt"], [39, "T-Shirt", "Sweat Shirt"], [40, "Polo", "T-Shirt"], [41, "Bottom", "Leggings"], [42, "Bottom", "Leggings"], [43, "T-Shirt", "Sweat Shirt"], [44, "T-Shirt", "Sweat Shirt"], [45, "T-Shirt", "Sweat Shirt"], [47, "BOTTOM", "Hoody"], [48, "Hoody", "Sweat Shirt"]];

function getChassisMasterLines(){
  // Business rule: EKWL Highway has only Lines 1–45, 47 and 48.
  // SQL Chassis Priority may configure these lines, but can never introduce Line 46, 49, 50, etc.
  const configured=new Set(getChassisPriority().map(r=>Number(r[0]))
    .filter(n=>EKWL_VALID_LINE_SET.has(n)));
  return configured.size?configured:new Set(EKWL_VALID_LINE_SET);
}
function isChassisMasterLine(v){
  const n=lineNumber(v);
  return EKWL_VALID_LINE_SET.has(n) && getChassisMasterLines().has(n);
}

let CHASSIS_PRIORITY_CACHE=null;

function getChassisPriority(){
  if(Array.isArray(CHASSIS_PRIORITY_CACHE)&&CHASSIS_PRIORITY_CACHE.length)
    return CHASSIS_PRIORITY_CACHE.map(r=>[...r]);
  return DEFAULT_CHASSIS_PRIORITY.map(r=>[...r]);
}

async function loadChassisPriorityFromSQL(render=true){
  try{
    const {data,error}=await readTinySetting('chassis',()=>SB.from('line_chassis_priority')
      .select('line_no,priority_order,product_name')
      .order('line_no').order('priority_order'));
    if(error)throw error;
    const byLine=new Map();
    (data||[]).forEach(r=>{
      const line=Number(r.line_no);
      if(!EKWL_VALID_LINE_SET.has(line))return;
      if(!byLine.has(line))byLine.set(line,[line,'','']);
      const row=byLine.get(line);
      if(Number(r.priority_order)===1)row[1]=r.product_name||'';
      if(Number(r.priority_order)===2)row[2]=r.product_name||'';
    });
    if(byLine.size) CHASSIS_PRIORITY_CACHE=[...byLine.values()].sort((a,b)=>a[0]-b[0]);
    else CHASSIS_PRIORITY_CACHE=DEFAULT_CHASSIS_PRIORITY.map(r=>[...r]);
    if(render && document.getElementById('chassis-priority-body'))renderChassisPriority();
    return CHASSIS_PRIORITY_CACHE;
  }catch(e){
    console.error('Chassis Priority SQL load failed',e);
    const msg=document.getElementById('chassis-save-msg');
    if(msg)msg.textContent='SQL load failed: '+(e?.message||e);
    return getChassisPriority();
  }
}

async function saveChassisPriority(){
  const msg=document.getElementById('chassis-save-msg');
  try{
    const rows=[...document.querySelectorAll('#chassis-priority-body tr')].map((tr,i)=>{
      const line=Number(tr.querySelector('.ch-team').value)||0;
      const p1=tr.querySelector('.ch-p1').value.trim();
      const p2=tr.querySelector('.ch-p2').value.trim();
      if(!EKWL_VALID_LINE_SET.has(line))
        throw Error(`Line ${line||'(blank)'} is not a valid EKWL line. Allowed: 1–45, 47, 48`);
      return [line,p1,p2];
    });
    if(!rows.length)throw Error('At least one Line is required');
    const seen=new Set();
    rows.forEach(r=>{if(seen.has(r[0]))throw Error('Duplicate Line: '+r[0]);seen.add(r[0]);});
    if(msg)msg.textContent='Saving to SQL…';

    const payload=[];
    rows.forEach(r=>{
      if(r[1])payload.push({line_no:r[0],priority_order:1,product_name:r[1],updated_at:new Date().toISOString()});
      if(r[2])payload.push({line_no:r[0],priority_order:2,product_name:r[2],updated_at:new Date().toISOString()});
    });
    invalidateTinySettings(['chassis']);
    await saveReportAtomically('chassis',payload,true);
    invalidateTinySettings(['chassis']);
    CHASSIS_PRIORITY_CACHE=rows.map(r=>[...r]);
    if(msg){msg.textContent='✓ Saved to SQL';setTimeout(()=>{if(msg)msg.textContent=''},2200);}
  }catch(e){
    if(msg)msg.textContent='Save failed: '+(e?.message||e);
  }
}

async function resetChassisPriority(){
  if(!confirm('Chassis Priority default data-তে reset করবেন?')) return;
  CHASSIS_PRIORITY_CACHE=DEFAULT_CHASSIS_PRIORITY.map(r=>[...r]);
  renderChassisPriority();
  await saveChassisPriority();
}

function addChassisPriorityLine(){
  const tbody=document.getElementById('chassis-priority-body');
  if(!tbody)return;
  const existing=new Set([...tbody.querySelectorAll('.ch-team')].map(x=>Number(x.value)||0));
  const next=[...EKWL_VALID_LINE_SET].sort((a,b)=>a-b).find(n=>!existing.has(n));
  if(!next){alert('All valid EKWL lines (1–45, 47, 48) are already configured.');return;}
  const tr=document.createElement('tr');
  tr.innerHTML=`<td><input class="ch-team" type="number" min="1" value="${next}"></td>
    <td><input class="ch-p1" type="text" placeholder="1st Priority"></td>
    <td><input class="ch-p2" type="text" placeholder="2nd Priority"></td>
    <td><button class="eff-delete-btn" type="button" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}
function renderChassisPriority(){
  const rows=getChassisPriority();
  document.getElementById('admin-setting-panel-title').textContent='🏭 Line Wise Chassis Priority';
  document.getElementById('admin-setting-panel-body').innerHTML=`
    <div class="chassis-master-note">
      <div class="eff-note">Line-wise 1st & 2nd chassis priority</div>
      <div class="eff-note2">এই Chassis list-ই পুরো dashboard-এর MASTER LINE LIST এবং এখন MySQL SQL থেকে load হয়। এখানে যে line থাকবে শুধু সেটাই Order, Buyer, EWO, Feeding, Calendar, KPI, Chart ও সব Count/Sum-এ গণনা হবে। শুধু Line 1–45, 47 এবং 48 valid। Line 46, 49, 50 বা অন্য কোনো line Dashboard calculation-এ allow করা হয় না।</div>
    </div>
    <div class="tbl-wrap chassis-table-wrap">
      <table class="dt chassis-priority-table">
        <thead><tr><th>Team / Line</th><th>1st Priority</th><th>2nd Priority</th><th>Delete</th></tr></thead>
        <tbody id="chassis-priority-body">
          ${rows.map(r=>`<tr>
            <td><input class="ch-team" type="number" min="1" value="${r[0]}"></td>
            <td><input class="ch-p1" type="text" value="${esc(r[1])}"></td>
            <td><input class="ch-p2" type="text" value="${esc(r[2])}"></td>
            <td><button class="eff-delete-btn" type="button" onclick="this.closest('tr').remove()">✕</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="chassis-bottom-actions">
      <span id="chassis-save-msg"></span>
      <button class="top-btn" onclick="addChassisPriorityLine()">＋ Add Line</button>
      <button class="top-btn" onclick="resetChassisPriority()">↺ Reset Default</button>
      <button class="top-btn primary" onclick="saveChassisPriority()">💾 Save Changes</button>
    </div>`;
}

const DEFAULT_ABP_TARGET={
  metrics:[
    ['Number of Workstation','1,960'],['Usage of Available Hour','94%'],['Efficiency','55%'],
    ['Yearly Work Days','300 days'],['Yearly Capacity','3,039,960 Hour'],['Daily Capacity','10,133 Hour'],
    ['Inspection Fail','0.00%'],['Cut Ship Ratio','96.32%'],['Excess Ship %','1.64%'],
    ['Total Extra OT in BDT','12.65 Crore'],['Total General OT in BDT','15.46 Crore'],['Total OT cost in BDT','28.11 Crore'],
    ['Factory Cost per Minute','$ 0.1100'],['Total Cost per Minute','$ 0.1621']
  ],
  months:[['July',26],['August',26],['September',26],['October',26],['November',27],['December',27],['January',27],['February',25],['March',19],['April',26],['May',19],['June',26]],
  eid:[['November',1],['December',1],['January',2],['February',2],['March',1],['April',2],['May',2]],
  buyers:[
    ['Bestseller',0.00,75,2019600,83446,3],['Bonds',1.47,86,4481349,105894,3],
    ['Calvin Klein Jeans',0.00,75,2970000,83753,3],['Carhartt',3.87,95,7521546,154302,5],
    ['Gildan',0.00,75,9918151,364535,12],['Hanes RL',0.00,75,811322,37893,1],
    ['J.Crew',2.94,75,1937783,61771,2],['Klattermusen Ab',0.00,85,2442651,35314,1],
    ['M&S',1.43,82,21170774,745160,24],['Ralph Lauren',1.96,95,7136331,264130,9],
    ['Tommy Hilfiger',1.35,81,12476813,435337,14],['Tommy Jeans',1.17,81,3626453,124605,4],
    ['Varner',2.94,86,15176463,550331,18]
  ]
};
let ABP_TARGET_CACHE=null;

function getABPTarget(){
  if(ABP_TARGET_CACHE) return JSON.parse(JSON.stringify(ABP_TARGET_CACHE));
  return JSON.parse(JSON.stringify(DEFAULT_ABP_TARGET));
}

async function loadABPTargetFromSQL(render=true,sharedRead=null){
  try{
    const {data,error}=await (sharedRead||fetchABPTargetFromSQL());
    if(error)throw error;
    if(data?.config && typeof data.config==='object'){
      ABP_TARGET_CACHE=JSON.parse(JSON.stringify(data.config));
    }else{
      ABP_TARGET_CACHE=JSON.parse(JSON.stringify(DEFAULT_ABP_TARGET));
    }
    if(typeof refreshLoadAnalysisPlan==='function')refreshLoadAnalysisPlan();
    if(render)renderABPTarget();
    return ABP_TARGET_CACHE;
  }catch(e){
    if(typeof refreshLoadAnalysisPlan==='function')refreshLoadAnalysisPlan();
    console.error('ABP Target SQL load failed',e);
    const m=document.getElementById('abp-save-msg');
    if(m)m.textContent='SQL load failed: '+(e?.message||e);
    return getABPTarget();
  }
}

async function saveABPTarget(){
  const m=document.getElementById('abp-save-msg');
  try{
    const d=getABPTarget();
    document.querySelectorAll('[data-abp-metric]').forEach(el=>d.metrics[+el.dataset.abpMetric][1]=el.value);
    document.querySelectorAll('[data-abp-month]').forEach(el=>d.months[+el.dataset.abpMonth][1]=Number(el.value)||0);
    document.querySelectorAll('[data-abp-eid]').forEach(el=>d.eid[+el.dataset.abpEid][1]=Number(el.value)||0);
    const buyerRows=[...document.querySelectorAll('#abp-buyers tbody tr')].filter(tr=>!tr.classList.contains('abp-total'));
    d.buyers=buyerRows.map(tr=>{
      const a=[...tr.querySelectorAll('input')];
      return [a[0].value,Number(a[1].value)||0,Number(a[2].value)||0,Number(a[3].value)||0,Number(a[4].value)||0,Number(a[5].value)||0];
    });
    if(m)m.textContent='Saving to SQL…';
    invalidateTinySettings(['abp']);
    const {error}=await SB.from('abp_target').upsert({
      parameter_name:'ABP_MATRIX_2026_27',
      target_value:0,
      config:d,
      updated_at:new Date().toISOString()
    },{onConflict:'parameter_name'});
    if(error)throw error;
    invalidateTinySettings(['abp']);
    ABP_TARGET_CACHE=JSON.parse(JSON.stringify(d));
    if(typeof refreshLoadAnalysisPlan==='function')refreshLoadAnalysisPlan();
    const effRow=(d.metrics||[]).find(r=>Array.isArray(r)&&String(r[0]||'').trim().toLowerCase()==='efficiency');
    if(effRow)LIVE_ABP_TARGET_EFF=parsePercentNumber(effRow[1],LIVE_ABP_TARGET_EFF);
    if(m){m.textContent='✓ Saved to SQL';setTimeout(()=>{if(m)m.textContent=''},2200);}
  }catch(e){
    if(m)m.textContent='Save failed: '+(e?.message||e);
  }
}

async function resetABPTarget(){
  if(!confirm('ABP Target default matrix-এ reset করবেন?'))return;
  ABP_TARGET_CACHE=JSON.parse(JSON.stringify(DEFAULT_ABP_TARGET));
  renderABPTarget();
  await saveABPTarget();
}

function renderABPTarget(){
 const d=getABPTarget();
 const sales=d.buyers.reduce((s,r)=>s+(+r[3]||0),0), hrs=d.buyers.reduce((s,r)=>s+(+r[4]||0),0);
 document.getElementById('admin-setting-panel-title').textContent='🎯 ABP Target Matrix 2026-27';
 document.getElementById('admin-setting-panel-body').innerHTML=`
 <div class="abp-head"><div><b>EKWL Highway</b><span>ABP Target Matrix 2026-27</span></div>
 <div class="eff-actions"><span id="abp-save-msg"></span><button class="top-btn" onclick="resetABPTarget()">↺ Reset</button><button class="top-btn primary" onclick="saveABPTarget()">💾 Save Changes</button></div></div>
 <div class="abp-grid">
   <div class="abp-box"><h4>Factory Parameters</h4>${d.metrics.map((r,i)=>`<label><span>${esc(r[0])}</span><input data-abp-metric="${i}" value="${esc(r[1])}"></label>`).join('')}</div>
   <div class="abp-box"><h4>Monthly Work Days Plan</h4>${d.months.map((r,i)=>`<label><span>${esc(r[0])}</span><span class="abp-num"><input data-abp-month="${i}" inputmode="numeric" value="${r[1]}"> days</span></label>`).join('')}
   <h4 class="abp-subhead">Eid Covering Plan</h4>${d.eid.map((r,i)=>`<label><span>${esc(r[0])}</span><span class="abp-num"><input data-abp-eid="${i}" inputmode="numeric" value="${r[1]}"> days</span></label>`).join('')}</div>
   <div class="abp-box abp-buyers"><h4>Buyer Target</h4><div class="tbl-wrap"><table class="dt" id="abp-buyers"><thead><tr><th>Buyer</th><th>Excess Ship%</th><th>OTD%</th><th>Sales Value</th><th>Producible Hour</th><th>%</th></tr></thead><tbody>
   ${d.buyers.map(r=>`<tr>${r.map((v,j)=>`<td><input value="${esc(v)}" inputmode="${j?'decimal':'text'}"></td>`).join('')}</tr>`).join('')}
   <tr class="abp-total"><td>EKWL Highway</td><td>1.64%</td><td>83%</td><td>$ ${fmt(sales)}</td><td>${fmt(hrs)} Hour</td><td>100%</td></tr>
   </tbody></table></div></div>
 </div>`;
}
function openAdminSetting(key){
  document.querySelectorAll('.admin-setting-grid .admin-setting-card').forEach((el,i)=>{
    const keys=['efficiency','chassis','abp','master','slide4strength'];
    el.classList.toggle('active',keys[i]===key);
  });
  if(key==='efficiency'){renderEfficiencyLadder();loadEfficiencyLadderFromSQL(true);return}
  if(key==='chassis'){renderChassisPriority();loadChassisPriorityFromSQL(true);return}
  if(key==='abp'){renderABPTarget();loadABPTargetFromSQL(true);return}
  if(key==='slide4strength'){renderS4StrengthSettings();loadS4StrengthsFromSQL(true);return}
  const title=ADMIN_SETTING_NAMES[key]||'Parameter Setting';
  document.getElementById('admin-setting-panel-title').textContent='⚙ '+title;
  if(key==='master'){
    const factory=document.getElementById('cfg-name')?.value||'EKWL · HW';
    const eff=document.getElementById('cfg-eff')?.value||'65';
    document.getElementById('admin-setting-panel-body').innerHTML=`
      <div class="abp-box" style="max-width:520px">
        <h4>Central SQL Master Settings</h4>
        <label><span>Factory Name</span><input id="master-factory-name" value="${esc(factory)}"></label>
        <label><span>Buyer Efficiency Target</span><span class="abp-num"><input id="master-eff-target" type="number" min="0" max="100" value="${esc(eff)}"> %</span></label>
        <div style="margin-top:12px"><span id="master-setting-msg"></span>
          <button class="top-btn primary" onclick="saveMasterAnalysisSettings()">💾 Save Changes</button>
        </div>
      </div>`;
    return;
  }
  document.getElementById('admin-setting-panel-body').innerHTML=
    `<div style="text-align:center"><div style="color:var(--amber2);font-weight:800;font-size:14px;margin-bottom:8px">${esc(title)}</div><div>This setting panel is ready for its parameters.</div></div>`;
}

const ACTIVE_TAB_STORAGE_KEY='ekwlhw_active_tab_v1';

function siteIsAdmin(){
  return String(SITE_USER_PROFILE?.role||'').toLowerCase()==='admin';
}
function siteHasPerm(key){
  if(siteIsAdmin())return true;
  const p=SITE_USER_PROFILE?.permissions||{};
  return p[key]===true || p[key]==='true';
}
function slidePermissionKey(n){
  return SLIDES.find(s=>s.number===resolveSlideNumber(n))?.permissionKey ?? null;
}
function canAccessSlide(n){
  const slide=SLIDES.find(s=>s.number===resolveSlideNumber(n));
  return !!slide && (!slide.permissionKey || siteHasPerm(slide.permissionKey));
}
function applySitePermissions(){
  if(!SITE_USER_PROFILE)return;
  document.querySelectorAll('[data-permission-hidden="1"]').forEach(el=>{
    el.style.display=el.dataset.permissionDisplay||'';
    delete el.dataset.permissionHidden; delete el.dataset.permissionDisplay;
  });
  const hideForRole=el=>{
    el.dataset.permissionDisplay=el.style.display;
    el.dataset.permissionHidden='1';el.style.display='none';
  };

  // User Home is a permission launcher only. Do not expose cross-module totals/status.
  if(!siteIsAdmin()){
    // Requested clean User Home: hide Fabrics & Cutting quick button
    // and the complete MySQL/cache loading-status panel.
    document.querySelectorAll('[data-admin-home-extra="1"]').forEach(hideForRole);

    const home=document.getElementById('s0');
    if(home){
      home.querySelectorAll('.load-status-wrap,.live-summary,.summary-grid').forEach(hideForRole);
    }
    // Template/Export can expose broader planning data, so keep them Admin-only.
    document.querySelectorAll('button').forEach(b=>{
      const t=(b.textContent||'').trim().toLowerCase();
      if(t.includes('template') || t.includes('export')) hideForRole(b);
    });
  }

  // Hide every navigation tab/home card the signed-in user is not allowed to open.
  document.querySelectorAll('[data-slide-access]').forEach(el=>{
    const n=Number(el.getAttribute('data-slide-access'));
    el.style.display=canAccessSlide(n)?'':'none';
  });

  // Upload/Data Control is visible only when at least one upload permission exists.
  const canAnyUpload=siteHasPerm('planning_upload')||siteHasPerm('fabric')||siteHasPerm('sewing')||siteHasPerm('production')||siteHasPerm('embellishment_upload')||siteIsAdmin()||siteHasPerm('admin_settings');
  document.querySelectorAll('[data-upload-launch]').forEach(el=>el.style.display=canAnyUpload?'':'none');

  // Admin/User modules are additionally role protected.
  if(!siteIsAdmin()){
    document.querySelectorAll('[data-slide-access="12"],[data-slide-access="13"]').forEach(el=>{
      const n=Number(el.getAttribute('data-slide-access'));
      if(!canAccessSlide(n))el.style.display='none';
    });
  }

  // If a restored slide is forbidden, force Home.
  if(typeof CURRENT_SLIDE!=='undefined' && !canAccessSlide(CURRENT_SLIDE)){
    CURRENT_SLIDE=0;
    try{localStorage.setItem(ACTIVE_TAB_STORAGE_KEY,'0')}catch(_){}
  }
  if(typeof refreshLoadAnalysisPlan==='function')refreshLoadAnalysisPlan();
}
function requireSitePerm(key,label='এই module'){
  if(siteHasPerm(key))return true;
  alert(label+' access আপনার জন্য অনুমোদিত নয়।');
  return false;
}

function goSlide(n){
  n=resolveSlideNumber(n);
  cancelDashboardDebounces();
  closeS2LineDetails();
  if(Number(n)===12 && canAccessSlide(12)){setTimeout(loadFloorAllocationAdmin,0);setTimeout(()=>loadEfficiencyLadderFromSQL(false),0);setTimeout(()=>loadChassisPriorityFromSQL(false),0);setTimeout(()=>loadABPTargetFromSQL(false),0);}
  if(Number(n)===10 && canAccessSlide(10))setTimeout(()=>loadS4StrengthsFromSQL(false),0);
  const maxSlide=getMaxDashboardSlide();
  n=Math.max(0,Math.min(Number(n)||0,maxSlide));
  if(!canAccessSlide(n)){
    console.warn('Permission denied for slide',n);
    n=0;
  }
  if(n===13)setTimeout(()=>loadSiteUsers(),0);
  document.querySelectorAll('.slide').forEach(s=>
    s.classList.toggle('active',Number(s.dataset.logicalSlide)===n)
  );
  document.querySelectorAll('.stab').forEach(t=>t.classList.toggle('active',+t.dataset.s===n));
  const activeSlides=[...document.querySelectorAll('.slide.active')];
  if(activeSlides.length!==1 || Number(activeSlides[0]?.dataset.logicalSlide)!==n){
    document.querySelectorAll('.slide').forEach(s=>s.classList.toggle('active',Number(s.dataset.logicalSlide)===n));
  }
  if(n===10)requestAnimationFrame(()=>renderS4(getFiltered()));
  CURRENT_SLIDE=n;
  beginDashboardSlideOpen(n);
  document.getElementById('order-execution-frame')?.contentWindow?.postMessage({type:'ekwl-execution-visible',visible:n===16},'*');
  try{localStorage.setItem(ACTIVE_TAB_STORAGE_KEY,String(n))}catch(e){}
  if(n===16){
    const frame=document.getElementById('order-execution-frame');
    if(frame&&!frame.getAttribute('src')){
      const src=new URL(frame.dataset.src,location.href);
      if(window.EKWL_PERF_ENABLED===true||new URLSearchParams(location.search).get('ekwlPerf')==='1')src.searchParams.set('ekwlPerf','1');
      frame.src=src.href;
    }
    if(frame&&frame.dataset.ready==='1')setTimeout(()=>loadOrderExecutionSlide(),0);
  }
  if(n===17)setTimeout(()=>loadSizeSetModule(),0);
  if(n===18)setTimeout(()=>loadAccessoriesModule(),0);
  if(n===19)setTimeout(()=>loadEmbellishmentModule(),0);
  if(n===20 && typeof refreshLoadAnalysisPlan==='function')refreshLoadAnalysisPlan();
  if(n===14 || n===15 || n===21){
    try{renderSlide(n)}catch(e){
      console.error('Slide '+n+' render failed',e);
      setStatus(false,'Slide '+n+' render error: '+(e?.message||e));
    }
  }else if(n>0 && DATA.length){
    try{renderSlide(n)}catch(e){
      console.error('Slide '+n+' render failed',e);
      setStatus(false,'Slide '+n+' render error: '+(e?.message||e));
    }
  }
}
function restoreActiveTab(){
  let n=CURRENT_SLIDE;
  const linked=requestedSlideFromHash(location.hash);
  try{
    const saved=Number(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY));
    if(Number.isInteger(saved)&&saved>=0&&saved<=getMaxDashboardSlide())n=saved;
    n=resolveSlideNumber(linked ?? n);
    if(!canAccessSlide(n))n=0;
  }catch(e){n=resolveSlideNumber(linked ?? n);}
  goSlide(n);
}


/* ══ SUPABASE LIVE DATA ═════════════════════════ */
function monthFromISO(s){
  if(!s) return '';
  const d=new Date(s+'T00:00:00Z');
  if(!Number.isFinite(+d)) return '';
  return monthNames[d.getUTCMonth()]+'-'+String(d.getUTCFullYear()).slice(-2);
}
function lineNumber(v){
  const m=String(v??'').match(/\d+/);
  return m?Number(m[0]):0;
}
function dashboardStyle(v){
  const s=String(v??'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  const map={
    't shirt':'T-Shirt','tshirt':'T-Shirt','tee shirt':'T-Shirt',
    'sweat shirt':'Sweat Shirt','sweatshirt':'Sweat Shirt',
    'hoody':'Hoody','hoodie':'Hoody','polo':'Polo',
    'sweat pant':'Sweat Pant','sweatpant':'Sweat Pant',
    'long pant':'Long Pant','longpant':'Long Pant',
    'short pant':'Short Pant','shorts':'Shorts','jogger':'Jogger',
    'tops':'Tops','top':'Tops','dress':'Dress','cardigan':'Cardigan',
    'leggings':'Leggings','tracksuit':'Tracksuit','pants':'Pants',
    'jacket':'Jacket','bottom':'Bottom','tanktop':'Tanktop','tank top':'Tanktop'
  };
  return map[s] || String(v??'').trim() || 'Other';
}

function setLoadProgress(percent,msg){
  const f=document.getElementById('load-fill');
  if(f){f.style.width=Math.max(0,Math.min(100,percent))+'%';f.classList.toggle('loading',percent<100);}
  if(msg)document.getElementById('status-msg').textContent=msg;
}
function setLoadChip(id,state,label){
  const el=document.getElementById(id);if(!el)return;
  el.className='load-chip '+state;
  el.textContent=(state==='ok'?'✓ ':state==='loading'?'⟳ ':state==='err'?'✕ ':'')+label;
}
function resetLoadUI(){
  setLoadProgress(3,'MySQL reports load শুরু হচ্ছে...');
  setLoadChip('load-plan','loading','Planning');
  setLoadChip('load-fabric','','Fabrics & Cutting');
  setLoadChip('load-sewing','','Sewing I/O');
  setLoadChip('load-production','','Date Wise Production');
}

function planningMonthLabel(ym){
  if(!ym)return '';
  const [y,m]=String(ym).split('-').map(Number);
  if(!y||!m)return String(ym);
  return new Date(y,m-1,1).toLocaleString('en-US',{month:'short',year:'numeric'});
}
function uploadMonthKey(u){
  if(u?.planning_month)return String(u.planning_month).slice(0,7);
  if(u?.uploaded_at)return String(u.uploaded_at).slice(0,7);
  return '';
}
function uploadSeq(u){return Number(u?.sequence_no)||0;}
function activePlanningLabel(){
  if(!ACTIVE_PLAN_UPLOAD)return 'No Planning Selected';
  const m=planningMonthLabel(uploadMonthKey(ACTIVE_PLAN_UPLOAD));
  const seq=uploadSeq(ACTIVE_PLAN_UPLOAD);
  const pid=String(ACTIVE_PLAN_UPLOAD.planning_id||'').trim();
  return m+' · Seq '+(seq||'-')+(pid?' · '+pid:'');
}
function rebuildPlanningFilters(preferredMonth,preferredUploadId){
  const mf=document.getElementById('month-filter'), sf=document.getElementById('planning-sequence-filter');
  if(!mf||!sf)return;
  const months=[...new Set(PLAN_UPLOAD_CATALOG.map(uploadMonthKey).filter(Boolean))].sort().reverse();
  const month=preferredMonth||mf.value||months[0]||'';
  mf.innerHTML=months.map(m=>`<option value="${esc(m)}">${esc(planningMonthLabel(m))}</option>`).join('') || '<option value="">No Planning</option>';
  if(months.includes(month))mf.value=month;
  const list=PLAN_UPLOAD_CATALOG.filter(u=>uploadMonthKey(u)===mf.value)
    .sort((a,b)=>(uploadSeq(b)-uploadSeq(a))||String(b.uploaded_at).localeCompare(String(a.uploaded_at)));
  sf.innerHTML=list.map(u=>{
    const id=u.planning_id?` · ${u.planning_id}`:'';
    return `<option value="${u.id}">Seq ${uploadSeq(u)||'-'}${esc(id)} · ${esc(u.file_name||'')}</option>`;
  }).join('') || '<option value="">No upload</option>';
  const wanted=String(preferredUploadId||'');
  if(wanted && list.some(u=>String(u.id)===wanted))sf.value=wanted;
  else if(list[0])sf.value=String(list[0].id);
}

function capturePlanningState(){
  return {
    cacheValidation:PLANNING_CACHE_VALIDATION,
    DATA,DAILY_PLAN,SAH_DATA,SAH_DAILY,CLOCK_HOUR_DATA,BUYER_PLAN_DATA,
    EFF15_METRIC_DAILY,EFF15_METRIC_UPLOAD_ID,
    CLOCK_HOUR_DAILY:typeof CLOCK_HOUR_DAILY!=='undefined'?CLOCK_HOUR_DAILY:[],
    MONTHS
  };
}
function restorePlanningState(c){
  PLANNING_CACHE_VALIDATION=c.cacheValidation||null;
  DATA=c.DATA||[];DAILY_PLAN=c.DAILY_PLAN||[];SAH_DATA=c.SAH_DATA||[];SAH_DAILY=c.SAH_DAILY||[];
  CLOCK_HOUR_DATA=c.CLOCK_HOUR_DATA||[];BUYER_PLAN_DATA=c.BUYER_PLAN_DATA||[];
  if(typeof CLOCK_HOUR_DAILY!=='undefined')CLOCK_HOUR_DAILY=c.CLOCK_HOUR_DAILY||[];
  MONTHS=c.MONTHS||[];
  EFF15_METRIC_DAILY=c.EFF15_METRIC_DAILY||[];
  EFF15_METRIC_UPLOAD_ID=c.EFF15_METRIC_UPLOAD_ID||null;
}

let PLAN_PREFETCH_RUNNING=false;
async function sbPaged(queryFactory){
  const out=[],size=1000;
  for(let from=0;;from+=size){
    const {data,error}=await queryFactory().range(from,from+size-1);
    if(error)throw error;
    out.push(...(data||[]));
    if(!data||data.length<size)break;
  }
  return out;
}
async function sbAll(table,select,filters=[]){
  const out=[],size=1000;
  for(let from=0;;from+=size){
    let q=SB.from(table).select(select);
    for(const [k,v] of filters)q=q.eq(k,v);
    const {data,error}=await q.range(from,from+size-1);
    if(error)throw error;
    out.push(...(data||[]));
    if(!data||data.length<size)break;
  }
  return out;
}
// Completed app uploads are snapshots; new uploads receive a new ID.
// Bound reuse because direct SQL edits may not update upload metadata.
function planningSnapshotVersion(upload){
  return JSON.stringify({schema:1,owner:SITE_AUTH_USER?.id||'',
    upload:Object.keys(upload||{}).sort().map(key=>[key,upload[key]]),
    lines:[...getChassisMasterLines()].sort((a,b)=>a-b)});
}
function canReusePlanningSnapshot(snapshot,upload){
  const stamp=snapshot?.cacheValidation;
  if(!stamp || stamp.version!==planningSnapshotVersion(upload))return false;
  const age=Date.now()-stamp.fetchedAt;
  if(!Number.isFinite(age)||age<0||age>=15*60*1000)return false;
  const fields=['DATA','DAILY_PLAN','SAH_DATA','SAH_DAILY','CLOCK_HOUR_DATA','CLOCK_HOUR_DAILY','BUYER_PLAN_DATA','MONTHS','EFF15_METRIC_DAILY'];
  return fields.every(key=>Array.isArray(snapshot[key])) && String(snapshot.EFF15_METRIC_UPLOAD_ID)===String(upload.id);
}
async function fetchPlanningSnapshot(upload){
  const version=planningSnapshotVersion(upload);
  const [records,daily]=await Promise.all([
    sbPaged(()=>SB.from('plan_records')
      .select('id,source_row,line_no,buyer,product_type,product,ewo,po,col,print,emb,outsource,order_qty,pcd,delivery,psd,pfd,manpower,smv,criteria,total,is_summary_row')
      .eq('upload_id',upload.id).eq('is_summary_row',false)
      .in('criteria',['Plan/Day','SAH/Day','Clock Hour/Day','Effi/Day'])
      .order('source_row',{ascending:true}).order('id',{ascending:true})),
    // Download daily values once; both planning and clock-hour maps use this result.
    sbPaged(()=>SB.from('plan_daily').select('record_id,plan_date,value')
      .eq('upload_id',upload.id)
      .order('plan_date',{ascending:true}).order('record_id',{ascending:true}))
  ]);
  const valid=records.filter(r=>!r.is_summary_row&&isChassisMasterLine(r.line_no));
  const planRows=valid.filter(r=>r.criteria==='Plan/Day');
  const sahRows=valid.filter(r=>r.criteria==='SAH/Day');
  const clockRows=valid.filter(r=>r.criteria==='Clock Hour/Day');

  const BUYER_PLAN_DATA_LOCAL=planRows.map(r=>({
    month:monthFromISO(r.psd||r.pfd||r.delivery),buyer:r.buyer||'',
    ewo:String(r.ewo??'').trim(),po:String(r.po||'').trim(),
    color:String(r.col||'').trim(),orderqty:N(r.order_qty),planqty:N(r.total)
  }));
  const DATA_LOCAL=planRows.map(r=>({
    record_id:r.id,month:monthFromISO(r.psd||r.pfd||r.delivery),line:lineNumber(r.line_no),
    ewo:r.ewo==null?'':String(r.ewo).replace(/\.0$/,''),buyer:r.buyer||'',color:r.col||'',po:r.po||'',
    print:r.print||'',emb:r.emb||'',outsource:r.outsource||'',productName:String(r.product||'').trim(),
    style:dashboardStyle(r.product_type||r.product),manpower:N(r.manpower),smv:N(r.smv),
    orderqty:N(r.order_qty),planqty:N(r.total),deliverydate:r.delivery||'',pcddate:r.pcd||'',
    startdate:r.psd||'',enddate:r.pfd||''
  })).filter(r=>r.line>0);
  const SAH_LOCAL=sahRows.map(r=>({
    record_id:r.id,startdate:r.psd||'',
    month:monthFromISO(r.psd||r.pfd||r.delivery),line:lineNumber(r.line_no),
    ewo:r.ewo==null?'':String(r.ewo).replace(/\.0$/,''),buyer:r.buyer||'',
    style:dashboardStyle(r.product_type||r.product),color:r.col||'',total:N(r.total)
  }));
  const CLOCK_LOCAL=clockRows.map(r=>({
    record_id:r.id,startdate:r.psd||'',month:monthFromISO(r.psd||r.pfd||r.delivery),line:lineNumber(r.line_no),
    ewo:r.ewo==null?'':String(r.ewo).replace(/\.0$/,''),buyer:r.buyer||'',
    style:dashboardStyle(r.product_type||r.product),color:r.col||'',total:N(r.total)
  }));
  const planMeta=new Map(DATA_LOCAL.map(r=>[String(r.record_id),r]));
  const clockMeta=new Map(CLOCK_LOCAL.map(r=>[String(r.record_id),r]));
  const sahMeta=new Map(sahRows.map(r=>[String(r.id),{
    line:lineNumber(r.line_no),ewo:r.ewo==null?'':String(r.ewo).replace(/\.0$/,''),
    buyer:r.buyer||'',style:dashboardStyle(r.product_type||r.product)
  }]));
  const metricMeta=new Map(valid.map(r=>[String(r.id),r]));
  const METRIC_LOCAL=[];
  const DAILY_LOCAL=[],SAH_DAILY_LOCAL=[],CLOCK_DAILY_LOCAL=[];
  for(const d of daily){
    const m=metricMeta.get(String(d.record_id));
    if(m&&d.plan_date)METRIC_LOCAL.push({record_id:d.record_id,date:d.plan_date,value:N(d.value),
      line:lineNumber(m.line_no),product:dashboardStyle(m.product_type||m.product),
      ewo:String(m.ewo??'').replace(/\.0$/,'').trim(),criteria:String(m.criteria||'').trim()});
    const p=planMeta.get(String(d.record_id));
    if(p)DAILY_LOCAL.push({record_id:d.record_id,date:d.plan_date,value:N(d.value),
      line:p.line,ewo:p.ewo,buyer:p.buyer,style:p.style,color:p.color||'',smv:p.smv});
    const s=sahMeta.get(String(d.record_id));
    if(s)SAH_DAILY_LOCAL.push({record_id:d.record_id,date:d.plan_date,value:N(d.value),
      line:s.line,ewo:s.ewo,buyer:s.buyer,style:s.style});
    const c=clockMeta.get(String(d.record_id));
    if(c)CLOCK_DAILY_LOCAL.push({record_id:d.record_id,date:d.plan_date,value:N(d.value),
      line:c.line,ewo:c.ewo,buyer:c.buyer,style:c.style});
  }
  return {cacheValidation:{version,fetchedAt:Date.now()},DATA:DATA_LOCAL,DAILY_PLAN:DAILY_LOCAL,SAH_DATA:SAH_LOCAL,SAH_DAILY:SAH_DAILY_LOCAL,CLOCK_HOUR_DATA:CLOCK_LOCAL,
    EFF15_METRIC_DAILY:METRIC_LOCAL,EFF15_METRIC_UPLOAD_ID:String(upload.id),
    CLOCK_HOUR_DAILY:CLOCK_DAILY_LOCAL,BUYER_PLAN_DATA:BUYER_PLAN_DATA_LOCAL,
    MONTHS:[...new Set(DAILY_LOCAL.map(d=>monthFromISO(d.date)).filter(Boolean))].sort((a,b)=>monthTime(a)-monthTime(b))};
}
async function prefetchPlanningVersions(){
  if(PLAN_PREFETCH_RUNNING)return;
  PLAN_PREFETCH_RUNNING=true;
  try{
    const current=String(ACTIVE_PLAN_UPLOAD?.id||'');
    const queue=PLAN_UPLOAD_CATALOG
      .filter(u=>String(u.id)!==current&&!PLAN_VERSION_CACHE.has(String(u.id)))
      .sort((a,b)=>String(b.uploaded_at).localeCompare(String(a.uploaded_at)));
    for(let i=0;i<queue.length;i++){
      const u=queue[i];
      try{
        setLoadProgress(100,'Ready · background cache '+(i+1)+'/'+queue.length);
        const snap=await fetchPlanningSnapshot(u);
        PLAN_VERSION_CACHE.set(String(u.id),snap);
        await saveDashboardCache();
      }catch(e){console.warn('Planning prefetch skipped',u.id,e);}
      await new Promise(r=>setTimeout(r,0));
    }
  }finally{
    PLAN_PREFETCH_RUNNING=false;
    setLoadProgress(100,'Planning versions ready');
  }
}
async function switchPlanningInstant(uploadId){
  if(!uploadId)return;
  const token=++PLAN_FILTER_TOKEN;
  ++EFF15_FR_TOKEN;
  ++SUPABASE_LOAD_TOKEN; // Invalidate any older load, including when this selection is cached.
  const upload=PLAN_UPLOAD_CATALOG.find(u=>String(u.id)===String(uploadId));
  if(upload)ACTIVE_PLAN_UPLOAD=upload;
  if(typeof refreshLoadAnalysisPlan==='function')refreshLoadAnalysisPlan();

  // Previously opened versions are restored instantly with zero MySQL requests.
  if(PLAN_VERSION_CACHE.has(String(uploadId))&&canReusePlanningSnapshot(PLAN_VERSION_CACHE.get(String(uploadId)),upload)){
    restorePlanningState(PLAN_VERSION_CACHE.get(String(uploadId)));
    renderAll();
    if(CURRENT_SLIDE>9){try{renderSlide(CURRENT_SLIDE)}catch(e){console.error(e)}}
    setLoadProgress(100,'Planning version cache থেকে instantly loaded');
    setStatus(true,'Planning filter applied instantly',
      activePlanningLabel()+' · '+DATA.length+' Plan/Day · '+FABRIC_CUTTING_DATA.length+' Fabric/Cutting · '+SEWING_IO_DATA.length+' Sewing I/O · '+DATE_WISE_PRODUCTION_DATA.length+' Production');
    return;
  }

  setLoadProgress(18,'Selected Planning version load হচ্ছে...');
  const loaded=await loadFromSupabase(uploadId,true);
  if(!loaded||token!==PLAN_FILTER_TOKEN)return;
  PLAN_VERSION_CACHE.set(String(uploadId),capturePlanningState());
}
async function planningMonthChanged(){
  rebuildPlanningFilters(document.getElementById('month-filter').value,'');
  await switchPlanningInstant(document.getElementById('planning-sequence-filter').value);
}
async function planningSequenceChanged(){
  await switchPlanningInstant(document.getElementById('planning-sequence-filter').value);
}
async function updateNextPlanningSequence(){
  const month=getPlanningMonthValue();
  const box=document.getElementById('sb-sequence-preview');
  if(!month||!box)return;
  const {data,error}=await SB.from('plan_uploads').select('sequence_no,planning_id')
    .eq('status','complete').eq('planning_month',month+'-01').order('sequence_no',{ascending:false}).limit(1);
  if(error){box.textContent='Sequence check failed: '+error.message;return;}
  const next=(data?.[0]?.sequence_no||0)+1;
  const autoId='P'+String(next).padStart(2,'0');
  const idBox=document.getElementById('sb-planning-id');
  if(idBox && (!idBox.value.trim() || idBox.dataset.auto==='1')){
    idBox.value=autoId;
    idBox.dataset.auto='1';
  }
  box.textContent=`${planningMonthLabel(month)} → Sequence ${next} · Auto ID: ${autoId} (editable)`;
}


function setSupabaseLiveBadge(state,text){
  const el=document.getElementById('supabase-live-badge');
  if(!el)return;
  el.className=state==='ok'?'ok':state==='err'?'err':'';
  el.textContent=text;
}
async function loadCentralAdminSettingsBeforeData(abpRead=null){
  // Master-line configuration must be known BEFORE plan_records are filtered.
  await Promise.allSettled([
    loadChassisPriorityFromSQL(false),
    loadEfficiencyLadderFromSQL(false),
    loadABPTargetFromSQL(false,abpRead)
  ]);
}
async function bootLiveSupabaseData(){
  const finish=startDashboardTiming('boot');
  const homeTiming=startDashboardTiming('home.first-data');
  HOME_FIRST_DATA_TIMING=homeTiming;
  let timingStatus='failed';
  try{
    const generation=SITE_SESSION_GENERATION;
    invalidateSharedReports();
    invalidateTinySettings();
    const abpRead=fetchABPTargetFromSQL();
    setSupabaseLiveBadge('','MySQL · checking live data…');
    await Promise.all([
      loadCentralAdminSettingsBeforeData(abpRead),
      loadS4StrengthsFromSQL(false),
      loadDashboardMasterSettingsFromSQL(),
      loadABPTargetEfficiencyLive(abpRead)
    ]);

    if(generation!==SITE_SESSION_GENERATION||!SITE_AUTH_USER)return false;
    // Cache is only an instant visual bootstrap; it is never treated as the live authority.
    let cached=restoreFastBootCache();
    if(!cached) cached=await restoreDashboardFromCache();

    if(generation!==SITE_SESSION_GENERATION||!SITE_AUTH_USER)return false;
    try{
      const keepId=ACTIVE_PLAN_UPLOAD?.id||null;
      if(!await loadFromSupabase(keepId,true,true))throw Error('Live report load did not complete');
      timingStatus=PLAN_UPLOAD_CATALOG.length?'loaded':'empty';
      if(PLAN_UPLOAD_CATALOG.length)setSupabaseLiveBadge('ok','MySQL Live ✓ · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
      else setSupabaseLiveBadge('','MySQL connected · no planning');
      return true;
    }catch(e){
      console.error('Live MySQL verification failed',e);
      timingStatus=cached?'cached':'failed';
      setSupabaseLiveBadge('err',cached?'MySQL check failed · cached data':'MySQL sync failed');
      if(!cached)throw e;
      return false;
    }
  }finally{
    finish({status:timingStatus});
    if(HOME_FIRST_DATA_TIMING===homeTiming){homeTiming({status:'no-data'});HOME_FIRST_DATA_TIMING=null;}
  }
}

// ===== Instant same-browser refresh cache =====
let SITE_SESSION_GENERATION=0;
const FAST_BOOT_KEY='EKWL_FAST_BOOT_v3';
function dashboardCacheOwner(){return SITE_AUTH_USER?.id||'';}
function dashboardCacheKey(){return SUPABASE_URL+':'+dashboardCacheOwner();}
function fastBootCacheKey(){return FAST_BOOT_KEY+':'+dashboardCacheKey();}
function saveFastBootCache(){
  if(!dashboardCacheOwner())return false;
  try{
    const payload={
      owner:dashboardCacheOwner(),
      activeUpload:ACTIVE_PLAN_UPLOAD,
      catalog:PLAN_UPLOAD_CATALOG,
      planning:capturePlanningState(),
      fabric:FABRIC_CUTTING_DATA,
      sewing:SEWING_IO_DATA,
      production:DATE_WISE_PRODUCTION_DATA,
      sharedReportsLoaded:sharedReportCacheAvailability()
    };
    sessionStorage.setItem(fastBootCacheKey(),JSON.stringify(payload));
    return true;
  }catch(e){console.warn('Fast boot cache save skipped',e);return false;}
}
function restoreFastBootCache(){
  try{
    const raw=sessionStorage.getItem(fastBootCacheKey());
    if(!raw)return false;
    const c=JSON.parse(raw);
    if(!dashboardCacheOwner()||c?.owner!==dashboardCacheOwner()||!c?.planning?.DATA?.length)return false;
    ACTIVE_PLAN_UPLOAD=c.activeUpload||null;
    PLAN_UPLOAD_CATALOG=c.catalog||[];
    restorePlanningState(c.planning);
    FABRIC_CUTTING_DATA=c.fabric||[];
    SEWING_IO_DATA=c.sewing||[];
    DATE_WISE_PRODUCTION_DATA=c.production||[];
    registerSharedReportCache(c.sharedReportsLoaded,{fabric:c.fabric,sewing:c.sewing,production:c.production});
    rebuildPlanningFilters(uploadMonthKey(ACTIVE_PLAN_UPLOAD),ACTIVE_PLAN_UPLOAD?.id);
    if(ACTIVE_PLAN_UPLOAD?.id)PLAN_VERSION_CACHE.set(String(ACTIVE_PLAN_UPLOAD.id),c.planning);
    applySitePermissions();
    renderAll();
    return true;
  }catch(e){console.warn('Fast boot cache restore failed',e);return false;}
}

// ===== Persistent browser cache: instant bootstrap only; live MySQL is always verified =====
const DASH_CACHE_DB='EKWL_Planning_Cache_v3', DASH_CACHE_STORE='snapshots', DASH_CACHE_KEY='dashboard';
function openDashCache(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DASH_CACHE_DB,1);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DASH_CACHE_STORE))r.result.createObjectStore(DASH_CACHE_STORE);};
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
async function saveDashboardCache(){
  const owner=dashboardCacheOwner(),generation=SITE_SESSION_GENERATION,key=dashboardCacheKey();
  if(!owner)return false;
  try{
    const db=await openDashCache();
    if(generation!==SITE_SESSION_GENERATION){db.close();return false;}
    const payload={
      owner,
      savedAt:Date.now(),PLAN_UPLOAD_CATALOG,ACTIVE_PLAN_UPLOAD,
      activeSnapshot:capturePlanningState(),
      // Only the active planning snapshot is persisted. Historical sequences load on demand.
      FABRIC_CUTTING_DATA,SEWING_IO_DATA,DATE_WISE_PRODUCTION_DATA,
      sharedReportsLoaded:sharedReportCacheAvailability()
    };
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(DASH_CACHE_STORE,'readwrite');
      tx.objectStore(DASH_CACHE_STORE).put(payload,key);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
    return true;
  }catch(e){console.warn('Persistent dashboard cache save failed',e);return false;}
}
async function readDashboardCache(){
  const key=dashboardCacheKey(),generation=SITE_SESSION_GENERATION;
  try{
    const db=await openDashCache();
    const val=await new Promise((resolve,reject)=>{
      const tx=db.transaction(DASH_CACHE_STORE,'readonly');
      const r=tx.objectStore(DASH_CACHE_STORE).get(key);
      r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
    });
    db.close();return generation===SITE_SESSION_GENERATION?val:null;
  }catch(e){console.warn('Persistent dashboard cache read failed',e);return null;}
}
async function clearDashboardCache(key=dashboardCacheKey()){
  try{
    const db=await openDashCache();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(DASH_CACHE_STORE,'readwrite');
      tx.objectStore(DASH_CACHE_STORE).delete(key);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  }catch(e){console.warn(e);}
}
async function restoreDashboardFromCache(){
  const c=await readDashboardCache();
  if(!dashboardCacheOwner()||c?.owner!==dashboardCacheOwner()||!c?.activeSnapshot)return false;
  PLAN_UPLOAD_CATALOG=c.PLAN_UPLOAD_CATALOG||[];
  ACTIVE_PLAN_UPLOAD=c.ACTIVE_PLAN_UPLOAD||null;
  PLAN_VERSION_CACHE.clear();
  restorePlanningState(c.activeSnapshot);
  if(ACTIVE_PLAN_UPLOAD?.id) PLAN_VERSION_CACHE.set(String(ACTIVE_PLAN_UPLOAD.id),c.activeSnapshot);
  FABRIC_CUTTING_DATA=c.FABRIC_CUTTING_DATA||[];
  SEWING_IO_DATA=c.SEWING_IO_DATA||[];
  DATE_WISE_PRODUCTION_DATA=c.DATE_WISE_PRODUCTION_DATA||[];
  registerSharedReportCache(c.sharedReportsLoaded,{fabric:c.FABRIC_CUTTING_DATA,sewing:c.SEWING_IO_DATA,production:c.DATE_WISE_PRODUCTION_DATA});
  rebuildPlanningFilters(uploadMonthKey(ACTIVE_PLAN_UPLOAD),ACTIVE_PLAN_UPLOAD?.id);
  applySitePermissions();
  renderAll();
  goSlide(CURRENT_SLIDE);
  setLoadChip('load-plan','ok','Planning ('+DATA.length.toLocaleString()+')');
  setLoadChip('load-fabric','ok','Fabrics & Cutting ('+FABRIC_CUTTING_DATA.length.toLocaleString()+')');
  setLoadChip('load-sewing','ok','Sewing I/O ('+SEWING_IO_DATA.length.toLocaleString()+')');
  setLoadChip('load-production','ok','Date Wise Production ('+DATE_WISE_PRODUCTION_DATA.length.toLocaleString()+')');
  setLoadProgress(100,'Browser cache থেকে instantly loaded');
  setStatus(true,'Cached MySQL reports instantly loaded',
    activePlanningLabel()+' · '+DATA.length+' Plan/Day · '+FABRIC_CUTTING_DATA.length+' Fabric/Cutting · '+SEWING_IO_DATA.length+' Sewing I/O · '+DATE_WISE_PRODUCTION_DATA.length+' Production');
  return true;
}
let SUPABASE_LOAD_TOKEN=0;
async function loadFromSupabase(requestedUploadId=null,preserveFilters=false,reuseCache=false){
  const loadToken=++SUPABASE_LOAD_TOKEN;
  const generation=SITE_SESSION_GENERATION,owner=SITE_AUTH_USER?.id;
  const current=()=>loadToken===SUPABASE_LOAD_TOKEN&&generation===SITE_SESSION_GENERATION&&owner===SITE_AUTH_USER?.id;
  try{
    setStatus(true,'MySQL থেকে reports load হচ্ছে...','3%');
    resetLoadUI();

    const {data:uploads,error:upErr}=await SB.from('plan_uploads')
      .select('*') // Small upload metadata only, including any source revision fields.
      .eq('status','complete')
      .order('uploaded_at',{ascending:false});
    if(!current())return false;
    if(upErr) throw upErr;
    if(!Array.isArray(uploads))throw Error('Planning upload response is incomplete.');
    if(!uploads.length){
      // A successful empty catalog is valid for a new staging DB. Its live response
      // also invalidates any older planning snapshot restored from this user's cache.
      PLAN_UPLOAD_CATALOG=[];ACTIVE_PLAN_UPLOAD=null;PLAN_VERSION_CACHE.clear();
      restorePlanningState({});
      rebuildPlanningFilters('','');
      try{sessionStorage.removeItem(fastBootCacheKey());}catch(e){console.warn(e)}
      await clearDashboardCache();
      if(!current())return false;
      if(typeof invalidateGanttIndex==='function')invalidateGanttIndex();
      renderAll();
      setLoadChip('load-plan','','Planning · no upload');
      setLoadProgress(100,'MySQL connected · planning data not imported yet');
      setStatus(true,'MySQL connected · planning data not imported yet','Complete data migration or upload a Planning CSV.');
      setSupabaseLiveBadge('','MySQL connected · no planning');
      return true;
    }
    PLAN_UPLOAD_CATALOG=uploads;

    const oldMonth=preserveFilters?document.getElementById('month-filter')?.value:'';
    rebuildPlanningFilters(oldMonth,requestedUploadId);
    const selectedId=requestedUploadId || document.getElementById('planning-sequence-filter')?.value || uploads[0].id;
    const upload=uploads.find(u=>String(u.id)===String(selectedId)) || uploads[0];
    ACTIVE_PLAN_UPLOAD=upload;
    const cached=PLAN_VERSION_CACHE.get(String(upload.id));
    const reused=reuseCache&&canReusePlanningSnapshot(cached,upload);
    const snapshot=reused?cached:await fetchPlanningSnapshot(upload);
    if(!current())return false;
    restorePlanningState(snapshot);

    // Keep Slide 15 FR Comparison synchronized with the selected Planning upload.
    if(CURRENT_SLIDE===15 && typeof EFF15_SUB!=='undefined' && EFF15_SUB==='fr'){
      setTimeout(()=>renderEff15LineDateTable(),0);
    }

    // Do not wait for Fabric/Sewing/Production reports before showing Planning slides.
    // This applies to every permitted Planning slide, including Line Calendar.
    refreshPermittedSlides('planning');


    setLoadChip('load-plan','ok','Planning ('+DATA.length.toLocaleString()+')');

    // Shared reports are fetched by the opened feature, never by planning boot.
    setLoadProgress(96,'Planning ready · shared reports load on demand');

    renderAll();
    PLAN_VERSION_CACHE.set(String(upload.id),capturePlanningState());
    if(!reused){saveFastBootCache();await saveDashboardCache();}
    if(!current())return false;
    setLoadProgress(100,reused?'Planning version checked · browser cache reused':'Planning loaded · shared reports load on demand');
    setStatus(true,
      reused?'Planning unchanged · loaded from browser cache':'Planning successfully loaded',
      activePlanningLabel()+' · '+DATA.length+' Plan/Day · '+FABRIC_CUTTING_DATA.length+' Fabric/Cutting · '+SEWING_IO_DATA.length+' Sewing I/O · '+DATE_WISE_PRODUCTION_DATA.length+' Production'
    );
    // Keep whichever tab the user is currently working on.
    if(CURRENT_SLIDE>11)goSlide(CURRENT_SLIDE);
    // Preload other Planning sequences in the background so first selection is also instant.
    // Performance: do not download every historical planning version in background.
    // A version is fetched only when the user explicitly selects it.
    return true;
  }catch(error){
    if(!current())return false;
    console.error(error);
    setSupabaseLiveBadge('err','MySQL sync failed');
    const lf=document.getElementById('load-fill');if(lf)lf.classList.remove('loading');
    setStatus(false,'MySQL load failed: '+(error?.message||error)+'. CSV upload এখনও ব্যবহার করা যাবে.');
    return false;
  }
}

/* ══ FILE HANDLING ══════════════════════════════ */
const dz=document.getElementById('dz');
if(dz){
  dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag')});
  dz.addEventListener('dragleave',()=>dz.classList.remove('drag'));
  dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag');const f=e.dataTransfer.files[0];if(f)readFile(f)});
}

function handleFile(input){if(input.files[0])readFile(input.files[0]);input.value=''}

function readFile(file){const r=new FileReader();r.onload=e=>parseCSV(e.target.result);r.onerror=()=>setStatus(false,'Could not read the selected file.');r.readAsText(file,'UTF-8')}

function parseCSV(text){
 try{
  const records=parseRecords(text);if(!records.length)throw Error('The CSV is empty');
  const headers=records.shift().map(h=>h.toLowerCase().replace(/\s+/g,''));
  const required=['month','line','ewo','buyer','style','smv','orderqty','planqty','deliverydate'];
  for(const k of required)if(!headers.includes(k))throw Error('Missing column: '+k);
  if(new Set(headers).size!==headers.length)throw Error('Duplicate column headers');
  const candidates=[],metadata=new Map();
  records.forEach((cols,i)=>{
   const fail=msg=>{throw Error('Record '+(i+2)+': '+msg)};
   if(cols.length!==headers.length)fail('column count does not match the header');
   const row=Object.fromEntries([...required,'startdate','enddate'].map(k=>[k,cols[headers.indexOf(k)]||'']));
   for(const k of ['month','ewo','buyer','style'])if(!row[k])fail(k+' is required');
   if(!/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}$/.test(row.month))fail('Month must use MMM-YY, for example Apr-26');
   for(const k of ['line','smv','orderqty','planqty']){
    const v=row[k];const plain=/^\d+(\.\d+)?$/.test(v);const grouped=/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v);
    const n=Number(v.replace(/,/g,''));if(!(plain||grouped)||!Number.isFinite(n)||n<0)fail(k+' must be a non-negative number');row[k]=n;
   }
   if(!Number.isInteger(row.line)||!getChassisMasterLines().has(row.line))fail('Line '+row.line+' is not in Admin → Line Wise Chassis Priority master list');
   if(!Number.isInteger(row.orderqty)||!Number.isInteger(row.planqty))fail('Quantities must be whole pieces');
   for(const k of ['deliverydate','startdate','enddate'])if(row[k]&&!validDate(row[k]))fail(k+' must be a valid YYYY-MM-DD date');
   if(Boolean(row.startdate)!==Boolean(row.enddate))fail('Supply both StartDate and EndDate, or leave both empty');
   if(row.startdate>row.enddate)fail('StartDate is after EndDate');
   const key=JSON.stringify([row.month,row.ewo]);const old=metadata.get(key);
   if(old&&['buyer','style','smv','orderqty','deliverydate'].some(k=>old[k]!==row[k]))fail('Conflicting metadata for EWO '+row.ewo+' in '+row.month);
   metadata.set(key,row);candidates.push(row);
  });
  DATA=candidates;MONTHS=sortedMonths(DATA);
  // Legacy local CSV preview must not overwrite the MySQL Planning History filters.
  renderAll();goSlide(CURRENT_SLIDE);setStatus(true,DATA.length+' rows loaded successfully',DATA.length+' rows · '+MONTHS.length+' data months');return true;
 }catch(error){setStatus(false,error.message+' — previous data retained.');return false}
}

function setStatus(ok,msg,count=''){
  document.getElementById('sdot').className='status-dot '+(ok?'ok':'err');
  document.getElementById('status-msg').textContent=msg;
  document.getElementById('row-count').textContent=count;
}

function getFiltered(){
  const m='';
  if(!m) return DATA;

  // Global month filter source of truth = actual Plan/Day dates.
  // A record is included only when it has positive daily plan in the selected month.
  const activeRecordIds=new Set(
    DAILY_PLAN
      .filter(d=>d.value>0 && monthFromISO(d.date)===m)
      .map(d=>String(d.record_id))
  );
  return DATA.filter(r=>activeRecordIds.has(String(r.record_id)));
}


function getMonthFilteredAux(arr){
  const m='';
  return m ? arr.filter(r=>r.month===m) : arr;
}

function applyFilter(){
  trackDashboardFilter('global',()=>{
    if(CURRENT_SLIDE===0)renderHome();
    else if(canAccessSlide(CURRENT_SLIDE))renderSlide(CURRENT_SLIDE);
  });
}
function renderAll(){
 const cfgName=document.getElementById('cfg-name');
 const factory=(cfgName?cfgName.value.trim():'')||'EKWL · HW';
 document.title=factory+' Production Planning Dashboard';
 const brand=document.querySelector('#topnav .brand');if(brand)brand.textContent=factory+' · Production Planning';
 try{renderHome();if(ACTIVE_PLAN_UPLOAD)finishHomeFirstDataTiming()}catch(e){console.error('Home render failed',e)}
 if(CURRENT_SLIDE>=1 && CURRENT_SLIDE<=11 && canAccessSlide(CURRENT_SLIDE)){
   try{renderSlide(CURRENT_SLIDE)}catch(e){console.error(e)}
 }
 if(typeof refreshLoadAnalysisPlan==='function')refreshLoadAnalysisPlan();
}

let HOME_RANGE_PLAN_ID='';
function homeFirstPSDCount(rows,from='',to=''){
  const firstByLineEwo=new Map();
  for(const row of rows){
    const line=Number(row.line),ewo=String(row.ewo||'').trim(),psd=String(row.startdate||'').slice(0,10);
    if(!line||!ewo||!validDate(psd))continue;
    const key=JSON.stringify([line,ewo]);
    if(!firstByLineEwo.has(key)||psd<firstByLineEwo.get(key))firstByLineEwo.set(key,psd);
  }
  return [...firstByLineEwo.values()].filter(psd=>(!from||psd>=from)&&(!to||psd<=to)).length;
}
function clearHomeDateRange(){
  document.getElementById('home-date-from').value='';
  document.getElementById('home-date-to').value='';
  renderHome();
}
function renderHome(){
  if(typeof recordDashboardRender==='function')recordDashboardRender('home');
  const host=document.getElementById('home-live-kpis');
  const detail=document.getElementById('home-live-detail');
  const monthEl=document.getElementById('home-live-month');
  if(!host||!detail)return;

  const fromInput=document.getElementById('home-date-from');
  const toInput=document.getElementById('home-date-to');
  const errorEl=document.getElementById('home-live-date-error');
  const planId=String(ACTIVE_PLAN_UPLOAD?.id||'');
  if(HOME_RANGE_PLAN_ID!==planId){
    HOME_RANGE_PLAN_ID=planId;
    fromInput.value='';toInput.value='';
  }
  const allData=getFiltered();
  const availableDates=[...new Set([
    ...DAILY_PLAN.map(d=>d.date),...allData.map(r=>String(r.startdate||'').slice(0,10))
  ].filter(validDate))].sort();
  const minDate=availableDates[0]||'',maxDate=availableDates.at(-1)||'';
  for(const input of [fromInput,toInput]){input.min=minDate;input.max=maxDate;input.disabled=!availableDates.length;}
  const from=fromInput.value,to=toInput.value;
  const invalid=from&&to&&from>to;
  errorEl.textContent=invalid?'From date must be before To date.':'';
  const selected=from||to ? [from||minDate,to||maxDate].join(' – ') : '';
  if(monthEl) monthEl.textContent='· '+activePlanningLabel()+(selected?' · '+selected:'');
  if(invalid){host.innerHTML='';detail.innerHTML='';return;}

  // Match the selected calendar days to Plan/Day record IDs; plan quantity
  // uses the sum of daily values inside the range, not the full record total.
  const scopedDaily=DAILY_PLAN.filter(d=>d.value>0&&(!from||d.date>=from)&&(!to||d.date<=to));
  const planByRecord=new Map();
  for(const day of scopedDaily){
    const id=String(day.record_id);
    planByRecord.set(id,(planByRecord.get(id)||0)+N(day.value));
  }
  const data=from||to ? allData.filter(r=>planByRecord.has(String(r.record_id)))
    .map(r=>({...r,planqty:planByRecord.get(String(r.record_id))})) : allData;

  if(!allData.length){
    host.innerHTML='<div class="home-quick-box"><b class="home-live-kpi-val">0</b><span>No planning data loaded</span></div>';
    detail.innerHTML='';
    return;
  }

  const orderQty=authoritativeOrderQty(data);
  const planQty=sum(data,'planqty');
  const ewos=getUniqueEWOs(data).length;
  const buyers=new Set(data.map(r=>String(r.buyer||'').trim()).filter(Boolean)).size;
  const master=getChassisMasterLines();
  const activeLines=new Set(data.map(r=>Number(r.line)).filter(n=>master.has(n))).size;

  const dateScope=scopedDaily.filter(d=>master.has(Number(d.line)));
  const activeDates=new Set(dateScope.map(d=>d.date)).size;
  const totalPSD=homeFirstPSDCount(allData,from,to);

  const kpis=[
    ['Total Order Qty',fmt(orderQty),'PCS'],
    ['Total Plan Qty',fmt(planQty),'PCS'],
    ['Unique EWO',fmt(ewos),'Orders'],
    ['Buyers',fmt(buyers),'Active'],
    ['Active Lines',fmt(activeLines),'Master lines only'],
    ['Active Plan Days',fmt(activeDates),'Off-days excluded'],
    ['Total PSD',fmt(totalPSD),'Unique Line × EWO · 1st PSD'],
    ['Plan Rows',fmt(data.length),'Plan/Day rows']
  ];
  host.innerHTML=kpis.map(x=>'<div class="home-quick-box"><b class="home-live-kpi-val">'+x[1]+'</b><span>'+x[0]+'</span><div class="home-live-kpi-label">'+x[2]+'</div></div>').join('');

  // Buyer-wise plan quantity preview
  const buyerMap={};
  data.forEach(r=>{const b=String(r.buyer||'Unknown').trim()||'Unknown';buyerMap[b]=(buyerMap[b]||0)+N(r.planqty)});
  const buyerRows=Object.entries(buyerMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxBuyer=Math.max(1,...buyerRows.map(x=>x[1]));
  const buyerHtml=buyerRows.map(([n,v])=>'<div class="home-mini-row"><div class="home-mini-name" title="'+esc(n)+'">'+esc(n)+'</div><div class="home-mini-track"><div class="home-mini-fill" style="width:'+Math.round(v/maxBuyer*100)+'%"></div></div><div class="home-mini-val">'+fmt(v)+'</div></div>').join('');

  // Product-wise plan quantity preview
  const prodMap={};
  data.forEach(r=>{const p=String(r.style||'Other').trim()||'Other';prodMap[p]=(prodMap[p]||0)+N(r.planqty)});
  const prodRows=Object.entries(prodMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxProd=Math.max(1,...prodRows.map(x=>x[1]));
  const prodHtml=prodRows.map(([n,v])=>'<div class="home-mini-row"><div class="home-mini-name" title="'+esc(n)+'">'+esc(n)+'</div><div class="home-mini-track"><div class="home-mini-fill" style="width:'+Math.round(v/maxProd*100)+'%"></div></div><div class="home-mini-val">'+fmt(v)+'</div></div>').join('');

  // Same winner-cell logic used by Line Running Calendar for priority hit/not-hit.
  const dates=[...new Set(dateScope.map(d=>d.date))].sort();
  const winner=new Map();
  dateScope.forEach(d=>{const k=Number(d.line)+'|'+d.date,old=winner.get(k);if(!old||d.value>old.value)winner.set(k,d)});
  const prMap=new Map(getChassisPriority().map(r=>[Number(r[0]),r]));
  const norm=v=>String(v||'').trim().toUpperCase().replace(/HOODIE/g,'HOODY').replace(/SWEATSHIRT/g,'SWEAT SHIRT').replace(/TANK TOP/g,'TANKTOP').replace(/RUGBY\s+POLO/g,'RUGBY POLO').replace(/\s+/g,' ');
  const tokens=v=>norm(v).split('/').map(x=>x.trim()).filter(Boolean);
  let hit=0,miss=0;
  winner.forEach(w=>{
    const pr=prMap.get(Number(w.line))||[w.line,'',''];
    const allowed=[...tokens(pr[1]),...tokens(pr[2])];
    if(allowed.includes(norm(w.style)))hit++;else miss++;
  });
  const total=hit+miss,hp=total?hit/total*100:0,mp=total?miss/total*100:0;
  const hitHtml='<div class="home-hit-wrap"><div class="home-hit-pie" style="background:conic-gradient(#3aaa63 0 '+hp+'%,#d94a4a '+hp+'% 100%)"><div class="home-hit-hole"><b>'+hp.toFixed(0)+'%</b><span>'+fmt(total)+' cells</span></div></div><div class="home-hit-legend"><div>■ Hit <b>'+hp.toFixed(1)+'% ('+fmt(hit)+')</b></div><div>■ Not Hit <b>'+mp.toFixed(1)+'% ('+fmt(miss)+')</b></div><div>Active Dates <b>'+fmt(dates.length)+'</b></div></div></div>';

  detail.innerHTML='<div class="home-live-detail-grid">'+
    '<div class="home-live-panel"><div class="home-live-panel-title">BUYER WISE PLAN QTY · TOP 6</div>'+buyerHtml+'</div>'+
    '<div class="home-live-panel"><div class="home-live-panel-title">PRODUCT WISE PLAN QTY · TOP 6</div>'+prodHtml+'</div>'+
    '<div class="home-live-panel"><div class="home-live-panel-title">PRIORITY HIT VS NOT HIT</div>'+hitHtml+'</div>'+
    '</div>';
}


let S12_RANGE_PLAN_ID='',S12_RANGE_FROM='',S12_RANGE_TO='';
function s12DateRangeChanged(side){
  const from=document.getElementById('s12-date-from'),to=document.getElementById('s12-date-to');
  S12_RANGE_FROM=from.value;S12_RANGE_TO=to.value;
  if(S12_RANGE_FROM&&S12_RANGE_TO&&S12_RANGE_FROM>S12_RANGE_TO){
    if(side==='from')S12_RANGE_TO=S12_RANGE_FROM;else S12_RANGE_FROM=S12_RANGE_TO;
  }
  renderS12('date');
}
function s12ResetDateRange(){
  const dates=DAILY_PLAN.filter(d=>N(d.value)>0&&validDate(d.date)).map(d=>d.date).sort();
  S12_RANGE_FROM=dates[0]||'';S12_RANGE_TO=dates.at(-1)||'';
  renderS12('date');
}
function fabricEwoColorKey(ewo,color){
  let e=String(ewo??'').trim().toUpperCase();if(/^\d+\.0+$/.test(e))e=e.replace(/\.0+$/,'');
  const c=String(color??'').trim().replace(/\s+/g,' ').toUpperCase();
  return e&&c?JSON.stringify([e,c]):'';
}
function fabricCuttingCascade(all,planKeySet,planMatch,search,selected,changed='',dateKeySet=null){
  const ewoKey=v=>{
    let s=String(v??'').trim().toUpperCase();
    if(/^\d+\.0+$/.test(s))s=s.replace(/\.0+$/,'');
    return s;
  };
  const text=v=>String(v??'').trim();
  const options=rows=>[...new Set(rows.map(text).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const base=all.filter(r=>{
    const key=fabricEwoColorKey(r.ewo,r.color_name),match=!!key&&planKeySet.has(key);
    const inRange=!dateKeySet||dateKeySet.has(key);
    return (planMatch==='nomatch'?!match:match&&inRange)&&
      (!search||[r.ewo,r.color_name,r.buyer,r.item_product_type,r.style_embellishment_type]
        .some(v=>text(v).toLowerCase().includes(search)));
  });
  const fields=[['buyer','buyer'],['product','item_product_type'],['status','status'],['difficulty','cutting_difficulties']];
  const values={},available={};
  const order=changed&&fields.some(([name])=>name===changed)?
    [fields.find(([name])=>name===changed),...fields.filter(([name])=>name!==changed)]:fields;
  let narrowed=base;
  for(const [name,field] of order){
    values[name]=options(narrowed.map(r=>r[field])).includes(selected[name])?selected[name]:'';
    if(values[name])narrowed=narrowed.filter(r=>text(r[field])===values[name]);
  }
  const matches=(r,except)=>fields.every(([name,field])=>name===except||!values[name]||text(r[field])===values[name]);
  for(const [name,field] of fields)available[name]=options(base.filter(r=>matches(r,name)).map(r=>r[field]));
  const rows=base.filter(r=>matches(r,''));
  return {rows,available,values};
}
let S12_EM_ROWS=null,S12_EM_LOADING=false,S12_EM_ERROR='',S12_EM_LOAD_TOKEN=0;
async function loadS12Embellishment(){
  if(S12_EM_LOADING||S12_EM_ROWS!==null||!SB||!SITE_AUTH_USER)return;
  S12_EM_LOADING=true;const session=SITE_SESSION_GENERATION,token=++S12_EM_LOAD_TOKEN,userId=SITE_AUTH_USER.id;
  const current=()=>session===SITE_SESSION_GENERATION&&token===S12_EM_LOAD_TOKEN&&userId===SITE_AUTH_USER?.id;
  try{
    const rows=await loadActiveModuleRows('embellishment');
    if(!current())return;
    S12_EM_ROWS=rows;S12_EM_ERROR='';
  }catch(e){if(current())S12_EM_ERROR='Embellishment data unavailable';}
  finally{if(current()){S12_EM_LOADING=false;if(CURRENT_SLIDE===11)renderS12();}}
}
function s12CuttingWip(keys,cutByKey,sewingByKey,processKeys,embellishmentByKey){
  // A summary with Print/EMB uses its complete receive total minus input.
  const hasProcess=[...keys].some(key=>{const m=embellishmentByKey.get(key);return m&&(N(m.printSend)!==0||N(m.printReceive)!==0||N(m.embSend)!==0||N(m.embReceive)!==0);});
  if(S12_EM_ROWS===null&&[...keys].some(key=>processKeys.has(key)))return null;
  let available=0,input=0;
  for(const key of keys){
    const movement=embellishmentByKey.get(key);
    available+=hasProcess?N(movement?.printReceive)+N(movement?.embReceive):N(cutByKey.get(key));
    input+=N(sewingByKey.get(key)?.input);
  }
  return available-input;
}
function s12EmbellishmentTotals(rows){
  // Sum daily movements across all report dates by EWO and color.
  // Plan dates select the matching pairs, not the movement dates.
  const result=new Map(),num=v=>Number(String(v??'').replace(/,/g,''))||0;
  for(const r of rows||[]){
    const pair=fabricEwoColorKey(r['EWO No'],r.Color);if(!pair)continue;
    if(!result.has(pair))result.set(pair,{print:0,emb:0,printSend:0,printReceive:0,embSend:0,embReceive:0});
    const m=result.get(pair);
    const daily=Object.fromEntries(Object.entries(r).map(([key,value])=>[key.trim().replace(/\s+/g,' '),value]));
    m.printSend+=num(daily['Today Print Send Qty']);
    m.printReceive+=num(daily['Today Print Receive Qty']);
    m.embSend+=num(daily['Today EMB Send Qty']);
    m.embReceive+=num(daily['Today EMB Receive Qty']);
    m.print=m.printSend-m.printReceive;m.emb=m.embSend-m.embReceive;
  }
  return result;
}
function renderS12(changed=''){
  if(!prepareSharedReportView(11))return;
  if(typeof recordDashboardRender==='function')recordDashboardRender('11');
  if(S12_EM_ROWS===null&&!S12_EM_ERROR)loadS12Embellishment();
  document.getElementById('s12-em-msg').textContent=S12_EM_ERROR||(S12_EM_ROWS===null?'Loading Print / Embroidery WIP…':'Today Send / Receive summed across all active report dates · selected Plan EWO + Color');
  const all=FABRIC_CUTTING_DATA||[];
  const buyerEl=document.getElementById('s12-buyer'),prodEl=document.getElementById('s12-product'),
        statusEl=document.getElementById('s12-status'),diffEl=document.getElementById('s12-difficulty');
  if(!buyerEl)return;
  const q=String(document.getElementById('s12-search').value||'').trim().toLowerCase();
  const planMatch=document.getElementById('s12-plan-match').value;
  // Normalize both sources so values such as 271305 and 271305.0 match correctly.
  const ewoKey=v=>{
    let s=String(v??'').trim().toUpperCase();
    if(/^\d+\.0+$/.test(s))s=s.replace(/\.0+$/,'');
    return s;
  };
  const planKeySet=new Set((DATA||[])
    .filter(r=>!r.is_summary_row && ewoKey(r.ewo))
    .map(r=>fabricEwoColorKey(r.ewo,r.color)).filter(Boolean));
  const activeDates=[...new Set(DAILY_PLAN.filter(d=>N(d.value)>0&&validDate(d.date)).map(d=>d.date))].sort();
  const planId=String(ACTIVE_PLAN_UPLOAD?.id||'local');
  if(S12_RANGE_PLAN_ID!==planId){
    S12_RANGE_PLAN_ID=planId;S12_RANGE_FROM=activeDates[0]||'';S12_RANGE_TO=activeDates.at(-1)||'';
  }
  const dateFrom=document.getElementById('s12-date-from'),dateTo=document.getElementById('s12-date-to');
  for(const input of [dateFrom,dateTo]){
    input.disabled=!activeDates.length;input.min=activeDates[0]||'';input.max=activeDates.at(-1)||'';
  }
  if(activeDates.length){
    const clamp=value=>!value||value<activeDates[0]?activeDates[0]:value>activeDates.at(-1)?activeDates.at(-1):value;
    S12_RANGE_FROM=clamp(S12_RANGE_FROM);S12_RANGE_TO=clamp(S12_RANGE_TO);
    if(S12_RANGE_FROM>S12_RANGE_TO)S12_RANGE_TO=S12_RANGE_FROM;
  }
  dateFrom.value=S12_RANGE_FROM;dateTo.value=S12_RANGE_TO;
  document.getElementById('s12-date-all').disabled=!activeDates.length;
  const scopedDaily=DAILY_PLAN.filter(d=>N(d.value)>0&&d.date>=S12_RANGE_FROM&&d.date<=S12_RANGE_TO);
  const embellishmentByKey=s12EmbellishmentTotals(S12_EM_ROWS);
  const embellishmentTotal=(keys,field)=>S12_EM_ROWS===null?'—':fmt([...keys].reduce((sum,key)=>sum+(embellishmentByKey.get(key)?.[field]||0),0));
  const dateKeySet=new Set(scopedDaily.map(d=>fabricEwoColorKey(d.ewo,d.color)).filter(Boolean));
  const planPcsByKey=new Map();
  scopedDaily.forEach(d=>{
    const key=fabricEwoColorKey(d.ewo,d.color);if(key)planPcsByKey.set(key,(planPcsByKey.get(key)||0)+N(d.value));
  });
  document.getElementById('s12-date-note').textContent=planMatch==='nomatch'
    ?'Not in Plan: date range does not apply'
    :fmt(dateKeySet.size)+' planned EWO / Color pairs in selected dates';
  const {rows,available,values}=fabricCuttingCascade(all,planKeySet,planMatch,q,{
    buyer:buyerEl.value,product:prodEl.value,status:statusEl.value,difficulty:diffEl.value
  },changed,dateKeySet);
  const setOpts=(el,label,vals,val)=>{
    el.innerHTML='<option value="">'+label+'</option>'+vals.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
    el.value=val;
  };
  setOpts(buyerEl,'All Buyers',available.buyer,values.buyer);
  setOpts(prodEl,'All Products',available.product,values.product);
  setOpts(statusEl,'All Status',available.status,values.status);
  setOpts(diffEl,'All Cutting Difficulty',available.difficulty,values.difficulty);
  const matchedRows=rows.filter(r=>planKeySet.has(fabricEwoColorKey(r.ewo,r.color_name)));
  const matchedCount=matchedRows.length;
  const matchedEwoCount=new Set(matchedRows.map(r=>ewoKey(r.ewo))).size;
  document.getElementById('s12-count').textContent=fmt(rows.length)+' rows • '+fmt(matchedCount)+' Plan-EWO matched rows';
  const matchNote=document.getElementById('s12-match-note');
  if(matchNote)matchNote.textContent=fmt(matchedEwoCount)+' matched EWO • '+fmt(matchedCount)+' matched rows';

  const total=k=>rows.reduce((s,r)=>s+N(r[k]),0);
  const order=total('color_order_qty'),book=total('fabric_booking_qty'),recv=total('total_fabric_received'),
        cutable=total('cutable_qty'),cut=total('total_cut_qty'),bal=total('cutting_balance');
  const cutPct=order>0?cut/order*100:0;
  const uniqueEwo=new Set(rows.map(r=>String(r.ewo||'')).filter(Boolean)).size;
  const kpis=[
    ['Unique EWO',fmt(uniqueEwo),'Orders'],['Order Qty',fmt(order),'PCS'],['Fabric Booking',fmt(book),'KG'],
    ['Fabric Received',fmt(recv),'KG'],['Cutable Qty',fmt(cutable),'PCS'],['Total Cut Qty',fmt(cut),'PCS'],
    ['Cutting Balance',fmt(bal),'PCS'],['Cutting Progress',cutPct.toFixed(1)+'%','Cut ÷ Order']
  ];
  document.getElementById('s12-kpi').innerHTML=kpis.map(x=>'<div class="kpi"><div class="kpi-val">'+x[1]+'</div><div class="kpi-label">'+x[0]+'</div><div class="kpi-sub">'+x[2]+'</div></div>').join('');

  const plannedLinesByEwo=new Map(),plannedLinesByEwoColor=new Map();
  const ewoColorKey=fabricEwoColorKey;
  const scopedPlanRecords=new Set(scopedDaily.map(d=>String(d.record_id)));
  (DATA||[]).filter(r=>!r.is_summary_row&&scopedPlanRecords.has(String(r.record_id))).forEach(r=>{
    const ewo=ewoKey(r.ewo),line=String(r.line??'').trim();
    if(!ewo||!line||line==='0')return;
    if(!plannedLinesByEwo.has(ewo))plannedLinesByEwo.set(ewo,new Set());
    plannedLinesByEwo.get(ewo).add(line);
    if(String(r.color??'').trim()){
      const key=ewoColorKey(ewo,r.color);
      if(!plannedLinesByEwoColor.has(key))plannedLinesByEwoColor.set(key,new Set());
      plannedLinesByEwoColor.get(key).add(line);
    }
  });
  const processKeys=new Set();
  const hasProcess=value=>!['','no','n','0','false','n/a','na','none','-','—'].includes(String(value??'').trim().toLowerCase());
  (DATA||[]).filter(r=>!r.is_summary_row).forEach(r=>{
    const key=fabricEwoColorKey(r.ewo,r.color);
    if(key&&(hasProcess(r.print)||hasProcess(r.emb)))processKeys.add(key);
  });
  const cutByKey=new Map();
  rows.forEach(r=>{const key=fabricEwoColorKey(r.ewo,r.color_name);if(key)cutByKey.set(key,(cutByKey.get(key)||0)+N(r.total_cut_qty));});
  const cuttingWipTotal=keys=>{const value=s12CuttingWip(keys,cutByKey,sewingByKey,processKeys,embellishmentByKey);return value===null?'—':fmt(value);};
  const sewingByKey=new Map();
  (SEWING_IO_DATA||[]).forEach(r=>{
    const key=fabricEwoColorKey(r.ewo,r.color);if(!key)return;
    if(!sewingByKey.has(key))sewingByKey.set(key,{input:0,output:0,wip:0});
    const metric=sewingByKey.get(key);
    metric.input+=N(r.input);metric.output+=N(r.output);metric.wip+=N(r.wip);
  });
  const sewingTotals=keys=>[...keys].reduce((sum,key)=>{
    const m=sewingByKey.get(key);if(m){sum.input+=m.input;sum.output+=m.output;sum.wip+=m.wip}
    return sum;
  },{input:0,output:0,wip:0});
  const prod={},filteredKeys=new Set();
  rows.forEach(r=>{const k=r.item_product_type||'Other',key=fabricEwoColorKey(r.ewo,r.color_name);
    if(!prod[k])prod[k]={o:0,c:0,f:0,lines:new Set(),keys:new Set()};
    prod[k].o+=N(r.color_order_qty);prod[k].c+=N(r.total_cut_qty);prod[k].f+=N(r.fabric_balance);
    if(key){prod[k].keys.add(key);filteredKeys.add(key)}
    (plannedLinesByEwoColor.get(key)||[]).forEach(line=>prod[k].lines.add(line));
  });
  const productTotals=Object.entries(prod).sort((a,b)=>b[1].c-a[1].c);
  document.getElementById('s12-product-summary').innerHTML=productTotals.map(([name,v])=>{
    const sewing=sewingTotals(v.keys);
    const planPcs=[...v.keys].reduce((sum,key)=>sum+(planPcsByKey.get(key)||0),0);
    return '<tr><td>'+esc(name)+'</td><td>'+([...v.lines].sort((a,b)=>Number(a)-Number(b)).map(x=>esc(x.padStart(2,'0'))).join(', ')||'—')+'</td><td class="num">'+fmt(v.o)+'</td><td class="num">'+fmt(v.c)+'</td><td class="num">'+esc(embellishmentTotal(v.keys,'printSend'))+'</td><td class="num">'+esc(embellishmentTotal(v.keys,'printReceive'))+'</td><td class="num">'+esc(embellishmentTotal(v.keys,'print'))+'</td><td class="num">'+esc(embellishmentTotal(v.keys,'embSend'))+'</td><td class="num">'+esc(embellishmentTotal(v.keys,'embReceive'))+'</td><td class="num">'+esc(embellishmentTotal(v.keys,'emb'))+'</td><td class="num">'+cuttingWipTotal(v.keys)+'</td><td class="num">'+fmt(sewing.input)+'</td><td class="num">'+fmt(sewing.output)+'</td><td class="num">'+fmt(sewing.wip)+'</td><td class="num">'+fmt(planPcs)+'</td><td class="num">'+fmt(sewing.wip-planPcs)+'</td><td class="num">'+(v.o?v.c/v.o*100:0).toFixed(1)+'%</td><td class="num">'+fmt(v.f)+'</td></tr>';
  }).join('')||'<tr><td colspan="14">No data</td></tr>';
  const sewingTotal=sewingTotals(filteredKeys);
  const planPcsTotal=[...filteredKeys].reduce((sum,key)=>sum+(planPcsByKey.get(key)||0),0);
  document.getElementById('s12-product-total').innerHTML='<td>Total</td><td>—</td><td class="num">'+fmt(order)+'</td><td class="num">'+fmt(cut)+'</td><td class="num">'+esc(embellishmentTotal(filteredKeys,'printSend'))+'</td><td class="num">'+esc(embellishmentTotal(filteredKeys,'printReceive'))+'</td><td class="num">'+esc(embellishmentTotal(filteredKeys,'print'))+'</td><td class="num">'+esc(embellishmentTotal(filteredKeys,'embSend'))+'</td><td class="num">'+esc(embellishmentTotal(filteredKeys,'embReceive'))+'</td><td class="num">'+esc(embellishmentTotal(filteredKeys,'emb'))+'</td><td class="num">'+(productTotals.some(([,v])=>s12CuttingWip(v.keys,cutByKey,sewingByKey,processKeys,embellishmentByKey)===null)?'—':fmt(productTotals.reduce((sum,[,v])=>sum+s12CuttingWip(v.keys,cutByKey,sewingByKey,processKeys,embellishmentByKey),0)))+'</td><td class="num">'+fmt(sewingTotal.input)+'</td><td class="num">'+fmt(sewingTotal.output)+'</td><td class="num">'+fmt(sewingTotal.wip)+'</td><td class="num">'+fmt(planPcsTotal)+'</td><td class="num">'+fmt(sewingTotal.wip-planPcsTotal)+'</td><td class="num">'+cutPct.toFixed(1)+'%</td><td class="num">'+fmt(total('fabric_balance'))+'</td>';

  const dm={},difficultyEwos=new Map(),difficultyLines=new Map();
  rows.forEach(r=>{
    const k=String(r.cutting_difficulties||'').trim(),ewo=ewoKey(r.ewo);
    if(!k||/^no difficulty$/i.test(k))return;
    dm[k]=(dm[k]||0)+1;
    if(!difficultyEwos.has(k)){difficultyEwos.set(k,new Set());difficultyLines.set(k,new Set())}
    if(ewo)difficultyEwos.get(k).add(ewo);
    (plannedLinesByEwoColor.get(fabricEwoColorKey(r.ewo,r.color_name))||[]).forEach(line=>difficultyLines.get(k).add(line));
  });
  const difficultyRows=Object.entries(dm).sort((a,b)=>b[1]-a[1]);
  const difficultyTotal=difficultyRows.reduce((sum,[,count])=>sum+count,0);
  const listCell=(items,limit)=>{
    const all=items.map(esc),head=all.slice(0,limit).join(', ');
    return head+(all.length>limit?'<details><summary>Show all '+fmt(all.length)+'</summary>'+all.join(', ')+'</details>':'')||'—';
  };
  document.getElementById('s12-diff-summary').innerHTML=difficultyRows.map(([name,count])=>
    '<tr><td>'+esc(name)+'</td><td class="s12-list-cell">'+listCell([...difficultyLines.get(name)].sort((a,b)=>Number(a)-Number(b)).map(x=>x.padStart(2,'0')),10)+'</td><td class="s12-list-cell">'+listCell([...difficultyEwos.get(name)].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),8)+'</td><td class="num">'+fmt(count)+'</td><td class="num">'+(difficultyTotal?count/difficultyTotal*100:0).toFixed(1)+'%</td></tr>'
  ).join('')||'<tr><td colspan="5">No data</td></tr>';
  document.getElementById('s12-diff-total').innerHTML='<td>Total</td><td>—</td><td>—</td><td class="num">'+fmt(difficultyTotal)+'</td><td class="num">'+(difficultyTotal?'100.0':'0.0')+'%</td>';

  const detailSearch=document.getElementById('s12-detail-ewo').value.trim().toLowerCase();
  const detailStatus=document.getElementById('s12-detail-status').value;
  const detailLineEl=document.getElementById('s12-detail-line');
  const detailBase=rows.filter(r=>String(r.ewo??'').toLowerCase().includes(detailSearch)&&(!detailStatus||(detailStatus==='blank'?!String(r.status??'').trim():/^(close|closed)$/i.test(String(r.status??'').trim()))));
  const detailLines=[...new Set(detailBase.flatMap(r=>[...plannedLinesByEwoColor.get(ewoColorKey(r.ewo,r.color_name))||[]]))].sort((a,b)=>Number(a)-Number(b));
  const selectedDetailLine=detailLineEl.value;
  detailLineEl.innerHTML='<option value="">All Lines</option>'+detailLines.map(line=>'<option value="'+esc(line)+'">'+esc(String(line).padStart(2,'0'))+'</option>').join('');
  detailLineEl.value=detailLines.includes(selectedDetailLine)?selectedDetailLine:'';
  const detailRows=detailBase.filter(r=>!detailLineEl.value||plannedLinesByEwoColor.get(ewoColorKey(r.ewo,r.color_name))?.has(detailLineEl.value));
  const detailKeys=new Set(detailRows.map(r=>ewoColorKey(r.ewo,r.color_name)).filter(Boolean));
  const detailTotal=field=>detailRows.reduce((sum,r)=>sum+N(r[field]),0);
  const movementCells=keys=>['printSend','printReceive','print','embSend','embReceive','emb'].map(field=>'<td class="num">'+esc(embellishmentTotal(keys,field))+'</td>').join('');
  const sewingCells=keys=>{const m=sewingTotals(keys);return ['input','output','wip'].map(field=>'<td class="num">'+fmt(m[field])+'</td>').join('');};
  document.getElementById('s12-body').innerHTML=detailRows.map(r=>'<tr>'+
    '<td>'+([...plannedLinesByEwoColor.get(ewoColorKey(r.ewo,r.color_name))||[]].sort((a,b)=>Number(a)-Number(b)).map(x=>esc(x.padStart(2,'0'))).join(', ')||'—')+'</td>'+
    '<td>'+esc(r.buyer||'')+'</td><td>'+esc(r.ewo||'')+'</td><td>'+esc(r.color_name||'')+'</td>'+
    '<td>'+esc(r.item_product_type||'')+'</td><td>'+esc(r.style_embellishment_type||'')+'</td>'+
    '<td class="num">'+fmt(N(r.color_order_qty))+'</td><td class="num">'+fmt(N(r.fabric_booking_qty))+'</td>'+
    '<td class="num">'+fmt(N(r.total_fabric_received))+'</td><td class="num">'+fmt(N(r.fabric_balance))+'</td>'+
    '<td class="num">'+fmt(N(r.fabric_stock_after_cut))+'</td><td class="num">'+fmt(N(r.cutable_qty))+'</td>'+
    '<td class="num">'+fmt(N(r.total_cut_qty))+'</td>'+movementCells(new Set([ewoColorKey(r.ewo,r.color_name)]))+sewingCells(new Set([ewoColorKey(r.ewo,r.color_name)]))+'<td class="num">'+fmt(N(r.cutting_balance))+'</td>'+
    '<td class="num">'+N(r.cutting_percent).toFixed(1)+'%</td><td>'+esc(r.status||'')+'</td><td>'+esc(r.cutting_difficulties||'')+'</td></tr>').join('');

  document.getElementById('s12-foot').innerHTML='<td colspan="6">TOTAL</td><td class="num">'+fmt(detailTotal('color_order_qty'))+'</td>'+
    '<td class="num">'+fmt(detailTotal('fabric_booking_qty'))+'</td><td class="num">'+fmt(detailTotal('total_fabric_received'))+'</td><td class="num">'+fmt(detailTotal('fabric_balance'))+'</td>'+
    '<td class="num">'+fmt(detailTotal('fabric_stock_after_cut'))+'</td><td class="num">'+fmt(detailTotal('cutable_qty'))+'</td><td class="num">'+fmt(detailTotal('total_cut_qty'))+'</td>'+
    movementCells(detailKeys)+sewingCells(detailKeys)+'<td class="num">'+fmt(detailTotal('cutting_balance'))+'</td><td class="num">'+(detailTotal('color_order_qty')?100*detailTotal('total_cut_qty')/detailTotal('color_order_qty'):0).toFixed(1)+'%</td><td colspan="2"></td>';
  document.getElementById('s12-top-total').innerHTML=document.getElementById('s12-foot').innerHTML;
}

function renderSlide(n){
  if(!canAccessSlide(n))return;
  if(!prepareSharedReportView(n))return;
  const fns={1:renderS1,3:renderS3,5:renderS5,6:renderS6,7:renderS11,8:renderS7,10:renderS9,11:renderS12};
  if(fns[n])fns[n](getFiltered());

  if(n===14)loadOrderBankSlide();
  if(n===15)showEff15Sub(EFF15_SUB||'fixed');
  if(n===16)loadOrderExecutionSlide();
  if(n===21)loadEWOReadinessBoard();
}

// Permission-aware progressive rendering.
// Planning-backed slides (01-10) refresh as soon as Planning + Plan Daily are ready.
// Fabric slide (11) refreshes as soon as Fabric data is ready.
// Admin/User modules remain independent from report loading.
function refreshPermittedSlides(stage='all'){
  if(!canAccessSlide(CURRENT_SLIDE))return;
  const planning=CURRENT_SLIDE>=1&&CURRENT_SLIDE<=10;
  const fabric=CURRENT_SLIDE===11;
  if(CURRENT_SLIDE===21){loadEWOReadinessBoard();return;}
  if((planning&&(stage==='planning'||stage==='all'))||(fabric&&(stage==='fabric'||stage==='all'))){
    try{renderSlide(CURRENT_SLIDE)}catch(e){console.error('Progressive render failed',e)}
  }
}

/* ══ UTILITIES ══════════════════════════════════ */
function groupBy(arr,key){
  return arr.reduce((a,r)=>{(a[r[key]]||(a[r[key]]=[])).push(r);return a},Object.create(null));
}
function sum(arr,key){return arr.reduce((s,r)=>s+N(r[key]),0)}
function unique(arr,key){return [...new Set(arr.map(r=>r[key]))]}

// Get unique EWOs (deduplicate by month+ewo)
function getUniqueEWOs(data){
  const map={};
  data.forEach(r=>{
    const k=JSON.stringify([r.month,r.ewo]);
    if(!map[k]){map[k]={month:r.month,ewo:r.ewo,buyer:r.buyer,style:r.style,smv:r.smv,orderqty:r.orderqty,planqty:0,lines:[],deliverydate:r.deliverydate}}
    map[k].planqty+=r.planqty;
    map[k].lines.push(r.line);
  });
  return Object.values(map);
}

function monthLabel(data){
  const ms=unique(data,'month');
  return ms.length?ms.join(' & '):'-';
}

// AUDIT FIX: Order Qty is order-level metadata and may repeat across Plan/Day
// allocation rows. Count it once per distinct Month + EWO + PO + Color.
// If PO/Color are blank, the key naturally falls back to Month + EWO.
function getUniqueOrderComponents(data){
  const map=new Map();
  data.forEach(r=>{
    const ewo=String(r.ewo??'').trim(); if(!ewo)return;
    const po=String(r.po??'').trim(), color=String(r.color??'').trim();
    const k=JSON.stringify([r.month,ewo,po,color]);
    if(!map.has(k)) map.set(k,{month:r.month,ewo,po,color,buyer:r.buyer,style:r.style,orderqty:N(r.orderqty)});
    else if(N(r.orderqty)>N(map.get(k).orderqty)) map.get(k).orderqty=N(r.orderqty);
  });
  return [...map.values()];
}
function authoritativeOrderQty(data){return (data||[]).reduce((s,r)=>s+N(r.orderqty),0)}
function uniqueOrderQty(data){return authoritativeOrderQty(data)}

/* ══ SLIDE 1: ORDER TABLE ═══════════════════════ */
function s1Fill(id,values,label){
  const el=document.getElementById(id); if(!el)return;
  const cur=el.value;
  const vals=[...new Set(values.map(v=>String(v??'')).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  el.innerHTML='<option value="">'+label+'</option>'+vals.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  if(vals.includes(cur))el.value=cur;
}
function clearOrderFilters(){
  const search=document.getElementById('s1-ewo-search'); if(search)search.value='';
  ['s1-line-filter','s1-ewo-filter','s1-buyer-filter','s1-item-filter'].forEach(id=>document.getElementById(id).value='');
  renderS1(getFiltered());
}

function colorBreakdownHtml(row, view){
  const rows=view.filter(x=>String(x.ewo)===String(row.ewo) && String(x.line)===String(row.line));
  const byColor={};
  rows.forEach(x=>{
    const c=x.color||'(Blank)';
    if(!byColor[c])byColor[c]={order:0,plan:0,pos:new Set()};
    byColor[c].order+=N(x.orderqty); byColor[c].plan+=N(x.planqty);
    if(String(x.po||'').trim()) byColor[c].pos.add(String(x.po).trim());
  });
  const entries=Object.entries(byColor).sort((a,b)=>b[1].order-a[1].order);
  const to=entries.reduce((s,[,v])=>s+v.order,0), tp=entries.reduce((s,[,v])=>s+v.plan,0);
  const allPOs=new Set(); entries.forEach(([,v])=>v.pos.forEach(po=>allPOs.add(po)));
  return '<div class="oh-title">EWO '+esc(row.ewo)+' · Line '+esc(row.line)+' · Color-wise Data</div>'+
    '<table><thead><tr><th>Color</th><th>No. of PO</th><th>Order Qty</th><th>Plan Qty</th></tr></thead><tbody>'+
    entries.map(([c,v])=>'<tr><td>'+esc(c)+'</td><td>'+fmt(v.pos.size)+'</td><td>'+fmt(v.order)+'</td><td>'+fmt(v.plan)+'</td></tr>').join('')+
    '<tr class="oh-total"><td>Total</td><td>'+fmt(allPOs.size)+'</td><td>'+fmt(to)+'</td><td>'+fmt(tp)+'</td></tr></tbody></table>';
}
function showOrderHover(ev,idx){
  const row=window.__S1_VIEW[idx], box=document.getElementById('order-hover');
  if(!row||!box)return;
  box.innerHTML=colorBreakdownHtml(row,window.__S1_VIEW);
  box.style.display='block'; moveOrderHover(ev);
}
function moveOrderHover(ev){
  const box=document.getElementById('order-hover'); if(!box||box.style.display==='none')return;
  const pad=14,w=box.offsetWidth,h=box.offsetHeight;
  let x=ev.clientX+14,y=ev.clientY+14;
  if(x+w>innerWidth-pad)x=ev.clientX-w-14;
  if(y+h>innerHeight-pad)y=ev.clientY-h-14;
  box.style.left=Math.max(pad,x)+'px';box.style.top=Math.max(pad,y)+'px';
}
function hideOrderHover(){const b=document.getElementById('order-hover');if(b)b.style.display='none'}

function renderS1(data){
  if(typeof recordDashboardRender==='function')recordDashboardRender('1');
  const ml=monthLabel(data);
  document.getElementById('s1-month').textContent=ml;

  // Cascading filters:
  // Line -> EWO -> Buyer -> Item
  // Each next dropdown only shows values available after previous selections.
  const lineEl=document.getElementById('s1-line-filter');
  const ewoEl=document.getElementById('s1-ewo-filter');
  const buyerEl=document.getElementById('s1-buyer-filter');
  const itemEl=document.getElementById('s1-item-filter');

  s1Fill('s1-line-filter',data.map(r=>r.line),'All Lines');
  const line=lineEl.value;
  const ewoSearch=(document.getElementById('s1-ewo-search')?.value||'').trim().toLowerCase();

  const searched=data.filter(r=>!ewoSearch || String(r.ewo).toLowerCase().includes(ewoSearch));
  const afterLine=searched.filter(r=>!line || String(r.line)===line);
  s1Fill('s1-ewo-filter',afterLine.map(r=>r.ewo),'All EWO');
  const ewo=ewoEl.value;

  const afterEwo=afterLine.filter(r=>!ewo || String(r.ewo)===ewo);
  s1Fill('s1-buyer-filter',afterEwo.map(r=>r.buyer),'All Buyers');
  const buyer=buyerEl.value;

  const afterBuyer=afterEwo.filter(r=>!buyer || String(r.buyer)===buyer);
  s1Fill('s1-item-filter',afterBuyer.map(r=>r.style),'All Items');
  const item=itemEl.value;

  const view=afterBuyer.filter(r=>!item || String(r.style)===item);

  document.getElementById('s1-count').textContent=
    view.length===data.length ? `${view.length} rows` : `${view.length} filtered / ${data.length} rows`;

  // Correct source rule verified against Planning Data:
  // after Criteria=Plan/Day and valid EKWL lines (1–45,47,48), Order Qty is
  // the direct SUM of column M / order_qty. Do NOT deduplicate Order Qty.
  // Invalid source lines (46,49,50,51+) are excluded upstream by isChassisMasterLine().
  const totOrd=authoritativeOrderQty(view);
  const totPlan=sum(view,'planqty');
  const ewos=getUniqueEWOs(view).length;
  const buyers=unique(view,'buyer').length;
  const lines=unique(view,'line').length;

  document.getElementById('s1-kpi').innerHTML=`
    <div class="kpi"><div class="kpi-lbl">Total Rows</div><div class="kpi-val">${view.length}</div><div class="kpi-sub">Filtered entries</div></div>
    <div class="kpi"><div class="kpi-lbl">Unique EWOs</div><div class="kpi-val">${ewos}</div><div class="kpi-sub">Work orders</div></div>
    <div class="kpi"><div class="kpi-lbl">Total Order</div><div class="kpi-val">${fmt(totOrd)}</div><div class="kpi-sub">PCS · Valid Lines Plan/Day SUM</div></div>
    <div class="kpi"><div class="kpi-lbl">Total Plan</div><div class="kpi-val">${fmt(totPlan)}</div><div class="kpi-sub">PCS</div></div>
    <div class="kpi"><div class="kpi-lbl">Buyers</div><div class="kpi-val">${buyers}</div><div class="kpi-sub">Active</div></div>
    <div class="kpi"><div class="kpi-lbl">Lines Used</div><div class="kpi-val">${lines}</div><div class="kpi-sub">Sewing lines</div></div>`;

  window.__S1_VIEW=view;
  document.getElementById('s1-body').innerHTML=view.map((r,i)=>`<tr>
    <td>${esc(r.month)}</td><td class="cen">${r.line}</td>
    <td class="num hoverable" onmouseenter="showOrderHover(event,${i})" onmousemove="moveOrderHover(event)" onmouseleave="hideOrderHover()">${esc(r.ewo)}</td>
    <td>${esc(r.buyer)}</td><td>${itemChip(r.style)}</td><td class="num">${r.smv}</td>
    <td class="num hoverable" onmouseenter="showOrderHover(event,${i})" onmousemove="moveOrderHover(event)" onmouseleave="hideOrderHover()">${fmt(r.orderqty)}</td><td class="num">${fmt(r.planqty)}</td>
    <td>${esc(r.pcddate)}</td><td>${esc(r.startdate)}</td><td>${esc(r.enddate)}</td>
    <td>${esc(r.deliverydate)}</td><td class="num">1</td></tr>`).join('');

  document.getElementById('s1-foot').innerHTML=`
    <td colspan="6">Total</td><td class="num">${fmt(totOrd)}</td>
    <td class="num">${fmt(totPlan)}</td><td colspan="5"></td>`;
}

/* ══ SLIDE 2: PLAN QTY ANALYSIS ════════════════ */

let S2_LINE_DETAILS=[];
let S2_RANGE_PLAN_ID=null,S2_RANGE_FROM='',S2_RANGE_TO='';
function s2DateRangeRows(rows,daily,from,to){
  if(!from||!to)return rows;
  return rows.filter(row=>validDate(row.startdate)&&row.startdate>=from&&row.startdate<=to);
}
function s2DateRangeChanged(which){
  const from=document.getElementById('s2-date-from'),to=document.getElementById('s2-date-to');
  if(!from||!to)return;
  if(from.value>to.value){if(which==='from')to.value=from.value;else from.value=to.value;}
  S2_RANGE_FROM=from.value;S2_RANGE_TO=to.value;
  renderS2(getFiltered());
}
function s2ResetDateRange(){S2_RANGE_PLAN_ID=null;renderS2(getFiltered());}
function closeS2LineDetails(){
  const dialog=document.getElementById('s2-line-dialog');
  if(dialog){if(dialog.open)dialog.close();dialog.remove();}
}
function buildS2EwoRows(rows){
  const groups=new Map();
  rows.forEach(r=>{
    const ewo=String(r.ewo??'').trim();
    if(!groups.has(ewo))groups.set(ewo,{ewo,items:new Set(),colors:new Set(),smvs:new Set(),pos:new Set(),orderqty:0,planqty:0});
    const g=groups.get(ewo);
    if(String(r.style??'').trim())g.items.add(String(r.style).trim());
    if(String(r.color??'').trim())g.colors.add(String(r.color).trim());
    if(r.smv!=null && String(r.smv).trim()!=='')g.smvs.add(Number.isFinite(Number(r.smv))?String(Number(r.smv)):String(r.smv).trim());
    if(String(r.po??'').trim())g.pos.add(String(r.po).trim());
    g.orderqty+=N(r.orderqty);g.planqty+=N(r.planqty);
  });
  return [...groups.values()].sort((a,b)=>a.ewo.localeCompare(b.ewo,undefined,{numeric:true}));
}
function summarizeS2Line(groups){
  const colors=new Set(),pos=new Set(),smvs=new Set();
  groups.forEach(g=>{g.colors.forEach(v=>colors.add(v));g.pos.forEach(v=>pos.add(v));g.smvs.forEach(v=>smvs.add(v));});
  return {ewos:groups.filter(g=>g.ewo).length,colors:colors.size,pos:pos.size,smvs,
    orderqty:groups.reduce((s,g)=>s+g.orderqty,0),planqty:groups.reduce((s,g)=>s+g.planqty,0)};
}
function openS2LineDetails(index){
  const detail=S2_LINE_DETAILS[index];if(!detail)return;
  closeS2LineDetails();
  const groups=buildS2EwoRows(detail.rows);
  const totals=summarizeS2Line(groups);
  const dialog=document.createElement('dialog');dialog.id='s2-line-dialog';
  dialog.setAttribute('aria-labelledby','s2-line-dialog-title');
  const list=values=>[...values].map(esc).join(', ')||'—';
  dialog.innerHTML='<header><div><h2 id="s2-line-dialog-title">Line '+esc(detail.line)+' · '+esc(detail.range)+'</h2><p>'+esc(S2_RANGE_FROM&&S2_RANGE_TO?S2_RANGE_FROM+' – '+S2_RANGE_TO:sortedMonths(detail.rows).join(' & '))+' · '+groups.length+' EWO(s)</p></div><button type="button" class="s2-dialog-close" aria-label="Close EWO details">✕</button></header>'+
    '<p class="s2-detail-note">Range uses Order Qty for this Line + EWO across matching PO and colours whose Plan Data PSD falls in the selected dates. Plan Qty is the source Plan Qty for those rows; blank Colour and PO values are excluded from their unique counts.</p>'+
    '<div class="s2-line-kpis">'+[
      ['Total EWO',fmt(totals.ewos)],['Unique Colours',fmt(totals.colors)],
      ['Total Order Qty',fmt(totals.orderqty)],['Total Plan Qty',fmt(totals.planqty)],
      ['Unique PO Count',fmt(totals.pos)],['Unique SMV',list(totals.smvs)]
    ].map(([label,value])=>'<div><span>'+label+'</span><strong>'+value+'</strong></div>').join('')+'</div>'+
    '<div class="s2-detail-scroll"><table><thead><tr><th>EWO</th><th>Product</th><th>Total Colours</th><th>Colour</th><th>Total Order Qty</th><th>Total Plan Qty</th><th>Unique SMV</th><th>Unique PO Count</th></tr></thead><tbody>'+
    groups.map(g=>'<tr><td>'+esc(g.ewo||'—')+'</td><td>'+list(g.items)+'</td><td class="num">'+fmt(g.colors.size)+'</td><td>'+list(g.colors)+'</td><td class="num">'+fmt(g.orderqty)+'</td><td class="num">'+fmt(g.planqty)+'</td><td>'+list(g.smvs)+'</td><td class="num">'+fmt(g.pos.size)+'</td></tr>').join('')+
    '</tbody></table></div>';
  document.body.appendChild(dialog);
  dialog.querySelector('.s2-dialog-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();
}

function renderS2(data){
  if(!document.getElementById('s2'))return;
  closeS2LineDetails();
  S2_LINE_DETAILS=[];
  const dates=[...new Set(DATA.filter(r=>validDate(r.startdate)).map(r=>r.startdate))].sort();
  const planId=String(ACTIVE_PLAN_UPLOAD?.id||'local');
  if(S2_RANGE_PLAN_ID!==planId){
    S2_RANGE_PLAN_ID=planId;S2_RANGE_FROM=dates[0]||'';S2_RANGE_TO=dates.at(-1)||'';
  }
  const from=document.getElementById('s2-date-from'),to=document.getElementById('s2-date-to'),all=document.getElementById('s2-date-all');
  for(const input of [from,to]){
    input.disabled=!dates.length;input.min=dates[0]||'';input.max=dates.at(-1)||'';
  }
  if(dates.length){
    const clamp=value=>!value||value<dates[0]?dates[0]:value>dates.at(-1)?dates.at(-1):value;
    S2_RANGE_FROM=clamp(S2_RANGE_FROM);S2_RANGE_TO=clamp(S2_RANGE_TO);
    if(S2_RANGE_FROM>S2_RANGE_TO)S2_RANGE_TO=S2_RANGE_FROM;
  }
  from.value=S2_RANGE_FROM;to.value=S2_RANGE_TO;all.disabled=!dates.length;
  const formatDate=value=>new Date(value+'T00:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
  document.getElementById('s2-months').textContent=dates.length
    ?formatDate(S2_RANGE_FROM)+' – '+formatDate(S2_RANGE_TO):sortedMonths(data).join(' & ');

  // Slide 02 authoritative source = Planning Data rows where Criteria = Plan/Day.
  // This matches the Excel cross-check: Order qty column filtered to Plan/Day.
  // `data` is already the normalized Plan/Day planning dataset used by this dashboard.
  // Do not re-filter on r.criteria here: that field is not retained in this runtime view.
  const s2Source=dates.length?s2DateRangeRows(data,DAILY_PLAN,S2_RANGE_FROM,S2_RANGE_TO):data;

  // Range basis: source PSD-filtered Order Qty by Line + EWO. Unique EWO buckets aggregate across lines.
  const ewoOrderMap=new Map();
  s2Source.forEach(r=>{
    const k=JSON.stringify([String(r.line),String(r.ewo??'').trim()]);
    if(!ewoOrderMap.has(k)) ewoOrderMap.set(k,{
      line:String(r.line),ewo:String(r.ewo??'').trim(),buyer:r.buyer||'',style:r.style||'',
      orderqty:0,lines:[]
    });
    const e=ewoOrderMap.get(k);
    e.orderqty+=N(r.orderqty);
    if(r.line!=null && String(r.line).trim()!=='') e.lines.push(String(r.line));
  });
  const allUniqueEWOs=[...ewoOrderMap.values()];
  const totalOrderQty=authoritativeOrderQty(s2Source);

  const RANGES=[
    {lbl:'Below 500',min:0,max:500},
    {lbl:'501-1000',min:501,max:1000},
    {lbl:'1001-2000',min:1001,max:2000},
    {lbl:'2001-3000',min:2001,max:3000},
    {lbl:'3001-5000',min:3001,max:5000},
    {lbl:'5001-8000',min:5001,max:8000},
    {lbl:'Above 8000',min:8001,max:Infinity}
  ];

  const ewoTotals=new Map();
  allUniqueEWOs.forEach(e=>{if(e.ewo)ewoTotals.set(e.ewo,(ewoTotals.get(e.ewo)||0)+e.orderqty);});
  const totalStyles=allUniqueEWOs.length;
  const stats=RANGES.map(r=>{
    const matched=allUniqueEWOs.filter(e=>e.orderqty>=r.min && e.orderqty<=r.max);
    const count=matched.length;
    const orderQty=matched.reduce((s,e)=>s+N(e.orderqty),0);
    return {...r,count,ewoCount:[...ewoTotals.values()].filter(q=>q>=r.min&&q<=r.max).length,orderQty,pct:totalStyles ? count/totalStyles*100 : 0};
  });
  const lowCount=stats.slice(0,5).reduce((s,r)=>s+r.count,0);
  const highCount=stats.slice(5).reduce((s,r)=>s+r.count,0);
  const lowPct=totalStyles ? lowCount/totalStyles*100 : 0;
  const highPct=totalStyles ? highCount/totalStyles*100 : 0;
  const pct=v=>`${Math.round(v)}%`;

  let html=`<table class="qty-range-ref">
    <thead><tr>
      <th>Order QTY Range</th><th>No Of Line–EWO</th><th>EWO Count</th><th>Order Qty</th><th>Percentage</th><th>Summary</th>
    </tr></thead><tbody>`;

  stats.forEach((r,i)=>{
    const low=i<5;
    html+=`<tr class="${low?'range-low':'range-high'}">
      <td>${esc(r.lbl)}</td>
      <td class="num">${fmt(r.count)}</td>
      <td class="num">${fmt(r.ewoCount)}</td>
      <td class="num">${fmt(r.orderQty)}</td>
      <td class="num">${pct(r.pct)}</td>`;
    if(i===0) html+=`<td class="summary-low" rowspan="5">${pct(lowPct)}</td>`;
    if(i===5) html+=`<td class="summary-high" rowspan="2">${pct(highPct)}</td>`;
    html+=`</tr>`;
  });
  html+=`<tr class="range-total">
    <td>Total Line–EWO</td><td class="num">${fmt(totalStyles)}</td><td class="num">${fmt(ewoTotals.size)}</td><td class="num">${fmt(totalOrderQty)}</td><td class="num">${totalStyles?'100%':'0%'}</td><td class="num">${totalStyles?'100%':'0%'}</td>
  </tr></tbody></table>`;
  document.getElementById('s2-legacy-range-wrap').innerHTML=`
    <div style="display:flex;justify-content:flex-end;align-items:center;margin:0 0 8px">
      <div style="border:1px solid #c9d8e8;border-radius:7px;background:#f5f9fd;padding:7px 12px;font-size:12px;color:#28445f">
        <span style="font-weight:700">Total Order Qty</span>
        <strong style="margin-left:8px;font-size:15px;color:#0d3157">${fmt(totalOrderQty)} pcs</strong>
      </div>
    </div>`+html+'<p class="s2-detail-note">Date filter: Plan Data PSD. EWO Count: one range per EWO using its total Order Qty across lines. Line–EWO and Order Qty: line-level ranges.</p>';
  document.getElementById('s2-top-pie').innerHTML=`
    <div class="s2-top-pie-title">📊 LINE–EWO DISTRIBUTION</div>
    <div class="s2-top-pie-body">
      <div class="s2-top-donut" style="background:conic-gradient(#79c7df 0 ${lowPct}%, #58b63d ${lowPct}% 100%)">
        <div class="s2-top-hole"><b>${fmt(totalStyles)}</b><span>Line–EWO</span></div>
      </div>
      <div class="s2-top-legend">
        <div class="lg"><i style="background:#79c7df"></i><div>5000 or fewer<strong>${pct(lowPct)} (${fmt(lowCount)})</strong></div></div>
        <div class="lg"><i style="background:#58b63d"></i><div>Above 5000<strong>${pct(highPct)} (${fmt(highCount)})</strong></div></div>
      </div>
    </div>`;

  // Keep the existing lower distribution section, but use the same range basis.
  const maxV=Math.max(...stats.map(r=>r.count),1);
  document.getElementById('s2-bar').innerHTML=stats.map(r=>{
    const rangeEwoSet=new Set(allUniqueEWOs
      .filter(e=>e.orderqty>=r.min && e.orderqty<=r.max)
      .map(e=>JSON.stringify([e.line,String(e.ewo)])));
    const lines=[...new Set(s2Source
      .filter(x=>rangeEwoSet.has(JSON.stringify([String(x.line),String(x.ewo??'').trim()])))
      .map(x=>String(x.line)).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    return `<div class="bar-row" style="align-items:flex-start">
      <div class="bar-lbl">${esc(r.lbl)}</div>
      <div style="flex:1;display:flex;flex-direction:column;gap:3px">
        <div class="bar-wrap" style="height:14px">
          <div class="bar-fill" style="width:${Math.round(r.count/maxV*100)}%"></div>
          <div class="bar-val">${r.count}</div>
        </div>
        <div class="range-lines"><span class="range-line-label">Lines:</span>
          ${lines.length?lines.map(l=>{const index=S2_LINE_DETAILS.push({line:l,range:r.lbl,rows:s2Source.filter(x=>String(x.line)===l&&rangeEwoSet.has(JSON.stringify([String(x.line),String(x.ewo??'').trim()])) )})-1;return `<button type="button" class="range-line-chip" data-s2-detail="${index}" aria-label="View EWO details for line ${esc(l)}, ${esc(r.lbl)}">${esc(l)}</button>`;}).join(''):'<span class="range-line-label">—</span>'}
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('s2-bar').onclick=e=>{const button=e.target.closest('button[data-s2-detail]');if(button)openS2LineDetails(Number(button.dataset.s2Detail));};
  document.getElementById('s2-summary').innerHTML=`<div class="range-summary">
    <div class="rsum-box"><div class="rsum-title">5000 or fewer</div><div class="rsum-val">${pct(lowPct)}</div><div class="rsum-sub">${lowCount} of ${totalStyles} Line–EWOs</div></div>
    <div class="rsum-box"><div class="rsum-title">Above 5000</div><div class="rsum-val">${pct(highPct)}</div><div class="rsum-sub">${highCount} of ${totalStyles} Line–EWOs</div></div>
  </div>`;
}

/* ══ SLIDE 3: BUYER SUMMARY ═════════════════════ */
function renderS3PlanPie(id,entries){
 const total=entries.reduce((s,e)=>s+N(e[1]),0),colors=['#2563eb','#10b981','#f59e0b','#8b5cf6','#06b6d4','#f43f5e','#64748b','#ea580c','#14b8a6','#6366f1','#a855f7','#84cc16'];
 const cx=250,cy=145,rx=190,ry=108;let angle=-Math.PI/2;
 const slices=entries.filter(e=>N(e[1])>0).map((e,i)=>{const start=angle;angle+=N(e[1])/total*Math.PI*2;return {name:e[0],qty:N(e[1]),pct:N(e[1])/total*100,start,end:angle,color:colors[i%colors.length]};});
 const shape=r=>{if(slices.length===1)return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${r.color}"/>`;const a=[cx+rx*Math.cos(r.start),cy+ry*Math.sin(r.start)],b=[cx+rx*Math.cos(r.end),cy+ry*Math.sin(r.end)];return `<path d="M ${cx} ${cy} L ${a[0]} ${a[1]} A ${rx} ${ry} 0 ${r.end-r.start>Math.PI?1:0} 1 ${b[0]} ${b[1]} Z" fill="${r.color}" stroke="white" stroke-width="1.5"><title>${esc(r.name)}: ${fmt(r.qty)} pcs (${r.pct.toFixed(1)}%)</title></path>`;};
 const svg=`<svg viewBox="0 0 500 290" role="img" aria-label="Plan quantity distribution"><title>Plan Qty ${fmt(total)} pcs</title><g transform="translate(0 12)" style="filter:brightness(.8)">${slices.map(shape).join('')}</g>${slices.map(shape).join('')}</svg>`;
 document.getElementById(id).innerHTML=total?'<div class="plan-pie-total"><span>Total Plan Qty</span><strong>'+fmt(total)+' <small>pcs</small></strong></div>'+svg+'<div class="plan-pie-key">'+slices.map(r=>'<div><i style="background:'+r.color+'"></i><span>'+esc(r.name)+'</span><b>'+fmt(r.qty)+'</b><strong>'+r.pct.toFixed(1)+'%</strong></div>').join('')+'</div>':'<p class="plan-pie-empty">No Plan Qty in selected dates.</p>';
}
async function copyReportData(button){
 const card=button.closest('.card'),tables=[...card.querySelectorAll('table')];
 const text=tables.length?tables.map(t=>[...t.rows].map(r=>[...r.cells].map(c=>c.innerText.replace(/\s+/g,' ').trim()).join('\t')).join('\n')).join('\n\n'):card.innerText;
 try{await navigator.clipboard.writeText(text);button.textContent='Copied';}catch(e){button.textContent='Copy unavailable';}setTimeout(()=>button.textContent='Copy data',2000);
}
async function captureReport(button,mode){
 const card=button.closest('.card');button.disabled=true;
 try{
  const html2canvas=await ensureHtml2Canvas();
  if(!card.id)card.id='report-'+Date.now();const id=card.id;
  const tables=[...card.querySelectorAll('table')];
  const captureWidth=Math.ceil(Math.max(card.clientWidth,card.scrollWidth,...tables.map(t=>Math.max(t.scrollWidth,t.getBoundingClientRect().width)+48)));
  const canvas=await html2canvas(card,{backgroundColor:'#fff',scale:Math.min(2,window.devicePixelRatio||2),useCORS:true,logging:false,windowWidth:Math.max(window.innerWidth,captureWidth+64),scrollX:0,scrollY:0,onclone:doc=>{
   const clone=doc.getElementById(id);clone.querySelectorAll('.report-actions').forEach(e=>e.remove());
   clone.style.setProperty('width',captureWidth+'px','important');clone.style.setProperty('max-width','none','important');clone.style.setProperty('height','auto','important');clone.style.setProperty('max-height','none','important');clone.style.setProperty('overflow','visible','important');
   for(let parent=clone.parentElement;parent;parent=parent.parentElement){parent.style.setProperty('overflow','visible','important');parent.style.setProperty('max-height','none','important');parent.style.setProperty('contain','none','important');}
   clone.querySelectorAll('*').forEach(e=>{if(e.matches('.tbl-wrap,.cal-wrap')||['auto','scroll','hidden'].includes(getComputedStyle(e).overflowY)||['auto','scroll','hidden'].includes(getComputedStyle(e).overflowX)){e.style.setProperty('max-height','none','important');e.style.setProperty('height','auto','important');e.style.setProperty('max-width','none','important');e.style.setProperty('overflow','visible','important');e.scrollTop=0;e.scrollLeft=0;}
    if(e.matches('thead,tfoot,th,td')&&['sticky','fixed'].includes(getComputedStyle(e).position)){e.style.setProperty('position','static','important');e.style.setProperty('top','auto','important');e.style.setProperty('bottom','auto','important');}
   });
   clone.querySelectorAll('table').forEach(t=>{t.style.setProperty('width','100%','important');});
  }});
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Image failed');
  if(mode==='copy'&&navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);button.textContent='Copied';return;}catch(e){}}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='EKWL-'+id+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){button.textContent='Image failed';}finally{button.disabled=false;setTimeout(()=>button.textContent=mode==='copy'?'Copy image':'Download PNG',2000);}
}
function setupReportActions(){
 document.querySelectorAll('.card').forEach(card=>{
  if(!card.querySelector('table')&&!card.querySelector('#s3-buyer-pie,#s3-product-pie'))return;
  if(card.querySelector(':scope > .report-actions'))return;
  const actions=document.createElement('div');actions.className='report-actions';actions.innerHTML='<button class="pg-btn" onclick="copyReportData(this)">Copy data</button><button class="pg-btn" onclick="captureReport(this,\'copy\')">Copy image</button><button class="pg-btn" onclick="captureReport(this,\'download\')">Download PNG</button>';card.prepend(actions);
 });
}
document.addEventListener('DOMContentLoaded',setupReportActions);
let s4ResizeTimer;window.addEventListener('resize',()=>{clearTimeout(s4ResizeTimer);s4ResizeTimer=setTimeout(()=>{if(CURRENT_SLIDE===10)renderS4(getFiltered());},120);});
let S3_RANGE_PLAN=null,S3_RANGE_FROM='',S3_RANGE_TO='';
function s3DateRangeChanged(which){
 const f=document.getElementById('s3-date-from'),t=document.getElementById('s3-date-to');
 if(f.value&&t.value&&f.value>t.value){if(which==='from')t.value=f.value;else f.value=t.value;}
 S3_RANGE_FROM=f.value;S3_RANGE_TO=t.value;renderS3(getFiltered());
}
function renderS3(data){
  if(typeof recordDashboardRender==='function')recordDashboardRender('3');
 const dates=[...new Set(DATA.map(r=>r.startdate).filter(validDate))].sort();
 const plan=String(ACTIVE_PLAN_UPLOAD?.id||'local');
 if(S3_RANGE_PLAN!==plan){S3_RANGE_PLAN=plan;const month=uploadMonthKey(ACTIVE_PLAN_UPLOAD),monthDates=dates.filter(d=>d.slice(0,7)===month);S3_RANGE_FROM=monthDates[0]||dates[0]||'';S3_RANGE_TO=monthDates.at(-1)||dates.at(-1)||'';}
 const from=document.getElementById('s3-date-from'),to=document.getElementById('s3-date-to');
 from.value=S3_RANGE_FROM;to.value=S3_RANGE_TO;
 for(const input of [from,to]){input.min=dates[0]||'';input.max=dates.at(-1)||'';input.disabled=!dates.length;}
 if(S3_RANGE_FROM&&S3_RANGE_TO)data=data.filter(r=>validDate(r.startdate)&&r.startdate>=S3_RANGE_FROM&&r.startdate<=S3_RANGE_TO);

  const ml=monthLabel(data);
  document.getElementById('s3-month').textContent=ml;


  const byBuyer=groupBy(data,'buyer');
  const selectedMonth='';
  const activeBuyers=new Set(data.map(r=>String(r.buyer)));
  const buyerPlanScope=data;
  const scopeKeys=new Set(data.map(r=>JSON.stringify([String(r.line),String(r.ewo).trim(),String(r.color||'').trim().toUpperCase()])));
  const inScope=r=>scopeKeys.has(JSON.stringify([String(r.line),String(r.ewo).trim(),String(r.color||'').trim().toUpperCase()]));
  const poKey=r=>JSON.stringify([String(r.ewo).trim(),String(r.po||'').trim().toUpperCase()]);
  const isDummy=r=>/^D-/i.test(String(r.po||'').trim());
  const metricDateMatches=r=>!S3_RANGE_FROM||!S3_RANGE_TO||validDate(r.startdate)&&r.startdate>=S3_RANGE_FROM&&r.startdate<=S3_RANGE_TO;
  const sahScope=SAH_DATA.filter(r=>activeBuyers.has(String(r.buyer))&&metricDateMatches(r));
  const clockScope=CLOCK_HOUR_DATA.filter(r=>activeBuyers.has(String(r.buyer))&&metricDateMatches(r));
  // Buyer Summary Order Qty: direct SUM of Order Qty from Plan/Day rows.
  // This intentionally matches the Planning Data / Excel Plan/Day cross-check.
  const totOrd=authoritativeOrderQty(buyerPlanScope);
  const totPlan=sum(buyerPlanScope,'planqty');
  let totHrs=0,rows=[];

  Object.entries(byBuyer).forEach(([buyer,rws])=>{
    const buyerPlanRows=buyerPlanScope.filter(x=>String(x.buyer)===String(buyer));
    const ordQty=authoritativeOrderQty(buyerPlanRows);
    const planQty=sum(buyerPlanRows,'planqty');
    const totalPOQty=new Set(buyerPlanRows.filter(x=>String(x.po||'').trim()).map(poKey)).size;
    const dummyRows=buyerPlanRows.filter(isDummy);
    const dummyPOQty=new Set(dummyRows.map(poKey)).size;
    const dummyPOPlanQty=sum(dummyRows,'planqty');
    const dummyPlanPct=planQty>0 ? dummyPOPlanQty/planQty*100 : 0;
    const planHrs=sahScope
      .filter(s=>String(s.buyer)===String(buyer))
      .reduce((sum,s)=>sum+N(s.total),0);
    const clockHrs=clockScope
      .filter(s=>String(s.buyer)===String(buyer))
      .reduce((sum,s)=>sum+N(s.total),0);
    const planEff=clockHrs>0 ? planHrs/clockHrs*100 : 0;
    const abpTargetEff=LIVE_ABP_TARGET_EFF;
    const effDiff=planEff-abpTargetEff;
    totHrs+=planHrs;
    const planPct=totPlan?Math.round(planQty/totPlan*100):0;
      rows.push({uniqueEwo:new Set(buyerPlanRows.map(r=>String(r.ewo).trim()).filter(Boolean)).size,feeding:new Set(buyerPlanRows.filter(r=>r.ewo&&r.line).map(r=>JSON.stringify([String(r.line),String(r.ewo).trim()]))).size,buyer,ordQty,planQty,planHrs:planHrs,totalPOQty,dummyPOQty,dummyPOPlanQty,dummyPlanPct,clockHrs,abpTargetEff,planEff,effDiff,planPct,month:sortedMonths(rws).join(' & ')});
  });

  rows.sort((a,b)=>b.planQty-a.planQty);

  document.getElementById('s3-kpi').innerHTML=`
    <div class="kpi"><div class="kpi-lbl">Total Buyers</div><div class="kpi-val">${rows.length}</div></div>
    <div class="kpi"><div class="kpi-lbl">Total Order Qty</div><div class="kpi-val">${fmt(totOrd)}</div><div class="kpi-sub">PCS</div></div>
    <div class="kpi"><div class="kpi-lbl">Total Plan Qty</div><div class="kpi-val">${fmt(totPlan)}</div><div class="kpi-sub">PCS</div></div>
    <div class="kpi"><div class="kpi-lbl">Plan Hours</div><div class="kpi-val">${fmt(Math.round(totHrs))}</div><div class="kpi-sub">Total</div></div>
  `;

  document.getElementById('s3-body').innerHTML=rows.map(r=>`<tr>
    <td>${esc(r.month)}</td><td><b>${esc(r.buyer)}</b></td>
    <td class="num">${fmt(r.uniqueEwo)}</td><td class="num">${fmt(r.feeding)}</td><td class="num">${fmt(r.ordQty)}</td>
    <td class="num">${fmt(r.planQty)}</td>
    <td class="num">${fmt(r.planHrs)}</td><td class="num">${fmt(r.clockHrs)}</td>
    <td class="num">${fmt(r.totalPOQty)}</td>
    <td class="num">${fmt(r.dummyPOQty)}</td>
    <td class="num">${fmt(r.dummyPOPlanQty)}</td>
    <td class="num">${r.dummyPlanPct.toFixed(1)}%</td>
    <td class="num">${r.abpTargetEff.toFixed(1)}%</td>
    <td class="num">${r.planEff.toFixed(1)}%</td>
    <td class="num" style="color:${r.effDiff>=0?'#3aaa63':'#ff6b6b'}">${r.effDiff>=0?'+':''}${r.effDiff.toFixed(1)}%</td>
    <td class="num">${r.planPct}%</td>
  </tr>`).join('');

  const totClock=rows.reduce((s,r)=>s+r.clockHrs,0);
  const totalPlanEff=totClock>0 ? totHrs/totClock*100 : 0;
  const totalPOQty=new Set(buyerPlanScope.filter(r=>String(r.po||'').trim()).map(poKey)).size;
  const totalDummyRows=buyerPlanScope.filter(isDummy);
  const totalDummyPOQty=new Set(totalDummyRows.map(poKey)).size;
  const totalDummyPOPlanQty=sum(totalDummyRows,'planqty');
  const totalDummyPlanPct=totPlan>0 ? totalDummyPOPlanQty/totPlan*100 : 0;
  const totalABPTarget=LIVE_ABP_TARGET_EFF;
  const totalEffDiff=totalPlanEff-totalABPTarget;
  document.getElementById('s3-foot').innerHTML=`
    <td colspan="2">Total</td>
    <td class="num">${fmt(new Set(data.map(r=>String(r.ewo).trim()).filter(Boolean)).size)}</td><td class="num">${fmt(new Set(data.filter(r=>r.ewo&&r.line).map(r=>JSON.stringify([String(r.line),String(r.ewo).trim()]))).size)}</td><td class="num">${fmt(totOrd)}</td>
    <td class="num">${fmt(totPlan)}</td>
    <td class="num">${fmt(Math.round(totHrs))}</td><td class="num">${fmt(totClock)}</td>
    <td class="num">${fmt(totalPOQty)}</td>
    <td class="num">${fmt(totalDummyPOQty)}</td>
    <td class="num">${fmt(totalDummyPOPlanQty)}</td>
    <td class="num">${totalDummyPlanPct.toFixed(1)}%</td>
    <td class="num">${totalABPTarget.toFixed(1)}%</td>
    <td class="num">${totalPlanEff.toFixed(1)}%</td>
    <td class="num" style="color:${totalEffDiff>=0?'#3aaa63':'#ff6b6b'}">${totalEffDiff>=0?'+':''}${totalEffDiff.toFixed(1)}%</td>
    <td class="num">${totPlan?100:0}%</td>`;

  const maxPlan=Math.max(...rows.map(r=>r.planQty),1);
  document.getElementById('s3-bar').innerHTML=rows.map(r=>`
    <div class="bar-row">
      <div class="bar-lbl">${esc(r.buyer)}</div>
      <div class="bar-wrap"><div class="bar-fill" style="width:${Math.round(r.planQty/maxPlan*100)}%;background:#3aaa63"></div>
        <div class="bar-val">${fmt(r.planQty)}</div></div>
    </div>`).join('');
  renderS3PlanPie('s3-buyer-pie',rows.map(r=>[r.buyer,r.planQty]));
  document.getElementById('s3-buyer-chart-total').textContent=fmt(rows.reduce((s,r)=>s+N(r.planQty),0));

  // Product-wise Plan Qty: Product Type / Style from the same filtered Plan/Day data.
  const productMap={};
  data.forEach(r=>{
    const product=String(r.style||'Unspecified').trim()||'Unspecified';
    productMap[product]=(productMap[product]||0)+N(r.planqty);
  });
  const productRows=Object.entries(productMap)
    .map(([product,planQty])=>({product,planQty}))
    .sort((a,b)=>b.planQty-a.planQty);
  const maxProductPlan=Math.max(...productRows.map(r=>r.planQty),1);
  document.getElementById('s3-product-bar').innerHTML=productRows.map(r=>`
    <div class="bar-row">
      <div class="bar-lbl">${esc(r.product)}</div>
      <div class="bar-wrap"><div class="bar-fill" style="width:${Math.round(r.planQty/maxProductPlan*100)}%;background:#3aaa63"></div>
        <div class="bar-val">${fmt(r.planQty)}</div></div>
    </div>`).join('');
  renderS3PlanPie('s3-product-pie',productRows.map(r=>[r.product,r.planQty]));
  document.getElementById('s3-product-chart-total').textContent=fmt(productRows.reduce((s,r)=>s+N(r.planQty),0));
}

/* ══ SLIDE 4: LINE PLAN & LOADING ══════════════ */
const S4_DEFAULT_STRENGTHS=[
  {item_name:'T-Shirt',line_strength:12},{item_name:'Hoody/Jacket',line_strength:13},
  {item_name:'Sweat Shirt',line_strength:3},{item_name:'Polo',line_strength:12},
  {item_name:"TOP's",line_strength:1},{item_name:'Bottom',line_strength:6}
];
let S4_STRENGTHS_CACHE=null,S4_STRENGTHS_ERROR='',S4_STRENGTHS_DIRTY=false,S4_STRENGTHS_SAVING=false,S4_STRENGTHS_LOAD_TOKEN=0;
let S4_STRENGTHS_EDIT_VERSION=0,S4_STRENGTHS_AUTOSAVE_TIMER=0,S4_STRENGTHS_SAVE_PENDING=false;
function getS4Strengths(){
  const rows=S4_STRENGTHS_CACHE||S4_DEFAULT_STRENGTHS;
  return Object.fromEntries(rows.map(r=>[r.item_name,Number(r.line_strength)]));
}
async function loadS4StrengthsFromSQL(render=false){
  const token=++S4_STRENGTHS_LOAD_TOKEN;
  try{
    const {data,error}=await readTinySetting('strength',()=>SB.from('slide4_chassis_strength')
      .select('item_name,line_strength,sort_order').order('sort_order'));
    if(token!==S4_STRENGTHS_LOAD_TOKEN)return false;
    if(error)throw error;
    if(!data?.length){invalidateTinySettings(['strength']);throw Error(slideLabel(10)+' strength table has no rows');}
    S4_STRENGTHS_CACHE=data.map(r=>({item_name:String(r.item_name),line_strength:Number(r.line_strength)}));
    S4_STRENGTHS_ERROR='';
    if(render&&!S4_STRENGTHS_DIRTY)renderS4StrengthSettings();
    if(CURRENT_SLIDE===10)renderS4(getFiltered());
    return true;
  }catch(error){
    if(token!==S4_STRENGTHS_LOAD_TOKEN)return false;
    S4_STRENGTHS_ERROR=error?.message||String(error);
    console.error(slideLabel(10)+' HW Line Strength SQL load failed',error);
    if(render&&!S4_STRENGTHS_DIRTY)renderS4StrengthSettings();
    return false;
  }
}
function s4StrengthRow(name='',value='0.0'){
  return `<tr><td><input class="s4-strength-name" type="text" maxlength="80" value="${esc(name)}" placeholder="Chassis / Product item" aria-label="Chassis item name" oninput="s4StrengthChanged()" onchange="s4StrengthChanged(true)"></td>
    <td><input class="s4-strength-value" type="number" min="0" max="9999" step="0.1" value="${Number(value).toFixed(1)}" aria-label="HW Line Strength" oninput="s4StrengthChanged()" onchange="s4StrengthChanged(true)"></td>
    <td><button type="button" class="eff-delete-btn" onclick="this.closest('tr').remove();s4StrengthChanged()" aria-label="Delete item">✕</button></td></tr>`;
}
function s4StrengthChanged(autoSave=false){
  ++S4_STRENGTHS_EDIT_VERSION;
  S4_STRENGTHS_DIRTY=true;
  clearTimeout(S4_STRENGTHS_AUTOSAVE_TIMER);
  const msg=document.getElementById('s4-strength-msg');
  if(msg)msg.textContent=autoSave?'Saving change to SQL…':'Unsaved changes · click Save Changes to update '+slideLabel(10);
  if(autoSave)S4_STRENGTHS_AUTOSAVE_TIMER=setTimeout(()=>saveS4Strengths(true),150);
}
function renderS4StrengthSettings(){
  const panel=document.getElementById('admin-setting-panel-body');
  if(!panel)return;
  document.getElementById('admin-setting-panel-title').textContent='🏭 '+ADMIN_SETTING_NAMES.slide4strength;
  const rows=S4_STRENGTHS_CACHE||S4_DEFAULT_STRENGTHS;
  panel.innerHTML=`<div class="eff-toolbar"><div>
      <div class="eff-note">Chassis (Item) · HW Line Strength</div>
      <div class="eff-note2">Changes to an item are saved when you leave the field. Use Save Changes after adding or deleting a row. These values affect ${esc(slideLabel(10))} only.</div>
    </div><div class="eff-actions"><span id="s4-strength-msg" role="status"></span>
      <button type="button" class="top-btn" onclick="addS4StrengthItem()">＋ Add Item</button>
      <button type="button" class="top-btn primary" onclick="saveS4Strengths()">💾 Save Changes</button></div></div>
    ${S4_STRENGTHS_ERROR?`<p class="modal-msg" style="color:#b91c1c">SQL load failed: ${esc(S4_STRENGTHS_ERROR)}. Save will retry when the table is available.</p>`:''}
    <div class="tbl-wrap"><table class="dt s4-strength-table"><thead><tr><th>Chassis (Item)</th><th>HW Line Strength</th><th>Delete</th></tr></thead>
      <tbody id="s4-strength-body">${rows.map(r=>s4StrengthRow(r.item_name,r.line_strength)).join('')}</tbody></table></div>`;
}
function addS4StrengthItem(){
  const body=document.getElementById('s4-strength-body');if(!body)return;
  body.insertAdjacentHTML('beforeend',s4StrengthRow());
  s4StrengthChanged();
  body.lastElementChild?.querySelector('.s4-strength-name')?.focus();
}
async function saveS4Strengths(autoSave=false){
  if(!requireSitePerm('admin_settings',ADMIN_SETTING_NAMES.slide4strength))return;
  clearTimeout(S4_STRENGTHS_AUTOSAVE_TIMER);
  if(S4_STRENGTHS_SAVING){S4_STRENGTHS_SAVE_PENDING=true;return;}
  const msg=document.getElementById('s4-strength-msg');
  const button=msg?.parentElement?.querySelector('.primary');
  const editVersion=S4_STRENGTHS_EDIT_VERSION;
  try{
    const rows=[...document.querySelectorAll('#s4-strength-body tr')].map((tr,i)=>{
      const item_name=tr.querySelector('.s4-strength-name').value.trim();
      const raw=tr.querySelector('.s4-strength-value').value.trim();
      const line_strength=Number(raw);
      if(!item_name||item_name.length>80)throw Error(`Row ${i+1}: enter an item name (max 80 characters)`);
      if(item_name.toLocaleLowerCase()==='unmapped')throw Error('Unmapped is a reserved item name');
      if(!raw||!Number.isFinite(line_strength)||line_strength<0||line_strength>9999||Number(line_strength.toFixed(1))!==line_strength)
        throw Error(`Row ${i+1}: strength must be 0–9999 with one decimal place`);
      return {item_name,line_strength};
    });
    if(!rows.length||rows.length>100)throw Error('Keep 1 to 100 chassis items');
    if(new Set(rows.map(r=>r.item_name.toLocaleLowerCase())).size!==rows.length)throw Error('Duplicate chassis item name');
    S4_STRENGTHS_SAVING=true;
    ++S4_STRENGTHS_LOAD_TOKEN; // discard any read that began before this write
    if(button)button.disabled=true;
    if(msg)msg.textContent='Saving to SQL…';
    invalidateTinySettings(['strength']);
    const {data,error}=await SB.rpc('replace_slide4_chassis_strength',{p_rows:rows});
    if(error)throw error;
    if(data?.status!=='SUCCESS'||Number(data.row_count)!==rows.length)throw Error('SQL row-count check failed');
    invalidateTinySettings(['strength']);
    if(!await loadS4StrengthsFromSQL(false) && !await loadS4StrengthsFromSQL(false))
      throw Error('Saved, but SQL reload failed: '+S4_STRENGTHS_ERROR);
    if(rows.length!==S4_STRENGTHS_CACHE.length||rows.some((r,i)=>r.item_name!==S4_STRENGTHS_CACHE[i].item_name||r.line_strength!==S4_STRENGTHS_CACHE[i].line_strength))
      throw Error('SQL values do not match the edited rows; please retry');
    if(editVersion===S4_STRENGTHS_EDIT_VERSION){
      S4_STRENGTHS_DIRTY=false;
      if(document.getElementById('s4-strength-body'))renderS4StrengthSettings();
      const saved=document.getElementById('s4-strength-msg');if(saved)saved.textContent='✓ Saved in SQL · '+slideLabel(10)+' updated';
    }else S4_STRENGTHS_SAVE_PENDING=true;
  }catch(error){const current=document.getElementById('s4-strength-msg');if(current)current.textContent='Save failed: '+(error?.message||error);}
  finally{
    S4_STRENGTHS_SAVING=false;
    const current=document.getElementById('s4-strength-msg'),currentButton=current?.parentElement?.querySelector('.primary');
    if(currentButton)currentButton.disabled=false;
    if(S4_STRENGTHS_SAVE_PENDING){S4_STRENGTHS_SAVE_PENDING=false;S4_STRENGTHS_AUTOSAVE_TIMER=setTimeout(()=>saveS4Strengths(true),150);}
  }
}
let S4_RANGE_PLAN_ID=null,S4_RANGE_FROM='',S4_RANGE_TO='';
function s4DateRangeChanged(which){
  const from=document.getElementById('s4-date-from'),to=document.getElementById('s4-date-to');
  if(!from||!to)return;
  if(from.value>to.value){if(which==='from')to.value=from.value;else from.value=to.value;}
  S4_RANGE_FROM=from.value;S4_RANGE_TO=to.value;
  renderS4(getFiltered());
}
function s4ResetDateRange(){S4_RANGE_PLAN_ID=null;renderS4(getFiltered());}
async function captureS4Image(mode){
  const section=document.getElementById('s4-analysis');
  const copy=document.getElementById('s4-copy-image'),download=document.getElementById('s4-download-image');
  const status=document.getElementById('s4-capture-status');
  if(!section||!copy||!download||!status||copy.disabled)return;
  copy.disabled=true;download.disabled=true;status.textContent='Capturing both tables…';
  try{
    const html2canvas=await ensureHtml2Canvas();
    const fullWidth=Math.ceil(section.scrollWidth),fullHeight=Math.ceil(section.scrollHeight);
    const canvas=await html2canvas(section,{backgroundColor:'#ffffff',scale:Math.min(2,window.devicePixelRatio||2),useCORS:true,logging:false,
      windowWidth:Math.max(document.documentElement.clientWidth,fullWidth),
      windowHeight:Math.max(document.documentElement.clientHeight,fullHeight),
      onclone:doc=>{
        const clone=doc.getElementById('s4-analysis');
        clone?.querySelectorAll('.s4-capture-actions,.pager-btns').forEach(el=>el.style.display='none');
        clone?.querySelectorAll('.tbl-wrap').forEach(el=>{el.style.maxHeight='none';el.style.overflow='visible';});
      }});
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('PNG capture failed');
    if(mode==='copy'&&navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
      try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);status.textContent='Both tables copied as one image';return;}
      catch(error){console.warn('Image clipboard unavailable; downloading PNG instead',error);}
    }
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`EKWL_Chassis_Plan_${S4_RANGE_FROM||'all'}_${S4_RANGE_TO||'dates'}.png`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    status.textContent=mode==='copy'?'Clipboard unavailable · PNG downloaded':'PNG downloaded';
  }catch(error){console.warn(slideLabel(10)+' screenshot unavailable',error);status.textContent='Screenshot failed';}
  finally{copy.disabled=false;download.disabled=false;setTimeout(()=>status.textContent='',4000);}
}
function renderS4(data){
  const hw=getS4Strengths();
  const baseChassis=Object.keys(hw);

  // EXACT SAME SOURCE / SCOPE AS LINE RUNNING CALENDAR + ITEM COUNT PER DAY.
  const masterLines=getChassisMasterLines();
  const candidateDates=[...new Set(DAILY_PLAN.map(d=>d.date).filter(Boolean))].sort();
  const activeDateSet=new Set(
    DAILY_PLAN.filter(d=>candidateDates.includes(d.date)&&d.value>0&&masterLines.has(Number(d.line))).map(d=>d.date)
  );
  const planDates=candidateDates.filter(d=>activeDateSet.has(d));
  const planId=String(ACTIVE_PLAN_UPLOAD?.id||'local');
  if(S4_RANGE_PLAN_ID!==planId){
    S4_RANGE_PLAN_ID=planId;S4_RANGE_FROM=planDates[0]||'';S4_RANGE_TO=planDates.at(-1)||'';
  }
  const from=document.getElementById('s4-date-from'),to=document.getElementById('s4-date-to'),all=document.getElementById('s4-date-all');
  for(const input of [from,to]){input.disabled=!planDates.length;input.min=planDates[0]||'';input.max=planDates.at(-1)||'';}
  if(planDates.length){
    const clamp=value=>!value||value<planDates[0]?planDates[0]:value>planDates.at(-1)?planDates.at(-1):value;
    S4_RANGE_FROM=clamp(S4_RANGE_FROM);S4_RANGE_TO=clamp(S4_RANGE_TO);
    if(S4_RANGE_FROM>S4_RANGE_TO)S4_RANGE_TO=S4_RANGE_FROM;
  }
  from.value=S4_RANGE_FROM;to.value=S4_RANGE_TO;all.disabled=!planDates.length;
  const dates=planDates.filter(d=>d>=S4_RANGE_FROM&&d<=S4_RANGE_TO);
  const formatDate=value=>new Date(value+'T00:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
  document.getElementById('s4-month').textContent=planDates.length?formatDate(S4_RANGE_FROM)+' – '+formatDate(S4_RANGE_TO):'No active plan dates';
  const daily=DAILY_PLAN.filter(d=>dates.includes(d.date)&&d.value>0&&masterLines.has(Number(d.line)));

  const winner=new Map();
  daily.forEach(d=>{
    const k=Number(d.line)+'|'+d.date,old=winner.get(k);
    if(!old||d.value>old.value)winner.set(k,d);
  });

  // Product Type AVG Qty, identical to Item Count Per Day.
  const styleDateCounts={};
  winner.forEach(w=>{
    const st=String(w.style||'').trim();
    if(!styleDateCounts[st]) styleDateCounts[st]=Object.fromEntries(dates.map(d=>[d,0]));
    styleDateCounts[st][w.date]=(styleDateCounts[st][w.date]||0)+1;
  });

  const productAvg={};
  Object.keys(styleDateCounts).forEach(st=>{
    const lineDays=dates.reduce((s,d)=>s+(styleDateCounts[st][d]||0),0);
    productAvg[st]=dates.length?lineDays/dates.length:0;
  });

  // Aggregate Product AVG Qty into chassis. Never silently lose an unmapped product.
  const chassisPlan=Object.fromEntries(baseChassis.map(c=>[c,0]));
  let unmapped=0;
  Object.entries(productAvg).forEach(([st,avg])=>{
    const c=Object.hasOwn(hw,st)?st:chassisOf(st);
    if(Object.hasOwn(chassisPlan,c)) chassisPlan[c]+=avg;
    else unmapped+=avg;
  });

  const chassis=[...baseChassis];
  if(unmapped>0.000001){chassis.push('Unmapped');chassisPlan.Unmapped=unmapped}
  const linePlan=c=>chassisPlan[c]||0;
  const f1=v=>Number(v||0).toFixed(1);

  document.querySelector('#s4-tbl thead').innerHTML=`<tr>
    <th>Chassis (Item)</th><th class="num">HW Line Strength</th>
    <th class="num">Line Plan</th><th class="cen">Loading</th></tr>`;

  document.getElementById('s4-body').innerHTML=chassis.map(c=>{
    const isUnmapped=c==='Unmapped';
    const strength=isUnmapped?0:N(hw[c]);
    const plan=linePlan(c);
    const loading=strength?plan/strength*100:null;
    const over=loading!==null&&loading>100;
    return `<tr>
      <td>${esc(c)}</td>
      <td class="num">${isUnmapped?'—':f1(strength)}</td>
      <td class="num" style="background:#f6d3c0!important;color:#111!important;font-weight:800">${f1(plan)}</td>
      <td class="cen" style="background:${loading===null?'#fff4cc':(over?'#ffd9dd':'#d9f2e1')}!important;color:${loading===null?'#7a5700':(over?'#9f1239':'#14532d')}!important;font-weight:800">${loading===null?'Unmapped':loading.toFixed(1)+'%'}</td>
    </tr>`;
  }).join('');

  const totalHW=Object.values(hw).reduce((a,b)=>a+N(b),0);
  // This MUST equal Item Count Per Day -> Occupied line-days AVG Qty.
  const totalPlan=dates.length ? winner.size/dates.length : 0;
  const totalLoading=totalHW?totalPlan/totalHW*100:0;
  document.getElementById('s4-foot').innerHTML=`
    <td style="font-weight:900;color:#c87800">Grand Total</td>
    <td class="num">${f1(totalHW)}</td>
    <td class="num" style="background:#f6d3c0!important;color:#111!important;font-weight:900">${f1(totalPlan)}</td>
    <td class="cen" style="font-weight:900">${totalLoading.toFixed(1)}%</td>`;

  drawS4ChassisChart(
    chassis,
    chassis.map(c=>c==='Unmapped'?0:N(hw[c])),
    chassis.map(c=>linePlan(c)),
    totalHW,totalPlan
  );
}

function drawS4ChassisChart(labels, hwVals, planVals, totalHW, totalPlan){
  const one=v=>Number(v||0).toFixed(1);
  function setup(id){
    const c=document.getElementById(id); if(!c) return null;
    const cssW=Math.max(240,c.parentElement.clientWidth-20), cssH=230, dpr=window.devicePixelRatio||1;
    c.width=Math.round(cssW*dpr); c.height=Math.round(cssH*dpr); c.style.width=cssW+'px'; c.style.height=cssH+'px';
    const x=c.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0); x.clearRect(0,0,cssW,cssH); return {c,x,W:cssW,H:cssH};
  }
  function chart(id,labs,a,b){
    const z=setup(id); if(!z) return; const {x,W,H}=z;
    const pad={l:22,r:12,t:18,b:42}, cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;
    const max=Math.max(1,...a,...b)*1.22, gw=cw/Math.max(labs.length,1), bw=Math.min(22,gw*.24);
    x.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--border').trim();x.lineWidth=1;x.beginPath();x.moveTo(pad.l,pad.t+ch);x.lineTo(W-pad.r,pad.t+ch);x.stroke();
    labs.forEach((lab,i)=>{
      const cx=pad.l+gw*(i+.5), h1=a[i]/max*ch, h2=b[i]/max*ch;
      x.fillStyle='#00b050';x.fillRect(cx-bw-2,pad.t+ch-h1,bw,h1);
      x.strokeStyle='#ff0000';x.lineWidth=2;x.strokeRect(cx+2,pad.t+ch-h2,bw,h2);
      x.font='bold 10px Segoe UI';x.textAlign='center';
      x.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text').trim();x.fillText(one(a[i]),cx-bw/2-2,pad.t+ch-h1-4);
      x.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--chart-alert').trim();x.fillText(one(b[i]),cx+bw/2+2,pad.t+ch-h2-4);
      x.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text').trim();x.font='10px Segoe UI';const words=String(lab).split(/(?<=\/) | /);if(words.length>1){x.fillText(words.slice(0,-1).join(' '),cx,H-23);x.fillText(words.at(-1),cx,H-9);}else x.fillText(lab,cx,H-14);
    });
  }
  chart('s4-chassis-canvas',labels,hwVals,planVals);
  chart('s4-total-canvas',['Grand Total'],[totalHW],[totalPlan]);
  const cell='border:1px solid #111;padding:3px 5px;text-align:center';
  document.getElementById('s4-chart-detail').innerHTML=`<tr><th style="${cell};text-align:left"></th>${labels.map(v=>`<th style="${cell}">${esc(v)}</th>`).join('')}</tr><tr><td style="${cell};text-align:left;font-weight:700"><span style="display:inline-block;width:8px;height:8px;background:#00b050;margin-right:3px"></span>HW Strength</td>${hwVals.map(v=>`<td style="${cell};font-weight:700">${one(v)}</td>`).join('')}</tr><tr><td style="${cell};text-align:left;font-weight:700"><span style="display:inline-block;width:8px;height:8px;border:2px solid #f00;margin-right:3px"></span>Line Plan</td>${planVals.map(v=>`<td style="${cell};font-weight:700">${one(v)}</td>`).join('')}</tr>`;
  document.getElementById('s4-chart-total').innerHTML=`<tr><th style="${cell};text-align:left"></th><th style="${cell}">Grand Total</th></tr><tr><td style="${cell};text-align:left;font-weight:700"><span style="display:inline-block;width:8px;height:8px;background:#00b050;margin-right:3px"></span>HW Strength</td><td style="${cell};font-weight:700">${one(totalHW)}</td></tr><tr><td style="${cell};text-align:left;font-weight:700"><span style="display:inline-block;width:8px;height:8px;border:2px solid #f00;margin-right:3px"></span>Line Plan</td><td style="${cell};font-weight:700">${one(totalPlan)}</td></tr>`;
}

/* ══ SLIDE 5: ITEM STATUS ═══════════════════════ */
function renderS5(data){
  if(typeof recordDashboardRender==='function')recordDashboardRender('5');
  document.getElementById('s5-month').textContent=monthLabel(data);
  const byStyle=groupBy(data,'style');
  const totLines=data.length;
  const rows=Object.entries(byStyle)
    .map(([s,rws])=>({style:s,lines:new Set(rws.map(r=>r.month+'|'+r.line)).size}))
    .sort((a,b)=>b.lines-a.lines);
  const totL=rows.reduce((s,r)=>s+r.lines,0);

  document.getElementById('s5-body').innerHTML=rows.map(r=>`<tr>
    <td>${itemChip(r.style)}</td>
    <td class="num">${r.lines}</td>
    <td class="num">${Math.round(r.lines/totL*100)}%</td>
  </tr>`).join('');
  document.getElementById('s5-foot').innerHTML=`<td>Total</td><td class="num">${totL}</td><td class="num">${totL?100:0}%</td>`;

  const maxL=Math.max(...rows.map(r=>r.lines),1);
  document.getElementById('s5-bar').innerHTML=rows.map(r=>`
    <div class="bar-row">
      <div class="bar-lbl" style="display:flex;align-items:center;gap:4px;justify-content:flex-end">
        <span style="width:10px;height:10px;border-radius:2px;background:${itemColor(r.style)};flex-shrink:0"></span>
        ${esc(r.style)}
      </div>
      <div class="bar-wrap">
        <div class="bar-fill" style="width:${Math.round(r.lines/maxL*100)}%;background:${itemColor(r.style)}"></div>
        <div class="bar-val" style="color:#000">${r.lines}</div>
      </div>
    </div>`).join('');
}

/* ══ SLIDE 6: EWO DETAILS ═══════════════════════ */
function buildS6Rows(data,month,from='',to=''){
  const groups=new Map();
  for(const r of data){
    const psd=String(r.startdate||'').slice(0,10),ewo=String(r.ewo??'').trim();
    // DATA contains only Plan/Day rows. PSD must belong to the selected plan month.
    if(!ewo||!s6PSDMatches(r,month,from,to))continue;
    if(!groups.has(ewo))groups.set(ewo,{ewo,firstPSD:psd,buyers:new Set(),items:new Set(),orderqty:0,planqty:0,lineQty:new Map()});
    const g=groups.get(ewo),line=String(r.line??'').trim();
    if(psd<g.firstPSD)g.firstPSD=psd;
    if(r.buyer)g.buyers.add(String(r.buyer));if(r.style)g.items.add(String(r.style));
    g.orderqty+=N(r.orderqty);g.planqty+=N(r.planqty);
    if(line){g.lineQty.set(line,(g.lineQty.get(line)||0)+N(r.planqty));}
  }
  return [...groups.values()].map(g=>{
    const lines=[...g.lineQty.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    return {...g,lines,splits:lines.map(l=>g.lineQty.get(l)),feeding:lines.length};
  }).sort((a,b)=>a.firstPSD.localeCompare(b.firstPSD)||a.ewo.localeCompare(b.ewo,undefined,{numeric:true}));
}
function s6PSDMatches(row,month,from='',to=''){
  const psd=String(row.startdate||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(psd)&&psd.slice(0,7)===month&&(!from||psd>=from)&&(!to||psd<=to);
}
function s6PSDRangeChanged(which){
  const from=document.getElementById('s6-psd-from'),to=document.getElementById('s6-psd-to');
  if(from.value&&to.value&&from.value>to.value){
    if(which==='from')to.value=from.value;else from.value=to.value;
  }
  renderS6(getFiltered());
}
function s6ResetPSDRange(){
  document.getElementById('s6-psd-from').value='';
  document.getElementById('s6-psd-to').value='';
  renderS6(getFiltered());
}
function buildS6RangeSummary(rows){
  const ranges=[['Below 500',0,500],['501-1000',501,1000],['1001-2000',1001,2000],['2001-3000',2001,3000],['3001-5000',3001,5000],['5001-8000',5001,8000],['Above 8000',8001,Infinity]];
  return ranges.map(([label,min,max])=>{
    const matched=rows.filter(r=>r.orderqty>=min&&r.orderqty<=max);
    return {label,ewos:matched.length,feeding:matched.reduce((s,r)=>s+r.feeding,0),orderqty:matched.reduce((s,r)=>s+r.orderqty,0),pct:rows.length?matched.length/rows.length*100:0};
  });
}
function renderS6RangeSummary(rows,sourceRows=[]){
  S2_LINE_DETAILS=[];
  const stats=buildS6RangeSummary(rows),total=rows.reduce((s,r)=>s+r.orderqty,0),feeding=rows.reduce((s,r)=>s+r.feeding,0);
  document.getElementById('s6-range-summary').innerHTML='<p><strong>Total Order Qty '+fmt(total)+' pcs</strong></p><table class="qty-range-ref"><thead><tr><th>Order QTY Range</th><th>No Of Line–EWO</th><th>EWO Count</th><th>Order Qty</th><th>Percentage</th></tr></thead><tbody>'+stats.map((r,i)=>'<tr class="'+(i<5?'range-low':'range-high')+'"><td>'+esc(r.label)+'</td><td class="num">'+fmt(r.feeding)+'</td><td class="num">'+fmt(r.ewos)+'</td><td class="num">'+fmt(r.orderqty)+'</td><td class="num">'+r.pct.toFixed(1)+'%</td></tr>').join('')+'<tr class="range-total"><td>Total</td><td class="num">'+fmt(feeding)+'</td><td class="num">'+fmt(rows.length)+'</td><td class="num">'+fmt(total)+'</td><td class="num">'+(rows.length?'100.0%':'0.0%')+'</td></tr></tbody></table>';
  const low=stats.slice(0,5).reduce((s,r)=>s+r.ewos,0),high=rows.length-low,lowPct=rows.length?low/rows.length*100:0;
  const pieLow=stats.slice(0,5).reduce((s,r)=>s+r.orderqty,0),pieHigh=stats.slice(5).reduce((s,r)=>s+r.orderqty,0);
  const pieLowPct=total?pieLow/total*100:0,pieHighPct=total?pieHigh/total*100:0;
  document.getElementById('s6-range-pie').innerHTML='<div class="s2-top-pie-title">📊 ORDER QTY DISTRIBUTION</div><div class="s2-top-pie-body"><div class="s2-top-donut" style="background:'+(total?'conic-gradient(#79c7df 0 '+pieLowPct+'%,#58b63d '+pieLowPct+'% 100%)':'#64748b')+'"><div class="s2-top-hole"><b style="font-size:18px">'+fmt(total)+'</b><span>Order Qty · pcs</span></div></div><div class="s2-top-legend"><div class="lg"><i style="background:#79c7df"></i><div>5000 or fewer<strong>'+fmt(pieLow)+' pcs · '+pieLowPct.toFixed(1)+'%</strong></div></div><div class="lg"><i style="background:#58b63d"></i><div>Above 5000<strong>'+fmt(pieHigh)+' pcs · '+pieHighPct.toFixed(1)+'%</strong></div></div></div></div>';
  document.getElementById('s6-range-kpis').innerHTML='<div class="range-summary">'+[['5000 or fewer',low,lowPct],['Above 5000',high,rows.length?100-lowPct:0]].map(([label,n,p])=>'<div class="rsum-box"><div class="rsum-title">'+label+'</div><div class="rsum-val">'+p.toFixed(1)+'%</div><div class="rsum-sub">'+fmt(n)+' of '+fmt(rows.length)+' EWOs</div></div>').join('')+'</div>';
  const max=Math.max(...stats.map(r=>r.ewos),1);
  const limits=[[0,500],[501,1000],[1001,2000],[2001,3000],[3001,5000],[5001,8000],[8001,Infinity]];
  document.getElementById('s6-range-bar').innerHTML=stats.map((r,i)=>{
    const ewos=new Set(rows.filter(e=>e.orderqty>=limits[i][0]&&e.orderqty<=limits[i][1]).map(e=>e.ewo));
    const matching=sourceRows.filter(e=>ewos.has(String(e.ewo??'').trim()));
    const lines=[...new Set(matching.map(e=>String(e.line)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const chips=lines.map(line=>{const n=S2_LINE_DETAILS.push({line,range:r.label,rows:matching.filter(e=>String(e.line)===line)})-1;return '<button class="range-line-chip" data-s2-detail="'+n+'">'+esc(line)+'</button>';}).join('');
    return '<div class="bar-row"><div class="bar-lbl">'+esc(r.label)+'</div><div style="flex:1"><div class="bar-wrap"><div class="bar-fill" style="width:'+r.ewos/max*100+'%"></div><div class="bar-val">'+fmt(r.ewos)+'</div></div><div class="range-lines">'+chips+'</div></div></div>';
  }).join('');
  document.getElementById('s6-range-bar').onclick=e=>{const button=e.target.closest('button[data-s2-detail]');if(button)openS2LineDetails(Number(button.dataset.s2Detail));};

}
let S6_FEEDING_SOURCE=[];
function renderS6(data){
  if(typeof recordDashboardRender==='function')recordDashboardRender('6');
  const month=uploadMonthKey(ACTIVE_PLAN_UPLOAD)||document.getElementById('month-filter').value;
  const monthText=planningMonthLabel(month);
  const filter=document.getElementById('s6-feeding-filter');
  const rangeFilter=document.getElementById('s6-order-range-filter');
  const scope=month+'|'+String(ACTIVE_PLAN_UPLOAD?.id||'');
  const previous=filter.dataset.scope===scope?filter.value:'';
  const previousRange=rangeFilter.dataset.scope===scope?rangeFilter.value:'';
  filter.dataset.scope=scope;rangeFilter.dataset.scope=scope;
  const fromInput=document.getElementById('s6-psd-from'),toInput=document.getElementById('s6-psd-to');
  for(const input of [fromInput,toInput]){
    if(input.dataset.scope!==scope)input.value='';
    input.dataset.scope=scope;
    input.min=month+'-01';
    input.max=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  }
  const from=fromInput.value,to=toInput.value;
  document.getElementById('s6-psd-note').textContent='PSD: '+(from||'month start')+' → '+(to||'month end')+' · '+monthText;
  const allRows=buildS6Rows(data,month,from,to);
  const missingPSD=data.filter(r=>!/^\d{4}-\d{2}-\d{2}$/.test(String(r.startdate||''))).length;
  const warning=document.getElementById('s6-data-warning');
  warning.hidden=!missingPSD;
  warning.textContent=missingPSD+' of '+data.length+' Plan/Day rows have missing PSD and are excluded. '+(missingPSD===data.length?'Analysis unavailable — this is not a zero-order plan. ':'Totals cover only rows with PSD in the selected month. ')+'Check the source CSV dates and re-upload the corrected plan.';
  const ranges=[['Below 500',0,500],['501-1000',501,1000],['1001-2000',1001,2000],['2001-3000',2001,3000],['3001-5000',3001,5000],['5001-8000',5001,8000],['Above 8000',8001,Infinity]];
  const inRange=(r,v)=>v===''||r.orderqty>=ranges[Number(v)][1]&&r.orderqty<=ranges[Number(v)][2];
  rangeFilter.innerHTML='<option value="">All ranges</option>'+ranges.map((r,i)=>'<option value="'+i+'">'+r[0]+'</option>').join('');
  rangeFilter.value=/^[0-6]$/.test(previousRange)?previousRange:'';
  const counts=[...new Set(allRows.filter(r=>inRange(r,rangeFilter.value)).map(r=>r.feeding))].sort((a,b)=>a-b);
  filter.innerHTML='<option value="">All</option>'+counts.map(n=>'<option value="'+n+'">'+n+'</option>').join('');
  filter.value=counts.some(n=>String(n)===previous)?previous:'';
  const rows=allRows.filter(r=>inRange(r,rangeFilter.value)&&(!filter.value||r.feeding===Number(filter.value)));
  const frequencies=new Map();
  rows.forEach(r=>frequencies.set(r.feeding,(frequencies.get(r.feeding)||0)+1));
  document.getElementById('s6-feeding-body').innerHTML=[...frequencies].sort((a,b)=>a[0]-b[0]).map(([times,count])=>'<tr><td class="cen">'+times+'</td><td class="num">'+fmt(count)+'</td><td class="num">'+fmt(times*count)+'</td><td class="num">'+(rows.length?count/rows.length*100:0).toFixed(1)+'%</td><td></td></tr>').join('');
  document.getElementById('s6-feeding-foot').innerHTML='<td>Total Run EWO</td><td class="num">'+fmt(rows.length)+'</td><td class="num">'+fmt(rows.reduce((s,r)=>s+r.feeding,0))+'</td><td class="num">'+(rows.length?'100.0%':'0.0%')+'</td><td></td>';
  const selectedEwos=new Set(rows.map(r=>r.ewo));
  S6_FEEDING_SOURCE=data.filter(r=>s6PSDMatches(r,month,from,to)&&selectedEwos.has(String(r.ewo??'').trim())).map(r=>({...r,month}));
  renderS6RangeSummary(rows,S6_FEEDING_SOURCE);
  renderS8(S6_FEEDING_SOURCE);
  if(data.length&&missingPSD===data.length){
    for(const id of ['s6-range-summary','s6-range-pie','s6-range-bar','s6-range-kpis','s6-feeding-body','s6-feeding-foot','s8-bar','s8-summary','s8-buyer-pie','s8-product-pie'])document.getElementById(id).innerHTML='<p>Unavailable: source PSD is missing.</p>';
  }
  document.getElementById('s6-month').textContent=monthText;
  const totOrd=rows.reduce((s,r)=>s+r.orderqty,0),totPlan=rows.reduce((s,r)=>s+r.planqty,0);
  const feeding=rows.reduce((s,r)=>s+r.feeding,0);
  document.getElementById('s6-count').textContent=rows.length+' of '+allRows.length+' unique EWOs';
  document.getElementById('s6-kpi').innerHTML=[
    ['Unique EWOs',rows.length],['Total Order Qty',fmt(totOrd)],['Total Plan Qty',fmt(totPlan)],
    ['Avg Lines/EWO',rows.length?(rows.reduce((s,r)=>s+r.lines.length,0)/rows.length).toFixed(1):'0']
  ].map(([label,value])=>'<div class="kpi"><div class="kpi-lbl">'+label+'</div><div class="kpi-val">'+(data.length&&missingPSD===data.length?'Unavailable':value)+'</div></div>').join('');
  document.getElementById('s6-body').innerHTML=rows.map(r=>'<tr>'+
    '<td>'+esc(monthText)+'</td><td>'+[...r.buyers].map(esc).join(', ')+'</td><td class="num">'+esc(r.ewo)+'</td>'+
    '<td>'+r.lines.map(esc).join(' | ')+'</td><td class="num">'+r.feeding+'</td>'+
    '<td>'+[...r.items].map(esc).join(', ')+'</td><td class="num">'+fmt(r.orderqty)+'</td>'+
    '<td class="num">'+fmt(r.planqty)+'</td><td>'+r.splits.map(fmt).join(' | ')+'</td></tr>').join('')||
    '<tr><td colspan="9" class="cen">No EWOs match the PSD date range, planning month, feeding and Order Qty Range filters.</td></tr>';
  document.getElementById('s6-foot').innerHTML='<td><strong>Total</strong></td><td>—</td><td class="num">'+rows.length+'</td><td>—</td><td class="num">'+fmt(feeding)+'</td><td>—</td><td class="num">'+fmt(totOrd)+'</td><td class="num">'+fmt(totPlan)+'</td><td class="num">'+fmt(totPlan)+'</td>';
  if(data.length&&missingPSD===data.length){
    document.getElementById('s6-body').innerHTML='<tr><td colspan="9" class="cen">Analysis unavailable: all source PSD dates are missing.</td></tr>';
    document.getElementById('s6-foot').innerHTML='<td colspan="9">Totals unavailable until source PSD dates are supplied.</td>';
  }
}

/* ══ SLIDE 7: CHARTS (Canvas) ═══════════════════ */
let GANTT_EWO_SEARCH='';
let GANTT_LINE_FILTER='';
let S11_RANGE_PLAN_ID=null,S11_RANGE_FROM='',S11_RANGE_TO='',S11_RANGE_NARROWED=false;
function s11DateRangeChanged(which){
  const from=document.getElementById('s11-date-from'),to=document.getElementById('s11-date-to');
  if(!from||!to)return;
  if(from.value>to.value){if(which==='from')to.value=from.value;else from.value=to.value;}
  S11_RANGE_FROM=from.value;S11_RANGE_TO=to.value;
  renderS11(getFiltered());
}
function s11ResetDateRange(){S11_RANGE_PLAN_ID=null;renderS11(getFiltered());}
function ganttCoverageCondition(wip,cutting,cutable,shortage){
  return wip?'wip':cutting?'cutting':cutable?'cutable':shortage?'short':'';
}
function ganttConditionVisible(condition,enabled,filter){
  return !enabled||!filter||condition===filter;
}

let GANTT_INDEX_CACHE=null;
function invalidateGanttIndex(){GANTT_INDEX_CACHE=null;}
function getGanttIndex(master){
  const sources=[DAILY_PLAN,CLOCK_HOUR_DATA,SAH_DATA,SEWING_IO_DATA,DATE_WISE_PRODUCTION_DATA,FABRIC_CUTTING_DATA];
  const owner=typeof SITE_AUTH_USER==='undefined'?'':SITE_AUTH_USER?.id;
  const generation=typeof SITE_SESSION_GENERATION==='undefined'?0:SITE_SESSION_GENERATION;
  const key=[...master].join('|')+':'+String(ACTIVE_PLAN_UPLOAD?.id||'local');
  if(GANTT_INDEX_CACHE&&GANTT_INDEX_CACHE.owner===owner&&GANTT_INDEX_CACHE.generation===generation&&GANTT_INDEX_CACHE.key===key&&sources.every((rows,i)=>rows===GANTT_INDEX_CACHE.sources[i]&&rows.length===GANTT_INDEX_CACHE.lengths[i])){
    if(typeof recordDataCacheHit==='function')recordDataCacheHit('gantt.index');return GANTT_INDEX_CACHE.value;
  }
  const finish=typeof startDashboardTiming==='function'?startDashboardTiming('gantt.build'):()=>{};
  const allDates=[...new Set(DAILY_PLAN.map(d=>d.date).filter(Boolean))].sort();
  const activeDateSet=new Set(DAILY_PLAN.filter(d=>d.date&&d.value>0&&master.has(Number(d.line))).map(d=>d.date));
  const planDates=allDates.filter(d=>activeDateSet.has(d));
  const scope=DAILY_PLAN.filter(d=>activeDateSet.has(d.date)&&d.value>0&&master.has(Number(d.line)));
  // Shared Gantt normalizers: function scope, available to aggregation, indexing and rendering.
  const normEwo=v=>{
    let z=String(v??'').trim().toUpperCase();
    if(/^\d+\.0+$/.test(z))z=z.replace(/\.0+$/,'');
    return z;
  };
  const normColor=v=>String(v??'')
    .trim().toUpperCase().replace(/\s+/g,' ').replace(/\s*([\/-])\s*/g,'$1');

  // Correct Plan/Day aggregation: legitimate PO/Color Plan/Day rows are summed,
  // but an accidental duplicate plan_daily row for the same record_id + date counts once.
  // Example: Line 5 / 23-Sep / EWO 271774 = 846 + 150 = 996.
  const ewoQty=new Map(), metaMap=new Map(), planColorQty=new Map();
  const seenPlanDailyRecordDate=new Set();
  scope.forEach(d=>{
    const line=Number(d.line),date=d.date,ewo=normEwo(d.ewo);
    if(!line||!date||!ewo)return;
    const rdKey=String(d.record_id??'')+'|'+date;
    if(d.record_id!=null && seenPlanDailyRecordDate.has(rdKey))return;
    if(d.record_id!=null)seenPlanDailyRecordDate.add(rdKey);
    const k=line+'|'+date+'|'+ewo;
    ewoQty.set(k,(ewoQty.get(k)||0)+N(d.value));
    if(!metaMap.has(k))metaMap.set(k,{buyer:d.buyer||'',style:d.style||'',color:d.color||'',smv:N(d.smv)});
    const ck=k+'|'+String(d.color||'').trim();
    planColorQty.set(ck,(planColorQty.get(ck)||0)+N(d.value));
  });

  const clockByKey=new Map(),sahByKey=new Map(),smvByKey=new Map();
  const sewingByLineEwo=new Map(),sewingByEwo=new Map(),fabricByEwo=new Map(),fabricByColor=new Map(),productionByCell=new Map(),colorsByEwo=new Map();
  const add=(map,key,row)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(row);};
  const addColor=(ewo,color)=>{if(!colorsByEwo.has(ewo))colorsByEwo.set(ewo,new Set());const c=String(color||'').trim();if(c)colorsByEwo.get(ewo).add(c);};
  for(const x of scope){const ewo=normEwo(x.ewo);addColor(ewo,x.color);const k=Number(x.line)+'|'+x.date+'|'+String(x.ewo||'').trim();if(N(x.smv)>0&&!smvByKey.has(k))smvByKey.set(k,x);}
  for(const x of CLOCK_HOUR_DATA){for(const month of [x.month,'*']){const key=Number(x.line)+'|'+String(x.ewo)+'|'+month;clockByKey.set(key,(clockByKey.get(key)??0)+N(x.total));}}
  for(const x of SAH_DATA){for(const month of [x.month,'*']){const key=Number(x.line)+'|'+String(x.ewo)+'|'+month;if(!sahByKey.has(key))sahByKey.set(key,x);}}
  for(const x of FABRIC_CUTTING_DATA||[]){const ew=normEwo(x.ewo);add(fabricByEwo,ew,x);add(fabricByColor,JSON.stringify([ew,normColor(x.color_name)]),x);addColor(ew,x.color_name);}
  for(const x of SEWING_IO_DATA){const ew=normEwo(x.ewo);add(sewingByLineEwo,Number(x.line_no)+'|'+ew,x);add(sewingByEwo,ew,x);addColor(ew,x.color);}
  for(const x of DATE_WISE_PRODUCTION_DATA||[]){const ew=normEwo(x.ewo);add(productionByCell,Number(x.line_no)+'|'+String(x.output_date||'').slice(0,10)+'|'+ew,x);addColor(ew,x.color);}
  const colorsByCell=new Map();
  // Match the existing prefix lookup, including literal pipes in source color/EWO text.
  for(const k of ewoQty.keys())colorsByCell.set(k,[]);
  for(const [ck,cq] of planColorQty){let pos=ck.lastIndexOf('|');while(pos>=0){const key=ck.slice(0,pos);if(colorsByCell.has(key))colorsByCell.get(key).push({color:ck.slice(pos+1),qty:N(cq)});pos=ck.lastIndexOf('|',pos-1);}}

  const sumRows=(map,fields)=>new Map([...map].map(([key,rows])=>[key,Object.fromEntries(fields.map(field=>[field,rows.reduce((a,x)=>a+N(x[field]),0)]))]));
  const sewingTotals=sumRows(sewingByLineEwo,['input','output','wip','reject']),inputTotals=sumRows(sewingByEwo,['input']),fabricTotals=sumRows(fabricByEwo,['cutable_qty','total_cut_qty']),productionTotals=sumRows(productionByCell,['total_qty']);
  const sortedColors=new Map([...colorsByEwo].map(([key,colors])=>[key,[...colors].sort((a,b)=>a.localeCompare(b))]));
  const cuttingComments=new Map([...fabricByColor].map(([key,rows])=>{
    const text=field=>[...new Set(rows.map(x=>String(x[field]??'').trim()).filter(Boolean))].join(' | ')||'—';
    return [key,{styleEmb:text('style_embellishment_type'),status:text('status'),difficulties:text('cutting_difficulties')}];
  }));
  const cellEntries=new Map();
  ewoQty.forEach((qty,k)=>{
    const p=k.split('|'),line=Number(p[0]),date=p[1],ewo=p.slice(2).join('|');
    const cellKey=line+'|'+date,m=metaMap.get(k)||{};
    const month=monthFromISO(date);
    // Exact hovered Line + Date Plan SAH:
    // Plan SAH = this Gantt cell's Plan Qty × SMV / 60.
    // Do NOT use monthly SAH/Day total here.
    let smv=N(m.smv);
    if(smv<=0){
      const dp=smvByKey.get(line+'|'+date+'|'+ewo);
      if(dp)smv=N(dp.smv);
    }
    const sah=qty*smv/60;
    const clock=(clockByKey.get(line+'|'+ewo+'|'+(month||'*'))??0);
    const eff=clock>0?sah/clock*100:0;
    // Resolve Color from THIS exact Plan Line + Date + EWO cell.
    // If the same EWO has multiple colors on the same line/date, use the color
    // carrying the highest Plan Qty for that cell (stable alphabetical tie-break).
    const colorCandidates=colorsByCell.get(k)||[];
    colorCandidates.sort((a,b)=>b.qty-a.qty || String(a.color).localeCompare(String(b.color)));
    let color=colorCandidates.length?colorCandidates[0].color:(m.color||'');
    if(!color){
      const sr=sahByKey.get(line+'|'+ewo+'|'+(month||'*'));
      if(sr)color=sr.color||'';
    }
    const ganttColor=normColor(color);

    // EWO-wise reconciliation: Color is informational only, never a calculation key.
    // Sewing metrics = exact Line + EWO, summed across every Color.
    const sio=sewingByLineEwo.get(line+'|'+normEwo(ewo))||[];
    const sewingInput=(sewingTotals.get(line+'|'+normEwo(ewo))?.input??0);
    const sewingOutput=(sewingTotals.get(line+'|'+normEwo(ewo))?.output??0);
    const sewingWip=(sewingTotals.get(line+'|'+normEwo(ewo))?.wip??0);
    const sewingReject=(sewingTotals.get(line+'|'+normEwo(ewo))?.reject??0);

    // Exact Date Wise Production match:
    // SAME Line + SAME Output Date + SAME EWO, across all Colors.
    // The production report may contain multiple PO / Color rows for that key,
    // therefore Total Qty is summed once across every exact matching source row.
    const productionMatches=productionByCell.get(Number(line)+'|'+String(date||'').slice(0,10)+'|'+normEwo(ewo))||[];
    const productionQty=(productionTotals.get(Number(line)+'|'+String(date||'').slice(0,10)+'|'+normEwo(ewo))?.total_qty??0);

    // Cut Qty = EWO total across every Color (not line/date scoped).
    const fcMatches=fabricByEwo.get(normEwo(ewo))||[];
    const cutableQty=(fabricTotals.get(normEwo(ewo))?.cutable_qty??0);
    const cutQty=(fabricTotals.get(normEwo(ewo))?.total_cut_qty??0);

    // Cutting WIP = EWO Total Cut Qty - EWO Total Sewing Input.
    // All lines and all colors are combined; no Line/Date/Color filter here.
    const cuttingTotalSewingInput=(inputTotals.get(normEwo(ewo))?.input??0);
    const cuttingWip=Math.max(0,cutQty-cuttingTotalSewingInput);

    // Informational only: show every known color for this EWO.
    const ewoColors=sortedColors.get(normEwo(ewo))||[];

    // Informational Cutting comments ONLY: exact EWO + exact Gantt Color.
    // These fields do not participate in any quantity, WIP, coverage, winner or color calculation.
    const cuttingComment=cuttingComments.get(JSON.stringify([normEwo(ewo),ganttColor]))||{styleEmb:'—',status:'—',difficulties:'—'};

    const item={ewo,qty,buyer:m.buyer||'',style:m.style||'',color,planColors:colorCandidates,ewoColors,sah,clock,eff,
      sewingInput,sewingOutput,sewingWip,sewingReject,sewingRows:sio.length,
      productionQty,productionRows:productionMatches.length,
      cutableQty,cutQty,cutRows:fcMatches.length,cuttingTotalSewingInput,cuttingWip,
      cuttingComment};
    if(!cellEntries.has(cellKey))cellEntries.set(cellKey,[]);
    cellEntries.get(cellKey).push(item);
  });

  cellEntries.forEach(items=>items.sort((a,b)=>b.qty-a.qty||a.ewo.localeCompare(b.ewo,undefined,{numeric:true})));

  // Pre-index latest production date once per Line+EWO.
  // This avoids rescanning thousands of production rows for every Gantt cell.
  const latestProdByLineEwo=new Map();
  let actualProductionDate='';
  for(const x of (DATE_WISE_PRODUCTION_DATA||[])){
    const ln=Number(x.line_no);
    const ew=normEwo(x.ewo);
    const dt=String(x.output_date||'').slice(0,10);
    // ACTUAL PRODUCTION REPORT CUTOFF:
    // The latest valid output_date present in the uploaded Date Wise Actual Production Report
    // is the official "production updated through" date. Qty is NOT used to decide the cutoff.
    if(dt && (!actualProductionDate || dt>actualProductionDate))actualProductionDate=dt;
    if(!ln||!ew||!dt)continue;
    const k=ln+'|'+ew;
    if(!latestProdByLineEwo.has(k)||dt>latestProdByLineEwo.get(k))latestProdByLineEwo.set(k,dt);
  }

  // Precompute cumulative Plan Qty from all planned EWO entries, grouped by Line+EWO.
  const ewoCoverage=new Map();
  cellEntries.forEach((items,ck)=>items.forEach(cw=>{
    const p=String(ck).split('|');
    const ln=Number(p[0]),dt=String(p[1]||'').slice(0,10),ew=normEwo(cw.ewo);
    if(!ln||!dt||!ew)return;
    const k=ln+'|'+ew;
    if(!ewoCoverage.has(k))ewoCoverage.set(k,[]);
    ewoCoverage.get(k).push({date:dt,qty:N(cw.qty)});
  }));
  ewoCoverage.forEach(arr=>arr.sort((a,b)=>a.date.localeCompare(b.date)));

  const cumulativeDemand=new Map();
  for(const [key,rows] of ewoCoverage){let total=0;const byDate=new Map();for(const row of rows){if(actualProductionDate&&row.date<=actualProductionDate)continue;total+=N(row.qty);byDate.set(row.date,total);}cumulativeDemand.set(key,byDate);}
  const value={planDates,activeDateSet,cellEntries,latestProdByLineEwo,actualProductionDate,cumulativeDemand,normEwo};
  GANTT_INDEX_CACHE={sources,lengths:sources.map(rows=>rows.length),key,owner,generation,value};
  finish({cells:cellEntries.size,rows:scope.length});return value;
}

function renderS11(data){
  if(!prepareSharedReportView(7))return;
  if(typeof recordDashboardRender==='function')recordDashboardRender('7');
  const finishRender=typeof startDashboardTiming==='function'?startDashboardTiming('gantt.render'):()=>{};
  const master=getChassisMasterLines();
  const {planDates,cellEntries,latestProdByLineEwo,actualProductionDate,cumulativeDemand,normEwo}=getGanttIndex(master);
  const planId=String(ACTIVE_PLAN_UPLOAD?.id||'local');
  if(S11_RANGE_PLAN_ID!==planId){
    S11_RANGE_PLAN_ID=planId;S11_RANGE_FROM=planDates[0]||'';S11_RANGE_TO=planDates.at(-1)||'';
  }
  const from=document.getElementById('s11-date-from'),to=document.getElementById('s11-date-to'),all=document.getElementById('s11-date-all');
  for(const input of [from,to]){input.disabled=!planDates.length;input.min=planDates[0]||'';input.max=planDates.at(-1)||'';}
  if(planDates.length){
    const clamp=value=>!value||value<planDates[0]?planDates[0]:value>planDates.at(-1)?planDates.at(-1):value;
    S11_RANGE_FROM=clamp(S11_RANGE_FROM);S11_RANGE_TO=clamp(S11_RANGE_TO);
    if(S11_RANGE_FROM>S11_RANGE_TO)S11_RANGE_TO=S11_RANGE_FROM;
  }
  from.value=S11_RANGE_FROM;to.value=S11_RANGE_TO;all.disabled=!planDates.length;
  S11_RANGE_NARROWED=!!planDates.length&&(S11_RANGE_FROM!==planDates[0]||S11_RANGE_TO!==planDates.at(-1));
  const dates=planDates.filter(d=>d>=S11_RANGE_FROM&&d<=S11_RANGE_TO);
  // Retain the complete plan for cumulative coverage, even when showing a short date range.
  document.getElementById('s11-month').textContent=activePlanningLabel();

  const allLines=[...master].map(Number).filter(n=>n>0&&n!==46).sort((a,b)=>a-b);
  const searchEwo=String(GANTT_EWO_SEARCH||'').trim().toUpperCase();
  const selectedLine=Number(GANTT_LINE_FILTER)||0;
  const lines=allLines.filter(line=>{
    if(selectedLine && line!==selectedLine)return false;
    if(!searchEwo)return true;
    return dates.some(date=>{
      return (cellEntries.get(line+'|'+date)||[]).some(w=>normEwo(w.ewo)===searchEwo);
    });
  });
  const displayDates=searchEwo
    ? dates.filter(date=>lines.some(line=>(cellEntries.get(line+'|'+date)||[]).some(w=>normEwo(w.ewo)===searchEwo)))
    : dates;

  const dateLabel=d=>{const dt=new Date(d+'T00:00:00');return String(dt.getDate()).padStart(2,'0')+'-'+dt.toLocaleString('en-US',{month:'short'})+'-'+String(dt.getFullYear()).slice(-2)};
  const s11Count=document.getElementById('s11-count'); if(s11Count)s11Count.textContent=lines.length+' Teams · '+displayDates.length+' active days'+(actualProductionDate?' · Actual Production Report updated through: '+dateLabel(actualProductionDate):'');
  const s11Head=document.getElementById('s11-head'); if(s11Head)s11Head.innerHTML='<tr><th class="sticky-team">Team</th>'+displayDates.map(d=>'<th class="g-date">'+dateLabel(d)+'</th>').join('')+'</tr>';

  const ewoInput=document.getElementById('gantt-ewo-search');
  const ewoBtn=document.getElementById('gantt-ewo-search-btn');
  const lineSel=document.getElementById('gantt-line-filter');
  const clearBtn=document.getElementById('gantt-filter-clear');
  const colorToggle=document.getElementById('gantt-color-condition');
  const conditionSelect=document.getElementById('gantt-condition-filter');
  const colorEnabled=!!colorToggle?.checked;
  const conditionFilter=colorEnabled?conditionSelect?.value||'':'';
  if(conditionSelect)conditionSelect.disabled=!colorEnabled;
  if(lineSel){
    const current=String(GANTT_LINE_FILTER||'');
    lineSel.innerHTML='<option value="">All Lines</option>'+allLines.map(x=>'<option value="'+x+'" '+(String(x)===current?'selected':'')+'>Line '+x+'</option>').join('');
    lineSel.onchange=()=>{GANTT_LINE_FILTER=lineSel.value;renderS11(data);};
  }
  if(ewoInput){
    ewoInput.value=GANTT_EWO_SEARCH;
    const runSearch=()=>flushDashboardInput(ewoInput,()=>{GANTT_EWO_SEARCH=String(ewoInput.value||'').trim();renderS11(data);});
    ewoInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();runSearch();}};
    if(ewoBtn)ewoBtn.onclick=runSearch;
  }
  if(clearBtn)clearBtn.onclick=()=>{
    GANTT_EWO_SEARCH='';GANTT_LINE_FILTER='';
    if(colorToggle)colorToggle.checked=true;
    if(conditionSelect)conditionSelect.value='';
    renderS11(data);
  };

  const s11Body=document.getElementById('s11-body'); if(!s11Body)return; s11Body.innerHTML=lines.map(line=>'<tr><td class="sticky-team">'+line+'</td>'+displayDates.map(date=>{
    const items=cellEntries.get(line+'|'+date)||[];
    const entries=items.filter(w=>!searchEwo||normEwo(w.ewo)===searchEwo).map(w=>{
      // WIP coverage starts AFTER this exact Line + EWO's latest production date.
      // All planned EWO entries remain the source for cumulative future Plan Qty.
      const coverageKey=Number(line)+'|'+normEwo(w.ewo);
      const lineEwoLatestProductionDate=latestProdByLineEwo.get(coverageKey)||'';
      const thisDate=String(date||'').slice(0,10);
      // Material coverage colors are allowed only AFTER the latest date physically present
      // in the uploaded Date Wise Actual Production Report. Dates through that report date
      // keep the normal Gantt color; coverage begins strictly on the next plan date.
      const latestProductionDate=actualProductionDate;
      const afterProductionCutoff=!!actualProductionDate && thisDate>actualProductionDate;

      let wipCovered=false,cuttingCovered=false,cutableCovered=false,materialShort=false;
      if(afterProductionCutoff){
        const cumulativePlan=cumulativeDemand.get(coverageKey)?.get(thisDate)||0;
        // Sequential/additive stock consumption:
        // 1) cumulative Plan consumes Sewing WIP first;
        // 2) only the uncovered balance consumes Cutting WIP;
        // 3) only the still-uncovered balance consumes Cutable Qty.
        const sewingStock=N(w.sewingWip);
        const cuttingStock=N(w.cuttingWip);
        const cutableStock=N(w.cutableQty);
        const planRequiringCutting=Math.max(0,cumulativePlan-sewingStock);
        const planRequiringCutable=Math.max(0,cumulativePlan-sewingStock-cuttingStock);

        w.consumableWip=Math.max(0,sewingStock-cumulativePlan);
        w.consumableCuttingWip=Math.max(0,cuttingStock-planRequiringCutting);
        w.consumableCutableQty=Math.max(0,cutableStock-planRequiringCutable);

        wipCovered=cumulativePlan<=sewingStock;
        cuttingCovered=!wipCovered && cumulativePlan<=sewingStock+cuttingStock;
        cutableCovered=!wipCovered && !cuttingCovered && cumulativePlan<=sewingStock+cuttingStock+cutableStock;
        materialShort=!wipCovered && !cuttingCovered && !cutableCovered;
      }
      if(!afterProductionCutoff){
        w.consumableWip=null;
        w.consumableCuttingWip=null;
        w.consumableCutableQty=null;
      }

      const condition=ganttCoverageCondition(wipCovered,cuttingCovered,cutableCovered,materialShort);
      if(!ganttConditionVisible(condition,colorEnabled,conditionFilter))return '';
      const cellEwos=items.map(item=>({line,date,ewo:item.ewo,qty:item.qty,color:item.color,planColors:item.planColors,buyer:item.buyer,style:item.style}));
      const payloadWithWip=encodeURIComponent(JSON.stringify({line,date,...w,cellEwos}));
      const coverageClass=!colorEnabled?'':condition==='wip'?' g-wip-covered':condition==='cutting'?' g-cutting-covered':condition==='cutable'?' g-cutable-covered':condition==='short'?' g-material-short':'';
      return '<button type="button" class="g-ewo'+coverageClass+'" data-gantt="'+payloadWithWip+'" aria-label="Open EWO '+esc(w.ewo)+' status">'+esc(w.ewo)+'</button>';
    }).filter(Boolean);
    return entries.length?'<td class="g-ewo-cell"><div class="g-ewo-stack">'+entries.join('\n')+'</div></td>':'<td class="g-empty">&nbsp;</td>';
  }).join('')+'</tr>').join('');

  if(s11Body.addEventListener&&!s11Body.dataset.ganttBound){
    s11Body.dataset.ganttBound='1';
    s11Body.addEventListener('click',event=>{
      const target=event.target.closest('[data-gantt]');
      if(target&&s11Body.contains(target))showGanttPopup(target);
    });
    s11Body.addEventListener('keydown',event=>{
      const target=event.target.closest('[data-gantt]');
      if(target&&s11Body.contains(target)&&(event.key==='Enter'||event.key===' ')){
        event.preventDefault();showGanttPopup(target);
      }
    });
  }
  if(typeof GANTT_ACTION_TAB!=='undefined'&&GANTT_ACTION_TAB!=='gantt')renderGanttActionCalendar();
  finishRender({lines:lines.length,dates:displayDates.length});
}

function renderS7(data){
  if(typeof recordDashboardRender==='function')recordDashboardRender('8');
 document.getElementById('s7-month').textContent=monthLabel(data);
 const ms=sortedMonths(data),hw=strengths(),chassis=[...Object.keys(hw),'Other'];
 const colors=['#ce93d8','#ef5350','#4fc3f7','#ffb74d','#4db6ac'];
 const plans=ms.map((m,i)=>({lbl:m+' Plan',vals:chassis.map(c=>new Set(data.filter(r=>r.month===m&&chassisOf(r.style)===c).map(r=>r.line)).size),color:colors[i%colors.length]}));
 drawGroupedBar('s7-canvas1',chassis,[{lbl:'HW Strength',vals:chassis.map(c=>hw[c]||0),color:'#3aaa63'},...plans]);
 drawGroupedBar('s7-canvas2',['Grand Total'],[{lbl:'HW Strength',vals:[Object.values(hw).reduce((a,b)=>a+b,0)],color:'#3aaa63'},...ms.map((m,i)=>({lbl:m+' Plan',vals:[new Set(data.filter(r=>r.month===m).map(r=>r.line)).size],color:colors[i%colors.length]}))]);
 const buyers=unique(data,'buyer');drawGroupedBar('s7-canvas3',buyers,[{lbl:'Order Qty',vals:buyers.map(b=>authoritativeOrderQty(data.filter(r=>r.buyer===b))),color:'#4fc3f7'},{lbl:'Plan Qty',vals:buyers.map(b=>sum(data.filter(r=>r.buyer===b),'planqty')),color:'#3aaa63'}]);
}

function drawGroupedBar(canvasId,labels,datasets){
  const canvas=document.getElementById(canvasId);
  if(!canvas) return;
  const W=canvas.parentElement.offsetWidth||600;
  const legendColumns=Math.max(1,Math.floor((W-75)/150));
  const legendHeight=Math.ceil(datasets.length/legendColumns)*16;
  const H=220+legendHeight;
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);

  const pad={top:20,right:20,bottom:50+legendHeight,left:55};
  const cW=W-pad.left-pad.right;
  const cH=H-pad.top-pad.bottom;

  const allVals=datasets.flatMap(d=>d.vals);
  const maxV=Math.max(...allVals,1)*1.15;

  // grid
  const gridLines=4;
  ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--border').trim();ctx.lineWidth=1;
  for(let i=0;i<=gridLines;i++){
    const y=pad.top+cH*(1-i/gridLines);
    ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(pad.left+cW,y);ctx.stroke();
    ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text2').trim();ctx.font='9px monospace';ctx.textAlign='right';
    ctx.fillText(Math.round(maxV*i/gridLines),pad.left-4,y+3);
  }

  const n=labels.length;
  const nd=datasets.length;
  const groupW=cW/Math.max(n,1);
  const barW=Math.min(groupW*0.7/nd,35);
  const gapBetween=2;

  datasets.forEach((ds,di)=>{
    ctx.fillStyle=ds.color;
    labels.forEach((lbl,li)=>{
      const v=ds.vals[li]||0;
      const bH=Math.max(v/maxV*cH,1);
      const x=pad.left+groupW*li+(groupW*(1-(nd*barW+(nd-1)*gapBetween)/groupW)/2)+(barW+gapBetween)*di;
      const y=pad.top+cH-bH;
      ctx.fillRect(x,y,barW,bH);
      // value on top
      ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text2').trim();ctx.font='9px monospace';ctx.textAlign='center';
      if(v>0)ctx.fillText(v,x+barW/2,y-2);
      ctx.fillStyle=ds.color;
    });
  });

  // x labels
  ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text2').trim();ctx.font='10px sans-serif';ctx.textAlign='center';
  labels.forEach((lbl,li)=>{
    const x=pad.left+groupW*li+groupW/2;
    ctx.fillText(lbl.length>10?lbl.slice(0,10)+'…':lbl,x,H-pad.bottom+14);
  });

  // legend
  datasets.forEach((ds,i)=>{
    const lx=pad.left+(i%legendColumns)*150;
    const ly=H-legendHeight+Math.floor(i/legendColumns)*16;
    ctx.fillStyle=ds.color;ctx.fillRect(lx,ly,10,8);
    ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text2').trim();ctx.font='9px sans-serif';ctx.textAlign='left';
    ctx.fillText(ds.lbl,lx+13,ly+7,132);
  });
}

/* ══ SLIDE 8: FEEDING ANALYSIS ══════════════════ */
function renderFeedingPie(elId, entries, totalFeeding){
  const el=document.getElementById(elId); if(!el)return;
  const palette=['#3aaa63','#f0a500','#4fc3f7','#ce93d8','#ef5350','#81c784','#ff8a65','#dce775','#4db6ac','#a1887f','#66bb6a','#f06292','#78909c','#26a69a'];
  const clean=entries.filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
  if(!clean.length||!totalFeeding){el.innerHTML='<div style="color:var(--text3);font-size:12px">No feeding data</div>';return;}
  let run=0; const stops=[];
  clean.forEach((x,i)=>{const a=run/totalFeeding*360;run+=x.value;const b=run/totalFeeding*360;stops.push(`${palette[i%palette.length]} ${a}deg ${b}deg`)});
  el.innerHTML=`<div class="feeding-pie" style="background:conic-gradient(${stops.join(',')})">
    <div class="feeding-pie-center"><b>${fmt(totalFeeding)}</b><span>Total Feeding</span></div></div>
    <div class="feeding-pie-legend">${clean.map((x,i)=>`<div class="feeding-leg-row">
      <span class="feeding-leg-dot" style="background:${palette[i%palette.length]}"></span>
      <span class="feeding-leg-name" title="${esc(x.name)}">${esc(x.name)}</span>
      <span class="feeding-leg-count">${fmt(x.value)}</span>
      <span class="feeding-leg-pct">${(x.value/totalFeeding*100).toFixed(1)}%</span>
    </div>`).join('')}</div>`;
}

function renderS8(data){
  data=S6_FEEDING_SOURCE;

  // Count lines per EWO (= feeding count)
  const ewoMap={};
  data.forEach(r=>{
    const k=JSON.stringify([r.month,r.ewo]);
    if(!ewoMap[k])ewoMap[k]=new Set();
    ewoMap[k].add(r.line);
  });

  const feedCounts=Object.values(ewoMap).map(lines=>lines.size);
  const maxFeed=Math.max(...feedCounts,1);
  const totEWO=feedCounts.length;

  const freq={};
  feedCounts.forEach(c=>{freq[c]=(freq[c]||0)+1});

  const rows=Object.entries(freq).map(([times,cnt])=>({times:N(times),cnt,feeding:N(times)*cnt}))
    .sort((a,b)=>a.times-b.times);
  const totFeeding=rows.reduce((s,r)=>s+r.feeding,0);

  // Buyer/Product feeding: one feeding = one distinct Month + EWO + Line.
  // This keeps both pie-chart totals exactly aligned with Total Feeding above.
  const feedingUnits=new Map();
  data.forEach(r=>{
    const ewo=String(r.ewo??'').trim(), line=String(r.line??'').trim();
    if(!ewo||!line)return;
    const k=JSON.stringify([r.month,ewo,line]);
    if(!feedingUnits.has(k))feedingUnits.set(k,{buyer:(r.buyer||'Unknown').trim()||'Unknown',product:(r.style||'Unknown').trim()||'Unknown'});
  });
  const buyerFeed={}, productFeed={};
  feedingUnits.forEach(x=>{buyerFeed[x.buyer]=(buyerFeed[x.buyer]||0)+1;productFeed[x.product]=(productFeed[x.product]||0)+1});

  const maxCnt=Math.max(...rows.map(r=>r.cnt),1);
  document.getElementById('s8-bar').innerHTML=rows.map(r=>`
    <div class="bar-row">
      <div class="bar-lbl">${r.times} Lines</div>
      <div class="bar-wrap"><div class="bar-fill" style="width:${Math.round(r.cnt/maxCnt*100)}%;background:${r.times===1?'#3aaa63':r.times<=2?'#f0a500':'#ef5350'}"></div>
        <div class="bar-val">${r.cnt} EWOs</div></div>
    </div>`).join('');

  const singleLine=freq[1]||0;
  document.getElementById('s8-summary').innerHTML=`
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-lbl">Single Line EWO</div><div class="kpi-val c">${singleLine}</div>
        <div class="kpi-sub">${(totEWO?Math.round(singleLine/totEWO*100):0)}% of total</div></div>
      <div class="kpi"><div class="kpi-lbl">Multi Line EWO</div><div class="kpi-val" style="color:var(--amber2)">${totEWO-singleLine}</div>
        <div class="kpi-sub">${(totEWO?Math.round((totEWO-singleLine)/totEWO*100):0)}% of total</div></div>
      <div class="kpi"><div class="kpi-lbl">Total Feeding</div><div class="kpi-val">${totFeeding}</div></div>
    </div>`;

  renderFeedingPie('s8-buyer-pie',Object.entries(buyerFeed).map(([name,value])=>({name,value})),totFeeding);
  renderFeedingPie('s8-product-pie',Object.entries(productFeed).map(([name,value])=>({name,value})),totFeeding);
}

/* ══ SLIDE 9: LINE CALENDAR ═════════════════════ */
function renderS9(data){
  if(typeof recordDashboardRender==='function')recordDashboardRender('10');
  // Date columns come only from uploaded Plan/Day data. A date with no positive plan on any master line is an Off Day and is hidden.
  const allDates=[...new Set(DAILY_PLAN.map(d=>d.date).filter(Boolean))].sort();
  const selected='';
  const candidateDates=selected ? allDates.filter(d=>monthFromISO(d)===selected) : allDates;
  const masterLines=getChassisMasterLines();
  const activeDateSet=new Set(DAILY_PLAN.filter(d=>candidateDates.includes(d.date)&&d.value>0&&masterLines.has(Number(d.line))).map(d=>d.date));
  const dates=candidateDates.filter(d=>activeDateSet.has(d));

  document.getElementById('s9-month').textContent=
    dates.length ? activePlanningLabel()+' · '+dates[0]+' → '+dates[dates.length-1] : 'No daily data';

  if(!dates.length){
    document.getElementById('s9-cal').innerHTML='<tbody><tr><td>No active date-wise Plan/Day data found.</td></tr></tbody>';
    for(const id of ['s9-legend','s9-sum-head','s9-sum-body','s9-hit-chart','s9-product-chart','s9-day-chart'])document.getElementById(id).innerHTML='';
    return;
  }

  const daily=DAILY_PLAN.filter(d=>dates.includes(d.date)&&d.value>0&&masterLines.has(Number(d.line)));
  const lines=[...new Set(daily.map(d=>Number(d.line)).filter(n=>n>0&&masterLines.has(n)))].sort((a,b)=>a-b);
  const winner=new Map();
  daily.forEach(d=>{const k=Number(d.line)+'|'+d.date,old=winner.get(k);if(!old||d.value>old.value)winner.set(k,d)});

  const norm=v=>String(v||'').trim().toUpperCase().replace(/HOODIE/g,'HOODY').replace(/SWEATSHIRT/g,'SWEAT SHIRT').replace(/TANK TOP/g,'TANKTOP').replace(/RUGBY\s+POLO/g,'RUGBY POLO').replace(/\s+/g,' ');
  const priorityTokens=v=>norm(v).split('/').map(x=>x.trim()).filter(Boolean);
  const isPriorityHit=(style,pr)=>{
    const st=norm(style); const allowed=[...priorityTokens(pr[1]),...priorityTokens(pr[2])];
    return allowed.includes(st);
  };

  const styles=[...new Set([...winner.values()].map(d=>d.style))].sort();
  const counts=Object.fromEntries(styles.map(s=>[s,dates.map(()=>0)]));
  const linesByStyle=Object.fromEntries(styles.map(s=>[s,new Set()]));
  winner.forEach((w,k)=>{if(linesByStyle[w.style])linesByStyle[w.style].add(Number(k.split('|')[0]))});

  const chassisPriorityMap=new Map(getChassisPriority().map(r=>[Number(r[0]),r]));
  let totalHit=0,totalMiss=0;
  const productCells={};
  const productHitMiss={};
  let out='<thead><tr><th>Line</th><th class="priority-head">1st Priority</th><th class="priority-head">2nd Priority</th><th class="metric-head">Hit %</th><th class="metric-head">Not Hit %</th>'+dates.map(d=>'<th title="'+esc(d)+'">'+Number(d.slice(8))+'<div style="font-size:8px;color:var(--text2);font-weight:400">'+esc(monthNames[Number(d.slice(5,7))-1])+'</div></th>').join('')+'</tr></thead><tbody>';

  for(const line of lines){
    const pr=chassisPriorityMap.get(Number(line))||[line,'',''];
    let lineHit=0,lineMiss=0;
    const cells=[];
    dates.forEach((date,i)=>{
      const w=winner.get(line+'|'+date);
      if(!w){cells.push('<td class="off-cell">—</td>');return}
      counts[w.style][i]++;
      productCells[w.style]=(productCells[w.style]||0)+1;
      const hit=isPriorityHit(w.style,pr);
      if(!productHitMiss[w.style])productHitMiss[w.style]={hit:0,miss:0};
      if(hit){productHitMiss[w.style].hit++;lineHit++;totalHit++}
      else{productHitMiss[w.style].miss++;lineMiss++;totalMiss++}
      const month=monthFromISO(date);

      // PLAN SAH must be for THIS hovered Line/Date plan, not the monthly SAH total.
      // Standard Hours = Plan Qty × SMV / 60.
      const sah=N(w.value)*N(w.smv)/60;

      // Clock Hour/Day = exact value from the hovered DATE column.
      // Match Line + Date + EWO and aggregate only genuine duplicate clock rows.
      let clock=CLOCK_HOUR_DAILY
        .filter(x=>Number(x.line)===Number(line) && x.date===date && String(x.ewo)===String(w.ewo))
        .reduce((s,x)=>s+N(x.value),0);
      // Some source Clock Hour rows may not carry EWO. In that case use Line + Date.
      if(clock<=0){
        clock=CLOCK_HOUR_DAILY
          .filter(x=>Number(x.line)===Number(line) && x.date===date && (!x.ewo || String(x.ewo).trim()===''))
          .reduce((s,x)=>s+N(x.value),0);
      }
      // Line-wise Manpower is counted ONCE only.
      // DATA preserves source-row order, so take one positive manpower value for the line;
      // never sum manpower across EWO/product rows.
      const mpRow=DATA.find(r=>Number(r.line)===Number(line) && N(r.manpower)>0);
      const manpower=mpRow?N(mpRow.manpower):0;

      // Working Hour = date-wise line total Clock Hour / one line-wise Manpower.
      const workingHour=manpower>0?clock/manpower:0;

      // Fixed capacity = 10 working hours per line.
      const capacityWorkingHour=10;
      const capacityClockHour=capacityWorkingHour*manpower;
      const capacityDiffClockHour=(capacityWorkingHour-workingHour)*manpower;
      const capacityStatus=capacityDiffClockHour>0?'Less Work Load':(capacityDiffClockHour<0?'Over Plan':'Full Capacity');

      const eff=clock>0?sah/clock*100:0;

      let color=w.color||'';
      if(!color){
        const sr=SAH_DATA.find(x=>Number(x.line)===Number(line)&&String(x.ewo)===String(w.ewo)&&(!month||x.month===month));
        if(sr)color=sr.color||'';
      }

      // RUN DAY = current continuous product run on this line.
      // If another product appears between two runs, the counter restarts from 1.
      const lineDates=dates.filter(d=>d<=date);
      let runDay=0,runStart='';
      for(let j=lineDates.length-1;j>=0;j--){
        const rw=winner.get(line+'|'+lineDates[j]);
        if(!rw || norm(rw.style)!==norm(w.style)) break;
        runDay++;
        runStart=lineDates[j];
      }

      // Ladder Efficiency = Admin > Efficiency & Run Day Ladder,
      // matched by Product Type and current continuous Run Day.
      const ladderRows=getEfficiencyLadder();
      const ladderRow=ladderRows.find(r=>norm(r[0])===norm(w.style));
      const ladderDayIndex=Math.min(Math.max(runDay,1),6); // Day-6 is also 6+
      const ladderEfficiency=ladderRow?N(ladderRow[ladderDayIndex]):null;

      const payload=encodeURIComponent(JSON.stringify({
        line,date,ewo:w.ewo||'',qty:w.value,buyer:w.buyer||'',style:w.style||'',color,sah,clock,manpower,workingHour,capacityWorkingHour,capacityClockHour,capacityDiffClockHour,capacityStatus,eff,hit,
        runDay,runStart,ladderEfficiency
      }));
      cells.push('<td class="'+(hit?'hit-cell':'miss-cell')+'" data-cal-tip="'+payload+'" style="'+(hit?'background:#b7e4c7!important;color:#17351f!important;':'background:#f6c1c1!important;color:#681b1b!important;')+'font-weight:800!important">'+esc(w.style)+'</td>');
    });
    const denom=lineHit+lineMiss, hp=denom?lineHit/denom*100:0, mp=denom?lineMiss/denom*100:0;
    out+='<tr><td class="line-td">'+line+'</td><td class="priority-cell priority-1">'+esc(pr[1]||'—')+'</td><td class="priority-cell priority-2">'+esc(pr[2]||'—')+'</td><td class="metric-cell hit-pct">'+hp.toFixed(0)+'%</td><td class="metric-cell miss-pct">'+mp.toFixed(0)+'%</td>'+cells.join('')+'</tr>';
  }
  out+='</tbody>';
  document.getElementById('s9-cal').innerHTML=out;

  // Calendar details: hover = bold only; left-click = popup.
  // Event delegation keeps working every time renderS9 rebuilds the calendar table.
  const calTable=document.getElementById('s9-cal');
  if(calTable){
    calTable.onclick=function(e){
      const td=e.target.closest('td[data-cal-tip]');
      if(!td || !calTable.contains(td)) return;
      e.preventDefault();

      let w={};
      try{w=JSON.parse(decodeURIComponent(td.getAttribute('data-cal-tip')||''));}catch(err){return;}

      const modal=document.getElementById('cal-detail-modal');
      const title=document.getElementById('cal-detail-title');
      const sub=document.getElementById('cal-detail-sub');
      const body=document.getElementById('cal-detail-body');
      if(!modal||!title||!sub||!body)return;

      title.textContent=(w.style||'Product')+' — Plan Details';
      sub.textContent='Line '+(w.line||'—')+' • '+(w.date||'—')+' • EWO '+(w.ewo||'—');

      const diff=Number(w.capacityDiffClockHour||0);
      const rows=[
        ['Priority Status',w.hit?'Priority Hit':'Priority Not Hit',w.hit?'#15803d':'#dc2626'],
        ['Plan Qty',Number(w.qty||0).toLocaleString(),null],
        ['Plan SAH',Number(w.sah||0).toFixed(1),null],
        ['Clock Hour/Day',Number(w.clock||0).toFixed(1),null],
        ['Manpower',w.manpower?Number(w.manpower).toFixed(0):'—',null],
        ['Working Hour',w.manpower?Number(w.workingHour).toFixed(1):'—','#0284c7'],
        ['Capacity Working Hour',Number(w.capacityWorkingHour||10).toFixed(1),'#059669'],
        ['Capacity Clock Hour',w.manpower?Number(w.capacityClockHour||0).toFixed(1):'—',null],
        [diff>=0?'Less Work Load Hour':'Over Plan Hour',w.manpower?Math.abs(diff).toFixed(1):'—',diff>=0?'#d97706':'#dc2626'],
        ['Capacity Status',w.capacityStatus||'—',w.capacityStatus==='Full Capacity'?'#15803d':(w.capacityStatus==='Less Work Load'?'#d97706':'#dc2626')],
        ['Buyer Name',w.buyer||'—',null],
        ['Product Name',w.style||'—','#15803d'],
        ['Run Start',w.runStart||'—',null],
        ['Run Day',(w.runDay||0)+' Day'+((w.runDay||0)===1?'':'s'),'#0284c7'],
        ['Ladder Efficiency',w.ladderEfficiency==null?'—':Number(w.ladderEfficiency).toFixed(1)+'%','#7c3aed'],
        ['Color Name',w.color||'—','#ea580c'],
        ['Plan Efficiency',Number(w.clock||0)>0?Number(w.eff||0).toFixed(1)+'%':'—',null]
      ];

      body.innerHTML=rows.map(r=>
        '<div class="cd-row"><span class="cd-lbl">'+esc(r[0])+'</span>'+
        '<span class="cd-val"'+(r[2]?' style="color:'+r[2]+'"':'')+'>'+esc(String(r[1]))+'</span></div>'
      ).join('');

      modal.dataset.copyText=[
        title.textContent,
        sub.textContent,
        ...rows.map(r=>r[0]+': '+r[1])
      ].join('\n');

      modal.classList.add('open');
      modal.setAttribute('aria-hidden','false');
    };
  }

  // Bind close controls once.
  const calModal=document.getElementById('cal-detail-modal');
  const calClose=document.getElementById('cal-detail-close');
  const calCopy=document.getElementById('cal-detail-copy');
  if(calCopy && !calCopy.dataset.bound){
    calCopy.dataset.bound='1';
    calCopy.addEventListener('click',async()=>{
      const box=document.getElementById('cal-detail-box');
      if(!box)return;
      const old=calCopy.textContent;
      calCopy.textContent='Copying...';
      try{
        const html2canvas=await ensureHtml2Canvas();
        const canvas=await html2canvas(box,{backgroundColor:'#ffffff',scale:2,useCORS:true,logging:false});
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob) throw new Error('Image creation failed');
        if(!navigator.clipboard || typeof ClipboardItem==='undefined') throw new Error('Image clipboard not supported');
        await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
        calCopy.textContent='Screen Copied!';
      }catch(err){
        // If browser blocks image clipboard (common for local file:// pages), save PNG instead.
        try{
          const html2canvas=await ensureHtml2Canvas();
          const canvas=await html2canvas(box,{backgroundColor:'#ffffff',scale:2,useCORS:true,logging:false});
          const a=document.createElement('a');
          a.download='plan-details-popup.png';
          a.href=canvas.toDataURL('image/png');
          a.click();
          calCopy.textContent='PNG Saved';
        }catch(e){
          calCopy.textContent='Copy Failed';
        }
      }
      setTimeout(()=>calCopy.textContent=old,1500);
    });
  }
  if(calClose && !calClose.dataset.bound){
    calClose.dataset.bound='1';
    calClose.addEventListener('click',()=>{calModal.classList.remove('open');calModal.setAttribute('aria-hidden','true');});
  }
  if(calModal && !calModal.dataset.bound){
    calModal.dataset.bound='1';
    calModal.addEventListener('click',e=>{
      if(e.target===calModal){calModal.classList.remove('open');calModal.setAttribute('aria-hidden','true');}
    });
  }

  const total=totalHit+totalMiss, hitPct=total?totalHit/total*100:0, missPct=total?totalMiss/total*100:0;
  document.getElementById('s9-hit-chart').innerHTML=`<div class="s9-hit-wrap"><div class="s9-hit-pie" style="background:conic-gradient(#3aaa63 0 ${hitPct}%,#d94a4a ${hitPct}% 100%)"><div class="s9-hit-center"><b>${hitPct.toFixed(0)}%</b><span>${fmt(total)} Plan Cells</span></div></div><div class="s9-hit-legend"><div><i class="s9-dot" style="background:#3aaa63"></i>Hit <b>${hitPct.toFixed(1)}% (${fmt(totalHit)})</b></div><div><i class="s9-dot" style="background:#d94a4a"></i>Not Hit <b>${missPct.toFixed(1)}% (${fmt(totalMiss)})</b></div></div></div>`;

  const prod=Object.entries(productHitMiss).map(([name,v])=>{
    const total=v.hit+v.miss;
    return {name,hit:v.hit,miss:v.miss,total,hitPct:total?v.hit/total*100:0,missPct:total?v.miss/total*100:0};
  }).sort((a,b)=>b.total-a.total);
  document.getElementById('s9-product-chart').innerHTML=
    '<div class="s9-prod-chart-legend"><b>■ Hit %</b> &nbsp;&nbsp; <b>■ Not Hit %</b></div>'+
    '<div class="s9-prod-bars">'+prod.map(p=>`<div class="s9-prod-col" title="${esc(p.name)} · Hit ${p.hitPct.toFixed(1)}% (${p.hit}) · Not Hit ${p.missPct.toFixed(1)}% (${p.miss})"><div class="s9-prod-pair"><div class="s9-prod-one"><div class="s9-prod-val">${p.hitPct.toFixed(0)}%</div><div class="s9-prod-bar s9-prod-hit" style="height:${Math.max(2,p.hitPct/100*125)}px"></div></div><div class="s9-prod-one"><div class="s9-prod-val">${p.missPct.toFixed(0)}%</div><div class="s9-prod-bar s9-prod-miss" style="height:${Math.max(2,p.missPct/100*125)}px"></div></div></div><div class="s9-prod-name">${esc(p.name)}</div></div>`).join('')+'</div>';

  // AUDIT FIX: day-wise hit/not-hit uses the exact same winning Line×Date cells
  // as the overall and product-wise calculations.
  const dayHM=Object.fromEntries(dates.map(d=>[d,{hit:0,miss:0}]));
  winner.forEach((w,k)=>{
    const parts=k.split('|'), line=Number(parts[0]), date=parts.slice(1).join('|');
    const pr=chassisPriorityMap.get(line)||[line,'',''];
    if(!dayHM[date])return;
    if(isPriorityHit(w.style,pr))dayHM[date].hit++; else dayHM[date].miss++;
  });
  document.getElementById('s9-day-chart').innerHTML='<div class="s9-day-bars">'+dates.map(d=>{
    const v=dayHM[d], t=v.hit+v.miss, hp=t?v.hit/t*100:0, mp=t?v.miss/t*100:0;
    return `<div class="s9-prod-col" title="${esc(d)} · Hit ${hp.toFixed(1)}% (${v.hit}) · Not Hit ${mp.toFixed(1)}% (${v.miss})"><div class="s9-prod-pair"><div class="s9-prod-one"><div class="s9-prod-val">${hp.toFixed(0)}%</div><div class="s9-prod-bar s9-prod-hit" style="height:${Math.max(2,hp/100*96)}px"></div></div><div class="s9-prod-one"><div class="s9-prod-val">${mp.toFixed(0)}%</div><div class="s9-prod-bar s9-prod-miss" style="height:${Math.max(2,mp/100*96)}px"></div></div></div><div class="s9-prod-name">${Number(d.slice(8))} ${esc(monthNames[Number(d.slice(5,7))-1])}</div></div>`;
  }).join('')+'</div>';

  document.getElementById('s9-legend').innerHTML='<span style="color:#6bd98b;font-weight:800">■ Hit</span> = Product matches 1st/2nd priority &nbsp; <span style="color:#ff6868;font-weight:800">■ Not Hit</span> = Product does not match priority &nbsp; <span style="color:var(--text2)">Off-day date columns are hidden. Same line/date হলে highest Plan/Day product দেখানো হচ্ছে.</span>';

  document.getElementById('s9-sum-head').innerHTML='<tr><th>Product Type</th>'+dates.map(d=>{
    const dt=new Date(d+'T00:00:00');
    const day=dt.getDate();
    const mon=dt.toLocaleString('en-US',{month:'short'});
    return '<th title="'+esc(d)+'"><div class="icpd-day">'+day+'</div><div class="icpd-month">'+mon+'</div></th>';
  }).join('')+'<th>Line-days</th><th>AVG Qty</th><th>In%</th></tr>';
  const totals=dates.map((_,i)=>styles.reduce((n,st)=>n+counts[st][i],0));
  const totalOccupied=totals.reduce((a,b)=>a+b,0);
  const summaryRow=(name,values,isTotal=false)=>{
    const t=values.reduce((a,b)=>a+b,0);
    const avgQty=dates.length?t/dates.length:0;
    const inPct=isTotal?100:(totalOccupied?Math.round(t/totalOccupied*100):0);
    return '<tr><td>'+esc(name)+'</td>'+values.map(v=>'<td class="num">'+v+'</td>').join('')+
      '<td class="num">'+t+'</td><td class="num">'+avgQty.toFixed(1)+'</td><td>'+inPct+'%</td></tr>';
  };
  document.getElementById('s9-sum-body').innerHTML=
    styles.map(st=>summaryRow(st,counts[st],false)).join('')+
    summaryRow('Occupied line-days',totals,true);
}

/* ══ TEMPLATE DOWNLOAD ══════════════════════════ */
function downloadTemplate(){
  const csv=`Month,Line,EWO,Buyer,Style,SMV,OrderQty,PlanQty,DeliveryDate,StartDate,EndDate
Apr-26,12,263480,Tommy,Polo,18.7,5546,638,2026-04-30,2026-04-01,2026-04-14
Apr-26,8,263480,Tommy,Polo,18.7,5546,2552,2026-04-30,2026-04-15,2026-04-30
Apr-26,3,263562,Ralph Lauren,Polo,20,2800,641,2026-04-01,2026-04-01,2026-04-30
Apr-26,5,263590,Carhartt,T-Shirt,6.5,1500,325,2026-04-01,2026-04-01,2026-04-20
Apr-26,6,263497,Tommy,T-Shirt,10.2,3373,3445,2026-04-01,2026-04-01,2026-04-25
Apr-26,7,263909,Ralph Lauren,T-Shirt,8.96,2000,208,2026-04-01,2026-04-01,2026-04-18
Apr-26,9,263752,Tommy,Hoody,20,400,25,2026-04-01,2026-04-01,2026-04-05
Apr-26,14,263553,Tommy,T-Shirt,8.9,15415,2617,2026-04-01,2026-04-01,2026-04-28
Apr-26,14,263757,Tommy,T-Shirt,9.3,524,415,2026-04-01,2026-04-20,2026-04-30
Apr-26,1,264100,M&S,Sweat Shirt,15,8500,4200,2026-04-25,2026-04-05,2026-04-25
Apr-26,2,264100,M&S,Sweat Shirt,15,8500,4300,2026-04-25,2026-04-06,2026-04-26
Apr-26,20,264200,Carhartt,Hoody,22,12000,6000,2026-04-28,2026-04-10,2026-04-28
Apr-26,21,264200,Carhartt,Hoody,22,12000,6000,2026-04-28,2026-04-10,2026-04-28
Apr-26,30,264300,M&S,T-Shirt,7.5,25000,12500,2026-04-30,2026-04-01,2026-04-20
Apr-26,31,264300,M&S,T-Shirt,7.5,25000,12500,2026-04-30,2026-04-15,2026-04-30
May-26,1,265100,Tommy,Sweat Shirt,16,9000,4500,2026-05-20,2026-05-01,2026-05-15
May-26,2,265100,Tommy,Sweat Shirt,16,9000,4500,2026-05-20,2026-05-10,2026-05-20
May-26,5,265200,Ralph Lauren,Polo,19,6000,3000,2026-05-25,2026-05-01,2026-05-25
May-26,6,265200,Ralph Lauren,Polo,19,6000,3000,2026-05-25,2026-05-05,2026-05-25`;
  download(csv,'production_planning_template.csv','text/csv');
}

/* ══ EXPORT ════════════════════════════════════ */
function exportData(){
  if(!DATA.length){alert('No data to export.');return}
  const hdr='Month,Line,EWO,Buyer,Style,SMV,OrderQty,PlanQty,DeliveryDate,StartDate,EndDate\n';
  const rows=DATA.map(r=>[r.month,r.line,r.ewo,r.buyer,r.style,r.smv,r.orderqty,r.planqty,r.deliverydate,r.startdate,r.enddate].map(csvCell).join(',')).join('\r\n');
  download(hdr+rows,'planning_export.csv','text/csv');
}

function download(content,name,type){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type}));
  a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* ══ SAMPLE DATA ════════════════════════════════ */
function loadSampleData(){
  const csv=`Month,Line,EWO,Buyer,Style,SMV,OrderQty,PlanQty,DeliveryDate,StartDate,EndDate
Apr-26,12,263480,Tommy,Polo,18.7,5546,638,2026-04-30,2026-04-01,2026-04-14
Apr-26,8,263480,Tommy,Polo,18.7,5546,2552,2026-04-30,2026-04-15,2026-04-30
Apr-26,3,263562,Ralph Lauren,Polo,20,2800,641,2026-04-01,2026-04-01,2026-04-30
Apr-26,5,263590,Carhartt,T-Shirt,6.5,1500,325,2026-04-01,2026-04-01,2026-04-20
Apr-26,6,263497,Tommy,T-Shirt,10.2,3373,3445,2026-04-01,2026-04-01,2026-04-25
Apr-26,7,263909,Ralph Lauren,T-Shirt,8.96,2000,208,2026-04-01,2026-04-01,2026-04-18
Apr-26,9,263752,Tommy,Hoody,20,400,25,2026-04-01,2026-04-01,2026-04-05
Apr-26,14,263553,Tommy,T-Shirt,8.9,15415,2617,2026-04-01,2026-04-01,2026-04-28
Apr-26,14,263757,Tommy,T-Shirt,9.3,524,415,2026-04-01,2026-04-20,2026-04-30
Apr-26,1,264100,M&S,Sweat Shirt,15,8500,4200,2026-04-25,2026-04-05,2026-04-25
Apr-26,2,264101,M&S,Sweat Shirt,15,7600,3800,2026-04-25,2026-04-06,2026-04-26
Apr-26,20,264200,Carhartt,Hoody,22,12000,6000,2026-04-28,2026-04-10,2026-04-28
Apr-26,21,264200,Carhartt,Hoody,22,12000,6000,2026-04-28,2026-04-10,2026-04-28
Apr-26,30,264300,M&S,T-Shirt,7.5,25000,12500,2026-04-30,2026-04-01,2026-04-20
Apr-26,31,264300,M&S,T-Shirt,7.5,25000,12500,2026-04-30,2026-04-15,2026-04-30
Apr-26,10,264400,Ralph Lauren,Sweat Shirt,14.5,18000,9000,2026-04-22,2026-04-01,2026-04-22
Apr-26,11,264400,Ralph Lauren,Sweat Shirt,14.5,18000,9000,2026-04-22,2026-04-05,2026-04-22
Apr-26,15,264500,Tommy,Hoody,21,22000,11000,2026-04-28,2026-04-08,2026-04-28
Apr-26,16,264500,Tommy,Hoody,21,22000,11000,2026-04-28,2026-04-10,2026-04-28
Apr-26,22,264600,Carhartt,T-Shirt,9,38000,19000,2026-04-30,2026-04-01,2026-04-20
Apr-26,23,264600,Carhartt,T-Shirt,9,38000,19000,2026-04-30,2026-04-15,2026-04-30
Apr-26,24,264700,Tommy,Polo,17,7500,3750,2026-04-25,2026-04-05,2026-04-25
Apr-26,25,264700,Tommy,Polo,17,7500,3750,2026-04-25,2026-04-10,2026-04-25
Apr-26,26,264800,M&S,Polo,19.5,9400,4700,2026-04-28,2026-04-08,2026-04-28
Apr-26,27,264800,M&S,Polo,19.5,9400,4700,2026-04-28,2026-04-12,2026-04-28
Apr-26,33,264900,Ralph Lauren,Polo,20,3700,1850,2026-04-20,2026-04-01,2026-04-20
Apr-26,34,264900,Ralph Lauren,Polo,20,3700,1850,2026-04-20,2026-04-05,2026-04-20
Apr-26,40,265000,Varner,T-Shirt,8.5,51000,25500,2026-04-30,2026-04-01,2026-04-20
Apr-26,41,265000,Varner,T-Shirt,8.5,51000,25500,2026-04-30,2026-04-15,2026-04-30
Apr-26,42,265010,Tommy,Sweat Shirt,16,11400,5700,2026-04-25,2026-04-05,2026-04-25
Apr-26,43,265010,Tommy,Sweat Shirt,16,11400,5700,2026-04-25,2026-04-10,2026-04-25
Apr-26,44,265020,Tommy,T-Shirt,10,14000,7000,2026-04-28,2026-04-08,2026-04-28
Apr-26,45,265020,Tommy,T-Shirt,10,14000,7000,2026-04-28,2026-04-12,2026-04-28
Apr-26,47,265030,Carhartt,Hoody,23,9200,4600,2026-04-25,2026-04-10,2026-04-25
May-26,1,265100,Tommy,Sweat Shirt,16,9000,4500,2026-05-20,2026-05-01,2026-05-15
May-26,2,265100,Tommy,Sweat Shirt,16,9000,4500,2026-05-20,2026-05-10,2026-05-20
May-26,5,265200,Ralph Lauren,Polo,19,6000,3000,2026-05-25,2026-05-01,2026-05-25
May-26,6,265200,Ralph Lauren,Polo,19,6000,3000,2026-05-25,2026-05-05,2026-05-25
May-26,10,265300,M&S,T-Shirt,8,12000,6000,2026-05-28,2026-05-01,2026-05-20
May-26,11,265300,M&S,T-Shirt,8,12000,6000,2026-05-28,2026-05-15,2026-05-28
May-26,20,265400,Tommy,Hoody,20,8500,4250,2026-05-22,2026-05-05,2026-05-22
May-26,21,265400,Tommy,Hoody,20,8500,4250,2026-05-22,2026-05-08,2026-05-22`;
  parseCSV(csv);
}




/* === USER MODULE MANAGEMENT === */
function getDashboardSlideRegistry(){
  return SLIDES.filter(s=>s.permissionKey).map(s=>({n:s.number,key:s.permissionKey,title:s.title}));
}
function getUserPermissionKeys(){
  const slideKeys=getDashboardSlideRegistry().map(x=>x.key);
  return [...new Set([...slideKeys,'planning_upload','fabric','sewing','production','embellishment_upload'])];
}
function getMaxDashboardSlide(){
  return Math.max(...SLIDES.map(s=>s.number));
}
function umEsc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function umOn(p,k){return !!(p&&(p[k]===true||p[k]==='true'))}

let SITE_USER_CREATE_BUSY=false;
async function addNewSiteUser(){
  if(SITE_USER_CREATE_BUSY)return;
  if(!requireSitePerm('user_admin','User Admin'))return;
  const email=String(document.getElementById('new-user-email')?.value||'').trim().toLowerCase();
  const password=String(document.getElementById('new-user-password')?.value||'');
  const role=document.getElementById('new-user-role')?.value||'user';
  const status=document.getElementById('new-user-status')?.value||'active';
  const msg=document.getElementById('user-add-msg');

  if(!email){if(msg)msg.innerHTML='<span style="color:#dc2626">✕ Email দিন</span>';return}
  if(password.length<12){if(msg)msg.innerHTML='<span style="color:#dc2626">✕ Password কমপক্ষে 12 characters দিন</span>';return}
  if(!SITE_USER_PROFILE || String(SITE_USER_PROFILE.role||'').toLowerCase()!=='admin'){
    if(msg)msg.innerHTML='<span style="color:#dc2626">✕ Admin access required</span>';return;
  }

  const permissionKeys=getUserPermissionKeys();
  const permissions = String(role).toLowerCase()==='admin'
    ? Object.fromEntries(permissionKeys.map(k=>[k,true]))
    : Object.fromEntries(permissionKeys.map(k=>[k,false]));

  SITE_USER_CREATE_BUSY=true;
  const addButton=document.querySelector('[onclick="addNewSiteUser()"]');
  if(addButton)addButton.disabled=true;
  try{
    if(msg)msg.innerHTML='<span style="color:#d97706">Creating confirmed Auth user...</span>';

    // Server-side Edge Function creates the Auth account with email_confirm:true.
    // The current Admin JWT is sent automatically by the MySQL client.
    const {data:{session}}=await SB.auth.getSession();
    if(!session?.access_token)throw Error('Admin session expired. Please sign in again.');
    const {data,error}=await SB.functions.invoke('admin-create-user',{
      headers:{Authorization:`Bearer ${session.access_token}`},
      body:{action:'create',email,password,role,status,permissions}
    });
    if(error)throw error;
    if(!data?.success)throw Error(data?.error||'User creation failed.');

    if(!data.auth_user_id)throw Error('Auth User ID link missing.');

    document.getElementById('new-user-email').value='';
    document.getElementById('new-user-password').value='';
    if(msg)msg.innerHTML='<span style="color:#16a34a;font-weight:900">✓ User Created · Email Confirmed · Login Ready</span>';
    await loadSiteUsers();
  }catch(e){
    console.error(e);
    let detail=e?.message||String(e);
    // functions.invoke may expose the function response body through context.
    try{
      if(e?.context && typeof e.context.json==='function'){
        const j=await e.context.json();
        if(j?.error)detail=j.error;
      }
    }catch(_){ }
    if(msg)msg.innerHTML='<span style="color:#dc2626;font-weight:900">✕ Failed: '+umEsc(detail)+'</span>';
    await loadSiteUsers();
  }finally{
    SITE_USER_CREATE_BUSY=false;if(addButton)addButton.disabled=false;
  }
}

async function loadSiteUsers(){
  if(!requireSitePerm('user_admin','User Admin'))return;
  const body=document.getElementById('site-users-body'),head=document.getElementById('site-users-head'),msg=document.getElementById('user-module-msg');
  if(!body||!head)return;

  const slides=getDashboardSlideRegistry();
  const fixedPerms=[
    {key:'planning_upload',title:'Plan Upload'},
    {key:'fabric',title:'Fabric Upload'},
    {key:'sewing',title:'Sewing Upload'},
    {key:'production',title:'Production Upload'},
    {key:'embellishment_upload',title:'Embellishment Upload'}
  ];
  const totalCols=4+slides.length+fixedPerms.length+1;

  head.innerHTML='<th>Email</th><th>Auth Status</th><th>Role</th><th>Status</th>'+
    slides.map(s=>`<th>${String(s.n).padStart(2,'0')} ${umEsc(s.title)}</th>`).join('')+
    fixedPerms.map(p=>`<th>${umEsc(p.title)}</th>`).join('')+
    '<th>Action</th>';

  body.innerHTML=`<tr><td colspan="${totalCols}" class="cen">Loading...</td></tr>`;
  if(msg)msg.textContent='Loading from MySQL...';
  try{
    const {data,error}=await SB.from('site_users').select('id,auth_user_id,email,role,status,permissions,created_at').order('created_at',{ascending:true});
    if(error)throw error;
    const rows=data||[];
    body.innerHTML=rows.length?rows.map(u=>{
      const p=u.permissions||{}, ck=k=>`<input type="checkbox" data-perm="${k}" ${umOn(p,k)?'checked':''}>`;
      const authLinked=!!u.auth_user_id;
      return `<tr data-user-id="${u.id}">
        <td>${umEsc(u.email)}</td>
        <td class="cen">${authLinked?'<span style="color:#16a34a;font-weight:900">✓ Auth Linked</span>':'<span style="color:#dc2626;font-weight:900">✕ Not Linked</span>'}</td>
        <td><select class="usr-role"><option value="user" ${u.role==='user'?'selected':''}>User</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select></td>
        <td><select class="usr-status"><option value="active" ${u.status==='active'?'selected':''}>Active</option><option value="disabled" ${u.status==='disabled'?'selected':''}>Disabled</option></select></td>
        ${slides.map(s=>`<td class="cen">${ck(s.key)}</td>`).join('')}
        ${fixedPerms.map(x=>`<td class="cen">${ck(x.key)}</td>`).join('')}
        <td><div style="display:flex;gap:5px;white-space:nowrap"><button class="pg-btn" onclick="saveSiteUser(${u.id},this)">Save</button><button class="pg-btn" style="border-color:#dc2626;color:#dc2626" onclick="removeSiteUser(${u.id},this)">Remove</button></div></td></tr>`;
    }).join(''):`<tr><td colspan="${totalCols}" class="cen">No users found.</td></tr>`;
    if(msg)msg.textContent=`${rows.length} user(s) loaded · ${slides.length} slide permission(s) detected automatically`;
  }catch(e){
    console.error(e);
    body.innerHTML=`<tr><td colspan="${totalCols}" class="cen" style="color:#ef4444">${umEsc(e.message)}</td></tr>`;
    if(msg)msg.textContent='Load failed';
  }
}
async function saveSiteUser(id,btn){
  const tr=btn.closest('tr'),msg=document.getElementById('user-module-msg'),permissions={};
  const selectedRole=tr.querySelector('.usr-role').value;
  getUserPermissionKeys().forEach(k=>permissions[k]=selectedRole==='admin' ? true : !!tr.querySelector(`[data-perm="${k}"]`)?.checked);
  btn.disabled=true;if(msg)msg.textContent='Saving...';
  try{
    const {data:{session}}=await SB.auth.getSession();
    if(!session?.access_token)throw Error('Admin session expired. Please sign in again.');
    const {data,error}=await SB.functions.invoke('admin-create-user',{
      headers:{Authorization:`Bearer ${session.access_token}`},
      body:{action:'update',site_user_id:id,role:selectedRole,status:tr.querySelector('.usr-status').value,permissions}
    });
    if(error)throw error;
    if(!data?.success)throw Error(data?.error||'User update failed.');
    if(msg)msg.textContent='✓ Saved to MySQL';await loadSiteUsers();
  }catch(e){console.error(e);if(msg)msg.textContent='Save failed: '+e.message}
  finally{btn.disabled=false}
}


async function removeSiteUser(id,btn){
  if(!requireSitePerm('user_admin','User Admin'))return;
  const msg=document.getElementById('user-module-msg');
  const row=btn.closest('tr');
  const email=String(row?.cells?.[0]?.textContent||'').trim();
  const currentEmail=String(SITE_AUTH_USER?.email||'').trim().toLowerCase();
  const targetEmail=email.toLowerCase();
  if(targetEmail===currentEmail){
    if(msg)msg.textContent='নিজের logged-in Admin account Remove করা যাবে না।';
    return;
  }
  if(!confirm(`Deactivate user?\n\n${email}\n\nএই account-এর login এবং dashboard access বন্ধ হবে।`))return;
  btn.disabled=true;if(msg)msg.textContent='Removing user...';
  try{
    const {data:{session}}=await SB.auth.getSession();
    if(!session?.access_token)throw Error('Admin session expired. Please sign in again.');
    const {data,error}=await SB.functions.invoke('admin-create-user',{
      headers:{Authorization:`Bearer ${session.access_token}`},
      body:{action:'delete',site_user_id:id,email:targetEmail}
    });
    if(error)throw error;
    if(!data?.success)throw Error(data?.error||'User remove failed.');
    if(msg)msg.textContent='✓ User deactivated — login and dashboard access revoked';
    await loadSiteUsers();
  }catch(e){
    console.error(e);
    let detail=e?.message||String(e);
    try{if(e?.context&&typeof e.context.json==='function'){const j=await e.context.json();if(j?.error)detail=j.error;}}catch(_){ }
    if(msg)msg.textContent='Remove failed: '+detail;
  }finally{btn.disabled=false}
}

/* === SECURE SITE LOGIN / site_users AUTHORIZATION === */
let SITE_AUTH_USER=null;
let SITE_USER_PROFILE=null;
let SITE_BOOTED=false;

function siteLoginMessage(msg,type=''){
  const el=document.getElementById('site-login-msg');
  if(!el)return;
  el.textContent=msg||'';
  el.className=type?type:'';
}
function showSiteLogin(msg=''){
  document.body.classList.add('site-locked');
  document.getElementById('site-login-gate')?.classList.remove('hidden');
  document.getElementById('site-user-pill').style.display='none';
  document.getElementById('site-signout-btn').style.display='none';
  if(msg)siteLoginMessage(msg,'err');
}
function unlockSite(user,profile){
  SITE_AUTH_USER=user; SITE_USER_PROFILE=profile;
  document.body.classList.remove('site-locked');
  document.getElementById('site-login-gate')?.classList.add('hidden');
  const pill=document.getElementById('site-user-pill');
  document.getElementById('site-user-email').textContent=user?.email||profile?.email||'User';
  document.getElementById('site-user-role').textContent='· '+String(profile?.role||'user').toUpperCase();
  pill.style.display='flex';
  document.getElementById('site-signout-btn').style.display='inline-block';
  applySitePermissions();
}
async function getAuthorizedSiteUser(user){
  if(!user)return null;
  let q=SB.from('site_users').select('id,auth_user_id,email,role,status,permissions').eq('auth_user_id',user.id).limit(1);
  let {data,error}=await q;
  if(error)throw error;
  let profile=data?.[0]||null;
  if(!profile && user.email){
    const r=await SB.from('site_users').select('id,auth_user_id,email,role,status,permissions').ilike('email',user.email).limit(1);
    if(r.error)throw r.error;
    profile=r.data?.[0]||null;
  }
  if(!profile)throw Error('This account is not registered in site_users.');
  if(String(profile.status||'').toLowerCase()!=='active')throw Error('This user is disabled. Contact Admin.');
  return profile;
}
async function authorizeSiteSession(){
  try{
    const {data:{session},error}=await SB.auth.getSession();
    if(error)throw error;
    if(!session?.user){showSiteLogin();return false}
    const profile=await getAuthorizedSiteUser(session.user);
    unlockSite(session.user,profile);
    return true;
  }catch(e){
    console.error('Authorization failed',e);
    try{await SB.auth.signOut()}catch(_){}
    showSiteLogin(e?.message||'Authorization failed.');
    return false;
  }
}

function siteRecoveryInUrl(){
  const q=new URLSearchParams(location.search);
  const h=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
  return q.has('code') || q.get('type')==='recovery' || h.get('type')==='recovery' || h.has('access_token');
}
function siteForgotPassword(){
  const email=document.getElementById('site-login-email')?.value?.trim()||'';
  document.getElementById('site-signin-panel')?.classList.add('reset-hidden');
  document.getElementById('site-reset-panel')?.classList.add('open');
  document.getElementById('site-reset-request').style.display='block';
  document.getElementById('site-reset-password-box').style.display='none';
  document.getElementById('site-reset-email').value=email;
  siteLoginMessage('Reset link পেতে আপনার email confirm করুন।');
  setTimeout(()=>document.getElementById('site-reset-email')?.focus(),30);
}
function siteBackToLogin(){
  document.getElementById('site-reset-panel')?.classList.remove('open');
  document.getElementById('site-signin-panel')?.classList.remove('reset-hidden');
  document.getElementById('site-reset-request').style.display='block';
  document.getElementById('site-reset-password-box').style.display='none';
  siteLoginMessage('Email এবং password দিয়ে sign in করুন।');
  setTimeout(()=>document.getElementById('site-login-email')?.focus(),30);
}
function siteShowNewPassword(){
  document.body.classList.add('site-locked');
  document.getElementById('site-login-gate')?.classList.remove('hidden');
  document.getElementById('site-signin-panel')?.classList.add('reset-hidden');
  document.getElementById('site-reset-panel')?.classList.add('open');
  document.getElementById('site-reset-request').style.display='none';
  document.getElementById('site-reset-password-box').style.display='block';
  siteLoginMessage('Recovery link verified. এখন নতুন password সেট করুন।','ok');
  setTimeout(()=>document.getElementById('site-new-password')?.focus(),30);
}
async function siteSendResetEmail(){
  const email=document.getElementById('site-reset-email')?.value?.trim()||'';
  const btn=document.getElementById('site-reset-send-btn');
  if(!email){siteLoginMessage('Email দিন।','err');return}
  btn.disabled=true; siteLoginMessage('Reset link পাঠানো হচ্ছে...');
  try{
    // Return to this exact dashboard URL; MySQL must allow this URL in Auth Redirect URLs.
    const redirectTo=location.origin+location.pathname;
    const {error}=await SB.auth.resetPasswordForEmail(email,{redirectTo});
    if(error)throw error;
    siteLoginMessage('Reset request জমা হয়েছে। আপনার Admin-এর কাছ থেকে secure reset link নিন।','ok');
  }catch(e){
    console.error(e);
    siteLoginMessage(e?.message||'Reset email পাঠানো যায়নি।','err');
  }finally{btn.disabled=false}
}
async function siteUpdatePassword(){
  const p1=document.getElementById('site-new-password')?.value||'';
  const p2=document.getElementById('site-confirm-password')?.value||'';
  const btn=document.getElementById('site-reset-update-btn');
  if(p1.length<12){siteLoginMessage('Password কমপক্ষে 12 characters হতে হবে।','err');return}
  if(p1!==p2){siteLoginMessage('Confirm password মিলছে না।','err');return}
  btn.disabled=true; siteLoginMessage('Password update হচ্ছে...');
  try{
    const {error}=await SB.auth.updateUser({password:p1});
    if(error)throw error;
    await SB.auth.signOut();
    // Remove recovery tokens/code from the address bar without reloading.
    history.replaceState({},document.title,location.pathname);
    document.getElementById('site-new-password').value='';
    document.getElementById('site-confirm-password').value='';
    siteBackToLogin();
    siteLoginMessage('Password updated successfully. নতুন password দিয়ে sign in করুন।','ok');
  }catch(e){
    console.error(e);
    siteLoginMessage(e?.message||'Password update failed. Reset link আবার request করুন।','err');
  }finally{btn.disabled=false}
}

// MySQL recovery event can arrive after the page has loaded.
SB.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY') siteShowNewPassword();
  if(event==='SESSION_EXPIRED'&&SITE_AUTH_USER)void siteLogout();
});

async function siteLogin(){
  const email=document.getElementById('site-login-email').value.trim();
  const password=document.getElementById('site-login-password').value;
  const btn=document.getElementById('site-login-btn');
  if(!email||!password){siteLoginMessage('Email এবং password দিন।','err');return}
  btn.disabled=true; siteLoginMessage('Signing in...');
  try{
    const {data,error}=await SB.auth.signInWithPassword({email,password});
    if(error)throw error;
    const profile=await getAuthorizedSiteUser(data.user);
    unlockSite(data.user,profile);
    document.getElementById('site-login-password').value='';
    siteLoginMessage('Login successful.','ok');
    if(!SITE_BOOTED){
      SITE_BOOTED=true;

      // Load centralized SQL settings first, then always verify/reload live MySQL reports.
      await bootLiveSupabaseData();

      applySitePermissions();
      restoreActiveTab();
      refreshPermittedSlides('all');
    }
  }catch(e){
    console.error(e);
    try{await SB.auth.signOut()}catch(_){}
    showSiteLogin(e?.message||'Login failed.');
  }finally{btn.disabled=false}
}
async function siteLogout(){
  closeS2LineDetails();S2_LINE_DETAILS=[];
  const cacheKey=dashboardCacheKey(),fastKey=fastBootCacheKey();
  ++SITE_SESSION_GENERATION;++SUPABASE_LOAD_TOKEN;++PLAN_FILTER_TOKEN;++EFF15_FR_TOKEN;
  SITE_AUTH_USER=null; // Prevent reset callbacks from starting new report reads during logout.
  invalidateSharedReports();
  invalidateTinySettings();
  invalidateDataCache();DATA_CACHE_VERSIONS.clear();EWO_SOURCE_SNAPSHOT_FENCES.clear();invalidateGanttIndex();
  cancelDashboardDebounces();
  DATA=[];DAILY_PLAN=[];SAH_DATA=[];SAH_DAILY=[];CLOCK_HOUR_DATA=[];CLOCK_HOUR_DAILY=[];BUYER_PLAN_DATA=[];MONTHS=[];
  FABRIC_CUTTING_DATA=[];SEWING_IO_DATA=[];DATE_WISE_PRODUCTION_DATA=[];S12_EM_ROWS=null;S12_EM_ERROR='';
  resetGanttHoverCache();
  PLAN_VERSION_CACHE.clear();PLAN_UPLOAD_CATALOG=[];ACTIVE_PLAN_UPLOAD=null;
  S4_STRENGTHS_CACHE=null;S4_STRENGTHS_ERROR='';
  EFF15_METRIC_DAILY=[];EFF15_METRIC_UPLOAD_ID=null;
  ORDER_BANK_RAW_ROWS=[];ORDER_BANK_FILTER_INDEX={};ORDER_BANK_FILTERED_INDEXES=[];
  resetOrderExecutionSlide();
  if(typeof resetSizeSetModule==='function')resetSizeSetModule();
  if(typeof resetAccessoriesModule==='function')resetAccessoriesModule();
  if(typeof resetEmbellishmentModule==='function')resetEmbellishmentModule();
  if(typeof resetEWOReadinessBoard==='function')resetEWOReadinessBoard();
  SITE_AUTH_USER=null;SITE_USER_PROFILE=null;SITE_BOOTED=false;
  if(typeof refreshLoadAnalysisPlan==='function')refreshLoadAnalysisPlan();
  try{sessionStorage.removeItem(fastKey);sessionStorage.removeItem('EKWL_FAST_BOOT_v1');}catch(e){console.warn(e)}
  document.getElementById('site-login-password').value='';
  showSiteLogin('Signed out. Please sign in again.');
  await clearDashboardCache(cacheKey);
  // Remove the old unscoped cache without ever restoring its contents.
  try{indexedDB.deleteDatabase('EKWL_Planning_Cache_v2');}catch(e){console.warn(e)}
  try{await SB.auth.signOut()}catch(e){console.error(e)}
}
document.addEventListener('DOMContentLoaded',initializeSlideUI);
window.addEventListener('hashchange',()=>{
  const linked=requestedSlideFromHash(location.hash);
  if(SITE_USER_PROFILE && linked!==null)goSlide(linked);
});

document.addEventListener('keydown',e=>{
  if(!document.body.classList.contains('site-locked'))return;
  if(e.key==='Enter' && (e.target?.id==='site-login-email'||e.target?.id==='site-login-password'))siteLogin();
});


/* ══ INTEGRATED SUPABASE CSV UPLOAD ════════════ */
function openUploadModal(){
  setTimeout(refreshUploadReportOptions,0);
  const canAny=siteHasPerm('planning_upload')||siteHasPerm('fabric')||siteHasPerm('sewing')||siteHasPerm('production')||siteHasPerm('embellishment_upload')||siteIsAdmin()||siteHasPerm('admin_settings');
  if(!canAny){alert('Upload / Data Control access আপনার জন্য অনুমোদিত নয়।');return}
  document.getElementById('upload-modal').classList.add('open');
  refreshSbAuth();
  setTimeout(()=>{
    const rules=[
      ['uploadNewPlan','planning_upload'],
      ['uploadFabricCutting','fabric'],
      ['uploadSewingIO','sewing'],
      ['uploadDateWiseProduction','production']
    ];
    rules.forEach(([fn,key])=>{
      const btn=document.querySelector(`#upload-modal button[onclick="${fn}()"]`);
      if(!btn)return;
      // Hide the relevant section content while preserving modal layout.
      const allowed=siteHasPerm(key);
      btn.disabled=!allowed;
      btn.style.display=allowed?'':'none';
      if(!allowed){
        const file=btn.parentElement?.querySelector('input[type=file]');
        if(file)file.style.display='none';
      }
    });
  },0);
}
function closeUploadModal(){document.getElementById('upload-modal').classList.remove('open')}
function sbMsg(id,msg,ok=null){const e=document.getElementById(id);e.textContent=msg;e.style.color=ok===true?'#3aaa63':ok===false?'#ff8a80':'var(--text2)'}
function csvNum(v){if(v===undefined||v===null||String(v).trim()==='')return null;const x=Number(String(v).replace(/,/g,''));return Number.isFinite(x)?x:null}
function csvDate(v,order='auto'){
  const raw=String(v??'').trim();if(!raw)return null;
  let y,m,d,match;
  if(!['auto','dmy','mdy','excel'].includes(order))return null;
  if(order==='excel'){
    if(!/^\d+(?:\.\d+)?$/.test(raw))return null;
    const serial=Math.floor(Number(raw));if(serial<1||serial>2958465||serial===60)return null;
    return new Date(Date.UTC(1899,11,31)+(serial-(serial>60?1:0))*86400000).toISOString().slice(0,10);
  }
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const monthNo=name=>months.findIndex(x=>x===name.toLowerCase()||x.slice(0,3)===name.toLowerCase())+1;
  if((match=/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/.exec(raw))){y=match[1];m=match[3];d=match[4];}
  else if((match=/^(\d{4})(\d{2})(\d{2})$/.exec(raw))){[,y,m,d]=match;}
  else if((match=/^(\d{4})-(\d{2})-(\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,6})?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/.exec(raw))){
    [,y,m,d]=match;
    if(match[7]&&/^[+-]14:/.test(match[7])&&!match[7].endsWith(':00'))return null;
  }
  else if((match=/^(\d{1,2})[-/ .]([A-Za-z]+)[-/ ,]+(\d{2}|\d{4})$/.exec(raw))){d=match[1];m=monthNo(match[2]);y=match[3];}
  else if((match=/^([A-Za-z]+)[-/ .](\d{1,2})[-/ ,]+(\d{2}|\d{4})$/.exec(raw))){m=monthNo(match[1]);d=match[2];y=match[3];}
  else if((match=/^(\d{1,2})([-/.])(\d{1,2})\2(\d{2}|\d{4})$/.exec(raw))){
    const a=Number(match[1]),b=Number(match[3]);y=match[4];
    if(order==='dmy'||order==='auto'&&a>12){d=a;m=b;}
    else if(order==='mdy'||order==='auto'&&b>12){m=a;d=b;}
    else if(a===b){m=a;d=b;}
    else return null;
  }
  else return null;
  if(String(y).length===2)y='20'+y;
  if(Number(y)<1||Number(y)>9999)return null;
  const iso=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  return validDate(iso)?iso:null;
}
function csvChunks(a,size){const r=[];for(let i=0;i<a.length;i+=size)r.push(a.slice(i,i+size));return r}
function rawDateHeader(h){return (/[-/. ]/.test(String(h))||/^\d{8}$/.test(String(h)))&&rawHeaderDate(h)!==null}
function rawHeaderDate(h){return csvDate(h,/^\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})$/.test(String(h).trim())?'mdy':'auto')}
function planningCsvDate(v){return csvDate(v,/^\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})$/.test(String(v??'').trim())?'mdy':'auto')}
async function refreshSbAuth(){
 const {data:{user}}=await SB.auth.getUser();
 sbMsg('sb-auth-msg',user?'Signed in: '+user.email:'Not signed in',!!user);
 document.getElementById('login-fields').style.display=user?'none':'block';
 document.getElementById('sb-login-btn').style.display=user?'none':'inline-block';
 document.getElementById('sb-logout-btn').style.display=user?'inline-block':'none';
 return user;
}
async function sbLogin(){
 const email=document.getElementById('sb-email').value.trim(),password=document.getElementById('sb-password').value;
 if(!email||!password){sbMsg('sb-auth-msg','Email এবং password দিন।',false);return}
 const {error}=await SB.auth.signInWithPassword({email,password});
 if(error){sbMsg('sb-auth-msg',error.message,false);return}
 document.getElementById('sb-password').value='';await refreshSbAuth();
}
async function sbLogout(){await SB.auth.signOut();await refreshSbAuth()}
async function parseRawPlanFile(file){
 const text=await file.text(), records=parseRecords(text);
 if(records.length<2)throw Error('CSV is empty.');
 const fields=records.shift();
 const seen=new Set();
 fields.forEach(h=>{if(seen.has(h))throw Error('Duplicate CSV header: '+h);seen.add(h)});
 fields.forEach(h=>{
   if(/^(?:\d{4}[-/.]\d|\d{1,2}[-/. ](?:\d|[A-Za-z])|[A-Za-z]+[-/. ]\d{1,2}[-/, ])/.test(h)&&rawHeaderDate(h)===null)throw Error('Invalid or ambiguous daily date header: '+h);
 });
 const dateFields=fields.filter(rawDateHeader);
 if(!dateFields.length)throw Error('No valid daily date columns were found. Use YYYY-MM-DD or DD-MMM-YYYY.');
 if(new Set(dateFields.map(rawHeaderDate)).size!==dateFields.length)throw Error('Duplicate daily dates use different header formats.');
 const rows=records.map((cols,i)=>{
   if(cols.length!==fields.length)throw Error('Record '+(i+2)+': column count does not match header.');
   return Object.fromEntries(fields.map((h,j)=>[h,cols[j]??'']));
 });
 rows.forEach((r,i)=>{
   for(const column of ['PCD','PSD','PFD','Delivery']){
     if(String(r[column]??'').trim()&&!planningCsvDate(r[column]))throw Error('Record '+(i+2)+': invalid or ambiguous '+column+' date. Use MM/DD/YY, MM/DD/YYYY, YYYY-MM-DD or DD-MMM-YYYY.');
   }
 });
 return {rows,dateFields};
}
async function uploadNewPlan(){
 if(!requireSitePerm('planning_upload','Planning Upload'))return;
 let uploadId=null;
 try{
  const user=await refreshSbAuth();if(!user)throw Error('Please sign in first.');
  const file=document.getElementById('sb-csv-file').files[0];if(!file)throw Error('Choose Plan Data CSV first.');
  const planningMonth=getPlanningMonthValue();
  let planningId=String(document.getElementById('sb-planning-id')?.value||'').trim();
  if(!planningMonth)throw Error('Planning Month select করুন.');
  const prog=document.getElementById('sb-progress');prog.value=3;sbMsg('sb-upload-msg','CSV reading & validation...');
  const {rows,dateFields}=await parseRawPlanFile(file);
  const {data:lastSeq,error:seqErr}=await SB.from('plan_uploads').select('sequence_no')
    .eq('planning_month',planningMonth+'-01').order('sequence_no',{ascending:false}).limit(1);
  if(seqErr)throw seqErr;
  const sequenceNo=(lastSeq?.[0]?.sequence_no||0)+1;
  if(!planningId)planningId='P'+String(sequenceNo).padStart(2,'0');

  const {data:up,error:ue}=await SB.from('plan_uploads').insert({
    file_name:file.name,row_count:rows.length,expected_daily_rows:rows.length*dateFields.length,status:'processing',
    planning_month:planningMonth+'-01',sequence_no:sequenceNo,planning_id:planningId
  }).select('id').single();
  if(ue)throw ue; uploadId=up.id; prog.value=8;

  const safeName=`${uploadId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const backup=await SB.storage.from('plan-data').upload(safeName,file,{contentType:'text/csv',upsert:false});
  if(backup.error)console.warn('CSV backup:',backup.error.message);

  const records=rows.map((r,i)=>({
   upload_id:uploadId,source_row:i+2,is_summary_row:!r['Buyer']||!r['Line #'],
   unit:r['Unit']||null,line_no:r['Line #']||null,buyer:r['Buyer']||null,
   product_type:r['Product Type']||null,product:r['Product']||null,ewo:String(r['EWO']??'').trim()||null,
   stroke:r['Stroke']||null,po:r['P.O.']||null,col:r['Col']||null,print:r['Print']||null,
   emb:r['Emb']||null,outsource:r['Outsource']||null,order_qty:csvNum(r['Order qty']),
   planned_qty:csvNum(r['Planned qty']),pcd:planningCsvDate(r['PCD']),psd:planningCsvDate(r['PSD']),pfd:planningCsvDate(r['PFD']),
   strip_plan_qty:csvNum(r['Strip Plan Qty']),delivery:planningCsvDate(r['Delivery']),manpower:csvNum(r['Manpower']),
   smv:csvNum(r['SMV']),average:csvNum(r['Average']),criteria:r['Criteria']||null,total:csvNum(r['Total'])
  }));
  const rowIdMap=new Map();let done=0;
  for(const batch of csvChunks(records,300)){
    const {data,error}=await SB.from('plan_records').insert(batch).select('id,source_row');if(error)throw error;
    data.forEach(x=>rowIdMap.set(x.source_row,x.id));done+=batch.length;
    prog.value=8+Math.round(37*done/records.length);sbMsg('sb-upload-msg',`Main rows: ${done}/${records.length}`);
  }
  const daily=[];
  rows.forEach((r,i)=>{const recordId=rowIdMap.get(i+2);dateFields.forEach(h=>daily.push({record_id:recordId,upload_id:uploadId,plan_date:rawHeaderDate(h),value:csvNum(r[h])||0}))});
  done=0;
  for(const batch of csvChunks(daily,800)){
    const {error}=await SB.from('plan_daily').insert(batch);if(error)throw error;done+=batch.length;
    prog.value=45+Math.round(50*done/daily.length);sbMsg('sb-upload-msg',`Daily values: ${done}/${daily.length}`);
  }
  const {error:fe}=await SB.from('plan_uploads').update({status:'complete'}).eq('id',uploadId);if(fe)throw fe;
  prog.value=100;sbMsg('sb-upload-msg','Upload complete. Dashboard refreshing...',true);
  await refreshDashboardAfterSuccessfulUpload('plan',{planUploadId:uploadId});
  setTimeout(closeUploadModal,900);
 }catch(error){
  console.error(error);sbMsg('sb-upload-msg',error?.message||String(error),false);
  if(uploadId)console.warn('Incomplete upload remains with processing status:',uploadId);
 }
}


async function refreshDashboardAfterSuccessfulUpload(source,options={}){
  setSupabaseLiveBadge('','MySQL · refreshing after upload…');
  const session=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id;
  const current=()=>session===SITE_SESSION_GENERATION&&userId===SITE_AUTH_USER?.id;
  const dep=invalidateUploadDependencies(source);
  if(dep.planning){
    await clearDashboardCache();if(!current())return;
    if(!await loadFromSupabase(options.planUploadId||null,true))throw Error('Dashboard refresh failed after upload');
  }
  if(!current())return;
  if(source==='orderbank'){
    ORDER_BANK_RAW_ROWS=[];ORDER_BANK_FILTER_INDEX={};ORDER_BANK_FILTERED_INDEXES=[];ORDER_BANK_FILTERS={};ORDER_BANK_EWO_SEARCH='';ORDER_BANK_PAGE=1;
    if(CURRENT_SLIDE===14)await loadOrderBankSlide();
    if(CURRENT_SLIDE===16)await loadOrderExecutionSlide();
  }
  if(source==='floor'&&typeof loadFloorAllocationAdmin==='function')await loadFloorAllocationAdmin();
  if(!current())return;
  if(dep.reports){
    // Revalidate only report dependencies of the currently visible feature.
    if(canAccessSlide(CURRENT_SLIDE))await ensureSharedReports(sharedReportsForSlide(CURRENT_SLIDE));
    saveFastBootCache();await saveDashboardCache();
  }
  if(!current())return;
  if(CURRENT_SLIDE===21&&canAccessSlide(21)){
    if(dep.readiness)await loadEWOReadinessBoard(dep.coverage===true);
    else if(dep.coverage)await loadReadyInputCoverage();
  }else if((dep.reports||source==='embellishment')&&[7,11].includes(CURRENT_SLIDE)&&canAccessSlide(CURRENT_SLIDE))renderSlide(CURRENT_SLIDE);
  setSupabaseLiveBadge('ok','MySQL Live ✓ · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
}

/* ══ FABRICS & CUTTING CSV UPLOAD ═══════════════ */
function openFabricUpload(){
  openUploadModal();
  setTimeout(()=>{
    const f=document.getElementById('fc-csv-file');
    if(f)f.scrollIntoView({behavior:'smooth',block:'center'});
  },120);
}
function fcNormHeader(s){
  return String(s||'').replace(/^\uFEFF/,'').trim().toLowerCase()
    .replace(/[\r\n]+/g,' ').replace(/\s+/g,' ');
}
function fcPick(row, aliases){
  const keys=Object.keys(row), map={};
  keys.forEach(k=>map[fcNormHeader(k)]=k);
  for(const a of aliases){
    const k=map[fcNormHeader(a)];
    if(k!==undefined)return row[k];
  }
  return '';
}
function fcText(v){
  const s=String(v??'').trim();
  return s===''?null:s;
}
function fcDate(v){
  const s=String(v??'').trim();
  if(!s)return null;
  const pad=n=>String(n).padStart(2,'0');
  const valid=(y,m,d)=>{
    y=Number(y);m=Number(m);d=Number(d);
    if(y<1900||y>2100||m<1||m>12||d<1||d>31)return null;
    const dt=new Date(Date.UTC(y,m-1,d));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d
      ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T].*)?$/);
  if(m)return valid(m[1],m[2],m[3]);
  m=s.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2,4})$/);
  if(m){
    const mons={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    let y=Number(m[3]);if(y<100)y+=2000;
    return valid(y,mons[m[2].toLowerCase()],m[1]);
  }
  m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if(m){let y=Number(m[3]);if(y<100)y+=2000;return valid(y,m[2],m[1]);}
  // Excel date serial. Restrict the range so malformed values can never become huge JS dates.
  if(/^\d+(?:\.\d+)?$/.test(s)){
    const serial=Number(s);
    if(serial>=1&&serial<=73050){
      const dt=new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000);
      return valid(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());
    }
  }
  return null;
}
function fcTime(v){
  const s=String(v??'').trim();
  if(!s)return null;
  let m=s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if(m){
    let h=Number(m[1]),mi=Number(m[2]),sec=Number(m[3]||0);
    const ap=(m[4]||'').toUpperCase();
    if(ap){if(h<1||h>12)return null;if(ap==='PM'&&h<12)h+=12;if(ap==='AM'&&h===12)h=0;}
    if(h>23||mi>59||sec>59)return null;
    return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }
  // Excel time fraction, e.g. 0.4375.
  if(/^0?\.\d+$/.test(s)){
    const f=Number(s);if(f>=0&&f<1){const total=Math.round(f*86400)%86400;return `${String(Math.floor(total/3600)).padStart(2,'0')}:${String(Math.floor(total%3600/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;}
  }
  return null;
}
async function parseFabricCuttingFile(file){
  const text=await file.text(), records=parseRecords(text);
  if(records.length<2)throw Error('Fabrics & Cutting CSV is empty.');
  const fields=records.shift().map(x=>String(x??'').replace(/^\uFEFF/,'').trim());
  const rows=records.map((cols,i)=>{
    if(cols.length>fields.length)throw Error('Record '+(i+2)+': column count does not match header.');
    return Object.fromEntries(fields.map((f,j)=>[f,cols[j]??'']));
  });
  const hasEwo=fields.some(x=>fcNormHeader(x)==='ewo');
  const hasColor=fields.some(x=>['color name','color_name'].includes(fcNormHeader(x)));
  if(!hasEwo||!hasColor)throw Error('Required columns EWO and Color Name were not found.');
  return rows;
}
async function saveReportAtomically(kind,rows,replace=true){
  const {data,error}=await SB.rpc('ekwl_save_report',{p_kind:kind,p_rows:rows,p_replace:replace});
  if(error)throw error;
  if(!data?.success||Number(data.inserted_rows)!==rows.length)throw Error('Upload row-count verification failed');
  return data;
}

async function uploadFabricCutting(){
 if(!requireSitePerm('fabric','Fabrics & Cutting'))return;
  try{
    const user=await refreshSbAuth();
    if(!user)throw Error('Please sign in first.');
    const file=document.getElementById('fc-csv-file').files[0];
    if(!file)throw Error('Choose Fabrics & Cutting CSV first.');
    const prog=document.getElementById('fc-progress'); prog.value=3;
    sbMsg('fc-upload-msg','CSV reading & cleaning...');
    const rows=await parseFabricCuttingFile(file);

    const payload=rows.map((r,i)=>({
      buyer:fcText(fcPick(r,['Buyer'])),
      ewo:fcText(fcPick(r,['EWO','Ewo'])),
      color_name:fcText(fcPick(r,['Color name','Color Name','Color'])),
      item_product_type:fcText(fcPick(r,['Item/Product Type','Item / Product Type','Product Type'])),
      style_embellishment_type:fcText(fcPick(r,['Style /Embellishment Type','Style / Embellishment Type','Style/Embellishment Type'])),
      pattern_update:fcText(fcPick(r,['Pattern update','Pattern Update'])),
      pattern_received_date:fcDate(fcPick(r,['Pattern rerceived Date','Pattern received Date','Pattern Received Date'])),
      pattern_received_time:fcTime(fcPick(r,['Pattern rerceived Time','Pattern received Time','Pattern Received Time'])),
      color_order_qty:csvNum(fcPick(r,['Color wise order qty (pcs)','Color wise order qty','Color Order Qty'])),
      fabric_booking_qty:csvNum(fcPick(r,['Fabric booking qty (kg)','Fabric Booking Qty'])),
      replace_ask_qty:csvNum(fcPick(r,['Replace Ask qty(kg).','Replace Ask qty (kg)','Replace Ask Qty'])),
      replacement_settlement_qty:csvNum(fcPick(r,['Rep.Setl.Qty','Rep. Setl. Qty','Replacement Settlement Qty'])),
      replacement_receive_commitment_date:fcDate(fcPick(r,['Rep. RCV Comitment date','Rep. RCV Commitment date','Replacement Receive Commitment Date'])),
      fabrication:fcText(fcPick(r,['Fabrication'])),
      gsm:csvNum(fcPick(r,['GSM'])),
      width:fcText(fcPick(r,['width','Width'])),
      day_received:csvNum(fcPick(r,['Day Recvd','Day Received'])),
      total_fabric_received:csvNum(fcPick(r,['Total Fabric Recvd (kg)','Total Fabric Received (kg)','Total Fabric Recvd'])),
      fabric_balance:csvNum(fcPick(r,['Fabric Balance (kg)','Fabric Balance'])),
      bc_consumption:csvNum(fcPick(r,['B.C (kg/Mtr/yds.Pcs)','B.C','BC Consumption'])),
      fabric_stock_after_cut:csvNum(fcPick(r,['Fabric stock after cut(kg)','Fabric stock after cut (kg)','Fabric Stock After Cut'])),
      cutable_qty:csvNum(fcPick(r,['Cutable qty','Cutable Qty'])),
      day_cut:csvNum(fcPick(r,['Day Cut'])),
      total_cut_qty:csvNum(fcPick(r,['Total Cut Qty (pcs)','Total Cut Qty'])),
      cutting_balance:csvNum(fcPick(r,['Cutting bal','Cutting Balance'])),
      cutting_percent:csvNum(fcPick(r,['Cutting %','Cutting%','Cutting Percent'])),
      status:fcText(fcPick(r,['Status'])),
      cutting_difficulties:fcText(fcPick(r,['Cutting difficulties','Cutting Difficulties'])),
      source_row:i+2
    })).filter(r=>r.ewo||r.buyer||r.color_name||r.item_product_type);

    if(!payload.length)throw Error('No usable Fabrics & Cutting rows found.');
    prog.value=12;

    sbMsg('fc-upload-msg','Saving complete Fabrics & Cutting report...');
    await saveReportAtomically('fabric',payload,document.getElementById('fc-replace').checked);
    prog.value=100;
    await refreshDashboardAfterSuccessfulUpload('fabric');
    sbMsg('fc-upload-msg',`Upload complete — ${payload.length.toLocaleString()} rows imported. Local dashboard cache updated; no reload required.`,true);
  }catch(error){
    console.error(error);
    sbMsg('fc-upload-msg',error?.message||String(error),false);
  }
}


/* ══ SEWING INPUT & OUTPUT CSV UPLOAD ═══════════ */
function sioLineNo(v){
  const s=String(v??'').trim();
  if(!s)return null;
  const m=s.match(/(\d+)\s*$/);
  return m?Number(m[1]):null;
}
function sioEwo(v){
  let s=String(v??'').trim();
  if(!s)return null;
  if(/^\d+\.0+$/.test(s))s=s.replace(/\.0+$/,'');
  return s||null;
}
async function parseSewingIOFile(file){
  const text=await file.text(), records=parseRecords(text);
  if(records.length<2)throw Error('Sewing Input & Output CSV is empty.');
  const fields=records.shift().map(x=>String(x??'').replace(/^\uFEFF/,'').trim());
  const rows=records.map((cols,i)=>{
    if(cols.length>fields.length)throw Error('Record '+(i+2)+': column count does not match header.');
    return Object.fromEntries(fields.map((f,j)=>[f,cols[j]??'']));
  });
  const norm=fields.map(fcNormHeader);
  const required=['buyer','ewo no','po no','color','line','order qty','total input qty','total output qty','total reject qty','total wip qty'];
  const missing=required.filter(x=>!norm.includes(x));
  if(missing.length)throw Error('Required column(s) not found: '+missing.join(', '));
  return rows;
}
async function uploadSewingIO(){
 if(!requireSitePerm('sewing','Sewing I/O'))return;
  try{
    const user=await refreshSbAuth();
    if(!user)throw Error('Please sign in first.');
    const el=document.getElementById('sio-csv-file');
    const file=el&&el.files&&el.files[0];
    if(!file)throw Error('Choose Sewing Input & Output CSV first.');
    const prog=document.getElementById('sio-progress'); prog.value=3;
    sbMsg('sio-upload-msg','CSV reading & cleaning...');

    const rows=await parseSewingIOFile(file);
    const payload=rows.map((r,i)=>{
      const line=fcText(fcPick(r,['Line']));
      return {
        buyer:fcText(fcPick(r,['Buyer'])),
        ewo:sioEwo(fcPick(r,['EWO No','EWO','Ewo No'])),
        po_no:fcText(fcPick(r,['PO No','PO','PO Number'])),
        color:fcText(fcPick(r,['Color','Color Name'])),
        line:line,
        line_no:sioLineNo(line),
        order_qty:csvNum(fcPick(r,['Order Qty','Order QTY'])),
        total_input_qty:csvNum(fcPick(r,['Total Input Qty','TotalInput Qty','Total Input QTY'])),
        total_output_qty:csvNum(fcPick(r,['Total Output Qty','TotalOutput Qty','Total Output QTY'])),
        total_reject_qty:csvNum(fcPick(r,['Total Reject Qty','TotalReject Qty','Total Reject QTY'])),
        total_wip_qty:csvNum(fcPick(r,['Total WIP Qty','TotalWIP Qty','Total WIP QTY'])),
        source_row:i+2
      };
    }).filter(r=>r.ewo||r.buyer||r.line||r.po_no||r.color);

    if(!payload.length)throw Error('No usable Sewing Input & Output rows found.');
    prog.value=12;

    sbMsg('sio-upload-msg','Saving complete Sewing I/O report...');
    await saveReportAtomically('sewing',payload,document.getElementById('sio-replace').checked);
    prog.value=100;
    await refreshDashboardAfterSuccessfulUpload('sewing');
    sbMsg('sio-upload-msg',`Upload complete — ${payload.length.toLocaleString()} rows imported. Local dashboard cache updated; no reload required.`,true);
  }catch(error){
    console.error(error);
    sbMsg('sio-upload-msg',error?.message||String(error),false);
  }
}

/* ══ KEYBOARD NAV ═══════════════════════════════ */

// ===== Date Wise Production Report: replace uploaded date(s) only =====
function dwpEwo(v){let z=String(v??'').trim();if(/^\d+\.0+$/.test(z))z=z.replace(/\.0+$/,'');return z;}
function dwpDate(v){
  const z=String(v??'').trim(); if(!z)return '';
  const yy=y=>{y=Number(y);return y<100?(y>=70?1900+y:2000+y):y;};
  const valid=(y,m,d)=>{y=yy(y);m=Number(m);d=Number(d);if(y<1900||y>2100||m<1||m>12||d<1||d>31)return '';const dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';};
  const mons={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
  let m=z.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2}|\d{4})$/); if(m)return valid(m[3],mons[m[2].toUpperCase()],m[1]);
  m=z.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/); if(m)return valid(m[1],m[2],m[3]);
  m=z.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2}|\d{4})$/);
  if(m){const a=Number(m[1]),b=Number(m[2]),y=m[3];if(a>12&&b<=12)return valid(y,b,a);if(b>12&&a<=12)return valid(y,a,b);return valid(y,b,a);}
  if(/^\d{5}(?:\.0+)?$/.test(z)){const serial=Math.floor(Number(z));const dt=new Date(Date.UTC(1899,11,30)+serial*86400000);return valid(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());}
  return '';
}
function dwpDisplayDate(v){
  const s=String(v||'').slice(0,10);
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return s||'—';
  const mon=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m[2])-1]||m[2];
  return `${m[3]}-${mon}-${String(m[1]).slice(-2)}`;
}
function dwpLineNo(v){const m=String(v??'').trim().match(/(\d+)\s*$/);return m?Number(m[1]):0;}
async function parseDateWiseProductionFile(file){
  const rows=parseRecords(await file.text()); if(!rows||rows.length<2)throw new Error('CSV-তে data পাওয়া যায়নি।');
  const hdr=rows[0].map(fcNormHeader);
  const col=(...ns)=>{for(const n of ns){const i=hdr.indexOf(fcNormHeader(n));if(i>=0)return i;}return -1;};
  const ix={code:col('Code'),buyer:col('Buyer'),ewo:col('EWO No','EWO'),po:col('PO No','PO'),color:col('Color'),line:col('Line'),date:col('Output Date'),qty:col('Total Qty')};
  if(ix.date<0||ix.qty<0||ix.ewo<0||ix.line<0)throw new Error('Required columns: EWO No, Line, Output Date, Total Qty');
  const data=[];
  for(let r=1;r<rows.length;r++){const a=rows[r], output_date=dwpDate(a[ix.date]), ewo=dwpEwo(a[ix.ewo]), line=String(a[ix.line]??'').trim(), total_qty=csvNum(a[ix.qty]);
    if(!output_date||(!ewo&&!line&&!total_qty))continue;
    data.push({code:ix.code>=0?String(a[ix.code]??'').trim():'',buyer:ix.buyer>=0?String(a[ix.buyer]??'').trim():'',ewo,po_no:ix.po>=0?String(a[ix.po]??'').trim():'',color:ix.color>=0?String(a[ix.color]??'').trim():'',line,line_no:dwpLineNo(line),output_date,total_qty,source_row:r+1});
  }
  if(!data.length)throw new Error('Valid production row পাওয়া যায়নি।'); return data;
}
async function uploadDateWiseProduction(){
 if(!requireSitePerm('production','Date Wise Production'))return;
  const file=document.getElementById('dwp-csv-file')?.files?.[0],msg=document.getElementById('dwp-upload-msg'),prog=document.getElementById('dwp-progress');
  if(!file){msg.textContent='প্রথমে Date Wise Production CSV select করুন।';return;}
  try{
    msg.textContent='CSV reading...';prog.value=5;await refreshSbAuth();
    const rows=await parseDateWiseProductionFile(file),dates=[...new Set(rows.map(x=>x.output_date))].sort();
    msg.textContent=`${rows.length.toLocaleString()} rows | ${dates.join(', ')} — uploaded date(s) replacing...`;prog.value=15;
    prog.value=35;
    await saveReportAtomically('production',rows,true);
    prog.value=100;
    prog.value=100;
    msg.textContent=`✓ Upload complete: ${rows.length.toLocaleString()} rows | Date: ${dates.join(', ')}. Local cache update হচ্ছে...`;
    await refreshDashboardAfterSuccessfulUpload('production');
    msg.textContent=`✓ Upload complete: ${rows.length.toLocaleString()} rows | Actual Production Report: ${dwpDisplayDate(dates[0])} → ${dwpDisplayDate(dates[dates.length-1])}. Live MySQL data updated; local cache refreshed.`;
  }catch(e){console.error(e);msg.textContent='Upload failed: '+(e?.message||e);prog.value=0;}
}

document.addEventListener('keydown',e=>{
  if(e.target&&/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if(e.key==='ArrowRight')goSlide(adjacentDashboardSlide(1));
  if(e.key==='ArrowLeft')goSlide(adjacentDashboardSlide(-1));
});

/* ══ RESIZE CHARTS ══════════════════════════════ */
window.addEventListener('resize',()=>{if(DATA.length&&CURRENT_SLIDE===8)renderS7(getFiltered())});

/* Centralized runtime settings: source of truth is MySQL, never localStorage. */
let LIVE_ABP_TARGET_EFF=55;
function parsePercentNumber(v,fallback=55){
  const n=Number(String(v??'').replace(/[^0-9.+-]/g,''));
  return Number.isFinite(n)?Math.min(100,Math.max(0,n)):fallback;
}
async function loadABPTargetEfficiencyLive(sharedRead=null){
  const {data,error}=await (sharedRead||fetchABPTargetFromSQL());
  if(error)throw error;

  const metrics=Array.isArray(data?.config?.metrics)?data.config.metrics:[];
  const effRow=metrics.find(r=>Array.isArray(r) && String(r[0]||'').trim().toLowerCase()==='efficiency');
  if(effRow) LIVE_ABP_TARGET_EFF=parsePercentNumber(effRow[1],LIVE_ABP_TARGET_EFF);

  return LIVE_ABP_TARGET_EFF;
}

async function loadDashboardMasterSettingsFromSQL(){
  const {data,error}=await SB.from('dashboard_master_settings')
    .select('setting_key,setting_value');
  if(error)throw error;
  const m=new Map((data||[]).map(r=>[String(r.setting_key),String(r.setting_value??'')]));
  const factory=document.getElementById('cfg-name');
  const eff=document.getElementById('cfg-eff');
  if(factory && m.has('factory_name')) factory.value=m.get('factory_name');
  if(eff && m.has('buyer_efficiency_target')) eff.value=m.get('buyer_efficiency_target');
  return true;
}

async function saveDashboardMasterSetting(key,value){
  const {error}=await SB.from('dashboard_master_settings').upsert({
    setting_key:key,setting_value:String(value),updated_at:new Date().toISOString()
  },{onConflict:'setting_key'});
  if(error)throw error;
}

window.addEventListener('DOMContentLoaded',()=>{document.getElementById('site-login-btn').disabled=false;});

window.addEventListener('DOMContentLoaded',async()=>{
  document.body.classList.add('site-locked');
  document.getElementById('site-login-gate')?.classList.remove('hidden');
  SITE_AUTH_USER=null;
  SITE_USER_PROFILE=null;
  SITE_BOOTED=false;

  if(siteRecoveryInUrl()){
    showSiteLogin();
    siteLoginMessage('Recovery link verify হচ্ছে...');
    try{
      await new Promise(r=>setTimeout(r,350));
      const {data:{session}}=await SB.auth.getSession();
      if(session?.user) siteShowNewPassword();
      else siteLoginMessage('Recovery session পাওয়া যায়নি। Reset link আবার request করুন।','err');
    }catch(e){
      console.error('Recovery startup:',e);
      siteLoginMessage(e?.message||'Recovery link verify করা যায়নি।','err');
    }
    return;
  }

  // Persistent login: browser refresh/reopen keeps the valid MySQL session.
  try{
    const {data:{session},error}=await SB.auth.getSession();
    if(error)throw error;
    if(session?.user){
      const profile=await getAuthorizedSiteUser(session.user);
      unlockSite(session.user,profile);
      SITE_BOOTED=true;

      // Cache may paint instantly, but MySQL is always checked and reloaded.
      await bootLiveSupabaseData();
      applySitePermissions();
      restoreActiveTab();
      return;
    }
  }catch(e){
    console.error('Persistent session restore failed',e);
  }

  showSiteLogin();
  siteLoginMessage('Email এবং password দিয়ে sign in করুন।');
  setTimeout(()=>document.getElementById('site-login-email')?.focus(),50);
});


document.addEventListener('change' ,e=>{
  if(e.target?.id==='sb-planning-month')updateNextPlanningSequence();
});

let planningPickerYear=new Date().getFullYear();
function openPlanningMonthPicker(){
  const p=document.getElementById('planning-month-picker');
  const inp=document.getElementById('sb-planning-month');
  if(!p||!inp)return;
  const m=String(inp.dataset.value||'').match(/^(\d{4})-(\d{2})$/);
  planningPickerYear=m?Number(m[1]):new Date().getFullYear();
  renderPlanningMonthPicker();
  p.style.display=p.style.display==='block'?'none':'block';
}
function changePlanningPickerYear(n){planningPickerYear+=n;renderPlanningMonthPicker();}
function renderPlanningMonthPicker(){
  const y=document.getElementById('planning-picker-year'),box=document.getElementById('planning-picker-months');
  if(!y||!box)return;y.textContent=planningPickerYear;
  const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  box.innerHTML=names.map((n,i)=>`<button type="button" class="top-btn" style="padding:7px 4px" onclick="selectPlanningMonth(${i+1})">${n}</button>`).join('');
}
function selectPlanningMonth(month){
  const inp=document.getElementById('sb-planning-month');
  const value=planningPickerYear+'-'+String(month).padStart(2,'0');
  inp.dataset.value=value;
  inp.value=new Date(planningPickerYear,month-1,1).toLocaleString('en-US',{month:'long',year:'numeric'});
  document.getElementById('planning-month-picker').style.display='none';
  updateNextPlanningSequence();
}
function getPlanningMonthValue(){
  const inp=document.getElementById('sb-planning-month');
  return inp?.dataset?.value||'';
}

document.addEventListener('input',e=>{
  if(e.target?.id==='sb-planning-id')e.target.dataset.auto='0';
});

document.addEventListener('input',e=>{
  if(e.target?.id==='planning-sequence-filter'){
    const u=PLAN_UPLOAD_CATALOG.find(x=>String(x.id)===String(e.target.value));
    if(u){
      const old=ACTIVE_PLAN_UPLOAD;ACTIVE_PLAN_UPLOAD=u;
      const sm=document.getElementById('status-msg');
      if(sm)sm.textContent='Switching → '+activePlanningLabel();
      ACTIVE_PLAN_UPLOAD=old;
    }
  }
});

const ORDER_BANK_HEADERS=["Code-EWO","Code","Buyer","Dept","EWO","PO","GmtColor","EWO&Color","Stroke","Description","Destination","TechPackDate","FOB","RevisedFOB","EFD","FRDate","CostingSMV","UpdatedSMV","TotalHour","FRHour","OrderQty","OrderRate","Ordervalue","Season","ContractNo","ContractUnit","ExecutionUnit","Gender","ConsumptionQtyInHouse","ConsumptionQtyOutSource","FabrickgInHouse","FabrickgOutSource","TotalFabricinKG","Ordertype","OrderStatus","TNADays","MMTeam","CancelReason","Remarks","Month"];

let ORDER_BANK_UPLOADING=false;
function parseOrderBankCSV(text){
  const records=parseRecords(text,true,true);
  if(!records.length)throw Error('CSV is empty');
  const headers=records.shift().map(x=>String(x??'').trim().replace(/^\uFEFF/,''));
  if(headers.some(x=>!x))throw Error('Every column needs a name in the first row.');
  if(new Set(headers.map(x=>x.toLowerCase())).size!==headers.length)throw Error('Duplicate column names are not allowed.');
  if(!records.length||!records.some(r=>r.some(v=>v.trim()!=='')))throw Error('CSV has no nonblank data rows.');
  const rows=records.map((cols,i)=>{
    if(cols.length!==headers.length)throw Error(`Record ${i+2}: expected ${headers.length} columns; found ${cols.length}.`);
    return Object.fromEntries(headers.map((k,j)=>[k,cols[j]]));
  });
  return {headers,rows};
}
async function uploadOrderBank(){
 const f=document.getElementById('ob-file')?.files?.[0],msg=document.getElementById('ob-msg'),audit=document.getElementById('ob-audit');
 const btn=document.getElementById('ob-upload-btn'),progress=document.getElementById('ob-progress');
 if(ORDER_BANK_UPLOADING)return;
 if(!f){msg.textContent='Please select Order Bank.csv';return;}
 if(!siteIsAdmin()){msg.textContent='Active admin required to upload Order Bank.';return;}
 const sessionGeneration=SITE_SESSION_GENERATION;
 let token=null,activated=false;
 const checkSession=()=>{if(sessionGeneration!==SITE_SESSION_GENERATION)throw Error('Your session changed. Sign in and upload again.');};
 ORDER_BANK_UPLOADING=true;if(btn)btn.disabled=true;if(progress)progress.value=0;
 try{
  msg.textContent='Reading and validating CSV…';audit.innerHTML='';
  const {headers,rows}=parseOrderBankCSV(await f.text());checkSession();
  token=crypto.randomUUID();
  msg.textContent=`Validated ${rows.length.toLocaleString()} rows · ${headers.length} columns`;
  for(let i=0;i<rows.length;i+=500){
    checkSession();
    const chunk=rows.slice(i,i+500).map((source_data,j)=>({upload_token:token,source_row_no:i+j+1,source_data}));
    const {error}=await SB.from('order_bank_import_rows').insert(chunk);
    if(error)throw Error(`Upload failed near CSV record ${i+2}: ${error.message}`);
    checkSession();
    const completed=Math.min(i+500,rows.length);
    if(progress)progress.value=completed/rows.length*90;
    msg.textContent=`Uploading… ${completed.toLocaleString()} / ${rows.length.toLocaleString()} rows · ${headers.length} columns`;
  }
  msg.textContent='Validating SQL row count and activating snapshot…';checkSession();
  const {data:a,error}=await SB.rpc('finalize_order_bank_import',{p_upload_token:token,p_file_name:f.name,p_expected_rows:rows.length,p_source_columns:headers});
  if(error)throw error;
  activated=true;checkSession();
  if(!a||a.status!=='SUCCESS'||Number(a.staging_rows)!==rows.length||Number(a.raw_rows)!==rows.length||Number(a.source_column_count)!==headers.length)throw Error('SQL upload audit does not match this CSV.');
  if(progress)progress.value=100;
  audit.innerHTML=`<table class="dt"><tbody>
   <tr><td>CSV Rows</td><td class="num">${rows.length.toLocaleString()}</td></tr>
   <tr><td>SQL Raw Rows</td><td class="num">${Number(a.raw_rows).toLocaleString()}</td></tr>
   <tr><td>Source Columns</td><td class="num">${headers.length}</td></tr>
   <tr><td>Nonblank Rows</td><td class="num">${Number(a.nonblank_rows).toLocaleString()}</td></tr>
   <tr><td>Missing Rows</td><td class="num">0</td></tr>
   <tr><td>Upload Batch</td><td class="num">#${esc(a.batch_id)}</td></tr>
   <tr><td>Status</td><td class="num">SUCCESS</td></tr>
  </tbody></table>`;
  msg.textContent='✓ Order Bank saved · refreshing dashboard…';
  await refreshDashboardAfterSuccessfulUpload('orderbank');checkSession();
  msg.textContent=`✓ Order Bank uploaded · ${rows.length.toLocaleString()} rows · ${headers.length} columns · dashboard refreshed`;
 }catch(e){
  if(sessionGeneration===SITE_SESSION_GENERATION)msg.textContent=(activated?'Snapshot saved, but verification/refresh failed: ':'Upload failed: ')+(e?.message||e);
  if(token&&!activated&&sessionGeneration===SITE_SESSION_GENERATION){
    const {error}=await SB.from('order_bank_import_rows').delete().eq('upload_token',token);
    if(error)msg.textContent+=' · Incomplete upload cleanup failed; the previous snapshot remains active.';
  }
 }finally{ORDER_BANK_UPLOADING=false;if(btn)btn.disabled=false;}
}


function selectUploadReport(type){
  const types=['plan','fabric','sewing','production','orderbank','sizeset','accessories','embellishment'];
  const sel=document.getElementById('upload-report-select');
  if(!types.includes(type)||!sel)return;
  // Keep the visible report picker and its corresponding upload panel in sync.
  sel.value=type;
  types.forEach(t=>{
    const el=document.getElementById('upload-panel-'+t);
    if(el)el.style.display=(t===type)?'block':'none';
  });
  const help={
    plan:'Planning Data / Plan Data.csv → planning upload & import',
    fabric:'Fabrics & Cutting.csv → fabric_cutting_info',
    sewing:'Line Wise Reconcilation.csv → sewing_input_output',
    production:'Date Wise Actual Production Report.csv → date-wise replace',
    orderbank:'Order Bank.csv → staging → lossless SQL snapshot → validation',
    sizeset:'SS.csv → preview → 49-column SQL snapshot → row-count validation',
    accessories:'EKWLHW-Accessories.csv → PSD as Report Date → 15-column SQL snapshot',
    embellishment:'Embellishment Send Receive.csv → Date filter → 21-column SQL snapshot'
  };
  const x=document.getElementById('upload-report-help'); if(x)x.textContent=help[type]||'';
}
function refreshUploadReportOptions(){
  const sel=document.getElementById('upload-report-select'); if(!sel)return;
  const allowed={
    plan:siteHasPerm('planning_upload'),
    fabric:siteHasPerm('fabric'),
    sewing:siteHasPerm('sewing'),
    production:siteHasPerm('production'),
    orderbank:siteIsAdmin()||siteHasPerm('admin_settings'),
    sizeset:siteIsAdmin(),
    accessories:siteIsAdmin(),
    embellishment:siteHasPerm('embellishment_upload')
  };
  [...sel.options].forEach(o=>o.hidden=!allowed[o.value]);
  const chosen=[...sel.options].find(o=>o.value===sel.value&&!o.hidden)||[...sel.options].find(o=>!o.hidden);
  if(chosen)selectUploadReport(chosen.value);
}


async function uploadFloorAllocation(){
  const f=document.getElementById('floor-file')?.files?.[0],msg=document.getElementById('floor-msg');
  if(!f){msg.textContent='Please select Flore Allocation.csv';return;}
  try{
    msg.textContent='Reading and validating Floor Allocation…';
    const rec=parseRecords(await f.text());
    if(!rec.length)throw Error('CSV is empty');
    const headers=rec.shift().map(x=>String(x??'').trim().replace(/^\uFEFF/,''));
    const required=['Line','Level','IE Name & Line Block','ID'];
    const missing=required.filter(x=>!headers.includes(x));
    if(missing.length)throw Error('Missing columns: '+missing.join(', '));
    const rows=rec.filter(cols=>cols.some(v=>String(v??'').trim()!=='')).map((cols,i)=>{
      const o={}; required.forEach(k=>o[k]=String(cols[headers.indexOf(k)]??'').trim());
      if(required.some(k=>!o[k]))throw Error(`Row ${i+2}: blank required field`);
      if(!/^\d+$/.test(o.Line)||Number(o.Line)<=0||Number(o.Line)===46)throw Error(`Row ${i+2}: invalid Line ${o.Line}`);
      return o;
    });
    const seen=new Set();
    rows.forEach(r=>{if(seen.has(r.Line))throw Error('Duplicate Line: '+r.Line);seen.add(r.Line);});
    msg.textContent=`Validated ${rows.length.toLocaleString()} rows. Replacing SQL master allocation…`;
    invalidateTinySettings(['floor']);
    const {data,error}=await SB.rpc('replace_floor_allocation',{p_rows:rows});
    if(error)throw error;
    const a=Array.isArray(data)?data[0]:data;
    if(!a||a.status!=='SUCCESS'||Number(a.inserted_rows)!==rows.length)throw Error('SQL row-count validation failed');
    msg.textContent=`✓ Floor Allocation updated: ${Number(a.inserted_rows).toLocaleString()} rows | Missing Rows: 0 | Status: SUCCESS`;
  msg.textContent=msg.textContent+' · refreshing live dashboard…';
     await refreshDashboardAfterSuccessfulUpload('floor');
     msg.textContent=msg.textContent.replace(' · refreshing live dashboard…','')+' · Live MySQL refreshed';
  }catch(e){msg.textContent='Upload failed: '+(e?.message||e);}
}


async function loadFloorAllocationAdmin(){
  const box=document.getElementById('floor-admin-table');
  if(!box)return;
  box.innerHTML='<div class="modal-msg">Loading Floor Allocation…</div>';
  try{
    const {data,error}=await readTinySetting('floor',()=>SB.from('floor_allocation').select('line_no,level,ie_name_line_block,employee_id,updated_at').order('line_no'));
    if(error)throw error;
    const rows=data||[];
    box.innerHTML=`<table class="dt"><thead><tr><th>Line</th><th>Level</th><th>IE Name & Line Block</th><th>ID</th></tr></thead><tbody>${
      rows.map(r=>`<tr><td class="num">${r.line_no}</td><td>${esc(r.level||'')}</td><td>${esc(r.ie_name_line_block||'')}</td><td>${esc(r.employee_id||'')}</td></tr>`).join('')
    }</tbody></table><div class="modal-msg" style="margin-top:6px">Total Lines: ${rows.length.toLocaleString()}</div>`;
  }catch(e){box.innerHTML=`<div class="modal-msg">Load failed: ${esc(e?.message||String(e))}</div>`;}
}

async function addFloorAllocationRow(){
  if(!requireSitePerm('admin_settings','Floor Allocation'))return;
  const form=document.getElementById('floor-add-form');
  const msg=document.getElementById('floor-add-msg');
  const btn=document.getElementById('floor-add-btn');
  const lineText=document.getElementById('floor-add-line').value.trim();
  const level=document.getElementById('floor-add-level').value.trim();
  const block=document.getElementById('floor-add-block').value.trim();
  const employeeId=document.getElementById('floor-add-id').value.trim();
  const lineNo=Number(lineText);
  if(!/^\d+$/.test(lineText)||!Number.isSafeInteger(lineNo)||lineNo<1||lineNo===46){
    msg.textContent='Valid Line দিন (Line 46 blocked).';return;
  }
  if(!level||!block||!employeeId){msg.textContent='Level, IE Name & Line Block, এবং ID সবগুলো পূরণ করুন।';return;}
  btn.disabled=true;
  try{
    msg.textContent='Checking Line and saving to SQL…';
    const {data:existing,error:checkError}=await SB.from('floor_allocation').select('line_no').eq('line_no',lineNo).limit(1);
    if(checkError)throw checkError;
    if(existing?.length){msg.textContent=`Line ${lineNo} already exists. Add Row-এর জন্য নতুন Line দিন।`;return;}
    invalidateTinySettings(['floor']);
    const {error}=await SB.from('floor_allocation').insert({line_no:lineNo,level,ie_name_line_block:block,employee_id:employeeId});
    if(error)throw error;
    form.reset();
    msg.textContent=`✓ Line ${lineNo} added to SQL. Refreshing dashboard…`;
    try{
      await refreshDashboardAfterSuccessfulUpload('floor');
      msg.textContent=`✓ Line ${lineNo} added to SQL. Floor Allocation refreshed.`;
    }catch(refreshError){
      msg.textContent=`✓ Line ${lineNo} saved to SQL. Dashboard refresh failed: ${refreshError?.message||refreshError}. Use Refresh Current Data.`;
      await loadFloorAllocationAdmin();
    }
  }catch(e){msg.textContent='Add Row failed: '+(e?.message||e);}
  finally{btn.disabled=false;}
}





async function saveMasterAnalysisSettings(){
  const msg=document.getElementById('master-setting-msg');
  try{
    const factory=(document.getElementById('master-factory-name')?.value||'').trim()||'EKWL · HW';
    const eff=Number(document.getElementById('master-eff-target')?.value);
    if(!Number.isFinite(eff)||eff<0||eff>100)throw Error('Efficiency Target must be 0–100');
    if(msg)msg.textContent='Saving to SQL…';
    await Promise.all([
      saveDashboardMasterSetting('factory_name',factory),
      saveDashboardMasterSetting('buyer_efficiency_target',eff)
    ]);
    document.getElementById('cfg-name').value=factory;
    document.getElementById('cfg-eff').value=eff;
    renderAll();
    if(msg){msg.textContent='✓ Saved to SQL';setTimeout(()=>{if(msg)msg.textContent=''},2000);}
  }catch(e){if(msg)msg.textContent='Save failed: '+(e?.message||e);}
}


const ORDER_BANK_SOURCE_COLUMNS=[
  'Code-EWO','Code','Buyer','Dept','EWO','PO','GmtColor','EWO&Color','Stroke','Description',
  'Destination','TechPackDate','FOB','RevisedFOB','EFD','FRDate','CostingSMV','UpdatedSMV',
  'TotalHour','FRHour','OrderQty','OrderRate','Ordervalue','Season','ContractNo','ContractUnit',
  'ExecutionUnit','Gender','ConsumptionQtyInHouse','ConsumptionQtyOutSource','FabrickgInHouse',
  'FabrickgOutSource','TotalFabricinKG','Ordertype','OrderStatus','TNADays','MMTeam','CancelReason',
  'Remarks','Month'
];
const ORDER_BANK_FILTER_COLUMNS=['Buyer','Dept','EWO','PO','GmtColor','Description','Destination','Season','ExecutionUnit','Ordertype','OrderStatus','MMTeam','Month'];
const ORDER_BANK_PAGE_SIZE=100;
let ORDER_BANK_RAW_ROWS=[],ORDER_BANK_LOAD_TOKEN=0;
let ORDER_BANK_KEYMAP=new Map();
let ORDER_BANK_DISPLAY_COLUMNS=[...ORDER_BANK_SOURCE_COLUMNS];
let ORDER_BANK_FILTERS={};
let ORDER_BANK_FILTER_INDEX={};
let ORDER_BANK_FILTERED_INDEXES=[];
let ORDER_BANK_PAGE=1;
let ORDER_BANK_EWO_SEARCH='';

function obVal(r,label){
  const key=ORDER_BANK_KEYMAP.get(label.toLowerCase());
  return key ? String(r[key]??'') : '';
}
function obNum(r,label){
  const x=Number(obVal(r,label).replace(/,/g,'').trim());
  return Number.isFinite(x)?x:0;
}
function buildOrderBankFilterIndex(){
  ORDER_BANK_FILTER_INDEX={};
  ORDER_BANK_FILTER_COLUMNS.forEach(c=>ORDER_BANK_FILTER_INDEX[c]=new Map());
  ORDER_BANK_RAW_ROWS.forEach((r,i)=>{
    ORDER_BANK_FILTER_COLUMNS.forEach(c=>{
      const v=obVal(r,c);
      if(!ORDER_BANK_FILTER_INDEX[c].has(v))ORDER_BANK_FILTER_INDEX[c].set(v,new Set());
      ORDER_BANK_FILTER_INDEX[c].get(v).add(i);
    });
  });
}
function obIntersectSets(sets){
  if(!sets.length)return new Set(ORDER_BANK_RAW_ROWS.map((_,i)=>i));
  sets=[...sets].sort((a,b)=>a.size-b.size);
  const out=new Set(sets[0]);
  for(let x=1;x<sets.length;x++){
    const s=sets[x];
    for(const i of out)if(!s.has(i))out.delete(i);
    if(!out.size)break;
  }
  return out;
}
function obMatchingIndexSet(excludeColumn=null){
  const sets=[];
  ORDER_BANK_FILTER_COLUMNS.forEach(c=>{
    if(c===excludeColumn)return;
    const v=ORDER_BANK_FILTERS[c]||'';
    if(v){
      const s=ORDER_BANK_FILTER_INDEX[c]?.get(v);
      sets.push(s||new Set());
    }
  });
  if(ORDER_BANK_EWO_SEARCH){
    const ewoSet=ORDER_BANK_FILTER_INDEX['EWO']?.get(ORDER_BANK_EWO_SEARCH);
    sets.push(ewoSet||new Set());
  }
  return obIntersectSets(sets);
}
function obCascadeOptions(column){
  const candidates=obMatchingIndexSet(column);
  const values=new Set();
  for(const i of candidates){
    const v=obVal(ORDER_BANK_RAW_ROWS[i],column);
    if(v!=='')values.add(v);
  }
  return [...values].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
}
function renderOrderBankFilters(){
  const box=document.getElementById('order-bank-filters');
  if(!box)return;
  box.innerHTML=ORDER_BANK_FILTER_COLUMNS.filter(c=>ORDER_BANK_KEYMAP.has(c.toLowerCase())).map(c=>{
    const opts=obCascadeOptions(c),cur=ORDER_BANK_FILTERS[c]||'';
    return `<label><span>${esc(c)}</span><select data-ob-filter="${esc(c)}"><option value="">All</option>${
      opts.map(v=>`<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(v)}</option>`).join('')
    }</select></label>`;
  }).join('')+`<button class="top-btn" id="order-bank-clear-filters">Clear Filters</button>`;
  if(!box._obChangeBound){
    box._obChangeBound=true;
    box.onchange=event=>{
      const sel=event.target.closest('[data-ob-filter]');
      if(!sel||!box.contains(sel))return;
    ORDER_BANK_FILTERS[sel.dataset.obFilter]=sel.value;
    ORDER_BANK_FILTER_COLUMNS.forEach(c=>{
      if(c===sel.dataset.obFilter)return;
      const cur=ORDER_BANK_FILTERS[c]||'';
      if(cur && !obCascadeOptions(c).includes(cur))ORDER_BANK_FILTERS[c]='';
    });
    ORDER_BANK_PAGE=1;
    renderOrderBankView(true);
    };
  }
  document.getElementById('order-bank-clear-filters').onclick=()=>{
    ORDER_BANK_FILTERS={};ORDER_BANK_EWO_SEARCH='';ORDER_BANK_PAGE=1;renderOrderBankView(true);
    const si=document.getElementById('order-bank-ewo-search');if(si)si.value='';
  };
  const si=document.getElementById('order-bank-ewo-search'),sb=document.getElementById('order-bank-ewo-search-btn');
  const hasEWO=ORDER_BANK_KEYMAP.has('ewo');
  if(si)si.disabled=!hasEWO;
  if(sb)sb.disabled=!hasEWO;
  if(si){
    si.value=ORDER_BANK_EWO_SEARCH;
    const run=()=>flushDashboardInput(si,()=>{ORDER_BANK_EWO_SEARCH=String(si.value||'').trim();ORDER_BANK_PAGE=1;renderOrderBankView(true);});
    si.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();run();}};
    if(sb)sb.onclick=run;
  }
}
function renderOrderBankTotals(indexes){
  const box=document.getElementById('order-bank-total-cells');
  if(!box)return;
  let oq=0,ov=0,fkg=0; const ewos=new Set();
  for(const i of indexes){
    const r=ORDER_BANK_RAW_ROWS[i];
    oq+=obNum(r,'OrderQty'); ov+=obNum(r,'Ordervalue'); fkg+=obNum(r,'TotalFabricinKG');
    const e=obVal(r,'EWO'); if(e)ewos.add(e);
  }
  const cells=[['Filtered Rows',indexes.length]];
  if(ORDER_BANK_KEYMAP.has('ewo'))cells.push(['Unique EWO',ewos.size]);
  if(ORDER_BANK_KEYMAP.has('orderqty'))cells.push(['Order Qty',oq]);
  if(ORDER_BANK_KEYMAP.has('ordervalue'))cells.push(['Order Value',ov]);
  if(ORDER_BANK_KEYMAP.has('totalfabricinkg'))cells.push(['Fabric KG',fkg]);
  box.innerHTML=cells.map(([a,b])=>`<div class="ob-total-cell"><span>${esc(a)}</span><b>${fmt(b)}</b></div>`).join('');
}
function renderOrderBankPage(){
  const box=document.getElementById('order-bank-table'),pg=document.getElementById('order-bank-pagination'),msg=document.getElementById('order-bank-msg');
  if(!box)return;
  const cols=ORDER_BANK_DISPLAY_COLUMNS.map(label=>({label,key:ORDER_BANK_KEYMAP.get(label.toLowerCase())}));
  const total=ORDER_BANK_FILTERED_INDEXES.length;
  const pages=Math.max(1,Math.ceil(total/ORDER_BANK_PAGE_SIZE));
  ORDER_BANK_PAGE=Math.min(Math.max(1,ORDER_BANK_PAGE),pages);
  const from=(ORDER_BANK_PAGE-1)*ORDER_BANK_PAGE_SIZE;
  const indexes=ORDER_BANK_FILTERED_INDEXES.slice(from,from+ORDER_BANK_PAGE_SIZE);
  box.innerHTML=`<table class="dt order-bank-raw-table"><thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${
    indexes.length ? indexes.map(i=>{const r=ORDER_BANK_RAW_ROWS[i];return `<tr>${cols.map(c=>`<td>${esc(r[c.key]??'')}</td>`).join('')}</tr>`}).join('') : `<tr><td colspan="${cols.length}" class="cen">${ORDER_BANK_RAW_ROWS.length ? 'No orders match the current filters.' : 'No Order Bank rows are available for your account. Check the latest upload and your access permissions, then refresh.'}</td></tr>`
  }</tbody></table>`;
  if(pg){
    const lo=Math.max(1,ORDER_BANK_PAGE-2),hi=Math.min(pages,ORDER_BANK_PAGE+2);
    let nums=''; for(let p=lo;p<=hi;p++)nums+=`<button class="pg-btn ${p===ORDER_BANK_PAGE?'active':''}" onclick="goOrderBankPage(${p})">${p}</button>`;
    pg.innerHTML=`<span>${total?fmt(from+1):0}–${fmt(Math.min(from+ORDER_BANK_PAGE_SIZE,total))} of ${fmt(total)}</span>
      <button class="pg-btn" ${ORDER_BANK_PAGE<=1?'disabled':''} onclick="goOrderBankPage(${ORDER_BANK_PAGE-1})">← Previous</button>
      ${nums}
      <button class="pg-btn" ${ORDER_BANK_PAGE>=pages?'disabled':''} onclick="goOrderBankPage(${ORDER_BANK_PAGE+1})">Next →</button>
      <span>Page ${fmt(ORDER_BANK_PAGE)} / ${fmt(pages)}</span>`;
  }
  if(msg)msg.textContent=`RAW SQL · ${fmt(total)} filtered / ${fmt(ORDER_BANK_RAW_ROWS.length)} total · showing max ${ORDER_BANK_PAGE_SIZE} rows`;
}
function goOrderBankPage(p){
  ORDER_BANK_PAGE=p;renderOrderBankPage();
  document.getElementById('order-bank-table')?.scrollTo({top:0,left:0});
}
function renderOrderBankView(rebuildFilters=false){
  if(typeof recordDashboardRender==='function')recordDashboardRender('14');
  ORDER_BANK_FILTERED_INDEXES=[...obMatchingIndexSet()];
  if(rebuildFilters)renderOrderBankFilters();
  renderOrderBankTotals(ORDER_BANK_FILTERED_INDEXES);
  renderOrderBankPage();
}
async function loadOrderBankSlide(){
  const sessionGeneration=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id,token=++ORDER_BANK_LOAD_TOKEN;
  const current=()=>sessionGeneration===SITE_SESSION_GENERATION&&userId===SITE_AUTH_USER?.id&&token===ORDER_BANK_LOAD_TOKEN;
  const msg=document.getElementById('order-bank-msg'),box=document.getElementById('order-bank-table'),k=document.getElementById('order-bank-kpis');
  if(!box)return;
  if(msg)msg.textContent='Loading complete raw SQL snapshot…';
  try{
    const all=await loadOrderBankSnapshot();
    if(!current())return;
    // New imports carry the exact source headers and cells; legacy snapshots use 40 columns.
    const columns=all[0]?.source_columns||ORDER_BANK_SOURCE_COLUMNS;
    const flexible=Array.isArray(all[0]?.source_columns)&&columns.length>0;
    if(all.some(r=>r.upload_batch_id!==all[0].upload_batch_id))throw Error('Order Bank changed during loading. Refresh to load the complete latest snapshot.');
    const rows=flexible?all.map(r=>{
      if(!r.source_data||columns.some(c=>!Object.hasOwn(r.source_data,c)))throw Error('SQL source cells do not match the uploaded columns.');
      return r.source_data;
    }):all;
    // Empty results have no row keys and cannot establish the SQL view's schema.
    const keymap=new Map((rows[0]?Object.keys(rows[0]):columns).map(x=>[x.toLowerCase(),x]));
    const missing=columns.filter(c=>!keymap.has(c.toLowerCase()));
    if(missing.length)throw Error('SQL raw view missing source column(s): '+missing.join(', '));
    ORDER_BANK_RAW_ROWS=rows;
    ORDER_BANK_KEYMAP=keymap;
    ORDER_BANK_DISPLAY_COLUMNS=[...columns];
    ORDER_BANK_FILTERS={};ORDER_BANK_EWO_SEARCH='';ORDER_BANK_PAGE=1;
    buildOrderBankFilterIndex();
    k.innerHTML=`<div class="kpi"><div class="kpi-lbl">SQL RAW ROWS</div><div class="kpi-val">${fmt(all.length)}</div><div class="kpi-sub">Complete latest snapshot</div></div>
      <div class="kpi"><div class="kpi-lbl">SOURCE COLUMNS</div><div class="kpi-val">${columns.length}</div><div class="kpi-sub">Exact CSV order</div></div>
      <div class="kpi"><div class="kpi-lbl">FILTER MODE</div><div class="kpi-val" style="font-size:16px">FAST CASCADE</div><div class="kpi-sub">Pre-indexed filtering</div></div>
      <div class="kpi"><div class="kpi-lbl">TABLE PAGE</div><div class="kpi-val">${ORDER_BANK_PAGE_SIZE}</div><div class="kpi-sub">Rows rendered at once</div></div>`;
    renderOrderBankView(true);
  }catch(e){
    if(!current())return;
    if(msg)msg.textContent='Load failed';
    box.innerHTML=`<div class="modal-msg">Order Bank raw SQL load failed: ${esc(e?.message||e)}</div>`;
  }
}


let EFF15_SUB='fixed';
function showEff15Sub(name){
  EFF15_SUB=name==='fr'?'fr':'fixed';
  document.getElementById('eff15-fixed')?.classList.toggle('active',EFF15_SUB==='fixed');
  document.getElementById('eff15-fr')?.classList.toggle('active',EFF15_SUB==='fr');
  document.getElementById('eff15-tab-fixed')?.classList.toggle('active',EFF15_SUB==='fixed');
  document.getElementById('eff15-tab-fr')?.classList.toggle('active',EFF15_SUB==='fr');
  if(EFF15_SUB==='fixed')loadEfficiencyAnalysisSlide();
  else loadEff15FRComparison();
}
function refreshEfficiencySlide15(){
  invalidateTinySettings(['ladder']);
  if(EFF15_SUB==='fixed')loadEfficiencyAnalysisSlide();
  else loadEff15FRComparison();
}

let EFF15_FR_TOKEN=0;
let EFF15_METRIC_UPLOAD_ID=null;
let EFF15_FR_LOADING=false;
let EFF15_METRIC_DAILY=[];
async function loadEff15FRComparison(){
  const box=document.getElementById('eff15-fr-table'),msg=document.getElementById('eff15-fr-msg');
  if(!box)return;
  const token=++EFF15_FR_TOKEN,session=SITE_SESSION_GENERATION;
  EFF15_FR_LOADING=true;
  const current=()=>token===EFF15_FR_TOKEN&&session===SITE_SESSION_GENERATION&&CURRENT_SLIDE===15&&EFF15_SUB==='fr';
  try{
    if(msg)msg.textContent='Loading Planning data…';
    box.innerHTML='<div class="empty">Loading Line × Date planning table…</div>';
    if(!(DAILY_PLAN||[]).length){
      const selected=document.getElementById('planning-sequence-filter')?.value||null;
      if(!await loadFromSupabase(selected,true))return;
    }
    if(!current())return;
    const loaded=await loadEff15ExactMetricSource();
    if(!current()||!loaded)return;
    renderEff15LineDateTable();
  }catch(e){
    if(!current())return;
    console.error('FR comparison load failed',e);
    box.innerHTML='<div class="empty">FR comparison load failed: '+esc(e?.message||e)+'</div>';
    if(msg)msg.textContent='Load failed';
  }finally{
    if(token===EFF15_FR_TOKEN)EFF15_FR_LOADING=false;
  }
}

function bindEff15DynamicHover(){
  const table=document.getElementById('eff15-fr-table');
  const tip=document.getElementById('eff15-dynamic-tip');
  if(!table||!tip||table.dataset.hoverBound==='1')return;
  table.dataset.hoverBound='1';

  const renderTip=cell=>{
    const d=cell.dataset,target=d.target?Number(d.target):null;
    const hasEff=d.eff!==''&&Number.isFinite(Number(d.eff)),eff=hasEff?Number(d.eff):null;
    const gap=(target==null||!hasEff)?null:(eff-target);
    const state=d.state||'na';
    const status=target==null?'No Fixed Ladder Match':
      (state==='below'?'Below Ladder Target':state==='meet'?'Ladder Target Met':'Above Ladder Target');
    const cls=target==null?'na':(state==='below'?'below':state==='above'?'above':'ok');
    tip.innerHTML=
      '<div class="eff15-tip-title">'+esc(d.product||'Product')+' · Line '+esc(d.line||'')+'</div>'+
      '<div class="eff15-tip-grid">'+
      '<span>Date</span><b>'+esc(d.date||'')+'</b>'+
      '<span>Run Day</span><b>'+esc(d.runday||'')+'</b>'+
      '<span>Plan / Day</span><b>'+esc(d.planqty||'0.00')+'</b>'+ '<span>SAH / Day</span><b>'+esc(d.sah||'0.00')+'</b>'+
      '<span>SAH Source</span><b>'+esc(d.sahsource||'—')+'</b>'+
      '<span>Clock Hour / Day</span><b>'+esc(d.clock||'N/A')+'</b>'+
      '<span>Clock Match</span><b>'+esc(d.clocksource||'—')+'</b>'+
      '<span>Plan Efficiency</span><b>'+(hasEff?esc(d.eff)+'%':'N/A')+'</b>'+ '<span>Source Effi / Day</span><b>'+(d.sourceeff?esc(d.sourceeff)+'%':'N/A')+'</b>'+
      '<span>Fixed Ladder</span><b>'+(target==null?'N/A':target.toFixed(1)+'%')+'</b>'+
      '<span>Variance</span><b>'+(gap==null?'N/A':(gap>=0?'+':'')+gap.toFixed(1)+' pp')+'</b>'+
      '</div><div class="eff15-tip-status '+cls+'">'+status+'</div>';
  };
  const move=(e)=>{
    const pad=14,w=tip.offsetWidth||280,h=tip.offsetHeight||180;
    let x=e.clientX+14,y=e.clientY+14;
    if(x+w>window.innerWidth-pad)x=e.clientX-w-14;
    if(y+h>window.innerHeight-pad)y=e.clientY-h-14;
    tip.style.left=Math.max(pad,x)+'px';
    tip.style.top=Math.max(pad,y)+'px';
  };
  table.addEventListener('mouseover',e=>{
    const cell=e.target.closest('.eff15-hover-cell');
    if(!cell||!table.contains(cell))return;
    renderTip(cell);tip.classList.add('show');move(e);
  });
  table.addEventListener('mousemove',e=>{if(tip.classList.contains('show'))move(e);});
  table.addEventListener('mouseout',e=>{
    const cell=e.target.closest('.eff15-hover-cell');
    if(cell&&!cell.contains(e.relatedTarget))tip.classList.remove('show');
  });
}

async function loadEff15ExactMetricSource(){
  const upload=ACTIVE_PLAN_UPLOAD;
  if(!upload)return false;
  const id=String(upload.id),session=SITE_SESSION_GENERATION;
  if(EFF15_METRIC_UPLOAD_ID===id)return true;
  const snap=PLAN_VERSION_CACHE.get(id)||await fetchPlanningSnapshot(upload);
  if(session!==SITE_SESSION_GENERATION||String(ACTIVE_PLAN_UPLOAD?.id)!==id)return false;
  EFF15_METRIC_DAILY=snap.EFF15_METRIC_DAILY||[];
  EFF15_METRIC_UPLOAD_ID=id;
  return true;
}
function renderEff15LineDateTable(){
  const box=document.getElementById('eff15-fr-table'),msg=document.getElementById('eff15-fr-msg');
  if(!box)return;
  const master=getChassisMasterLines();
  const sourceRows=[...(SAH_DAILY||[]),...(CLOCK_HOUR_DAILY||[])];
  const dates=[...new Set(sourceRows.map(d=>d.date).filter(Boolean))].sort();
  const lines=[...master].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);

  // Exact source rule: selected plan -> Line + Product + Criteria + Date.
  // Calculation: SAH/Day ÷ Clock Hour/Day × 100.
  // Effi/Day is audit-only and never replaces the calculated result.
  const metricAgg=new Map(),metricSeen=new Set();
  (EFF15_METRIC_DAILY||[]).forEach(r=>{
    const line=Number(r.line),date=r.date,product=dashboardStyle(r.product),criteria=String(r.criteria||'').trim();
    if(!master.has(line)||!date||!product)return;
    const dedupe=String(r.record_id??'')+'|'+date;
    if(r.record_id!=null&&metricSeen.has(dedupe))return;
    if(r.record_id!=null)metricSeen.add(dedupe);
    const k=line+'|'+date+'|'+product+'|'+criteria;
    metricAgg.set(k,(metricAgg.get(k)||0)+N(r.value));
  });

  const productKeys=new Set();
  (EFF15_METRIC_DAILY||[]).forEach(r=>{
    if(String(r.criteria||'').trim()==='Plan/Day' && N(r.value)>0){
      const product=dashboardStyle(r.product);
      if(product)productKeys.add(Number(r.line)+'|'+r.date+'|'+product);
    }
  });

  const productDaily=new Map();
  productKeys.forEach(k=>{
    const p=k.split('|'),line=Number(p[0]),date=p[1],product=p.slice(2).join('|');
    const get=criteria=>N(metricAgg.get(k+'|'+criteria));
    const planQty=get('Plan/Day'),sah=get('SAH/Day'),clock=get('Clock Hour/Day'),sourceEff=get('Effi/Day');
    if(planQty<=0)return;
    const eff=(sah>0&&clock>0)?(sah/clock)*100:null;
    productDaily.set(k,{line,date,product,planQty,sah,clock,sourceEff,
      sahSource:'Exact SAH/Day',clockSource:'Exact Clock Hour/Day',eff});
  });

  const runDay=new Map();
  lines.forEach(line=>{
    const products=[...new Set([...productDaily.values()].filter(x=>x.line===line).map(x=>x.product))];
    products.forEach(product=>{
      let day=0;
      dates.forEach(date=>{
        const k=line+'|'+date+'|'+product;
        if(productDaily.has(k)){day++;runDay.set(k,Math.min(day,6));}
      });
    });
  });

  const normItem=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const ladderMap=new Map(getEfficiencyLadder().map(r=>[normItem(r[0]),r]));
  const best=new Map();
  productDaily.forEach(a=>{
    const cell=a.line+'|'+a.date,old=best.get(cell);
    if(!old || (a.eff!=null && (old.eff==null || a.eff>old.eff)))best.set(cell,a);
  });
  const dateLabel=d=>{
    const dt=new Date(d+'T00:00:00');
    return String(dt.getDate()).padStart(2,'0')+'-'+dt.toLocaleString('en-US',{month:'short'})+'-'+String(dt.getFullYear()).slice(-2);
  };
  if(!dates.length){
    box.innerHTML='<div class="empty">No date-wise SAH/Day or Clock Hour/Day data found in the selected Planning version.</div>';
    if(msg)msg.textContent='No SAH/Clock date data';
    return;
  }

  let belowCount=0,comparedCount=0;
  box.innerHTML='<table class="eff15-fr-table"><thead><tr><th class="eff15-line">Line</th>'+
    dates.map(d=>'<th>'+dateLabel(d)+'</th>').join('')+'</tr></thead><tbody>'+
    lines.map(line=>'<tr><td class="eff15-line">'+line+'</td>'+
      dates.map(date=>{
        const a=best.get(line+'|'+date);
        if(!a)return '<td class="eff15-fr-empty">—</td>';
        const k=line+'|'+date+'|'+a.product,rd=runDay.get(k)||1;
        const ladder=ladderMap.get(normItem(a.product));
        const target=ladder?N(ladder[Math.min(rd,6)]):null;
        const hasEff=a.eff!=null&&Number.isFinite(a.eff);
        const shownEff=hasEff?Number(a.eff.toFixed(1)):null;
        const shownTarget=target==null?null:Number(target.toFixed(1));
        const below=hasEff&&shownTarget!=null&&shownEff<shownTarget;
        const meet=hasEff&&shownTarget!=null&&shownEff===shownTarget;
        const above=hasEff&&shownTarget!=null&&shownEff>shownTarget;
        if(target!=null)comparedCount++;
        if(below)belowCount++;
        const targetText=target==null?'No fixed ladder match':target.toFixed(1)+'%';
        const tip='Product: '+a.product+' | Run Day: '+(rd>=6?'Day-6+':'Day-'+rd)+
          ' | SAH/Day: '+a.sah.toFixed(2)+' ('+a.sahSource+') | Clock Hour/Day: '+(a.clock>0?a.clock.toFixed(2):'N/A')+
          ' ('+a.clockSource+') | Plan Efficiency: '+(hasEff?a.eff.toFixed(1)+'%':'N/A')+' | Fixed Ladder: '+targetText+
          (below?' | BELOW TARGET':'');
        return '<td class="eff15-fr-cell eff15-hover-cell'+
          (below?' eff15-below':meet?' eff15-meet':above?' eff15-above':'')+'" '+
          'data-line="'+line+'" data-date="'+esc(dateLabel(date))+'" data-product="'+esc(a.product)+'" '+
          'data-runday="'+(rd>=6?'Day-6+':'Day-'+rd)+'" data-planqty="'+a.planQty.toFixed(2)+'" data-sourceeff="'+(a.sourceEff>0?a.sourceEff.toFixed(1):'')+'" data-sah="'+a.sah.toFixed(2)+'" '+
          'data-sahsource="'+esc(a.sahSource)+'" data-clock="'+(a.clock>0?a.clock.toFixed(2):'')+'" '+
          'data-clocksource="'+esc(a.clockSource)+'" data-eff="'+(hasEff?a.eff.toFixed(1):'')+'" '+
          'data-target="'+(target==null?'':target.toFixed(1))+'" data-below="'+(below?'1':'0')+
          '" data-state="'+(below?'below':meet?'meet':above?'above':'na')+'">'+
          '<div class="eff15-product">'+esc(a.product)+'</div>'+
          '<div class="eff15-pct">'+(hasEff?a.eff.toFixed(1)+'%':'N/A')+'</div>'+
          '<div class="eff15-run">'+(rd>=6?'D6+':'D'+rd)+(target!=null?' / '+target.toFixed(0)+'%':' / N/A')+'</div></td>';
      }).join('')+'</tr>').join('')+'</tbody></table>';


  bindEff15DynamicHover();
  if(msg){
    const planLabel=ACTIVE_PLAN_UPLOAD
      ? ((ACTIVE_PLAN_UPLOAD.sequence_no?'Seq '+ACTIVE_PLAN_UPLOAD.sequence_no+' · ':'')+(ACTIVE_PLAN_UPLOAD.planning_id||ACTIVE_PLAN_UPLOAD.file_name||'Selected Plan'))
      : 'Selected Plan';
    msg.textContent=planLabel+' · '+lines.length+' Lines · '+dates.length+' dates · Exact Criteria Rows '+(EFF15_METRIC_DAILY||[]).length+' · '+belowCount+'/'+comparedCount+' below ladder';
  }
}

async function loadEfficiencyAnalysisSlide(){
  const msg=document.getElementById('eff-analysis-msg'), box=document.getElementById('eff-analysis-table'), k=document.getElementById('eff-analysis-kpis');
  if(!box)return;
  if(msg)msg.textContent='Loading live SQL…';
  try{
    const {data,error}=await readTinySetting('ladder',()=>SB.from('efficiency_run_day_ladder').select('item,day_1,day_2,day_3,day_4,day_5,day_6_plus').order('item'));
    if(error)throw error;
    const rows=data||[];
    const avg=(field)=>rows.length?rows.reduce((s,r)=>s+N(r[field]),0)/rows.length:0;
    k.innerHTML=`<div class="kpi"><div class="kpi-lbl">Items</div><div class="kpi-val">${fmt(rows.length)}</div><div class="kpi-sub">SQL ladder</div></div>
      <div class="kpi"><div class="kpi-lbl">Avg Day-1</div><div class="kpi-val">${avg('day_1').toFixed(1)}%</div><div class="kpi-sub">Target</div></div>
      <div class="kpi"><div class="kpi-lbl">Avg Day-3</div><div class="kpi-val">${avg('day_3').toFixed(1)}%</div><div class="kpi-sub">Target</div></div>
      <div class="kpi"><div class="kpi-lbl">Avg Day-6 & 6+</div><div class="kpi-val">${avg('day_6_plus').toFixed(1)}%</div><div class="kpi-sub">Target</div></div>`;
    box.innerHTML=`<table class="dt"><thead><tr><th>Item</th><th>Day-1</th><th>Day-2</th><th>Day-3</th><th>Day-4</th><th>Day-5</th><th>Day-6 & 6+</th><th>Growth</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.item)}</b></td><td class="num">${N(r.day_1)}%</td><td class="num">${N(r.day_2)}%</td><td class="num">${N(r.day_3)}%</td><td class="num">${N(r.day_4)}%</td><td class="num">${N(r.day_5)}%</td><td class="num">${N(r.day_6_plus)}%</td><td class="num">${(N(r.day_6_plus)-N(r.day_1)).toFixed(1)} pp</td></tr>`).join('')}</tbody></table>`;
    if(msg)msg.textContent=`Live SQL · ${rows.length} items`;
  }catch(e){if(msg)msg.textContent='Load failed';box.innerHTML=`<div class="modal-msg">Efficiency Ladder SQL load failed: ${esc(e?.message||e)}</div>`;}
}
