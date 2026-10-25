<?php
declare(strict_types=1);
require __DIR__.'/../../backend/src/bootstrap.php';
require __DIR__.'/../../backend/src/query.php';

function check(bool $ok): void { if (!$ok) throw new RuntimeException('JSON EWO filter regression'); }
$catalog=json_decode(file_get_contents(__DIR__.'/../../backend/catalog.json'),true,512,JSON_THROW_ON_ERROR);
foreach (['size_set_rows','accessories_rows'] as $name) {
    $args=[];
    $sql=\Ekwl\filterSQL([['eq','is_active',true],['in','row_data->>EWO',['00123',"x' OR 1=1 --"]]],$catalog[$name],$args);
    check(count($sql)===2 && str_contains($sql[1],"JSON_UNQUOTE(JSON_EXTRACT(`row_data`, '$.EWO')) IN (?,?)"));
    check($args===[1,'00123',"x' OR 1=1 --"]);
    foreach (['row_data->>password','row_data->>EWO) OR 1=1 --'] as $field) {
        try { $args=[];\Ekwl\filterSQL([['in',$field,['00123']]],$catalog[$name],$args);throw new RuntimeException('Unexpected JSON path allowed'); }
        catch (\Ekwl\ApiError $e) { check($e->status===400); }
    }
}
try { $args=[];\Ekwl\filterSQL([['in','row_data->>EWO',['00123']]],$catalog['site_users'],$args);throw new RuntimeException('Non-report JSON path allowed'); }
catch (\Ekwl\ApiError $e) { check($e->status===400); }
echo "PASS report JSON EWO filters, exact text values, bound parameters and forbidden paths\n";
