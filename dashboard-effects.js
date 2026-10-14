
/* Decorative motion is isolated from planning calculations and Supabase calls. */
document.addEventListener('DOMContentLoaded',()=>{
  'use strict';
  const home=document.getElementById('s0');
  const hero=home?.querySelector('.home-head');
  const canvas=document.getElementById('home-motion-canvas');
  if(!home||!hero||!canvas)return;
  const ctx=canvas.getContext('2d');
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine=window.matchMedia('(pointer: fine)');
  let frame=0,last=0,w=0,h=0,px=.5,py=.5;
  const dots=Array.from({length:26},(_,i)=>({
    x:.38+((i*17%29)/29)*.62,
    y:.06+((i*13%31)/31)*.86,
    depth:.55+(i%5)*.13,
    phase:i*1.7
  }));
  function size(){
    if(!ctx)return;
    const rect=hero.getBoundingClientRect(),scale=Math.min(window.devicePixelRatio||1,1.5);
    w=rect.width;h=rect.height;
    if(!w||!h)return;
    canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
    ctx.setTransform(scale,0,0,scale,0,0);
    draw(0);
  }
  function draw(t){
    if(!ctx||!w||!h)return;
    ctx.clearRect(0,0,w,h);
    const points=dots.map(d=>({
      x:w*d.x+(px-.5)*13*d.depth+Math.sin(t*.00045+d.phase)*5*d.depth,
      y:h*d.y+(py-.5)*10*d.depth+Math.cos(t*.00038+d.phase)*4*d.depth,
      depth:d.depth
    }));
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
      const a=points[i],b=points[j],dist=Math.hypot(a.x-b.x,a.y-b.y);
      if(dist<Math.min(w*.21,180)){
        ctx.strokeStyle='rgba(111,190,238,'+(0.17*(1-dist/180)).toFixed(3)+')';
        ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
    }
    points.forEach((p,i)=>{
      const pulse=.7+.3*Math.sin(t*.0017+i);
      ctx.beginPath();ctx.arc(p.x,p.y,(i%6===0?3.1:1.7)*p.depth,0,Math.PI*2);
      ctx.fillStyle=i%6===0?'rgba(248,177,70,'+(.48*pulse).toFixed(3)+')':'rgba(139,207,250,'+(.55*pulse).toFixed(3)+')';ctx.fill();
    });
  }
  function tick(time){
    if(!home.classList.contains('active')||document.body.classList.contains('site-locked')||document.hidden||reduce.matches){frame=0;return}
    if(time-last>=33){draw(time);last=time}
    frame=requestAnimationFrame(tick);
  }
  function sync(){
    if(!ctx)return;
    if(!home.classList.contains('active')||document.body.classList.contains('site-locked')||document.hidden||reduce.matches){
      if(frame)cancelAnimationFrame(frame);frame=0;draw(0);return;
    }
    if(!frame)frame=requestAnimationFrame(tick);
  }
  if(ctx){
    if('ResizeObserver'in window)new ResizeObserver(size).observe(hero);
    else window.addEventListener('resize',size,{passive:true});
    new MutationObserver(sync).observe(home,{attributes:true,attributeFilter:['class']});
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
    document.addEventListener('visibilitychange',sync);
    if(reduce.addEventListener)reduce.addEventListener('change',sync);
    size();sync();
  }
  if(fine.matches){
    hero.addEventListener('pointermove',e=>{const r=hero.getBoundingClientRect();px=(e.clientX-r.left)/r.width;py=(e.clientY-r.top)/r.height},{passive:true});
    hero.addEventListener('pointerleave',()=>{px=.5;py=.5});
    home.querySelectorAll('.home-grid .home-card').forEach(card=>{
      card.addEventListener('pointermove',e=>{
        if(reduce.matches)return;
        const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
        card.style.setProperty('--pointer-x',(x*100).toFixed(1)+'%');
        card.style.setProperty('--pointer-y',(y*100).toFixed(1)+'%');
        card.style.setProperty('--tilt-x',((.5-y)*5).toFixed(2)+'deg');
        card.style.setProperty('--tilt-y',((x-.5)*5).toFixed(2)+'deg');
      },{passive:true});
      card.addEventListener('pointerleave',()=>{
        card.style.removeProperty('--tilt-x');card.style.removeProperty('--tilt-y');
      });
    });
  }
  const host=document.getElementById('home-live-kpis');
  if(host){
    let kpiFrame=0;
    const animate=()=>{
      if(kpiFrame)cancelAnimationFrame(kpiFrame);
      if(reduce.matches||!home.classList.contains('active'))return;
      const items=[...host.querySelectorAll('.home-live-kpi-val')].map(el=>{
        const label=el.textContent.trim(),number=Number(label.replace(/,/g,''));
        return Number.isSafeInteger(number)&&number>0?{el,label,number}:null;
      }).filter(Boolean);
      if(!items.length)return;
      const started=performance.now(),duration=660;
      const step=now=>{
        const p=Math.min(1,(now-started)/duration),ease=1-Math.pow(1-p,3);
        items.forEach(({el,label,number})=>{el.textContent=p>=1?label:Math.round(number*ease).toLocaleString('en-US')});
        kpiFrame=p<1?requestAnimationFrame(step):0;
      };
      kpiFrame=requestAnimationFrame(step);
    };
    new MutationObserver(animate).observe(host,{childList:true});
  }
});
