<?php
declare(strict_types=1);
namespace Ekwl;
/** Additive reconciliation metadata; source cells and upload contracts are immutable. */
function fdrSpecText(string $value): string {$n=fdrNumber($value);return $n===null?fdrNorm($value):fdrText($n);}
function fdrFabricSpecs(array $groups): array {
 $out=[];
 foreach($groups as $g){
  $specs=[];foreach($g['booking'] as $b){$spec=['gsm'=>fdrSpecText($b['v'][8]),'width'=>fdrNorm($b['v'][9]),'unit'=>fdrUnit($b['v'][10])];$key=json_encode($spec,JSON_THROW_ON_ERROR);$specs[$key]??=['spec'=>$spec,'booking'=>[]];$specs[$key]['booking'][]=$b;}
  if(!$specs){$g['spec']=['gsm'=>'','width'=>'','unit'=>''];$g['receipt_candidates']=[];$out[]=$g;continue;}
  $ambiguous=count($specs)>1;
  foreach($specs as $part){$x=$g;$x['booking']=$part['booking'];$x['spec']=$part['spec'];$x['receipt_candidates']=$ambiguous?fdrRefs($g['rfd']):[];if($ambiguous)$x['rfd']=[];$out[]=$x;}
 }
 return $out;
}
function fdrBookingReview(array $booking): array {
 $issues=[];$seen=[];
 foreach($booking as $b){$v=$b['v'];$key=hash('sha256',json_encode($v,JSON_THROW_ON_ERROR));if(isset($seen[$key]))$issues[]='Repeated-looking booking lines have no stable line/revision ID; quantities are retained pending review.';$seen[$key]=true;
  if(preg_match('/\b(cancel(?:led|ed)?|revis(?:ed|ion)|supersed(?:ed)?)\b/i',$v[12]))$issues[]='Booking reason mentions cancellation/revision, but no structured status or revision ID is supplied. Confirm the active quantity.';
 }
 return array_values(array_unique($issues));
}
function fdrReconcile(array &$rows,array &$proof,array &$pairs,array $identity): void {
 $groups=[];foreach($proof as $i=>$e)$groups[$e['pair']][]=$i;
 foreach($groups as $pair=>$indices){
  $reasons=[];$units=[];$quantities=[];$masterLabels=[];
  foreach($indices as $i){$r=$rows[$i];$e=&$proof[$i];$ewo=rcEwo($r[1]);$color=rcColorKey($r[2]);$master=$identity['targets'][$ewo][$color]??null;
   $e['master_identity']=['ewo'=>$ewo,'color'=>$master,'matched'=>$master!==null,'order_bank_rows'=>$identity['target_rows'][$ewo][$color]??[],'method'=>$master===null?'Review required':'Exact or approved source/EWO color mapping to current Order Bank'];
   if($master!==null){$rows[$i][2]=$master;$masterLabels[$master]=true;}else $reasons[]='EWO + Color is not confirmed against the current Order Bank; review source color mapping.';
   $qty=fdrNumber($r[13]);$unit=fdrUnit($r[12]);$quantities[$i]=$qty;$units[$unit]=true;
   if($qty===null||$qty<0)$reasons[]='Fabric Booking Qty is missing, invalid or negative.';
   $spec=$e['specification'];if(array_filter([$spec['gsm'],$spec['width'],$spec['unit']],fn($v)=>in_array($v,['','—','-','N/A','NA'],true))||$r[4]==='—'||$r[5]==='—')$reasons[]='Fabric specification is incomplete; confirm Construction, Composition, GSM, Width and Unit.';
   foreach($e['booking_review'] as $issue)$reasons[]=$issue;
   unset($e);
  }
  if(count($units)!==1||isset($units[''])||isset($units['—']))$reasons[]='Booking units differ or are missing. Do not compare KG, PCS or YDS without an approved conversion.';
  $max=$quantities?max(array_map(fn($q)=>$q??PHP_INT_MIN,$quantities)):0;$leaders=array_keys(array_filter($quantities,fn($q)=>$q!==null&&$q===$max));
  if($max<=0)$reasons[]='No positive complete booking quantity is available.';elseif(count($leaders)!==1)$reasons[]='Highest fabric booking is tied; primary fabric needs confirmation.';
  $reasons=array_values(array_unique($reasons));$primary=!$reasons?$leaders[0]:null;
  $ranking=[];foreach($indices as $i){$type=$primary===null?'review':($i===$primary?'body':'rib');$proof[$i]['reconciliation']=['type'=>$type,'label'=>$type==='body'?'Body / Primary':($type==='rib'?'Rib / Supporting':'Primary review required'),'booking_qty'=>$rows[$i][13],'unit'=>$rows[$i][12],'primary_row'=>$primary,'reason'=>$reasons?implode(' ',$reasons):'Highest active-source fabric Booking Qty within the complete EWO + Color. Classification precedes all view filters.','actual_construction'=>$rows[$i][4],'actual_composition'=>$rows[$i][5],'booking_type'=>'Not supplied','revision_status'=>'Not supplied'];
   $ranking[]=['row'=>$i,'type'=>$type,'construction'=>$rows[$i][4],'composition'=>$rows[$i][5],'gsm'=>$rows[$i][10],'width'=>$rows[$i][11],'unit'=>$rows[$i][12],'booking_qty'=>$rows[$i][13]];
  }
  $pairs[$pair]['reconciliation']=['primary_row'=>$primary,'issues'=>$reasons,'candidates'=>$ranking,'rule'=>'Largest comparable fabric Booking Qty; never infer primary from a fabric name. Supporting fabric retains its original construction.'];
 }
}
