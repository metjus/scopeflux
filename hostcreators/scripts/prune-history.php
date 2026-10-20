<?php
declare(strict_types=1);
// Daily CLI cleanup; keeps roughly 31 days of historical observations.
if (PHP_SAPI !== 'cli') {http_response_code(404);exit;}
require dirname(__DIR__) . '/lib/catalog-api.php';
$db=scopeflux_database();
$stmt=$db->prepare('DELETE FROM catalog_history WHERE release_at < ?');
$stmt->execute([gmdate('Y-m-d',time()-31*86400)]);
echo 'Pruned '.$stmt->rowCount()." historical records\n";
