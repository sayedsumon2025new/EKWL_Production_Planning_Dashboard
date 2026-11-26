<?php
declare(strict_types=1);
namespace Ekwl;
require_once __DIR__.'/rfd-fabrics-details.php';
require_once __DIR__.'/decimal.php';

/** Integer product/division keep whole-piece capacity exact without BCMath. */
function gcMultiply(string $a,string $b): string {
 $out='0';foreach(str_split($b) as $digit){$part='0';for($i=0;$i<(int)$digit;$i++)$part=Decimal::add($part,$a);$out=Decimal::add($out.'0',$part);}return $out;
}
function gcCapacity(int $received,int $booking,int $order): ?int {
 $numerator=gcMultiply((string)$received,(string)intdiv($order,100000000));$divisor=(string)$booking;$remainder='0';$out='';
 foreach(str_split($numerator) as $digit){$remainder=Decimal::normal($remainder.$digit);$q=0;while(Decimal::cmp($remainder,$divisor)>=0){$remainder=Decimal::sub($remainder,$divisor);$q++;}$out.=$q;}
 $out=Decimal::normal($out);return Decimal::cmp($out,'9007199254740991')>0?null:(int)$out;
}
function gcNonnegativeSum(array $rows,int $column): ?int {
 foreach($rows as $row){$n=fdrNumber($row['v'][$column]??null);if($n===null||$n<0)return null;}return fdrSum($rows,$column);
}
/** Literal Body receipts only; never rank fabrics or include Rib in consumption. */
function gcBuild(array $sources,array $identity,array $bank): array {
 $groups=[];$booking=[];$cutting=[];$other=[];$orders=fdrOrderBankIndex($bank);
 foreach($sources['rfd']['rows'] as $r){$v=$r['v'];$ewo=rcEwo($v[2]);$color=rcColorLabel($identity,'rfd',$v[2],$v[6],$v[7]);if(!rcValidEwo($ewo)||rcColorKey($color)==='')continue;
  $pair=fdrPair($ewo,$color);$spec=json_encode([fdrNorm($v[8]),fdrNorm($v[9])],JSON_THROW_ON_ERROR);
  if(rcNorm($v[7])==='BODY')$groups[$pair][$spec][]=$r;else $other[$pair][$spec]=true;
 }
 foreach($sources['booking']['rows'] as $r){$v=$r['v'];$pair=fdrPair($v[0],rcColorLabel($identity,'booking',$v[0],$v[7]));$spec=json_encode([fdrNorm($v[5]),fdrNorm($v[6])],JSON_THROW_ON_ERROR);$booking[$pair][$spec][]=$r;}
 foreach($sources['cutting']['rows'] as $r){$v=$r['v'];$cutting[fdrPair($v[3],rcColorLabel($identity,'cutting',$v[3],$v[6]))][]=$r;}
 $rows=[];
 foreach($groups as $pair=>$specs){[$ewo,$color]=json_decode($pair,true);$reasons=[];$r=array_merge(...array_values($specs));$b=[];$unit='';$received=$booked=$consumption=$capacity=$balance=null;
  if(count($specs)!==1)$reasons[]='Multiple Body fabric specifications require separate consumption confirmation.';
  else {$spec=array_key_first($specs);$b=$booking[$pair][$spec]??[];$parts=json_decode($spec,true);
   if(in_array('', $parts,true)||in_array('—',$parts,true))$reasons[]='Body Construction or Composition is missing.';
   if(isset($other[$pair][$spec]))$reasons[]='Body and supporting receipts share a specification; Body booking cannot be isolated.';
   $variants=[];foreach($b as $x)$variants[json_encode([fdrSpecText($x['v'][8]),fdrNorm($x['v'][9]),fdrUnit($x['v'][10])],JSON_THROW_ON_ERROR)]=true;
   if(count($variants)!==1)$reasons[]='No unique Body Booking GSM, Width and Unit matches the receipt specification.';
   else {[$gsm,$width,$unit]=json_decode(array_key_first($variants),true);if($gsm===''||$width==='')$reasons[]='Body Booking GSM or Width is missing.';}
   $receiptColumn=['KG'=>14,'PCS'=>15,'YDS'=>16][$unit]??null;
   if($receiptColumn===null)$reasons[]='Body receipt and booking require the same supported unit (KG, PCS or YDS).';
   else $received=gcNonnegativeSum($r,$receiptColumn);
   $booked=gcNonnegativeSum($b,11);if($received===null||$booked===null||$booked<=0)$reasons[]='Body received quantity or positive Body booking is unavailable.';
   foreach(fdrBookingReview($b) as $issue)$reasons[]=$issue;
  }
  $orderSource=$orders[$pair]??null;$order=fdrNumber($orderSource['quantity']??null);
  if($order===null||$order<=0||$order%100000000!==0)$reasons[]='A positive whole-piece Order Bank OrderQty is required for Body consumption.';
  $production=fdrProductionSnapshot($cutting[$pair]??[]);$cut=$production['cutting'];
  if($cut===null||$cut<0||$cut%100000000!==0)$reasons[]='Latest dated Cutting Total is missing, conflicting, invalid or fractional.';
  if(!$reasons){$consumption=fdrRatio($booked,$order);$capacity=gcCapacity($received,$booked,$order);if($capacity===null)$reasons[]='Body capacity exceeds the supported whole-piece range.';else $balance=$capacity-intdiv($cut,100000000);}
  $rows[]=['ewo'=>$ewo,'color'=>$color,'unit'=>$unit,'body_received'=>$received===null?null:fdrText($received),'body_booking'=>$booked===null?null:fdrText($booked),'order_qty'=>$order===null?null:fdrText($order),'body_consumption'=>$consumption,'body_capacity'=>$capacity,'total_cut'=>$cut===null?null:fdrText($cut),'cuttable'=>$balance,'cutting_date'=>$production['date'],'reasons'=>array_values(array_unique($reasons)),
   'evidence'=>['rfd_rows'=>fdrRefs($r),'booking_rows'=>fdrRefs($b),'cutting_rows'=>fdrRefs($production['rows']),'order_bank_rows'=>$orderSource['rows']??[],'color_mappings'=>rcUsedMappings($identity,['rfd'=>$r,'booking'=>$b,'cutting'=>$production['rows']])]];
 }
 return ['model'=>'body-cuttable-v1','rows'=>$rows,'integrity'=>['complete'=>true,'row_count'=>count($rows)]];
}
/** One read-only transaction: active receipts, bookings, order quantities and cutting. */
function gcRead(array $u): void {
 requirePermission($u,can($u,'slide_7')?'slide_7':'slide_20');$pdo=db();$pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$pdo->beginTransaction();
 try{$sources=[];foreach(['rfd','booking','cutting'] as $kind)$sources[$kind]=fdrRawSource($kind);$bank=rcOrderBank(true);$identity=rcContext($sources+['orderbank'=>$bank],rcStoredMappings());$body=gcBuild($sources,$identity,$bank);
  $body['sources']=array_map(fn($s)=>['head'=>$s['head'],'status'=>$s['status']],$sources+['orderbank'=>$bank]);$daily=$sources['cutting'];$report=$daily['head'];$rows=array_column($daily['rows'],'v');$pdo->commit();
  if(function_exists('ob_gzhandler')&&!ini_get('zlib.output_compression')&&!headers_sent()&&str_contains($_SERVER['HTTP_ACCEPT_ENCODING']??'','gzip'))ob_start('ob_gzhandler',8192);
  jsonOut(['data'=>['headers'=>dcsHeaders(),'report'=>$report,'rows'=>$rows,'integrity'=>['complete'=>true,'row_count'=>count($rows)]+($report?['batch_id'=>$report['id']]:[]),'body_cuttable'=>$body],'error'=>null]);
 }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
