// Logical numbers and database permission keys stay stable; id is the existing DOM id.
const SLIDES = Object.freeze([
  {id:'s0', number:0, title:'Home', icon:'🏠', permissionKey:null},
  {id:'s1', number:1, title:'Order Table', icon:'📋', permissionKey:'slide_1'},
  {id:'s3', number:3, title:'Buyer Summary', icon:'🧑‍💼', permissionKey:'slide_3'},
  {id:'s5', number:5, title:'Item / Style Status', icon:'🧵', permissionKey:'slide_5'},
  {id:'s6', number:6, title:'EWO Detail & Feeding Analysis', icon:'🔎', permissionKey:'slide_6'},
  {id:'s11', number:7, title:'EWO Gantt Chart', icon:'📅', permissionKey:'slide_7'},
  {id:'s7', number:8, title:'Plan vs HW Charts', icon:'📈', permissionKey:'slide_8'},
  {id:'s9', number:10, title:'Chassis Analysis', icon:'🏭', permissionKey:'slide_10'},
  {id:'s12', number:11, title:'Fabrics & Cutting Analysis', icon:'✂️', permissionKey:'slide_11'},
  {id:'s10', number:12, title:'Admin / Parameter Setting', icon:'⚙️', permissionKey:'admin_settings'},
  {id:'s13', number:13, title:'User Module', icon:'👥', permissionKey:'user_admin'},
  {id:'s14', number:14, title:'Order Bank', icon:'📦', permissionKey:'slide_14'},
  {id:'s15', number:15, title:'Efficiency Ladder Analysis', icon:'📈', permissionKey:'slide_15'},
  {id:'s16', number:16, title:'Order Execution Plan', icon:'📋', permissionKey:'slide_16'},
  {id:'s17', number:17, title:'Size Set Module', icon:'📐', permissionKey:'slide_17'},
  {id:'s18', number:18, title:'Accessories', icon:'🧰', permissionKey:'slide_18'},
  {id:'s19', number:19, title:'Embellishment Send Receive', icon:'🎨', permissionKey:'slide_19'},
  {id:'s20', number:20, title:'Load Analysis', icon:'📊', permissionKey:'slide_20'}
].map(Object.freeze));

const SLIDE_REDIRECTS = Object.freeze({2:6, 4:10, 9:6});
function resolveSlideNumber(value){
  const number=Number(value);
  return SLIDE_REDIRECTS[number] ?? number;
}
function slideLabel(number){
  const slide=SLIDES.find(s=>s.number===resolveSlideNumber(number));
  return slide ? `Slide ${String(slide.number).padStart(2,'0')} · ${slide.title}` : '';
}
function requestedSlideFromHash(hash){
  // #sN preserves the actual legacy DOM anchor; #slide=N is the logical number.
  const dom=/^#(s\d+)$/.exec(hash);
  if(dom){
    const slide=SLIDES.find(s=>s.id===dom[1]);
    return slide?.number ?? ({s2:6,s4:10,s8:6})[dom[1]] ?? null;
  }
  const logical=/^#slide(?:=|-)(\d+)$/.exec(hash);
  return logical ? resolveSlideNumber(logical[1]) : null;
}
function adjacentDashboardSlide(direction){
  const available=SLIDES.filter(s=>canAccessSlide(s.number));
  const index=available.findIndex(s=>s.number===CURRENT_SLIDE);
  return available[Math.max(0,Math.min(index+direction,available.length-1))]?.number ?? 0;
}
function initializeSlideUI(){
  const tabs=document.getElementById('slide-tabs');
  const grid=document.querySelector('#s0 .home-grid');
  const descriptions=new Map([...grid.querySelectorAll('[data-slide-description]')]
    .map(el=>[Number(el.dataset.slideDescription),el.textContent]));
  tabs.replaceChildren();
  grid.querySelectorAll('[data-slide-access]').forEach(card=>card.remove());
  for(const slide of SLIDES){
    const number=String(slide.number).padStart(2,'0');
    const tab=document.createElement('div');
    tab.className='stab'+(slide.number===0?' active':'');
    tab.dataset.s=slide.number;
    if(slide.permissionKey)tab.dataset.slideAccess=slide.number;
    tab.innerHTML=`<span class="tnum">${number}</span> ${esc(slide.title)}`;
    tab.onclick=()=>goSlide(slide.number);tabs.append(tab);
    if(slide.number===0)continue;
    const card=document.createElement('button');card.type='button';card.className='home-card';
    card.dataset.slideAccess=slide.number;card.onclick=()=>goSlide(slide.number);
    card.innerHTML=`<span class="home-no">${number}</span><span class="home-icon">${slide.icon}</span><span class="home-card-title">${esc(slide.title)}</span><span class="home-card-sub">${esc(descriptions.get(slide.number)||'')}</span>`;
    grid.append(card);
    const header=document.querySelector(`#${slide.id} > .slide-header`);
    const title=header?.querySelector('.slide-title');
    if(title){
      const subtitles=[...title.querySelectorAll('.slide-subtitle')];
      title.replaceChildren();title.style.setProperty('--slide-icon',JSON.stringify(slide.icon));
      const snum=document.createElement('span');snum.className='snum';snum.textContent=number;
      title.append(snum,document.createTextNode(' '+slide.title+' '),...subtitles);
    }
    header?.querySelectorAll('.pager-btns .pg-btn').forEach(button=>{
      if(button.textContent.includes('Next'))button.onclick=()=>goSlide(adjacentDashboardSlide(1));
      else if(button.textContent.includes('Back'))button.onclick=()=>goSlide(adjacentDashboardSlide(-1));
    });
  }
  document.querySelectorAll('[data-slide-label]').forEach(el=>{
    el.textContent=slideLabel(el.dataset.slideLabel)+(el.dataset.slideLabelSuffix||'');
  });
  const count=document.getElementById('admin-setting-count');
  if(count)count.textContent=`উপরের ${Object.keys(ADMIN_SETTING_NAMES).length}টি setting-এর যেকোনো একটি select করুন।`;
}
