/* Selected-plan dates and exact SAH/Day totals; no forecast/loss values invented. */
(()=>{
  const planRow=document.getElementById('selected-plan-sah-row');
  if(!planRow)return;
  const period=document.querySelector('.header-text .period');
  const format=value=>Number(value).toLocaleString('en-US',{maximumFractionDigits:2});
  const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const label=date=>Number(date.slice(8))+'-'+monthNames[Number(date.slice(5,7))-1];
  // The supplied report is the October 2026 snapshot. Its static values remain
  // associated with their original dates and are never shifted to another plan.
  const originalYear='2026';
  function numeric(cell){
    let text=cell.textContent.trim().replace(/^[●•]\s*/,'');
    if(!text)return null;
    const negative=/^\(.*\)$/.test(text);
    const value=Number(text.replace(/[(),\s]/g,''));
    return Number.isFinite(value)?(negative?-value:value):null;
  }
  const tables=Array.from(document.querySelectorAll('.content > table')).slice(0,2).map((table,index)=>{
    table.id=index===0?'load-analysis-summary-table':'load-analysis-loss-table';
    const prefix=index===0?1:2;
    const head=table.tHead.rows[table.tHead.rows.length-1];
    const dateKeys=Array.from(head.cells).slice(prefix,-2).map(cell=>{
      const [day,month]=cell.textContent.trim().split('-');
      return originalYear+'-'+String(monthNames.indexOf(month)+1).padStart(2,'0')+'-'+day.padStart(2,'0');
    });
    const rows=Array.from(table.tBodies[0].rows).map(row=>({
      row,leading:Array.from(row.cells).slice(0,prefix).map(c=>c.cloneNode(true)),
      source:new Map(dateKeys.map((date,i)=>[date,row.cells[prefix+i].cloneNode(true)])),
      sample:row.cells[prefix].cloneNode(true),
      trailing:Array.from(row.cells).slice(-2).map(c=>c.cloneNode(true))
    }));
    const wrapper=document.createElement('div');
    wrapper.className='plan-table-scroll';
    wrapper.style.cssText='width:100%;overflow:hidden;';
    table.before(wrapper);wrapper.appendChild(table);
    return {table,wrapper,prefix,head,leading:Array.from(head.cells).slice(0,prefix).map(c=>c.cloneNode(true)),
      trailing:Array.from(head.cells).slice(-2).map(c=>c.cloneNode(true)),rows};
  });
  function setCell(cell,text){
    const strong=cell.querySelector('strong');
    if(strong)strong.textContent=text;else cell.textContent=text;
  }
  function fitTables(){
    for(const view of tables){
      const available=view.wrapper.clientWidth;
      if(!available)continue;
      view.table.style.transform='none';
      view.table.style.width=Math.max(available,view.nativeWidth||0)+'px';
      const scale=Math.min(1,available/view.table.offsetWidth);
      view.table.style.transformOrigin='top left';
      view.table.style.transform='scale('+scale+')';
      view.wrapper.style.height=Math.ceil(view.table.offsetHeight*scale)+'px';
    }
  }
  function render(data){
    const ready=!!data.ready;
    const dates=ready && Array.isArray(data.dates)?data.dates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)):[];
    period.textContent=dates.length?label(dates[0])+' '+dates[0].slice(0,4)+' – '+label(dates[dates.length-1])+' '+dates[dates.length-1].slice(0,4)+' · '+String(data.label||'Selected plan'):'Selected plan · data unavailable or loading';
    for(const view of tables){
      view.head.replaceChildren(...view.leading.map(c=>c.cloneNode(true)));
      for(const date of dates){
        const th=document.createElement('th');th.textContent=label(date);th.title=date;th.dataset.planDate=date;view.head.appendChild(th);
      }
      view.head.append(...view.trailing.map(c=>c.cloneNode(true)));
      if(view.prefix===2)view.table.tHead.rows[0].cells[0].colSpan=dates.length+4;
      view.nativeWidth=Math.max(800,view.prefix*160+dates.length*44+150);
      view.table.style.minWidth=view.nativeWidth+'px';
      for(const template of view.rows){
        const row=template.row,isPlan=row.id==='selected-plan-sah-row';
        row.replaceChildren(...template.leading.map(c=>c.cloneNode(true)));
        let total=0,count=0,matched=0;
        for(const date of dates){
          const source=template.source.get(date);
          const cell=(source||template.sample).cloneNode(true);
          const supplied=isPlan?Object.hasOwn(data.totals||{},date):!!source;
          const value=isPlan?(supplied?Number(data.totals[date]):null):(supplied?numeric(source):null);
          cell.removeAttribute('data-plan-day');cell.dataset.planDate=date;
          if(value==null||!Number.isFinite(value)){
            cell.textContent='—';cell.title=date+' · No '+(isPlan?'SAH/Day':'supplied snapshot')+' source value';
          }else{
            if(isPlan)cell.textContent=format(value);
            cell.title=date+' · '+(isPlan?'Selected-plan SAH/Day total: ':'Supplied snapshot value: ')+format(value);
            total+=value;matched++;if(isPlan?value>0:true)count++;
          }
          row.appendChild(cell);
        }
        const [totalCell,avgCell]=template.trailing.map(c=>c.cloneNode(true));
        const display=value=>value<0?'('+format(Math.abs(value))+')':format(value);
        setCell(totalCell,matched?display(total):'—');
        setCell(avgCell,count?display(total/count):'—');
        totalCell.title='Sum of displayed dates';
        avgCell.title=isPlan?'Displayed total ÷ '+count+' active SAH days (positive SAH)':'Average of '+count+' supplied date values';
        row.append(totalCell,avgCell);
        if(isPlan)row.cells[0].title='SAH/Day · '+String(data.label||'Selected plan');
      }
    }
    fitTables();
  }
  render({ready:false});
  const fitObserver=new ResizeObserver(fitTables);
  tables.forEach(view=>fitObserver.observe(view.wrapper));
  if(document.fonts)document.fonts.ready.then(fitTables);
  window.addEventListener('message',event=>{
    if(event.source!==parent || event.origin!==location.origin || event.data?.type!=='ekwl-load-analysis-plan')return;
    render(event.data);
  });
  if(parent!==window)parent.postMessage({type:'ekwl-load-analysis-ready'},location.origin);
})();

