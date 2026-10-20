<?php
declare(strict_types=1);
// Cron: run via PHP CLI. Refreshes the official CZ.NIC auction JSON source.
// Backorder.sk parser and global feeds need separate verified adapters.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__) . '/lib/catalog-api.php';
const SOURCE='https://auctions-master.nic.cz/share/new_auctions.json';
$ctx=stream_context_create(['http'=>['timeout'=>18,'header'=>"Accept: application/json\r\nUser-Agent: ScopeFlux/1.0\r\n"]]);
$body=@file_get_contents(SOURCE,false,$ctx,0,4_000_000);
if($body===false)throw new RuntimeException('CZ.NIC feed unavailable.');
$items=json_decode($body,true,512,JSON_THROW_ON_ERROR);
if(!is_array($items))throw new RuntimeException('Unexpected CZ.NIC auction list.');
$checkedAt=gmdate('Y-m-d\TH:i:s\Z');$records=[];
foreach($items as $item){
 if(!is_array($item))continue;
 $name=strtolower((string)($item['item_title']??''));
 $from=(string)($item['auction_from']??'');
 if(!preg_match('/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cz$/',$name)||!scopeflux_upcoming($from))continue;
 $records[]=['domain'=>$name,'tld'=>'cz','status'=>'Registry auction','expiration'=>null,'drop'=>$from,'source'=>'CZ.NIC','sourceUrl'=>'https://www.domenovyprohlizec.cz/cs/aukce-domen/','checkedAt'=>$checkedAt,'note'=>'Registry auction opening date, not guaranteed availability.'];
}
if(!$records)throw new RuntimeException('No usable CZ auction records; existing data preserved.');
usort($records,static fn($a,$b)=>strcmp($a['drop'],$b['drop']));
$db=scopeflux_database();$db->beginTransaction();
try {
 $json=json_encode($records,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES);
 $stmt=$db->prepare('REPLACE INTO catalog_feeds(tld,records,checked_at) VALUES(?,?,?)');
 $stmt->execute(['cz',$json,$checkedAt]);
 $stmt=$db->prepare('DELETE FROM catalog_feed_parts WHERE tld=?');$stmt->execute(['cz']);
 $stmt=$db->prepare('REPLACE INTO catalog_preview(tld,records,total,checked_at) VALUES(?,?,?,?)');
 $stmt->execute(['cz',json_encode(array_slice($records,0,30),JSON_THROW_ON_ERROR),count($records),$checkedAt]);
 $db->commit();echo 'CZ.NIC refreshed: '.count($records)." records\n";
}catch(Throwable $error){$db->rollBack();throw $error;}
