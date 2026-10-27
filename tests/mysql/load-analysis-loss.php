<?php
declare(strict_types=1);
namespace Ekwl;
class ApiError extends \RuntimeException {public function __construct(string $m,public int $status=400){parent::__construct($m);}}
require __DIR__.'/../../backend/src/load-analysis-loss.php';
function equal($a,$b):void{if($a!==$b)throw new \RuntimeException('Assertion failed: '.json_encode([$a,$b]));}
$root=sys_get_temp_dir().'/ekwl-loss-test-'.bin2hex(random_bytes(5));mkdir($root,0700);
try{
 $key='["2026-10-25",1,"272718"]';$body=['action'=>'save','key'=>$key,'reason'=>'fabric','note'=>'Confirmed by operator'];
 $saved=lossCorrectionStore($root,'owner-a','plan-a',$body);equal($saved['overrides']->{$key}['reason'],'fabric');
 equal((array)lossCorrectionStore($root,'owner-b','plan-a',['action'=>'list'])['overrides'],[]);
 equal((array)lossCorrectionStore($root,'owner-a','plan-b',['action'=>'list'])['overrides'],[]);
 equal(lossCorrectionStore($root,'owner-a','plan-a',['action'=>'list'])['overrides']->{$key}['note'],'Confirmed by operator');
 $body['reason']='wash';lossCorrectionStore($root,'owner-a','plan-a',$body);equal(count((array)lossCorrectionStore($root,'owner-a','plan-a',['action'=>'list'])['overrides']),1);
 foreach([['key'=>'["2026-02-30",1,"272718"]'],['key'=>'["2026-10-25",46,"272718"]'],['key'=>'["2026-10-25","1","272718"]'],['reason'=>'planning'],['reason'=>'print'],['reason'=>'emb'],['note'=>''],['reason'=>['print']]] as $bad){$thrown=false;try{lossCorrectionStore($root,'owner-a','plan-a',array_replace($body,$bad));}catch(ApiError $e){$thrown=true;}equal($thrown,true);}
 equal((array)lossCorrectionStore($root,'owner-a','plan-a',['action'=>'reset'])['overrides'],[]);
 echo "PASS correction validation, update-not-duplicate, reset, owner/plan isolation and private atomic storage\n";
}finally{foreach(glob($root.'/load-analysis-loss/*')?:[] as $f)unlink($f);if(is_dir($root.'/load-analysis-loss'))rmdir($root.'/load-analysis-loss');rmdir($root);}
