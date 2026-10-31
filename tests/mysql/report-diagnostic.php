<?php
declare(strict_types=1);
require __DIR__.'/../../backend/src/bootstrap.php';
require __DIR__.'/../../backend/src/report-snapshot.php';
final class FixtureReportPDOError extends PDOException {
    public function __construct(string $message,string $state,int $driver){parent::__construct($message);$this->code=$state;$this->errorInfo=[$state,$driver,$message];}
}
function ensure(bool $ok):void {if(!$ok)throw new RuntimeException('Safe report diagnostic failed.');}
ensure(function_exists('Ekwl\\reportReadDiagnostic'));
$x=Ekwl\reportReadDiagnostic(new FixtureReportPDOError("Unknown column 'r.pattern_received_date' in 'field list'; SELECT PRIVATE_VALUE FROM private_table",'42S22',1054));
ensure(str_contains($x,'pattern_received_date')&&str_contains($x,'1054')&&!str_contains($x,'SELECT')&&!str_contains($x,'PRIVATE_VALUE'));
$x=Ekwl\reportReadDiagnostic(new FixtureReportPDOError("Unknown column 'private_token' in 'field list'",'42S22',1054));ensure(!str_contains($x,'private_token'));
foreach([1040,1203,1226,1205,1213,2002,2003,2006,2013,1142,1146] as $code){$x=Ekwl\reportReadDiagnostic(new FixtureReportPDOError('PRIVATE_VALUE','HY000',$code));ensure(str_contains($x,(string)$code)&&!str_contains($x,'PRIVATE_VALUE'));}
ensure(Ekwl\reportReadDiagnostic(new RuntimeException('PRIVATE_VALUE'))==='');
ensure(!str_contains(Ekwl\reportReadDiagnostic(new JsonException('PRIVATE_VALUE')),'PRIVATE_VALUE'));
echo "PASS safe source-field, hosting-limit, SQL-state and connection diagnostics; SQL and source values remain private\n";
