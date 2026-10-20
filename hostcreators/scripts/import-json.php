<?php
declare(strict_types=1);
// CLI only: php import-json.php /private/export.json
// Expected JSON object maps table names to arrays of rows exported from D1.
if (PHP_SAPI !== 'cli') {http_response_code(404);exit;}
require dirname(__DIR__) . '/lib/catalog-api.php';
$path=$argv[1]??'';
if (!$path || !is_file($path)) {fwrite(STDERR,"Usage: php import-json.php /private/export.json\n");exit(2);}
$payload=json_decode(file_get_contents($path),true,512,JSON_THROW_ON_ERROR);
if (!is_array($payload)) throw new RuntimeException('Expected JSON object.');
$tables=[
 'catalog_feeds'=>['tld','records','checked_at'],
 'catalog_feed_parts'=>['tld','part','records'],
 'catalog_preview'=>['tld','records','total','checked_at'],
 'catalog_history'=>['domain','tld','release_at','snapshot','checked_at'],
 'users'=>['id','email','name','created_at','last_login_at'],
 'watchlist'=>['user_id','domain','snapshot','checked_at']
];
$db=scopeflux_database();
$db->beginTransaction();
try{
 foreach($tables as $table=>$columns){
  if (!array_key_exists($table,$payload))continue;
  $rows=$payload[$table];
  if(!is_array($rows))throw new RuntimeException('Invalid table: '.$table);
  $cols=implode(',',array_map(static fn($x)=>'`'.$x.'`',$columns));
  $holders=implode(',',array_fill(0,count($columns),'?'));
  $stmt=$db->prepare('INSERT INTO `'.$table.'` ('.$cols.') VALUES ('.$holders.')');
  foreach($rows as $row){
   if(!is_array($row))throw new RuntimeException('Invalid row in '.$table);
   $values=[];
   foreach($columns as $column){
    if (!array_key_exists($column,$row))throw new RuntimeException('Missing '.$table.'.'.$column);
    $values[]=$row[$column];
   }
   $stmt->execute($values);
  }
  echo $table.': '.count($rows)." rows\n";
 }
 $db->commit();
}catch(Throwable $error){$db->rollBack();throw $error;}
