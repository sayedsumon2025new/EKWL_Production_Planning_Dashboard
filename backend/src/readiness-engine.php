<?php
declare(strict_types=1);
namespace Ekwl;
/** Port of repository readiness/coverage SQL. Inputs contain current visible source rows. */
final class ReadinessEngine {
    public static function key($v): string {
        $s=preg_replace('/\s+/u',' ',trim((string)$v,' '));
        if(preg_match('/[^\x00-\x7F]/',$s)&&!function_exists('mb_strtolower'))throw new ApiError('Unicode source normalization requires mbstring.',503);
        return function_exists('mb_strtolower')?mb_strtolower($s,'UTF-8'):strtolower($s);
    }
    public static function ewo($v): string {$s=trim((string)$v,' ');return preg_match('/^\d+(?:\.0+)?$/',$s)?(ltrim(preg_replace('/\.0+$/','',$s),'0')?:'0'):$s;}
    public static function number($v): ?string {$s=trim((string)$v,' ');return preg_match('/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/',$s)?Decimal::normal(str_replace(',','',$s)):null;}
    public static function date($v): ?string {
        $s=trim((string)$v,' ');$y=$m=$d=null;$names=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        if(preg_match('/^(\d{4})([-\/.])(\d{1,2})\2(\d{1,2})$/',$s,$p))[$y,$m,$d]=[$p[1],$p[3],$p[4]];
        elseif(preg_match('/^(\d{4})(\d{2})(\d{2})$/',$s,$p))[$y,$m,$d]=array_slice($p,1);
        elseif(preg_match('/^(\d{4})-(\d{2})-(\d{2})[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/',$s,$p)){if(preg_match('/[+-]14:(?!00)\d{2}$/',$s))return null;[$y,$m,$d]=array_slice($p,1,3);}
        elseif(preg_match('/^(\d{1,2})[-\/ .]([A-Za-z]+)[-\/ ,]+(\d{2}|\d{4})$/',$s,$p)){[$d,$n,$y]=array_slice($p,1);$i=self::month($n);if($i===null)return null;$m=$i;}
        elseif(preg_match('/^([A-Za-z]+)[-\/ .](\d{1,2})[-\/ ,]+(\d{2}|\d{4})$/',$s,$p)){[$n,$d,$y]=array_slice($p,1);$i=self::month($n);if($i===null)return null;$m=$i;}
        elseif(preg_match('/^(\d{1,2})([-\/.])(\d{1,2})\2(\d{2}|\d{4})$/',$s,$p)){$a=(int)$p[1];$b=(int)$p[3];$y=$p[4];if($a>12){$d=$a;$m=$b;}elseif($b>12||$a===$b){$m=$a;$d=$b;}else return null;}
        else return null;
        if(strlen((string)$y)===2)$y=2000+(int)$y;
        return $y>=1&&$y<=9999&&checkdate((int)$m,(int)$d,(int)$y)?sprintf('%04d-%02d-%02d',$y,$m,$d):null;
    }
    private static function month(string $name): ?int {$all=['january','february','march','april','may','june','july','august','september','october','november','december'];foreach($all as $i=>$full)if(strtolower($name)===$full||strtolower($name)===substr($full,0,3))return $i+1;return null;}
    public static function light(array $states): string {foreach(['red','unknown','amber','green'] as $s)if(in_array($s,$states,true)||($s==='unknown'&&(!$states||in_array(null,$states,true))))return $s;return 'na';}
    private static function groups(array $rows,callable $key): array {$out=[];foreach($rows as $r)$out[$key($r)][]=$r;return $out;}
    private static function pair($ewo,$color): string {return json_encode([self::ewo($ewo),self::key($color)],JSON_THROW_ON_ERROR);}
    private static function all(array $rows,callable $fn): bool {foreach($rows as $r)if(!$fn($r))return false;return true;}
    private static function any(array $rows,callable $fn): bool {foreach($rows as $r)if($fn($r))return true;return false;}
    private static function unique(array $v): array {return array_values(array_unique($v,SORT_REGULAR));}
    private static function timestamp(array $rows): ?string {$v=array_filter(array_column($rows,'uploaded_at'),fn($x)=>$x!==null);return $v?max($v):null;}
    private static function status(array $rows,string $key,array $ready): string {
        $values=array_map(fn($r)=>self::key($r['row_data'][$key]??''),$rows);
        return self::all($values,fn($v)=>in_array($v,$ready,true))?'green':(in_array('',$values,true)?'unknown':(self::any($values,fn($v)=>in_array($v,$ready,true))?'amber':'red'));
    }
    public static function prepare(array $data,string $upload,string $today): array {
        $valid=array_merge(range(1,45),[47,48]);$master=array_values(array_filter(array_map(fn($r)=>(int)$r['line_no'],$data['line_chassis_priority']??[]),fn($l)=>in_array($l,$valid,true)));$allowed=$master?:$valid;
        $complete=self::any($data['plan_uploads']??[],fn($r)=>(string)$r['id']===$upload&&$r['status']==='complete');
        $p=array_values(array_filter($data['plan_records']??[],function($r)use($upload,$complete,$allowed){preg_match('/\d+/',(string)($r['line_no']??''),$m);return $complete&&(string)$r['upload_id']===$upload&&($r['criteria']??'')==='Plan/Day'&&empty($r['is_summary_row'])&&isset($r['ewo'])&&isset($m[0])&&strlen($m[0])<=2&&in_array((int)$m[0],$allowed,true);}));
        foreach($p as &$r){preg_match('/\d+/',(string)$r['line_no'],$m);$r['_line']=(int)$m[0];$r['_ewo']=self::ewo($r['ewo']);$r['_color']=self::key($r['col']??'');$r['_print']=self::key($r['print']??'');$r['_emb']=self::key($r['emb']??'');}unset($r);
        $daily=[];foreach($data['plan_daily']??[] as $r)if((string)$r['upload_id']===$upload)$daily[(string)$r['record_id']][$r['plan_date']][]=$r['value'];
        $fold=[];foreach($daily as $record=>$dates)foreach($dates as $date=>$values)$fold[$record][$date]=['qty'=>Decimal::max($values),'conflict'=>count(self::unique($values))>1||in_array(null,$values,true)];
        $fabric=self::groups($data['fabric_cutting_info']??[],fn($r)=>self::pair($r['ewo']??'',$r['color_name']??''));
        $emGroups=self::groups(array_filter($data['embellishment_send_receive_rows']??[],fn($r)=>!empty($r['is_active'])),fn($r)=>self::pair($r['EWO No']??'',$r['Color']??''));$em=[];
        foreach($emGroups as $key=>$rows){
            $dates=array_map(fn($r)=>self::date($r['Date']??''),$rows);$known=!in_array(null,$dates,true)&&self::all($dates,fn($d)=>$d<=$today);$nonNull=array_filter($dates);$date=$nonNull?max($nonNull):null;
            $latest=array_values(array_filter($rows,fn($r)=>$date!==null&&self::date($r['Date']??'')===$date));
            $codes=self::groups($latest,fn($r)=>json_encode([$r['Code']??null,$r['Style No']??null]));$sums=['print'=>[],'emb'=>[]];$good=['print'=>$known,'emb'=>$known];
            foreach($codes as $code)foreach(['print'=>'Print','emb'=>'EMB'] as $kind=>$label){
                $pairs=array_map(fn($r)=>[self::number($r['Total '.$label.' Receive Qty']??''),self::number($r['Total '.$label.' Return Qty']??'')],$code);
                $one=self::unique($pairs);$receive=Decimal::max(array_column($pairs,0));$return=Decimal::max(array_column($pairs,1));
                if(count($one)!==1||$receive===null||$return===null||Decimal::cmp($return,$receive)>0)$good[$kind]=false;
                else $sums[$kind][]=Decimal::sub($receive,$return);
            }
            $em[$key]=['print_qty'=>$latest&&$good['print']?Decimal::sum($sums['print']):null,'emb_qty'=>$latest&&$good['emb']?Decimal::sum($sums['emb']):null,'report_date'=>$date,'uploaded_at'=>self::timestamp($latest)];
        }
        $acc=self::groups(array_filter($data['accessories_rows']??[],fn($r)=>!empty($r['is_active'])),fn($r)=>self::ewo($r['row_data']['EWO']??''));$accessories=[];
        foreach($acc as $k=>$rows)$accessories[$k]=['status'=>self::status($rows,'Sewing Trims Pending Stts',['ok','all acc. balanced']),'uploaded_at'=>self::timestamp($rows)];
        $ss=self::groups(array_filter($data['size_set_rows']??[],fn($r)=>!empty($r['is_active'])),fn($r)=>self::pair($r['row_data']['EWO']??'',$r['row_data']['Color']??''));$size=[];
        foreach($ss as $k=>$rows)$size[$k]=['status'=>self::status($rows,'T & A Closed',['closed']),'uploaded_at'=>self::timestamp($rows)];
        $sew=self::groups($data['sewing_input_output']??[],fn($r)=>self::ewo($r['ewo']??''));$sewing=[];$inputs=[];
        foreach($sew as $ewo=>$rows){
            $groups=self::groups($rows,fn($r)=>json_encode([self::key($r['color']??''),$r['po_no']??null,$r['line_no']??null,$r['order_qty']??null,$r['total_input_qty']??null,$r['total_output_qty']??null,$r['total_reject_qty']??null,$r['total_wip_qty']??null]));
            $validInput=self::all($groups,fn($g)=>count($g)===1&&isset($g[0]['total_input_qty'])&&Decimal::cmp($g[0]['total_input_qty'],'0')>=0);
            $validOutput=self::all($groups,fn($g)=>count($g)===1&&isset($g[0]['total_output_qty'])&&Decimal::cmp($g[0]['total_output_qty'],'0')>=0);
            $sewing[$ewo]=['sewing_started'=>self::any($rows,fn($r)=>isset($r['total_input_qty'])&&Decimal::cmp($r['total_input_qty'],'0')>0),'input_qty'=>$validInput?Decimal::sum(array_column($rows,'total_input_qty')):null,'output_qty'=>$validOutput?Decimal::sum(array_column($rows,'total_output_qty')):null];
            foreach(self::groups($rows,fn($r)=>self::pair($r['ewo'],$r['color']??'')) as $key=>$colorRows){
                $dups=self::groups($colorRows,fn($r)=>json_encode([$r['po_no']??null,$r['line_no']??null,$r['order_qty']??null,$r['total_input_qty']??null,$r['total_output_qty']??null,$r['total_reject_qty']??null,$r['total_wip_qty']??null]));
                $ok=self::all($dups,fn($g)=>count($g)===1&&isset($g[0]['total_input_qty'])&&Decimal::cmp($g[0]['total_input_qty'],'0')>=0);
                $inputs[$key]=['input_qty'=>$ok?Decimal::sum(array_column($colorRows,'total_input_qty')):null,'uploaded_at'=>self::timestamp($colorRows)];
            }
        }
        return compact('p','daily','fold','fabric','em','accessories','size','sewing','inputs','today','upload');
    }
    public static function board(array $s): array {
        $out=[];
        foreach(self::groups($s['p'],fn($r)=>$r['_ewo']) as $ewo=>$rows){
            $ewo=(string)$ewo;$first=null;$complete=true;
            foreach($rows as $r){$positive=array_filter($s['fold'][(string)$r['id']]??[],fn($d)=>$d['qty']!==null&&Decimal::cmp($d['qty'],'0')>0);if(!$positive)$complete=false;else{$d=min(array_keys($positive));$first=$first===null?$d:min($first,$d);}}
            $buyers=self::unique(array_values(array_filter(array_column($rows,'buyer'),fn($v)=>$v!==null)));sort($buyers,SORT_STRING);$lines=self::unique(array_column($rows,'_line'));sort($lines,SORT_NUMERIC);
            $dates=[];foreach(['pcd','psd','pfd','delivery'] as $key){$v=array_values(array_filter(array_column($rows,$key),fn($v)=>$v!==null));$dates[$key]=$v?($key==='pfd'?max($v):min($v)):null;}
            $valid=self::all($rows,fn($r)=>isset($r['pcd'],$r['psd'],$r['pfd'])&&$r['pcd']<=$r['psd']&&$r['psd']<=$r['pfd']);
            $planKnown=self::all($rows,fn($r)=>isset($r['total'])&&Decimal::cmp($r['total'],'0')>=0);
            $late=self::any($rows,fn($r)=>isset($r['delivery'],$r['pfd'])&&$r['pfd']>$r['delivery']);
            $targets=[];
            foreach($rows as $r){$day=$s['fold'][(string)$r['id']][$first??'']??null;if(!$day||$day['qty']===null||Decimal::cmp($day['qty'],'0')<=0)continue;$targets[$r['_color']][]=['r'=>$r,'d'=>$day];}
            ksort($targets,SORT_STRING);$details=[];$states=['fabric'=>[],'cutting'=>[],'print'=>[],'embroidery'=>[],'size_set'=>[]];$starter=[];$firstQty=[];
            foreach($targets as $color=>$parts){
                $color=(string)$color;$pair=json_encode([$ewo,$color],JSON_THROW_ON_ERROR);$fabric=$s['fabric'][$pair]??[];$em=$s['em'][$pair]??[];$size=$s['size'][$pair]??[];
                $qty=Decimal::sum(array_map(fn($p)=>$p['d']['qty'],$parts));$threshold=Decimal::ceil80($qty);$firstQty[]=$qty;$starter[]=$threshold;
                $printKnown=self::all($parts,fn($p)=>in_array($p['r']['_print'],['yes','no'],true));$embKnown=self::all($parts,fn($p)=>in_array($p['r']['_emb'],['yes','no'],true));
                $printThreshold=Decimal::ceil80(Decimal::sum(array_map(fn($p)=>$p['r']['_print']==='yes'?$p['d']['qty']:'0',$parts))??'0');
                $embThreshold=Decimal::ceil80(Decimal::sum(array_map(fn($p)=>$p['r']['_emb']==='yes'?$p['d']['qty']:'0',$parts))??'0');
                $conflict=self::any($parts,fn($p)=>$p['d']['conflict']);
                $pairs=self::unique(array_map(fn($f)=>[isset($f['total_cut_qty'])?Decimal::normal($f['total_cut_qty']):null,isset($f['cutable_qty'])?Decimal::normal($f['cutable_qty']):null],$fabric));$fabricConflict=count($pairs)>1;
                $cut=Decimal::max(array_column($fabric,'total_cut_qty'));$cutable=Decimal::max(array_column($fabric,'cutable_qty'));$available=Decimal::max([$cut,$cutable]);
                $unknown=$conflict||$color===''||!$complete||$fabricConflict;
                $badCut=$cut!==null&&Decimal::cmp($cut,'0')<0;$badCutable=$cutable!==null&&Decimal::cmp($cutable,'0')<0;
                $fabricStatus=$unknown||$badCut||$badCutable?'unknown':($available!==null&&Decimal::cmp($available,$threshold)>=0?'green':($cut===null||$cutable===null?'unknown':(Decimal::cmp($available,'0')>0?'amber':'red')));
                $cutStatus=$unknown||$cut===null||$badCut?'unknown':(Decimal::cmp($cut,$threshold)>=0?'green':(Decimal::cmp($cut,'0')>0?'amber':'red'));
                $stage=function(bool $known,string $required,string $key)use($conflict,$complete,$color,$em){if(!$known||$conflict||!$complete)return 'unknown';if(Decimal::cmp($required,'0')===0)return 'na';$v=$em[$key]??null;return $color===''||$v===null?'unknown':(Decimal::cmp($v,$required)>=0?'green':(Decimal::cmp($v,'0')>0?'amber':'red'));};
                $status=['fabric'=>$fabricStatus,'cutting'=>$cutStatus,'print'=>$stage($printKnown,$printThreshold,'print_qty'),'embroidery'=>$stage($embKnown,$embThreshold,'emb_qty'),'size_set'=>$color===''?'unknown':($size['status']??'unknown')];
                foreach($status as $key=>$value)$states[$key][]=$value;
                $names=array_values(array_filter(array_column(array_column($parts,'r'),'col'),fn($v)=>$v!==null));sort($names,SORT_STRING);
                $details[]=['color'=>$names[0]??null,'plan_qty'=>$qty,'required_qty'=>$threshold,'fabric_qty'=>$fabricConflict?null:$available,'cut_qty'=>$fabricConflict?null:$cut,'print_qty'=>$em['print_qty']??null,'emb_qty'=>$em['emb_qty']??null,'print_required_qty'=>$printThreshold,'emb_required_qty'=>$embThreshold]+$status+['fabric_uploaded_at'=>self::timestamp($fabric),'embellishment_date'=>$em['report_date']??null,'embellishment_uploaded_at'=>$em['uploaded_at']??null,'size_set_uploaded_at'=>$size['uploaded_at']??null];
            }
            $status=[];foreach($states as $key=>$values){
                if($values)$value=self::light($values);
                elseif(in_array($key,['print','embroidery'],true)){$flag=$key==='print'?'_print':'_emb';$value=self::all($rows,fn($r)=>$r[$flag]==='no')?'na':'unknown';}
                else $value='unknown';$status[$key.'_status']=$value;
            }
            $status['accessories_status']=$s['accessories'][$ewo]['status']??'unknown';$sew=$s['sewing'][$ewo]??['sewing_started'=>false,'input_qty'=>null,'output_qty'=>null];
            $six=array_values($status);$applicable=count(array_filter($six,fn($v)=>$v!=='na'));$known=count(array_filter($six,fn($v)=>in_array($v,['red','amber','green'],true)));$points=array_map(fn($v)=>['red'=>0,'amber'=>50,'green'=>100][$v],array_values(array_filter($six,fn($v)=>in_array($v,['red','amber','green'],true))));
            $score=$known===$applicable&&$known?round(array_sum($points)/$known,1):null;$sewingStatus=self::light($six);$planQty=Decimal::sum(array_column($rows,'total'));$today=$s['today'];$output=$sew['output_qty'];$behind=$output!==null&&$planQty!==null&&Decimal::cmp($output,$planQty)<0;$blocked=in_array($sewingStatus,['red','amber'],true);
            if($late){$risk='high';$reason='Planned finish is after the delivery date on a source planning row';}
            elseif($valid&&$dates['pfd']<$today&&$planKnown&&$behind){$risk='high';$reason='PFD passed; reported sewing output is below planned quantity';}
            elseif($valid&&$dates['psd']<=$today&&!$sew['sewing_started']&&$blocked){$risk='high';$reason='PSD reached; sewing-start prerequisites are incomplete';}
            elseif($valid&&$dates['pcd']<=$today&&!$sew['sewing_started']&&in_array(self::light([$status['fabric_status'],$status['cutting_status'],$status['size_set_status']]),['red','amber'],true)){$risk='high';$reason='PCD reached; fabric/cutting/size-set prerequisites are incomplete';}
            elseif(!$valid){$risk='unknown';$reason='Missing or inconsistent PCD/PSD/PFD';}
            elseif($score===null||!$complete){$risk='unknown';$reason='Missing, ambiguous or incomplete source evidence';}
            elseif($dates['pfd']<=$today&&($output===null||!$planKnown)){$risk='unknown';$reason='Finish milestone cannot be assessed from available quantities';}
            elseif($blocked){$risk='watch';$reason='Upcoming milestone; sewing-start prerequisites are incomplete';}
            elseif($dates['pfd']===$today&&$behind){$risk='watch';$reason='PFD today; reported output is below planned quantity';}
            else{$risk='low';$reason='No evidenced milestone breach; this is not a delivery forecast';}
            $out[]=['upload_id'=>$s['upload'],'ewo'=>$ewo,'buyer'=>implode(', ',$buyers),'lines'=>$lines]+$dates+['plan_qty'=>$planQty,'first_plan_date'=>$first,'first_day_plan_qty'=>Decimal::sum($firstQty),'starter_qty'=>Decimal::sum($starter)]+$status+$sew+['sewing_status'=>$sewingStatus,'readiness_score'=>$score,'known_stages'=>$known,'applicable_stages'=>$applicable,'color_details'=>$details,'accessories_uploaded_at'=>$s['accessories'][$ewo]['uploaded_at']??null,'as_of_date'=>$today,'delivery_risk'=>$risk,'risk_reason'=>$reason];
        }
        usort($out,fn($a,$b)=>strcmp($a['ewo'],$b['ewo']));return $out;
    }
    public static function coverage(array $s,array $production): array {
        $dates=array_values(array_filter(array_column($production,'output_date')));if(!$dates)return [];$cutoff=max($dates);$running=[];
        foreach($production as $r)if($r['output_date']===$cutoff){$e=self::ewo($r['ewo']);$running[$e]=Decimal::add($running[$e]??'0',$r['total_qty']??'0');}
        $calendar=[];for($d=1;$d<=3;$d++)$calendar[$d]=(new \DateTimeImmutable($cutoff))->modify('+'.$d.' days')->format('Y-m-d');
        $groups=self::groups($s['p'],fn($r)=>$r['_ewo']);$daily=[];$global=[1=>true,2=>true,3=>true];$totals=[1=>'0',2=>'0',3=>'0'];
        foreach($groups as $ewo=>$rows)foreach(self::groups($rows,fn($r)=>$r['_color']) as $color=>$colorRows)foreach($calendar as $d=>$date){
            $values=[];$known=true;
            foreach($colorRows as $r){$cells=$s['daily'][(string)$r['id']][$date]??[null];foreach($cells as $v){if($v===null||Decimal::cmp($v,'0')<0)$known=false;$values[]=$v;}}
            $qty=Decimal::sum($values);$daily[$ewo][$color][$d]=['known'=>$known,'qty'=>$qty];$global[$d]=$global[$d]&&$known;$totals[$d]=Decimal::add($totals[$d],$qty??'0');
        }
        foreach($global as $d=>&$off)$off=$off&&Decimal::cmp($totals[$d],'0')===0;unset($off);$out=[];
        foreach($groups as $ewo=>$rows){
            $ewo=(string)$ewo;if(!isset($running[$ewo])||Decimal::cmp($running[$ewo],'0')<=0)continue;$colors=self::groups($rows,fn($r)=>$r['_color']);ksort($colors,SORT_STRING);
            $stock=[];$needed=[];$cumulative=[];$prefix=[];$anyDemand=false;
            foreach($colors as $color=>$colorRows){
                $color=(string)$color;$pair=json_encode([$ewo,$color],JSON_THROW_ON_ERROR);$demand=Decimal::sum(array_column($daily[$ewo][$color],'qty'))??'0';$required=Decimal::cmp($demand,'0')>0;$needed[$color]=$required;$anyDemand=$anyDemand||$required;$cumulative[$color]='0';$prefix[$color]=true;if(!$required)continue;
                $fabric=$s['fabric'][$pair]??[];$input=$s['inputs'][$pair]??[];$em=$s['em'][$pair]??[];$cut=Decimal::max(array_column($fabric,'total_cut_qty'));
                $quantities=array_map(fn($r)=>isset($r['total_cut_qty'])?Decimal::normal($r['total_cut_qty']):null,$fabric);$conflict=count(self::unique($quantities))>1||in_array(null,$quantities,true)||self::any($quantities,fn($v)=>$v!==null&&Decimal::cmp($v,'0')<0);
                $noPrint=self::all($colorRows,fn($r)=>$r['_print']==='no');$allPrint=self::all($colorRows,fn($r)=>$r['_print']==='yes');$noEmb=self::all($colorRows,fn($r)=>$r['_emb']==='no');$allEmb=self::all($colorRows,fn($r)=>$r['_emb']==='yes');
                $issue=null;$eligible=null;
                if($color==='')$issue='Missing planning color';elseif(!$fabric)$issue='No matching cut report';elseif($conflict)$issue='Missing, negative or conflicting cut quantity';elseif(($input['input_qty']??null)===null)$issue='Missing, invalid or duplicate sewing input evidence';elseif(!($noPrint||$allPrint)||!($noEmb||$allEmb))$issue='Mixed or unknown Print/EMB requirements for this color';elseif($allPrint&&$allEmb)$issue='Both Print and EMB required; common finished-piece identity is unavailable';elseif($allPrint&&($em['print_qty']??null)===null)$issue='Missing or conflicting net Print receipts';elseif($allEmb&&($em['emb_qty']??null)===null)$issue='Missing or conflicting net EMB receipts';
                if($noPrint&&$noEmb)$eligible=$cut;elseif($allPrint&&$noEmb)$eligible=Decimal::min([$cut,$em['print_qty']??null]);elseif($noPrint&&$allEmb)$eligible=Decimal::min([$cut,$em['emb_qty']??null]);
                $ready=null;if($issue===null&&$eligible!==null){if(Decimal::cmp($input['input_qty'],$eligible)<=0)$ready=Decimal::sub($eligible,$input['input_qty']);else $issue='Sewing input exceeds eligible cut/receipt quantity';}
                $names=array_values(array_filter(array_column($colorRows,'col'),fn($v)=>$v!==null));sort($names,SORT_STRING);
                $stock[$color]=['color'=>$names[0]??null,'cut_qty'=>$cut,'input_qty'=>$input['input_qty']??null,'print_qty'=>$em['print_qty']??null,'emb_qty'=>$em['emb_qty']??null,'ready_qty'=>$ready,'reason'=>$issue,'fabric_uploaded_at'=>self::timestamp($fabric),'input_uploaded_at'=>$input['uploaded_at']??null,'embellishment_uploaded_at'=>$em['uploaded_at']??null,'embellishment_date'=>$em['report_date']??null];
            }
            if(!$anyDemand)continue;$buyers=self::unique(array_values(array_filter(array_column($rows,'buyer'),fn($v)=>$v!==null)));sort($buyers,SORT_STRING);$lines=self::unique(array_column($rows,'_line'));sort($lines,SORT_NUMERIC);
            $readyKnown=self::all($stock,fn($v)=>$v['ready_qty']!==null);$row=['upload_id'=>$s['upload'],'ewo'=>$ewo,'buyer'=>implode(', ',$buyers),'lines'=>$lines,'cutoff_date'=>$cutoff,'cutoff_output'=>$running[$ewo],'ready_input_qty'=>$readyKnown?Decimal::sum(array_column($stock,'ready_qty')):null,'color_details'=>array_values($stock),'first_short_date'=>null];$dayDetails=[];
            foreach($calendar as $d=>$date){
                $planKnown=true;$prefixKnown=true;$evidenceKnown=true;$short='0';$red=false;$day=[];$required=[];
                foreach($colors as $color=>$unused){$entry=$daily[$ewo][$color][$d];$day[]=$entry['qty'];$planKnown=$planKnown&&$entry['known'];$prefix[$color]=$prefix[$color]&&$entry['known'];$prefixKnown=$prefixKnown&&$prefix[$color];$cumulative[$color]=Decimal::add($cumulative[$color],$entry['qty']??'0');$required[]=$cumulative[$color];$ready=$stock[$color]['ready_qty']??null;
                    $evidenceKnown=$evidenceKnown&&$prefix[$color]&&(!$needed[$color]||Decimal::cmp($cumulative[$color],'0')===0||$ready!==null);
                    $deficit=Decimal::max([Decimal::sub($cumulative[$color],$ready??'0'),'0']);$short=Decimal::add($short,$deficit);$red=$red||Decimal::cmp($deficit,'0')>0;
                }
                $status=!$evidenceKnown?'unknown':($red?'red':'green');$plan=$planKnown?Decimal::sum($day):null;$requiredQty=$prefixKnown?Decimal::sum($required):null;$shortage=$evidenceKnown?$short:null;
                $row['day'.$d.'_date']=$date;$row['day'.$d.'_plan']=$plan;$row['day'.$d.'_status']=$status;$row['day'.$d.'_off']=$global[$d];
                if($status==='red'&&$row['first_short_date']===null)$row['first_short_date']=$date;
                $dayDetails[]=['date'=>$date,'plan_qty'=>$plan,'cumulative_qty'=>$requiredQty,'shortage_qty'=>$shortage,'status'=>$status,'off_day'=>$global[$d]];
                if($d===3){$row['required_qty']=$requiredQty;$row['shortage_qty']=$shortage;}
            }
            $row['day_details']=$dayDetails;$out[]=$row;
        }
        usort($out,fn($a,$b)=>strcmp($a['ewo'],$b['ewo']));return $out;
    }
}
