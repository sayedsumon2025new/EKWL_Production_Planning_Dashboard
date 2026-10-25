<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/backend/src/bootstrap.php';require dirname(__DIR__,2).'/backend/src/query.php';
use function Ekwl\{config,run,catalog,ident,normalizeValue};
if(PHP_SAPI!=='cli'||(config()['environment']??'')!=='staging')exit(1);
$path=$argv[1]??'';$m=json_decode(file_get_contents($path),true,64,JSON_THROW_ON_ERROR);$root=dirname($path);$report=[];$failed=false;
foreach($m['tables'] as $name=>$meta){
    $c=catalog()[$name]??null;if(!$c)throw new RuntimeException('Unmapped source table.');
    $target=(int)run('SELECT COUNT(*) FROM '.ident('ekwl_'.$name))->fetchColumn();$matched=0;$diff=0;
    $f=fopen($root.'/'.$meta['file'],'rb');if(!hash_equals($meta['sha256'],hash_file('sha256',$root.'/'.$meta['file'])))throw new RuntimeException('Checksum mismatch.');
    while(($line=fgets($f))!==false){
        $row=json_decode($line,true,64,JSON_THROW_ON_ERROR);$where=[];$args=[];
        foreach($c['pk'] as $pk){$where[]=ident($pk).'=?';$args[]=$row[$pk];}
        $actual=run('SELECT * FROM '.ident('ekwl_'.$name).' WHERE '.implode(' AND ',$where),$args)->fetch();$ok=(bool)$actual;if($actual)foreach($c['storage_names']??[] as $source=>$stored){$actual[$source]=$actual[$stored];unset($actual[$stored]);}
        if($actual)foreach($row as $key=>$value){
            $expected=normalizeValue($key,$value,$c);$got=$actual[$key];
            if(in_array($key,Ekwl\jsonColumns(),true))$equal=json_decode((string)$expected,true)===json_decode((string)$got,true);
            elseif(str_starts_with($c['columns'][$key],'DECIMAL'))$equal=decimalText((string)$expected)===decimalText((string)$got);
            else $equal=$expected===null?$got===null:(string)$expected===(string)$got;
            if(!$equal){$ok=false;break;}
        }
        if($ok)$matched++;else $diff++;
    }fclose($f);
    $pass=$target===$meta['rows']&&$matched===$meta['rows']&&$diff===0;$failed=$failed||!$pass;
    $report[$name]=['source_rows'=>$meta['rows'],'target_rows'=>$target,'matching_rows'=>$matched,'different_rows'=>$diff,'passed'=>$pass];
}
echo json_encode(['passed'=>!$failed,'tables'=>$report],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";exit($failed?1:0);
function decimalText(string $s):string{if(!str_contains($s,'.'))return $s;$v=rtrim(rtrim($s,'0'),'.');return $v==='-0'?'0':$v;}
