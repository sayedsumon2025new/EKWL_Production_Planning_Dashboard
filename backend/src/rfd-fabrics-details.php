<?php
declare(strict_types=1);
namespace Ekwl;
require_once __DIR__.'/rfd.php';
require_once __DIR__.'/rfd-color-identity.php';
require_once __DIR__.'/rfd-booking.php';
require_once __DIR__.'/rfd-daily-cutting.php';
function fdrHeaders(): array {return ["Buyer", "EWO No", "Color", "Fabric Details", "Fabric Construction", "Fabric Composition", "Net Delivery Qty Kg.", "Net Delivery Qty Pcs", "Net Delivery Qty Yds", "Total Roll", "GSM/Height", "Width", "UOM", "Booking Qty.", "Total Booking", "Total Fabrics From Textile Receive", "MCD Live  Stock", "Total Order Qty", "Consumption", "Cut able From Textile Receive", "Total Cutting", "Total Print Send", "Total Print Receive", "Print WIP", "Total Embroidery Send", "Total Embroidery Receive", "Embroidery WIP", "Sewing Input", "Cutting WIP", "Sewing WIP", "Reason for\n Additional \nBooking"];}
function fdrNorm($v): string {return strtoupper(preg_replace('/\s+/u',' ',trim((string)$v)));}
function fdrPair($e,$c): string {return json_encode([rcEwo($e),fdrNorm($c)],JSON_THROW_ON_ERROR);}
function fdrUnit($u): string {$u=fdrNorm($u);return match($u){'KG','KGS','KILOGRAM'=>'KG','PCS','PC','PIECES','PIECE'=>'PCS','YDS','YD','YARD','YARDS'=>'YDS',default=>$u};}
function fdrDate(string $value): ?string {$value=trim($value);foreach(['Y-m-d','d-M-y','j-M-y','d-M-Y','j-M-Y','d/m/Y','j/n/Y','d/m/y','j/n/y','d-m-Y','j-n-Y','d-m-y','j-n-y'] as $format){$d=\DateTimeImmutable::createFromFormat('!'.$format,$value,new \DateTimeZone('UTC'));$errors=\DateTimeImmutable::getLastErrors();if($d&&(!$errors||(!$errors['warning_count']&&!$errors['error_count']))&&strtolower($d->format($format))===strtolower($value))return $d->format('Y-m-d');}return null;}
function fdrNumber($value): ?int {
 if($value===null||trim((string)$value)==='')return null;$s=trim((string)$value);
 if(!preg_match('/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?$/D',$s))return null;
 $s=str_replace(',','',$s);$neg=str_starts_with($s,'-');$s=ltrim($s,'+-');[$a,$b]=array_pad(explode('.',$s,2),2,'');$digits=ltrim($a.str_pad($b,8,'0'),'0')?:'0';
 if(strlen($digits)>18)return null;return ($neg?-1:1)*(int)$digits;
}
function fdrText(?int $n): string {if($n===null)return '—';$neg=$n<0;$n=abs($n);$s=(string)intdiv($n,100000000);$f=rtrim(str_pad((string)($n%100000000),8,'0',STR_PAD_LEFT),'0');return ($neg?'-':'').$s.($f!==''?'.'.$f:'');}
function fdrSum(array $rows,int|string $column): ?int {
 if(!$rows)return null;$sum=0;foreach($rows as $r){$n=fdrNumber($r['v'][$column]??null);if($n===null||($n>0&&$sum>PHP_INT_MAX-$n)||($n<0&&$sum<PHP_INT_MIN-$n))return null;$sum+=$n;}return $sum;
}
function fdrUnique(array $rows,int|string $col): string {$v=[];foreach($rows as $r){$s=trim((string)($r['v'][$col]??''));if($s!=='')$v[fdrNorm($s)]=$s;}return count($v)===1?(string)array_values($v)[0]:'—';}
/** Fabric Details is sourced only from RFD on all four identifying keys. */
function fdrDetailIndex(array $rows,array $identity=[]): array {
 $index=['ewo'=>[],'color'=>[],'construction'=>[],'full'=>[]];
 foreach($rows as $r){$v=$r['v'];if(trim($v[2])===''||trim($v[6])==='')continue;$key=[rcEwo($v[2]),fdrNorm(rcColorLabel($identity,'rfd',$v[2],$v[6])),fdrNorm($v[8]),fdrNorm($v[9])];
  foreach(['ewo'=>1,'color'=>2,'construction'=>3]as $level=>$length){$prefix=json_encode(array_slice($key,0,$length),JSON_THROW_ON_ERROR);$index[$level][$prefix]=($index[$level][$prefix]??0)+1;}
  $full=json_encode($key,JSON_THROW_ON_ERROR);$index['full'][$full]??=['rows'=>0,'values'=>[]];$index['full'][$full]['rows']++;$text=trim($v[7]);if($text!==''&&!isset($index['full'][$full]['values'][fdrNorm($text)]))$index['full'][$full]['values'][fdrNorm($text)]=$text;
 }return $index;
}
function fdrDetailMatch(array $index,array $g): array {
 $key=[rcEwo($g['ewo']),fdrNorm($g['color']),fdrNorm($g['construction']),fdrNorm($g['composition'])];$full=$index['full'][json_encode($key,JSON_THROW_ON_ERROR)]??['rows'=>0,'values'=>[]];$counts=[];
 foreach(['ewo'=>1,'color'=>2,'construction'=>3]as $level=>$length)$counts[$level]=$index[$level][json_encode(array_slice($key,0,$length),JSON_THROW_ON_ERROR)]??0;$counts['all_four']=$full['rows'];$values=array_values($full['values']);
 return ['value'=>$values?implode("\n",$values):'—','key'=>array_combine(['EWO','Color','Fabric Construction','Fabric Composition'],$key),'matched_rows'=>$full['rows'],'distinct_details'=>count($values),'candidate_rows'=>$counts,'status'=>!$full['rows']?'no_four_key_match':(!$values?'source_details_blank':'matched')];
}
function fdrUniqueNumber(array $rows,int|string $col): ?int {$values=[];foreach($rows as $r){$n=fdrNumber($r['v'][$col]??null);if($n===null)return null;$values[(string)$n]=$n;}return count($values)===1?array_values($values)[0]:null;}
/** A cumulative production report is a dated snapshot, not additive daily batches. */
function fdrProductionSnapshot(array $rows): array {
 $latest=null;$selected=[];$invalid=false;
 foreach($rows as $r){$date=fdrDate($r['v'][0]);if($date===null){$invalid=true;continue;}if($latest===null||$date>$latest){$latest=$date;$selected=[$r];}elseif($date===$latest)$selected[]=$r;}
 return ['date'=>$latest,'rows'=>$selected,'order'=>$invalid?null:fdrUniqueNumber($selected,7),'cutting'=>$invalid?null:fdrUniqueNumber($selected,9),'invalid_date'=>$invalid];
}
function fdrRatio(?int $a,?int $b): string {return $a===null||$b===null||$b<=0?'—':rtrim(rtrim(number_format($a/$b,8,'.',''),'0'),'.');}
function fdrRefs(array $rows): array {return array_column($rows,'n');}
function fdrRawSource(string $kind,?callable $project=null): array {
 $tables=['rfd'=>['ekwl_rfd_uploads','ekwl_rfd_rows',rfdHeaders()],'booking'=>['ekwl_rfd_booking_uploads','ekwl_rfd_booking_rows',bookingHeaders()],'cutting'=>['ekwl_rfd_daily_production_uploads','ekwl_rfd_daily_production_rows',dcsHeaders()]];
 [$head,$rows,$headers]=$tables[$kind];$installed=(int)run('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (?,?)',[$head,$rows])->fetchColumn();
 if($installed!==2)return ['head'=>null,'rows'=>[],'status'=>'Not uploaded'];
 $heads=run("SELECT id,file_name,file_sha256,expected_rows,received_rows,source_columns,completed_at FROM $head WHERE is_active=1 AND state='complete' ORDER BY completed_at DESC,id DESC LIMIT 2")->fetchAll();
 if(count($heads)>1)throw new ApiError('Ambiguous '.$kind.' source report.',409);if(!$heads)return ['head'=>null,'rows'=>[],'status'=>'Not uploaded'];$h=$heads[0];
 if(json_decode($h['source_columns'],true,32,JSON_THROW_ON_ERROR)!==$headers||(int)$h['expected_rows']!==(int)$h['received_rows'])throw new ApiError('Source metadata failed verification: '.$kind,409);
 $out=[];$cursor=run("SELECT source_row_no,cells FROM $rows WHERE batch_id=? ORDER BY source_row_no",[$h['id']]);$i=2;
 while($r=$cursor->fetch()){if((int)$r['source_row_no']!==$i++)throw new ApiError('Incomplete source row sequence: '.$kind,409);$cells=json_decode($r['cells'],true,32,JSON_THROW_ON_ERROR);if(!is_array($cells)||!array_is_list($cells)||count($cells)!==count($headers))throw new ApiError('Source column count changed: '.$kind,409);foreach($cells as $c)if(!is_string($c))throw new ApiError('Source cell type changed.',409);$out[]=['n'=>(int)$r['source_row_no'],'v'=>$project?$project($cells):$cells];}
 if(count($out)!==(int)$h['expected_rows'])throw new ApiError('Source row count changed: '.$kind,409);unset($h['source_columns']);return ['head'=>$h,'rows'=>$out,'status'=>'Complete'];
}
function fdrOperationalSources(): array {
 // Only active public report heads/rows are used; staged owner rows are excluded.
 $sewing=run("SELECT id,ewo,color,total_input_qty,total_output_qty,total_wip_qty,total_reject_qty,source_row,report_batch_id FROM ekwl_sewing_input_output WHERE report_batch_id IN (SELECT batch_id FROM ekwl_report_heads WHERE kind='sewing' AND scope='all') OR (report_batch_id IS NULL AND (NOT EXISTS(SELECT 1 FROM ekwl_report_heads WHERE kind='sewing' AND scope='all') OR EXISTS(SELECT 1 FROM ekwl_report_heads WHERE kind='sewing' AND scope='all' AND batch_id='legacy'))) ORDER BY id")->fetchAll();
 $c=catalog()['embellishment_send_receive_rows'];$emb=[];foreach(run('SELECT * FROM ekwl_embellishment_send_receive_rows WHERE is_active=1 ORDER BY batch_id,source_row_no')->fetchAll() as $r){$r=hydrate($r,$c);$values=[];foreach($r as $k=>$v)$values[trim(preg_replace('/\s+/u',' ',$k))]=$v;$emb[]=['n'=>(int)$r['source_row_no'],'v'=>$values];}
 $batches=[];foreach($emb as $r){$d=trim((string)($r['v']['Date']??''));$b=(string)$r['v']['batch_id'];if(isset($batches[$d])&&$batches[$d]!==$b)throw new ApiError('Multiple active embellishment batches for the same source date.',409);$batches[$d]=$b;}
 $plan=run("SELECT id,revision,file_name FROM ekwl_plan_uploads WHERE status='complete' ORDER BY uploaded_at DESC,id DESC LIMIT 1")->fetch();$routing=[];if($plan){foreach(run("SELECT source_row,ewo,col,`print`,emb FROM ekwl_plan_records WHERE upload_id=? AND is_summary_row=0 AND criteria='Plan/Day' ORDER BY source_row",[$plan['id']])->fetchAll() as $r){$key=fdrPair($r['ewo'],$r['col']);$routing[$key]['rows'][]=(int)$r['source_row'];foreach(['print','emb'] as $field){if($r[$field]===null)$flag='unknown';else $flag=in_array(strtolower(trim($r[$field])),['','no','n','0','false','n/a','na','none','-','—'],true)?'no':'yes';$routing[$key][$field][$flag]=true;}}foreach($routing as &$route){foreach(['print','emb'] as $field)$route[$field]=count($route[$field])===1&&!isset($route[$field]['unknown'])?isset($route[$field]['yes']):null;}unset($route);}
 return ['routing'=>$routing,'routing_plan'=>$plan?:null,'sewing'=>array_map(fn($r)=>['n'=>(int)$r['id'],'v'=>$r],$sewing),'embellishment'=>$emb,'sewing_heads'=>run("SELECT kind,scope,batch_id FROM ekwl_report_heads WHERE kind='sewing' ORDER BY scope")->fetchAll()];
}
function fdrPrepare(): void {
 run("CREATE TABLE IF NOT EXISTS ekwl_rfd_fabrics_details_reports (id CHAR(36) CHARACTER SET ascii PRIMARY KEY,dependency_digest CHAR(64) CHARACTER SET ascii NOT NULL UNIQUE,model_version VARCHAR(32) NOT NULL,generated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),row_count INT UNSIGNED NOT NULL,sources LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
 run("CREATE TABLE IF NOT EXISTS ekwl_rfd_fabrics_details_rows (report_id CHAR(36) CHARACTER SET ascii NOT NULL,row_no INT UNSIGNED NOT NULL,cells LONGTEXT NOT NULL,evidence LONGTEXT NOT NULL,PRIMARY KEY(report_id,row_no),FOREIGN KEY(report_id) REFERENCES ekwl_rfd_fabrics_details_reports(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
}
function fdrBuild(array $sources,array $ops,array $identity=[]): array {
 $detailIndex=fdrDetailIndex($sources['rfd']['rows'],$identity);$pairs=[];$groups=[];$blank=[];$bad=[];
 foreach(['rfd'=>[2,6,8,9],'booking'=>[0,7,5,6],'cutting'=>[3,6,null,null]] as $kind=>$cols){foreach($sources[$kind]['rows'] as $r){$v=$r['v'];if(!array_filter($v,fn($v)=>trim($v)!=='')){$blank[$kind][]= $r['n'];continue;}if(trim($v[$cols[0]])===''||trim($v[$cols[1]])===''){$bad[$kind][]=$r['n'];continue;}$color=rcColorLabel($identity,$kind,$v[$cols[0]],$v[$cols[1]]);$pair=fdrPair($v[$cols[0]],$color);$pairs[$pair][$kind][]=$r;
  if($kind!=='cutting'){$construction=trim($v[$cols[2]]);$composition=trim($v[$cols[3]]);$key=json_encode([$pair,fdrNorm($construction),fdrNorm($composition)],JSON_THROW_ON_ERROR);$groups[$key]??=['pair'=>$pair,'ewo'=>$v[$cols[0]],'color'=>$color,'construction'=>$construction,'composition'=>$composition,'rfd'=>[],'booking'=>[]];$groups[$key][$kind][]=$r;}
 }}
 foreach($ops['sewing'] as $r){$key=fdrPair($r['v']['ewo'],$r['v']['color']);$pairs[$key]['sewing'][]=$r;}
 foreach($ops['embellishment'] as $r){$key=fdrPair($r['v']['EWO No']??'',$r['v']['Color']??'');$pairs[$key]['embellishment'][]=$r;}
 // A cutting-only pair remains visible, with its fabric identity explicitly unknown.
 $known=array_fill_keys(array_column($groups,'pair'),true);foreach($pairs as $pair=>$p)if(!isset($known[$pair])&&isset($p['cutting'])){[$ewo,$color]=json_decode($pair,true);$groups[$pair]=['pair'=>$pair,'ewo'=>$ewo,'color'=>$color,'construction'=>'','composition'=>'','rfd'=>[],'booking'=>[]];}
 ksort($groups,SORT_STRING);$rows=[];$proof=[];$pairProof=[];$metrics=[];
 foreach($groups as $g){$pair=$g['pair'];$p=$pairs[$pair];$r=$g['rfd'];$b=$g['booking'];$allR=$p['rfd']??[];$allB=$p['booking']??[];$cut=$p['cutting']??[];$sew=$p['sewing']??[];$emb=$p['embellishment']??[];$warnings=[];
  $unitRaw=fdrUnique($b,10);$unit=$unitRaw==='—'?'':fdrUnit($unitRaw);$metricKey=json_encode([$pair,$unit]);if(!isset($metrics[$metricKey])){$allUnits=[];foreach($allB as $x)$allUnits[fdrUnit($x['v'][10])]=true;$sameUnit=count($allUnits)===1&&!isset($allUnits[''])&&isset($allUnits[$unit]);
  $totalBooking=$sameUnit?fdrSum($allB,11):null;$production=fdrProductionSnapshot($cut);$order=$production['order'];
  $receiptColumn=['KG'=>14,'PCS'=>15,'YDS'=>16][$unit]??null;$receive=$sameUnit&&$receiptColumn!==null?fdrSum($allR,$receiptColumn):null;$mcd=null;$warnings['16']='MCD stock formula is pending. Received for Cutting is excluded from all calculations by instruction.';$consumption=fdrRatio($totalBooking,$order);$cutable=$receive!==null&&$totalBooking!==null&&$order!==null&&$totalBooking>0&&$order>0?rtrim(rtrim(number_format(($receive/$totalBooking)*($order/100000000),8,'.',''),'0'),'.'):'—';
  $totalCut=$production['cutting'];$cutInvalid=$cut&&$totalCut===null;
  $dailyNames=['Today Print Send Qty','Today Print Receive Qty','Today EMB Send Qty','Today EMB Receive Qty'];$movement=[];foreach($dailyNames as $name)$movement[]=fdrSum($emb,$name);[$ps,$pr,$es,$er]=$movement;
  $input=fdrSum($sew,'total_input_qty');$output=fdrSum($sew,'total_output_qty');$sw=fdrSum($sew,'total_wip_qty');$print=$ps!==null&&$pr!==null?$ps-$pr:null;$embWip=$es!==null&&$er!==null?$es-$er:null;
  $route=$ops['routing'][$pair]??null;$hasPrint=$route['print']??null;$hasEmb=$route['emb']??null;$cw=null;
  if($hasPrint===null||$hasEmb===null)$warnings['28']='No unambiguous process applicability in the latest complete plan; zero movements do not prove no process.';elseif($hasPrint&&$hasEmb)$warnings['28']='Print and Embroidery both apply; final process routing must be confirmed.';elseif((!$hasPrint&&(($ps??0)!==0||($pr??0)!==0))||(!$hasEmb&&(($es??0)!==0||($er??0)!==0)))$warnings['28']='Planning process flags conflict with embellishment movements.';elseif($input===null)$warnings['28']='No complete matching Sewing Input quantity.';else{$base=$hasPrint?$pr:($hasEmb?$er:$totalCut);if($base!==null)$cw=$base-$input;}
  if($cw!==null&&$cw<0)$warnings['28']='Sewing Input exceeds the upstream received/cut quantity; check source dates and quantities.';
  if($print!==null&&$print<0)$warnings['23']='Print Receive exceeds Send; check source quantities and report dates.';if($embWip!==null&&$embWip<0)$warnings['26']='Embroidery Receive exceeds Send; check source quantities and report dates.';
  if($order===null)$warnings['17']='Daily Production latest-date Order Qty is missing, conflicts, or has an unrecognized source date; cumulative quantities are never summed across dates.';
  if(!$sameUnit)$warnings['14']='Booking units are missing or mixed; quantities in KG, PCS and YDS are not added together.';
  if($cutInvalid)$warnings['20']='Latest-date Daily Production Cutting Total is missing/conflicting, or a source date is invalid. Earlier cumulative totals are never summed or used as a fallback.';
  $metrics[$metricKey]=compact('sameUnit','totalBooking','order','receive','mcd','consumption','cutable','totalCut','ps','pr','es','er','input','output','sw','print','embWip','cw','production','warnings');}extract($metrics[$metricKey],EXTR_OVERWRITE);$booking=$unit!==''?fdrSum($b,11):null;
  $detailMatch=fdrDetailMatch($detailIndex,$g);if($detailMatch['status']==='no_four_key_match')$warnings['3']='No RFD row matches all four keys: EWO + Color + Fabric Construction + Fabric Composition. Click for key values and candidate counts.';elseif($detailMatch['status']==='source_details_blank')$warnings['3']='The four keys match RFD, but its Fabric Details source cells are blank.';
  $buyerValues=array_merge(array_map(fn($x)=>['v'=>[0=>$x['v'][10]]],$r),array_map(fn($x)=>['v'=>[0=>$x['v'][2]]],$b),array_map(fn($x)=>['v'=>[0=>$x['v'][1]]],$cut));
  $remarks=[];foreach($b as $x)if(trim($x['v'][12])!=='')$remarks[$x['v'][12]]=true;
  $row=[fdrUnique($buyerValues,0),$g['ewo'],$g['color'],$detailMatch['value'],$g['construction']?:'—',$g['composition']?:'—',fdrText(fdrSum($r,14)),fdrText(fdrSum($r,15)),fdrText(fdrSum($r,16)),fdrText(fdrSum($r,17)),fdrUnique($b,8),fdrUnique($b,9),$unit?:'—',fdrText($booking),fdrText($totalBooking),fdrText($receive),fdrText($mcd),fdrText($order),$consumption,$cutable,fdrText($totalCut),fdrText($ps),fdrText($pr),fdrText($print),fdrText($es),fdrText($er),fdrText($embWip),fdrText($input),fdrText($cw),fdrText($sw),$remarks?implode("\n",array_keys($remarks)):'—'];
  foreach($row as $j=>$v)if($v==='—'&&!isset($warnings[(string)$j]))$warnings[(string)$j]='No unique, complete matching source value, valid unit or denominator. Missing/conflicting evidence is not treated as zero.';
  if($sw!==null&&$input!==null&&$output!==null&&$sw!==$input-$output)$warnings['29']='Reported Sewing WIP differs from Input − Output; the reported WIP is retained.';
  $rows[]=$row;$proof[]=['pair'=>$pair,'fabric_details_match'=>array_diff_key($detailMatch,['value'=>true]),'grain'=>['rfd_rows'=>fdrRefs($r),'booking_rows'=>fdrRefs($b)],'issues'=>$warnings,'color_mappings'=>array_values(array_filter($identity['effective']??[],fn($m)=>$m['ewo']===rcEwo($g['ewo'])&&fdrNorm($m['to_color'])===fdrNorm($g['color'])))];
  if(!isset($pairProof[$pair]))$pairProof[$pair]=['planning_routing'=>$ops['routing'][$pair]??null,'rfd_rows'=>fdrRefs($allR),'booking_rows'=>fdrRefs($allB),'cutting_rows'=>fdrRefs($cut),'latest_production_date'=>$production['date'],'latest_production_rows'=>fdrRefs($production['rows']),'sewing_ids'=>fdrRefs($sew),'embellishment_rows'=>array_map(fn($x)=>['batch_id'=>$x['v']['batch_id'],'row'=>$x['n']],$emb)];
 }
 return ['rows'=>$rows,'evidence'=>$proof,'pairs'=>$pairProof,'excluded'=>['blank_rows'=>$blank,'missing_ewo_color_rows'=>$bad]];
}
function fdrAction(array $u,array $b): array {
 requirePermission($u,'slide_22');$action=$b['action']??'read';if(!in_array($action,['read','refresh'],true))throw new ApiError('This is an automatic report; CSV uploads are not accepted.');
 $save=$action==='refresh';if($save){requirePermission($u,'admin');if(config()['maintenance']??false)throw new ApiError('Writes paused for maintenance.',503);fdrPrepare();}
 $pdo=db();$pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$pdo->beginTransaction();
 try{if($save)snapshotLock();$sources=[];foreach(['rfd','booking','cutting'] as $kind)$sources[$kind]=fdrRawSource($kind);$ops=fdrOperationalSources();$stored=rcStoredMappings();$bank=$stored?rcOrderBank():['head'=>null,'rows'=>[],'status'=>'Not consulted (no active mappings)'];$identity=rcContext($sources+['orderbank'=>$bank],$stored);$model='fabrics-derived-v4';
  $digest=hash('sha256',json_encode([$model,$sources,$ops,$bank['head'],$bank['status'],$identity['entries']],JSON_THROW_ON_ERROR));$built=fdrBuild($sources,$ops,$identity);$meta=[];foreach($sources as $k=>$s)$meta[$k]=['status'=>$s['status'],'head'=>$s['head'],'rows'=>count($s['rows'])];foreach(['rfd'=>0,'cutting'=>0] as $kind=>$dateColumn){$dates=[];$invalid=0;foreach($sources[$kind]['rows'] as $r){if(!array_filter($r['v'],fn($v)=>trim($v)!==''))continue;$date=fdrDate($r['v'][$dateColumn]);if($date===null)$invalid++;else $dates[]=$date;}$meta[$kind]['date_coverage']=['from'=>$dates?min($dates):null,'to'=>$dates?max($dates):null,'unrecognized_dates'=>$invalid];}$meta['color_mappings']=['rows'=>count($identity['effective']),'status'=>'Approved mappings only','revision_digest'=>hash('sha256',json_encode($identity['entries'],JSON_THROW_ON_ERROR))];$meta['orderbank']=['head'=>$bank['head'],'rows'=>count($bank['rows']),'status'=>$bank['status']];$meta['routing_plan']=['head'=>$ops['routing_plan'],'rows'=>count($ops['routing'])];$meta['sewing']=['heads'=>$ops['sewing_heads'],'rows'=>count($ops['sewing'])];$meta['embellishment']=['rows'=>count($ops['embellishment'])];
  $id=$digest;$materialized=false;
  if($save){$existing=run('SELECT id,row_count FROM ekwl_rfd_fabrics_details_reports WHERE dependency_digest=?',[$digest])->fetch();if($existing){$id=$existing['id'];if((int)$existing['row_count']!==count($built['rows'])||(int)run('SELECT COUNT(*) FROM ekwl_rfd_fabrics_details_rows WHERE report_id=?',[$id])->fetchColumn()!==count($built['rows']))throw new ApiError('Materialized report count failed verification.',409);foreach(run('SELECT row_no,cells,evidence FROM ekwl_rfd_fabrics_details_rows WHERE report_id=? ORDER BY row_no',[$id])->fetchAll() as $i=>$stored){if((int)$stored['row_no']!==$i+1||json_decode($stored['cells'],true,64,JSON_THROW_ON_ERROR)!==$built['rows'][$i]||json_decode($stored['evidence'],true,64,JSON_THROW_ON_ERROR)!==$built['evidence'][$i])throw new ApiError('Materialized cells differ from current source calculations.',409);}}else{$id=uuid();run('INSERT INTO ekwl_rfd_fabrics_details_reports (id,dependency_digest,model_version,row_count,sources) VALUES (?,?,?,?,?)',[$id,$digest,$model,count($built['rows']),json_encode($meta,JSON_THROW_ON_ERROR)]);$args=[];$marks=[];$bytes=0;foreach($built['rows'] as $i=>$row){$cells=json_encode($row,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);$proof=json_encode($built['evidence'][$i],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);$size=strlen($cells)+strlen($proof);if($marks&&(count($marks)>=200||$bytes+$size>1048576)){run('INSERT INTO ekwl_rfd_fabrics_details_rows (report_id,row_no,cells,evidence) VALUES '.implode(',',$marks),$args);$args=[];$marks=[];$bytes=0;}$marks[]='(?,?,?,?)';array_push($args,$id,$i+1,$cells,$proof);$bytes+=$size;}if($marks)run('INSERT INTO ekwl_rfd_fabrics_details_rows (report_id,row_no,cells,evidence) VALUES '.implode(',',$marks),$args);audit('fabrics-details.calculate',$id,['rows'=>count($built['rows']),'dependency_digest'=>$digest]);}$materialized=true;}
  $pdo->commit();return ['headers'=>fdrHeaders()]+$built+['sources'=>$meta,'report'=>['id'=>$id,'dependency_digest'=>$digest,'model_version'=>$model,'materialized'=>$materialized,'generated_at'=>gmdate('Y-m-d H:i:s')],'integrity'=>['complete'=>true,'row_count'=>count($built['rows']),'dependency_digest'=>$digest]];
 }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
