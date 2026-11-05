/* Presentation only: theme messages and contrast. No report arrays, quantities,
   calculations, source matching, filters, API calls or permissions are touched. */
(()=>{'use strict';
 const frames=()=>[...document.querySelectorAll('iframe')];
 const channel=value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;};
 const luminance=rgb=>rgb.reduce((sum,v,i)=>sum+channel(v)*[.2126,.7152,.0722][i],0);
 let pending=0;
 function contrast(){
  pending=0;const styles=new WeakMap(),backgrounds=new WeakMap(),changes=[];
  const style=el=>{if(!styles.has(el))styles.set(el,getComputedStyle(el));return styles.get(el);};
  const background=el=>{
   if(!el)return[255,255,255];if(backgrounds.has(el))return backgrounds.get(el);
   const parts=(style(el).backgroundColor.match(/[\d.]+/g)||[]).map(Number),alpha=parts.length===4?parts[3]:parts.length===3?1:0;
   const rgb=alpha===1?parts.slice(0,3):background(el.parentElement).map((v,i)=>(parts[i]||0)*alpha+v*(1-alpha));backgrounds.set(el,rgb);return rgb;
  };
  const roots=document.querySelector('.slide')?[...document.querySelectorAll('.slide.active,dialog[open],#topnav,#site-login-gate:not(.hidden),#order-hover,#ssa-followup,#cal-detail-modal')]:[document.body];
  const visited=new Set();for(const root of roots){if(!root)continue;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
   while((node=walker.nextNode())){if(!node.textContent.trim())continue;const el=node.parentElement;if(!el||visited.has(el)||el.namespaceURI!=='http://www.w3.org/1999/xhtml'||['SCRIPT','STYLE','NOSCRIPT','OPTION'].includes(el.tagName))continue;visited.add(el);
    const bg=background(el),light=luminance(bg),ink=(light+.05)/.05>1.05/(light+.05)?'#000000':'#ffffff';
    const current=el.style.getPropertyValue('color'),normalized=ink==='#000000'?'rgb(0, 0, 0)':'rgb(255, 255, 255)';if(current!==ink&&current!==normalized||el.style.getPropertyPriority('color')!=='important')changes.push([el,ink]);
   }
  }
  // Read styles first, then write; avoid layout thrashing as tables are rendered.
  for(const[el,ink]of changes){el.style.setProperty('color',ink,'important');el.dataset.premiumContrast='';}
 }
 function schedule(){if(!pending)pending=requestAnimationFrame(contrast);}
 function sendTheme(){const theme=document.documentElement.dataset.theme==='dark'?'dark':'light';for(const f of frames())f.contentWindow?.postMessage({type:'ekwl-presentation-theme',theme},'*');schedule();}
 window.addEventListener('message',e=>{if(e.source!==window.parent||e.source===window||e.origin!==location.origin||e.data?.type!=='ekwl-presentation-theme')return;document.documentElement.dataset.theme=e.data.theme==='dark'?'dark':'light';schedule();});
 window.addEventListener('ekwl-theme-changed',sendTheme);
 window.addEventListener('resize',schedule);
 window.addEventListener('beforeprint',()=>document.querySelectorAll('[data-premium-contrast]').forEach(el=>el.style.setProperty('color','#000000','important')));
 window.addEventListener('afterprint',schedule);
 const init=()=>{for(const f of frames())f.addEventListener('load',sendTheme);new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});sendTheme();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
