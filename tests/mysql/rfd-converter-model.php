<?php
declare(strict_types=1);
require __DIR__.'/../../backend/src/bootstrap.php';
require __DIR__.'/../../backend/src/rfd-converter.php';
function test($ok,$message){if(!$ok)throw new RuntimeException($message);}
function rec($source,$ewo,$color,$n=2){return ['n'=>$n,'v'=>['ewo'=>$ewo,'color'=>$color,'details'=>$source==='rfd'?'Body fabric':null,'construction'=>in_array($source,['rfd','booking'])?'Single Jersey':null,'composition'=>in_array($source,['rfd','booking'])?'100% Cotton':null]];}
$s=[];foreach(['orderbank','booking','rfd','cutting']as $src)$s[$src]=['head'=>['id'=>$src],'status'=>'Complete','rows'=>[rec($src,'271080',$src==='rfd'?'C. Navy':'Carbon Navy'),rec($src,'271444','Black',3),rec($src,'271520','Ivory',4)]];
$context=Ekwl\rcContext($s,[],true);$issues=Ekwl\rcBuild($s,$context);test(count($issues)===1,'Only unmatched EWO shown');test($issues[0]['ewo']==='271080','Unmatched EWO');test($issues[0]['review_sources']===['rfd'],'Do not label exact other sources as mismatched');
$map=['id'=>'map','scope_key'=>Ekwl\rcScope('271080','rfd','C. Navy'),'ewo'=>'271080','source_name'=>'rfd','from_color'=>'C. Navy','to_color'=>'Carbon Navy','is_active'=>1];$mapped=Ekwl\rcContext($s,[$map],true);test(Ekwl\rcBuild($s,$mapped)===[],'Approved scope resolves alias');test($s['rfd']['rows'][0]['v']['color']==='C. Navy','Original source unchanged');
$s['rfd']['rows'][]=rec('rfd','271999','C. Navy',5);$r=Ekwl\rcBuild($s,Ekwl\rcContext($s,[$map],true));test(count($r)===1&&$r[0]['ewo']==='271999','Mapping never crosses EWO');
$x=$s;$x['rfd']['rows'][1]['v']['color']='';$r=Ekwl\rcBuild($x,Ekwl\rcContext($x,[$map],true));test(count($r)===2,'Missing color retained');
$x=$s;$x['booking']['rows'][]=rec('booking','271080','Cream',7);$x['orderbank']['rows'][]=rec('orderbank','271080','Cream',7);$r=Ekwl\rcBuild($x,Ekwl\rcContext($x,[],true));test($r[0]['issue']==='multiple','Ambiguous targets require manual choice');
$x=$s;$x['rfd']['rows'][0]['v']['ewo']='EWO 271080 / 271444';$r=Ekwl\rcBuild($x,Ekwl\rcContext($x,[],true));test(count(array_filter($r,fn($v)=>$v['issue']==='invalid'))===1,'Ambiguous EWO retained separately, never split or guessed');
$x=$s;foreach($x as &$source)$source['rows'][1]['v']['color']='N/A';unset($source);$r=Ekwl\rcBuild($x,Ekwl\rcContext($x,[],true));test(count(array_filter($r,fn($v)=>$v['ewo']==='271444'&&$v['issue']==='invalid'))===1,'Missing color placeholders never become exact matches');
$x=$s;$x['booking']['rows'][0]['v']['color']='C. Navy';$r=Ekwl\rcBuild($x,Ekwl\rcContext($x,[$map],true));test(in_array('booking',$r[0]['review_sources'],true),'A mapping never crosses source scope');
$x=$s;$x['cutting']['rows'][]=['n'=>22,'v'=>['ewo'=>'','color'=>'','details'=>null,'construction'=>null,'composition'=>null,'nonblank'=>true]];$r=Ekwl\rcBuild($x,Ekwl\rcContext($x,[],true));test(count(array_filter($r,fn($v)=>$v['issue']==='invalid'))===1,'Nonblank source row with no identity remains visible');
$x=$s;$x['orderbank']['rows'][0]['v']['color']='Changed';$ctx=Ekwl\rcContext($x,[$map],true);test(!$ctx['entries'][0]['valid']&&count($ctx['effective'])===0,'Removed reference invalidates mapping');
$x=$s;$x['rfd']['rows'][]=rec('rfd','271080','Carbon Navy',8);$r=Ekwl\rcBuild($x,Ekwl\rcContext($x,[],true));test(count($r[0]['records'])===1&&count($r[0]['context'])===5,'Matched references available in review, excluded from unmatched list');
foreach(Ekwl\rcBuild($s,$context) as $issue)foreach($issue['context'] as $row)test(!isset($row['qty'])&&!isset($row['quantity']),'No quantities in identity evidence');
test(Ekwl\rcEwo('EWO-001234 (updated)')==='001234','Leading zeros retained');
echo "PASS source-scoped color identity, complete matches hidden, unmatched-only groups, reference context, missing/ambiguous identities retained and stale mapping blocked\n";

$large=[];foreach(['orderbank','booking','rfd','cutting']as $source){$large[$source]=['head'=>['id'=>$source],'status'=>'Complete','rows'=>[]];for($i=0;$i<250;$i++)for($j=0;$j<20;$j++)$large[$source]['rows'][]=rec($source,(string)(280000+$i),$source==='rfd'?'C. Navy':'Carbon Navy',$i*20+$j+2);}$start=microtime(true);$out=Ekwl\rcBuild($large,Ekwl\rcContext($large,[],true));test(count($out)===250,'Large comparison retains each unmatched EWO');test(count($out[0]['context'][0]['rows'])===20,'Repeated source references retained without quantity joins');echo json_encode(['synthetic_source_rows'=>20000,'unmatched_ewos'=>250,'local_model_seconds'=>round(microtime(true)-$start,3),'peak_memory_bytes'=>memory_get_peak_usage(true)]).PHP_EOL;
