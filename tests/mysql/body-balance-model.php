<?php
declare(strict_types=1);
require __DIR__.'/../../backend/src/bootstrap.php';
require __DIR__.'/../../backend/src/body-fabric-balance.php';
function ok(bool $v,string $why): void {if(!$v)throw new RuntimeException($why);}
function fixture(): array {
 $body=array_fill(0,22,'0');$body[2]='273099';$body[6]='Black';$body[7]=' Body ';$body[8]='Jersey';$body[9]='Cotton';$body[10]='Carhartt';$body[14]='800';$rib=$body;$rib[7]='Rib';$rib[8]='Rib';$rib[14]='9999';
 $main=['273099','MAIN-01','Carhartt','Team','Supplier','Jersey','Cotton','Black','180','72','KG','900',''];$add=$main;$add[1]='ADD-01';$add[11]='100';$add[12]='Additional';$bookRib=$main;$bookRib[1]='RIB';$bookRib[5]='Rib';$bookRib[11]='9000';
 $cut=array_fill(0,25,'0');$cut[0]='02-Nov-26';$cut[3]='273099';$cut[6]='Black';$cut[9]='3000';$old=$cut;$old[0]='01-Nov-26';$old[9]='1000';
 return ['rfd'=>['rows'=>[['n'=>2,'v'=>$body],['n'=>3,'v'=>$rib]]],'booking'=>['rows'=>[['n'=>2,'v'=>$main],['n'=>3,'v'=>$add],['n'=>4,'v'=>$bookRib]]],'cutting'=>['rows'=>[['n'=>2,'v'=>$old],['n'=>3,'v'=>$cut],['n'=>4,'v'=>$cut]]]];
}
$bank=['rows'=>[['n'=>2,'v'=>['ewo'=>'273099','color'=>'Black','order_qty'=>'5000']]]];$s=fixture();$before=$s;$out=Ekwl\bbBuild($s,[],$bank);$r=$out['rows'][0];
ok(count($out['rows'])===1&&count($r)===14,'Literal Body only, 14 named columns');
foreach([5=>'1000',6=>'5000',7=>'0.2',8=>'800',9=>'3000',10=>'600',11=>'200',12=>'1000',13=>'-200']as $column=>$value)ok($r[$column]===$value,'Formula '.$column.' got '.$r[$column]);
ok($r[4]==="MAIN-01\nADD-01",'Real Main/Additional booking references retained');ok($s===$before,'Read-only source calculation');ok($out['evidence'][0]['grain']['rfd_rows']===[2]&&$out['evidence'][0]['grain']['booking_rows']===[2,3],'No Rib in receipt or booking');ok($out['evidence'][0]['cutting_rows']===[3,4],'Latest cumulative cutting once');
$x=$s;$x['rfd']['rows'][0]['v'][14]='400';$m=Ekwl\bbBuild($x,[],$bank);ok($m['rows'][0][11]==='-200'&&$m['rows'][0][12]==='0','Negative balance visible; available pieces clamped');
$x=$s;$x['cutting']['rows']=[];$m=Ekwl\bbBuild($x,[],$bank);ok($m['rows'][0][7]==='0.2'&&$m['rows'][0][11]==='—','Missing cutting is unknown, known consumption retained');
$x=$s;$x['booking']['rows'][0]['v'][11]='';$m=Ekwl\bbBuild($x,[],$bank);ok($m['rows'][0][7]==='—'&&$m['rows'][0][11]==='—','Missing booking cannot become zero');
$x=$s;$x['rfd']['rows'][1]['v'][8]='Jersey';$m=Ekwl\bbBuild($x,[],$bank);ok($m['rows'][0][11]==='—','Body/Rib booking collision requires review');
$x=$s;$x['booking']['rows'][0]['v'][10]='YDS';$x['booking']['rows'][1]['v'][10]='YDS';$m=Ekwl\bbBuild($x,[],$bank);ok(!$m['rows']&&$m['excluded_non_kg']===1,'No inferred KG from non-KG quantities');
$x=$s;$x['rfd']['rows'][0]['v'][14]='0.3';$x['booking']['rows']=[$x['booking']['rows'][0]];$x['booking']['rows'][0]['v'][11]='0.3';$x['cutting']['rows']=[$x['cutting']['rows'][1]];$x['cutting']['rows'][0]['v'][9]='2';$b=$bank;$b['rows'][0]['v']['order_qty']='3';$m=Ekwl\bbBuild($x,[],$b);ok($m['rows'][0][7]==='0.1'&&$m['rows'][0][11]==='0.1'&&$m['rows'][0][12]==='1','Exact decimal capacity, no lost piece');
ok(Ekwl\bbDivide('-1','3')==='-0.33333333'&&Ekwl\bbDivide('2','3')==='0.66666667','Exact signed division with final rounding');
echo "PASS Body booking/consumption, exact used/balance/cuttable/gap, source refs, Main/additional lines, Rib exclusion, missing/negative/non-KG/collision guards\n";
