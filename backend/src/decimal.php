<?php
declare(strict_types=1);
namespace Ekwl;
/** Exact finite decimal arithmetic; no BCMath dependency and no float quantities. */
final class Decimal {
    public static function normal($value): string {
        $s=(string)$value;if(!preg_match('/^(-?)(\d+)(?:\.(\d+))?$/',$s,$m))throw new ApiError('Invalid exact quantity.');
        $whole=ltrim($m[2],'0')?:'0';$fraction=rtrim($m[3]??'','0');$s=$whole.($fraction!==''?'.'.$fraction:'');return $m[1]&&$s!=='0'?'-'.$s:$s;
    }
    private static function aligned(string $a,string $b): array {
        $a=explode('.',ltrim($a,'-'));$b=explode('.',ltrim($b,'-'));$scale=max(strlen($a[1]??''),strlen($b[1]??''));
        return [$a[0].str_pad($a[1]??'',$scale,'0'),$b[0].str_pad($b[1]??'',$scale,'0'),$scale];
    }
    private static function cmpInt(string $a,string $b): int {$a=ltrim($a,'0')?:'0';$b=ltrim($b,'0')?:'0';return strlen($a)<=>strlen($b)?:strcmp($a,$b);}
    private static function addInt(string $a,string $b): string {
        $out='';$carry=0;for($i=1;$i<=max(strlen($a),strlen($b));$i++){$n=($i<=strlen($a)?(int)$a[strlen($a)-$i]:0)+($i<=strlen($b)?(int)$b[strlen($b)-$i]:0)+$carry;$out=($n%10).$out;$carry=intdiv($n,10);}return ($carry?$carry:'').$out;
    }
    private static function subInt(string $a,string $b): string {
        $out='';$borrow=0;for($i=1;$i<=strlen($a);$i++){$n=(int)$a[strlen($a)-$i]-($i<=strlen($b)?(int)$b[strlen($b)-$i]:0)-$borrow;$borrow=$n<0?1:0;if($n<0)$n+=10;$out=$n.$out;}return ltrim($out,'0')?:'0';
    }
    private static function scaled(string $s,int $scale): string {if($scale){$s=str_pad($s,$scale+1,'0',STR_PAD_LEFT);$s=substr($s,0,-$scale).'.'.substr($s,-$scale);}return self::normal($s);}
    public static function cmp($a,$b): int {
        $a=self::normal($a);$b=self::normal($b);$na=$a[0]==='-';$nb=$b[0]==='-';if($na!==$nb)return $na?-1:1;
        [$x,$y]=self::aligned($a,$b);return self::cmpInt($x,$y)*($na?-1:1);
    }
    public static function add($a,$b): string {
        $a=self::normal($a);$b=self::normal($b);$na=$a[0]==='-';$nb=$b[0]==='-';[$x,$y,$scale]=self::aligned($a,$b);
        if($na===$nb){$s=self::scaled(self::addInt($x,$y),$scale);return $na&&$s!=='0'?'-'.$s:$s;}
        $cmp=self::cmpInt($x,$y);$s=self::scaled($cmp>=0?self::subInt($x,$y):self::subInt($y,$x),$scale);$neg=$cmp>=0?$na:$nb;return $neg&&$s!=='0'?'-'.$s:$s;
    }
    public static function sub($a,$b): string {$b=self::normal($b);return self::add($a,$b[0]==='-'?substr($b,1):'-'.$b);}
    public static function sum(array $values): ?string {$sum=null;foreach($values as $v)if($v!==null)$sum=self::add($sum??'0',$v);return $sum;}
    public static function max(array $values): ?string {$out=null;foreach($values as $v)if($v!==null&&($out===null||self::cmp($v,$out)>0))$out=self::normal($v);return $out;}
    public static function min(array $values): ?string {$out=null;foreach($values as $v)if($v!==null&&($out===null||self::cmp($v,$out)<0))$out=self::normal($v);return $out;}
    public static function ceil80($value): string {
        $s=self::normal($value);if($s[0]==='-')throw new ApiError('Starter demand cannot be negative.');$p=explode('.',$s);$digits=($p[0].($p[1]??''));$carry=0;$out='';
        for($i=strlen($digits)-1;$i>=0;$i--){$n=(int)$digits[$i]*8+$carry;$out=($n%10).$out;$carry=intdiv($n,10);}if($carry)$out=$carry.$out;
        $product=self::scaled($out,strlen($p[1]??'')+1);$parts=explode('.',$product);return isset($parts[1])?self::add($parts[0],'1'):$parts[0];
    }
}
