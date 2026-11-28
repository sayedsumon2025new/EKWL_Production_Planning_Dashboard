<?php
declare(strict_types=1);
namespace Ekwl;
require_once __DIR__.'/gantt-body-cuttable.php';
function bbHeaders(): array {return ['EWO No','Buyer','Color','Body Fabric','Booking No','Fabric Booking\nKG','Order Qty\nPCS','Body Consumption\nKG / PCS','Net Received\nKG','Total Cutting\nPCS','Fabric Used\nKG','Fabric Balance\nKG','Remaining Cuttable\nPCS','Gap / Surplus\nKG'];}
/** Divide arbitrary signed integer strings, rounding only the final display precision. */
function bbDivide(string $a,string $b,int $scale=8): string {
 $negative=str_starts_with($a,'-');$a=ltrim($a,'-');$remainder='0';$out='';
 foreach(str_split($a.str_repeat('0',$scale+1)) as $digit){$remainder=Decimal::normal($remainder.$digit);$q=0;while(Decimal::cmp($remainder,$b)>=0){$remainder=Decimal::sub($remainder,$b);$q++;}$out.=$q;}
 $round=(int)substr($out,-1);$out=substr($out,0,-1)?:'0';if($round>=5)$out=Decimal::add($out,'1');$out=str_pad($out,$scale+1,'0',STR_PAD_LEFT);
 $value=Decimal::normal(substr($out,0,-$scale).'.'.substr($out,-$scale));return $negative&&$value!=='0'?'-'.$value:$value;
}
function bbProduct(string $a,string $b): string {$negative=str_starts_with($a,'-')!==str_starts_with($b,'-');$v=gcMultiply(ltrim($a,'-'),ltrim($b,'-'));return $negative&&$v!=='0'?'-'.$v:$v;}
function bbBuild(array $sources,array $identity,array $bank): array {
 $groups=[];$books=[];$cuts=[];$other=[];$orders=fdrOrderBankIndex($bank);$excluded=0;
 foreach($sources['rfd']['rows'] as $r){$v=$r['v'];$e=rcEwo($v[2]);$c=rcColorLabel($identity,'rfd',$v[2],$v[6],$v[7]);if(!rcValidEwo($e)||!rcColorKey($c))continue;$pair=fdrPair($e,$c);$spec=json_encode([fdrNorm($v[8]),fdrNorm($v[9])],JSON_THROW_ON_ERROR);
  if(rcNorm($v[7])!=='BODY'){$other[$pair][$spec]=true;continue;}
  $key=json_encode([$pair,$spec]);$groups[$key]??=['pair'=>$pair,'spec_key'=>$spec,'ewo'=>$e,'color'=>$c,'construction'=>$v[8],'composition'=>$v[9],'rfd'=>[],'booking'=>[]];$groups[$key]['rfd'][]=$r;
 }
 foreach($sources['booking']['rows'] as $r){$v=$r['v'];$pair=fdrPair($v[0],rcColorLabel($identity,'booking',$v[0],$v[7]));$spec=json_encode([fdrNorm($v[5]),fdrNorm($v[6])]);$books[$pair][$spec][]=$r;}
 foreach($sources['cutting']['rows'] as $r){$v=$r['v'];$cuts[fdrPair($v[3],rcColorLabel($identity,'cutting',$v[3],$v[6]))][]=$r;}
 foreach($groups as &$g)$g['booking']=$books[$g['pair']][$g['spec_key']]??[];unset($g);ksort($groups,SORT_STRING);$groups=fdrFabricSpecs(array_values($groups));$rows=[];$evidence=[];
 foreach($groups as $g){$r=$g['rfd'];$b=$g['booking'];$unit=$g['spec']['unit'];if($unit!==''&&$unit!=='KG'){$excluded++;continue;}$issues=[];
  if($unit!=='KG')$issues[]='No matched Body booking in KG; consumption and balances are unavailable.';
  if($g['receipt_candidates'])$issues[]='Multiple GSM/Width/unit specifications: receipt allocation requires confirmation.';
  if(isset($other[$g['pair']][$g['spec_key']]))$issues[]='Body and supporting fabric share this specification; the Body booking must be confirmed.';
  if(trim($g['construction'])===''||trim($g['composition'])==='')$issues[]='Body Construction or Composition is missing.';
  $received=$r?fdrSum($r,14):null;$booked=gcNonnegativeSum($b,11);$o=$orders[$g['pair']]??null;$order=fdrNumber($o['quantity']??null);$production=fdrProductionSnapshot($cuts[$g['pair']]??[]);$cut=$production['cutting'];
  foreach(fdrBookingReview($b) as $issue)$issues[]=$issue;
  if($booked===null||$booked<=0)$issues[]='Positive, complete Body booking is required.';
  if($order===null||$order<=0||$order%100000000!==0)$issues[]='Positive whole-piece current Order Bank quantity is required.';
  $cons=$used=$balance=$capacity=$gap='—';
  // Booking is per fabric grain, not the EWO/Color pool including Rib.
  if(!$issues&&$booked!==null&&$order!==null){$pcs=intdiv($order,100000000);$denominator=(string)$pcs.'00000000';$cons=bbDivide((string)$booked,$denominator);
   if($cut===null||$cut<0||$cut%100000000!==0)$issues[]='Latest cumulative Cutting Total is missing, conflicting or invalid.';
   else {$cutPcs=intdiv($cut,100000000);$usedNumerator=bbProduct((string)$booked,(string)$cutPcs);$used=bbDivide($usedNumerator,$denominator);
    if($received===null)$issues[]='Matching Body Net Delivery KG is missing or ambiguous.';
    else {$balanceNumerator=Decimal::sub(bbProduct((string)$received,(string)$pcs),$usedNumerator);$balance=bbDivide($balanceNumerator,$denominator);$gap=bbDivide(Decimal::sub($balanceNumerator,bbProduct((string)$booked,(string)max(0,$pcs-$cutPcs))),$denominator);
     $gross=$received<0?0:gcCapacity($received,$booked,$order);if($gross===null)$issues[]='Cuttable capacity exceeds the supported whole-piece range.';else $capacity=(string)max(0,$gross-$cutPcs);
    }
   }
  }
  $bookingNumbers=[];foreach($b as $line)if(trim($line['v'][1])!=='')$bookingNumbers[$line['v'][1]]=true;
  $buyerRows=array_merge(array_map(fn($x)=>['v'=>[0=>$x['v'][10]]],$r),array_map(fn($x)=>['v'=>[0=>$x['v'][2]]],$b));
  $fabric=implode("\n",array_filter([$g['construction'],$g['composition'],($g['spec']['gsm']?:'—').' GSM · '.($g['spec']['width']?:'—').' · Body']));
  $rows[]=[$g['ewo'],fdrUnique($buyerRows,0),$g['color'],$fabric,$bookingNumbers?implode("\n",array_keys($bookingNumbers)):'—',$booked===null?'—':fdrText($booked),$order===null?'—':fdrText($order),$cons,$received===null?'—':fdrText($received),$cut===null?'—':fdrText($cut),$used,$balance,$capacity,$gap];
  $evidence[]=['pair'=>$g['pair'],'body_only'=>true,'unit'=>$unit,'issues'=>array_values(array_unique($issues)),'grain'=>['rfd_rows'=>fdrRefs($r),'booking_rows'=>fdrRefs($b)],'receipt_candidates'=>$g['receipt_candidates'],'specification'=>$g['spec'],'booking_lines'=>$b,'cutting_date'=>$production['date'],'cutting_rows'=>fdrRefs($production['rows']),'order_bank'=>$o,'color_mappings'=>rcUsedMappings($identity,['rfd'=>$r,'booking'=>$b,'cutting'=>$production['rows']])];
 }
 return ['headers'=>array_map(fn($h)=>str_replace('\\n',"\n",$h),bbHeaders()),'rows'=>$rows,'evidence'=>$evidence,'excluded_non_kg'=>$excluded,'integrity'=>['complete'=>true,'row_count'=>count($rows)],'model'=>'body-fabric-balance-v1'];
}
function bbAction(array $u,array $b): array {
 requirePermission($u,'slide_22');if(($b['action']??'read')!=='read')throw new ApiError('Body balances are a read-only calculation.');$pdo=db();$pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$pdo->beginTransaction();
 try{$sources=[];foreach(['rfd','booking','cutting'] as $kind)$sources[$kind]=fdrRawSource($kind);$bank=rcOrderBank(true);$identity=rcContext($sources+['orderbank'=>$bank],rcStoredMappings());$out=bbBuild($sources,$identity,$bank);$out['sources']=array_map(fn($s)=>['head'=>$s['head'],'status'=>$s['status'],'rows'=>count($s['rows'])],$sources+['orderbank'=>$bank]);$out['digest']=hash('sha256',json_encode([$out['model'],$sources,$bank,$identity['entries']],JSON_THROW_ON_ERROR));$pdo->commit();return $out;
 }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
