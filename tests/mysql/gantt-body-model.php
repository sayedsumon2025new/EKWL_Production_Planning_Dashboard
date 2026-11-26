<?php
declare(strict_types=1);
require __DIR__.'/../../backend/src/bootstrap.php';
require __DIR__.'/../../backend/src/gantt-body-cuttable.php';
function check(bool $value,string $reason): void {if(!$value)throw new RuntimeException($reason);}
function receipt(int $row,string $detail,string $construction,string $qty,string $color='Navy'): array {$v=array_fill(0,22,'0');$v[0]='01-Nov-26';$v[2]='271080-FBR';$v[6]=$color;$v[7]=$detail;$v[8]=$construction;$v[9]='Cotton';$v[14]=$qty;return ['n'=>$row,'v'=>$v];}
function booking(int $row,string $construction,string $qty): array {return ['n'=>$row,'v'=>['271080','B'.$row,'Buyer','Team','Supplier',$construction,'Cotton','Navy','180','72','KG',$qty,'']];}
function cutting(int $row,string $date,string $total): array {$v=array_fill(0,25,'0');$v[0]=$date;$v[3]='271080';$v[6]='Navy';$v[8]='999';$v[9]=$total;return ['n'=>$row,'v'=>$v];}
function fixture(): array {return ['rfd'=>['rows'=>[receipt(2,' Body ','Single Jersey','600'),receipt(3,'BODY','Single Jersey','400'),receipt(4,'Rib','Rib','9000')]],'booking'=>['rows'=>[booking(2,'Single Jersey','1000'),booking(3,'Rib','9000')]],'cutting'=>['rows'=>[cutting(2,'01-Nov-26','1000'),cutting(3,'02-Nov-26','3000'),cutting(4,'02-Nov-26','3000')]]];}
$bank=['rows'=>[['n'=>2,'v'=>['ewo'=>'271080','color'=>'Navy','order_qty'=>'5000']]]];
$s=fixture();$before=$s;$m=Ekwl\gcBuild($s,[],$bank);$r=$m['rows'][0];
check($r['cuttable']===2000,'1000 KG / 0.2 KG per piece − 3000 cutting = 2000');
check($r['body_consumption']==='0.2'&&$r['body_capacity']===5000,'Only Body booking / current Order Bank quantity supplies consumption');
check($r['body_received']==='1000'&&$r['body_booking']==='1000','Rib receipt/booking excluded');
check($r['total_cut']==='3000'&&$r['cutting_date']==='2026-11-02','Latest cumulative total once, never sum Total or Cutting Today');
check($r['evidence']['rfd_rows']===[2,3]&&$r['evidence']['booking_rows']===[2]&&$r['evidence']['cutting_rows']===[3,4],'Exact source provenance');check($s===$before,'Original sources immutable');
$s=fixture();$s['rfd']['rows'][0]['v'][14]='0';$s['rfd']['rows'][1]['v'][14]='0';check(Ekwl\gcBuild($s,[],$bank)['rows'][0]['cuttable']===-3000,'Signed overcut visible, actual zero receipts are valid');
$s=fixture();$s['rfd']['rows'][0]['v'][14]='0.1';$s['rfd']['rows'][1]['v'][14]='0.2';$s['booking']['rows'][0]['v'][11]='0.3';check(Ekwl\gcBuild($s,[],$bank)['rows'][0]['cuttable']===2000,'Exact decimal boundary must not lose a piece');
$s=fixture();$s['rfd']['rows'][0]['v'][14]='600.1';check(Ekwl\gcBuild($s,[],$bank)['rows'][0]['cuttable']===2000,'Fractional pieces are floored');
foreach(['blank receipt','negative receipt','mixed specification','missing booking','conflicting total','bad date','missing order','zero booking','Body/Rib collision','ambiguous booking'] as $case){$s=fixture();$b=$bank;
 switch($case){case 'blank receipt':$s['rfd']['rows'][0]['v'][14]='';break;case 'negative receipt':$s['rfd']['rows'][0]['v'][14]='-1';break;case 'mixed specification':$s['rfd']['rows'][1]['v'][8]='Interlock';break;case 'missing booking':$s['booking']['rows']=[];break;case 'conflicting total':$s['cutting']['rows'][2]['v'][9]='3001';break;case 'bad date':$s['cutting']['rows'][0]['v'][0]='wrong';break;case 'missing order':$b=[];break;case 'zero booking':$s['booking']['rows'][0]['v'][11]='0';break;case 'Body/Rib collision':$s['rfd']['rows'][2]['v'][8]='Single Jersey';break;case 'ambiguous booking':$x=booking(4,'Single Jersey','500');$x['v'][8]='200';$s['booking']['rows'][]=$x;break;}
 $r=Ekwl\gcBuild($s,[],$b)['rows'][0];check($r['cuttable']===null&&count($r['reasons'])>0,$case.' remains unavailable');
}
$s=fixture();$s['rfd']['rows'][0]['v'][6]=$s['rfd']['rows'][1]['v'][6]='C. Navy';$key=Ekwl\rcScope('271080','rfd','C. Navy','Body');$identity=['effective'=>[$key=>['to_color'=>'Navy','fabric_details'=>'Body']],'scoped_present'=>[$key=>true]];
check(Ekwl\gcBuild($s,$identity,$bank)['rows'][0]['cuttable']===2000,'Approved Body-only color mapping applied');
$s=fixture();$s['rfd']['rows']=[$s['rfd']['rows'][2]];check(Ekwl\gcBuild($s,[],$bank)['rows']===[],'No Body receipt never falls back to Rib');
check(Ekwl\gcCapacity(100000000,300000000,500000000)===1,'Exact integer division floor');
echo "PASS Body-only received/consumption minus latest cutting, exact whole pieces, Rib exclusion, source refs, mapped colors and missing/conflicting/negative guards\n";
