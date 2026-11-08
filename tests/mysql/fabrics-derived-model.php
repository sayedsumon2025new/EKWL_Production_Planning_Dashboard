<?php
declare(strict_types=1);
require __DIR__.'/../../backend/src/bootstrap.php';
require __DIR__.'/../../backend/src/rfd-fabrics-details.php';
function check($ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
function raw(int $n,array $cells): array {return ['n'=>$n,'v'=>$cells];}
function rfdRow(int $n,string $construction,string $qty): array {$r=array_fill(0,22,'0');$r[2]='000123';$r[6]=' Blue ';$r[7]='Fabric <source>'; $r[8]=$construction;$r[9]='Cotton';$r[10]='Buyer';$r[14]=$qty;$r[17]='1';return raw($n,$r);}
function bookingRow(int $n,string $construction,string $qty,string $unit='kg'): array {return raw($n,['000123','B1','Buyer','Team','Supplier',$construction,'Cotton','Blue','160','60',$unit,$qty,'Additional']);}
function cutRow(int $n,string $date,string $batch,string $unused,string $ready): array {return raw($n,array_merge([$date,'Buyer','Team','000123','Style','Company','Blue','1000','0',$batch==='C2'?'500':$ready],array_fill(0,15,'0')));}
$s=['rfd'=>['rows'=>[rfdRow(2,'Body','400'),rfdRow(3,' body ','100'),rfdRow(4,'Rib','100')]],'booking'=>['rows'=>[bookingRow(2,'Body','400'),bookingRow(3,'Rib','200')]],'cutting'=>['rows'=>[cutRow(2,'01-Nov-26','C1','200','400'),cutRow(3,'01-Nov-26','C1','100','400'),cutRow(4,'02-Nov-26','C2','50','100')]]];
$ops=['routing'=>[Ekwl\fdrPair('000123','Blue')=>['print'=>true,'emb'=>false,'rows'=>[2]]],'sewing'=>[raw(1,['ewo'=>'000123','color'=>'Blue','total_input_qty'=>'100','total_output_qty'=>'80','total_wip_qty'=>'20']),raw(2,['ewo'=>'000123','color'=>'Blue','total_input_qty'=>'100','total_output_qty'=>'70','total_wip_qty'=>'30'])],'embellishment'=>[raw(2,['batch_id'=>'B','EWO No'=>'000123','Color'=>'Blue','Today Print Send Qty'=>'400','Today Print Receive Qty'=>'300','Today EMB Send Qty'=>'0','Today EMB Receive Qty'=>'0'])]];
$bank=['rows'=>[raw(2,['ewo'=>'000123','color'=>'BLUE','order_qty'=>'600']),raw(3,['ewo'=>'000123','color'=>' Blue ','order_qty'=>'400'])]];
function build(array $sources,array $ops): array {global $bank;return Ekwl\fdrBuild($sources,$ops,[],$bank);}
$result=build($s,$ops);check(count($result['rows'])===2,'Grain / join expansion');
foreach($result['rows'] as $row){check(count($row)===31,'31 columns');foreach([14=>'600',15=>'600',16=>'—',17=>'1000',18=>'0.6',19=>'1000',20=>'500',21=>'400',22=>'300',23=>'100',24=>'0',25=>'0',26=>'0',27=>'200',28=>'100',29=>'50'] as $i=>$value)check($row[$i]===$value,'Formula column '.$i.' got '.$row[$i]);check($row[1]==='000123','Leading-zero key');}
check(array_sum(array_map(fn($r)=>(int)$r[6],$result['rows']))===600,'No RFD multiplication');check(array_sum(array_map(fn($r)=>(int)$r[13],$result['rows']))===600,'No Booking multiplication');
$index=Ekwl\fdrDetailIndex($s['rfd']['rows']);$match=Ekwl\fdrDetailMatch($index,['ewo'=>' 000123 ','color'=>'BLUE','construction'=>' body ','composition'=>'cotton']);check($match['value']==='Fabric <source>'&&$match['matched_rows']===2,'Four-key RFD lookup normalizes case and whitespace');
foreach(['ewo','color','construction','composition'] as $field){$g=['ewo'=>'000123','color'=>'Blue','construction'=>'Body','composition'=>'Cotton'];$g[$field]='WRONG';check(Ekwl\fdrDetailMatch($index,$g)['status']==='no_four_key_match','No weaker fallback when '.$field.' differs');}
$x=$s;$x['rfd']['rows'][1]['v'][7]='Second matching fabric detail';$multiple=build($x,$ops);$body=array_values(array_filter($multiple['rows'],fn($row)=>$row[4]==='Body'))[0];check($body[3]==="Fabric <source>\nSecond matching fabric detail",'All matching RFD descriptions are retained');foreach($multiple['rows'] as $i=>$row){foreach($row as $j=>$value)if($j!==3)check($value===$result['rows'][$i][$j],'Fabric text cannot change numeric/source calculations');}
$g=['ewo'=>'000123','color'=>'Blue','construction'=>'Body','composition'=>'Cotton'];$x=$s['rfd']['rows'];foreach($x as &$r)$r['v'][7]='';unset($r);check(Ekwl\fdrDetailMatch(Ekwl\fdrDetailIndex($x),$g)['status']==='source_details_blank','Blank source distinguished from unmatched keys');
$x=$s;foreach($x['cutting']['rows'] as &$v)$v['v'][11]='9999999';unset($v);check(build($x,$ops)['rows']===$result['rows'],'Daily Production Sewing Total is output, never substituted for existing Sewing Input');
$x=$s;$x['cutting']['rows'][]=$x['cutting']['rows'][2];$x['cutting']['rows'][3]['v'][7]='1001';$r=build($x,$ops);check($r['rows'][0][17]==='1000'&&$r['rows'][0][18]==='0.6','Daily Production Order Qty cannot affect Order Bank quantity or consumption');
$x=$s;$x['cutting']['rows'][0]['v'][9]='999999';check(build($x,$ops)['rows']===$result['rows'],'Earlier cumulative totals cannot change the latest snapshot');
$x=$s;$x['booking']['rows'][1]['v'][10]='PCS';$r=build($x,$ops);check($r['rows'][0][14]==='—','Mixed units blocked');
$x=$s;$x['cutting']['rows'][1]['v'][0]='2026-11-01';$r=build($x,$ops);check($r['rows'][0][20]==='500','Equivalent dates do not add cumulative snapshots');
$x=$s;$x['cutting']['rows'][1]['v'][0]='31-Feb-26';$r=build($x,$ops);check($r['rows'][0][20]==='—','Invalid date blocked');
$x=$s;$x['cutting']['rows'][]=$x['cutting']['rows'][2];$x['cutting']['rows'][3]['v'][9]='501';$r=build($x,$ops);check($r['rows'][0][20]==='—','Latest production snapshot conflict blocked');
$x=$ops;$x['embellishment'][0]['v']['Today EMB Send Qty']='50';$x['embellishment'][0]['v']['Today EMB Receive Qty']='20';$r=build($s,$x);check($r['rows'][0][28]==='—','Both process routing unresolved');
$x=$ops;$x['embellishment'][0]['v']['Today Print Receive Qty']='';$r=build($s,$x);check($r['rows'][0][28]==='—','Missing required process receipt not zero');
$x=$ops;$x['routing']=[];$r=build($s,$x);check($r['rows'][0][28]==='—','Process applicability is not guessed from movements');
$x=$ops;$x['routing'][Ekwl\fdrPair('000123','Blue')]=['print'=>false,'emb'=>false,'rows'=>[2]];$x['embellishment']=[];$r=build($s,$x);check($r['rows'][0][28]==='300','Confirmed no-process cutting less sewing');
$x=$ops;$x['embellishment'][0]['v']['Total Print Send Qty']='999999';$x['embellishment'][0]['v']['Total Print Receive Qty']='999999';check(build($s,$x)['rows']===$result['rows'],'Cumulative movement columns are not re-summed');
$x=$ops;$x['sewing']=[];$r=build($s,$x);check($r['rows'][0][27]==='—'&&$r['rows'][0][28]==='—','Missing sewing not zero');
check(Ekwl\fdrText(Ekwl\fdrSum([raw(1,['0.1']),raw(2,['0.2'])],0))==='0.3','Exact decimal sum');check(Ekwl\fdrNumber('1,20')===null,'Malformed grouping rejected');check(Ekwl\fdrText(Ekwl\fdrNumber('1,000.5000'))==='1000.5','Validated grouped decimal');
$many=['rfd'=>['rows'=>[]],'booking'=>['rows'=>[]],'cutting'=>$s['cutting']];for($i=0;$i<2000;$i++){$many['rfd']['rows'][]=rfdRow($i+2,'Part '.$i,'1');$many['booking']['rows'][]=bookingRow($i+2,'Part '.$i,'1');}$start=microtime(true);$large=build($many,$ops);check(count($large['rows'])===2000&&$large['rows'][1999][14]==='2000','Large single-order grains retain exact totals');echo json_encode(['single_order_fabric_rows'=>2000,'model_seconds'=>round(microtime(true)-$start,3)]).PHP_EOL;
echo "PASS Fabrics derived grain, no join multiplication, exact sums, MCD stock, consumption, unique order/batch counts, units, missing data and process routing guards\n";

$originalBank=$bank;
check($result['pairs'][Ekwl\fdrPair('000123','Blue')]['order_bank_order']['rows'][1]['row']===3,'Original Order Bank row evidence');
$bank['rows'][]=raw(4,['ewo'=>'000123','color'=>'RED','order_qty'=>'9999']);check(build($s,$ops)['rows'][0][17]==='1000','Other color must not contribute');
$bank['rows'][]=raw(5,['ewo'=>'999999','color'=>'Blue','order_qty'=>'9999']);check(build($s,$ops)['rows'][0][17]==='1000','Other EWO must not contribute');
foreach(['','bad','-1','1.5'] as $invalid){$bank=$originalBank;$bank['rows'][1]['v']['order_qty']=$invalid;$m=build($s,$ops);foreach([17,18,19] as $column)check($m['rows'][0][$column]==='—','Invalid Order Bank quantity cannot produce partial quantity/ratios');}
$bank=['rows'=>[]];$m=build($s,$ops);check($m['rows'][0][17]==='—'&&$m['rows'][0][18]==='—','No Daily Production fallback when Order Bank missing');
$bank=$originalBank;$x=$s;$x['cutting']['rows']=[];check(build($x,$ops)['rows'][0][17]==='1000','Order Bank qty works without Daily Production');
$bank['rows'][0]['v']['order_qty']='0';$bank['rows'][1]['v']['order_qty']='0';$m=build($s,$ops);check($m['rows'][0][17]==='0'&&$m['rows'][0][18]==='—','Real zero preserved, division by zero unavailable');
echo "PASS Order Bank EWO/Color exact sum, distinct PO components, no cross-color/EWO leakage, strict missing/invalid guards, evidence and no Daily Production fallback\n";

$bank=$originalBank;$x=$s;foreach(['rfd'=>6,'booking'=>7,'cutting'=>6]as $kind=>$col)foreach($x[$kind]['rows']as &$r)$r['v'][$col]='C. Blue';unset($r);
$identity=['effective'=>[]];foreach(['rfd','booking','cutting']as $kind)$identity['effective'][Ekwl\rcScope('000123',$kind,'C. Blue')]=['ewo'=>'000123','to_color'=>'Blue'];
$m=Ekwl\fdrBuild($x,$ops,$identity,$bank);check($m['rows'][0][17]==='1000','Approved source color mapping uses the Order Bank master quantity');
