<?php
declare(strict_types=1);

/** Read-only PHP catalogue API. Only uses private config and MariaDB snapshots. */
function scopeflux_json(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    exit;
}
function scopeflux_database(): PDO {
    $filename = dirname(__DIR__) . '/config.php';
    if (!is_file($filename)) throw new RuntimeException('Private configuration is missing.');
    $config = require $filename;
    if (!is_array($config)) throw new RuntimeException('Invalid private configuration.');
    $dsn = 'mysql:host=' . ($config['db_host'] ?? 'localhost') .
        ';port=' . ($config['db_port'] ?? '3306') .
        ';dbname=' . ($config['db_name'] ?? '') . ';charset=utf8mb4';
    return new PDO($dsn, (string) ($config['db_user'] ?? ''), (string) ($config['db_password'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}
function scopeflux_tlds(?string $input): array {
    $supported = ['com','net','org','io','app','co','xyz','info','me','biz','us','pro','cc','tv','cz','sk'];
    if ($input === null) return $supported;
    $tlds = array_values(array_unique(array_map(static fn ($x) => ltrim(strtolower(trim($x)), '.'), explode(',', $input))));
    if (!$tlds || count($tlds)>2 || array_diff($tlds,$supported)) scopeflux_json(['error'=>'Unsupported extension selection.'],400);
    return $tlds;
}
function scopeflux_upcoming(mixed $value): bool {
    if (!is_string($value) || $value === '') return false;
    try {
        $date = new DateTimeImmutable($value, new DateTimeZone('UTC'));
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) $date = $date->setTime(23,59,59);
        return $date->getTimestamp() >= time();
    } catch (Exception) { return false; }
}
function scopeflux_feed_records(PDO $db, string $tld): ?array {
    $statement = $db->prepare('SELECT records, checked_at FROM catalog_feeds WHERE tld=?');
    $statement->execute([$tld]);$row=$statement->fetch();
    if (!$row) return null;
    $records=json_decode($row['records'], true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($records)) throw new RuntimeException('Invalid saved catalogue records.');
    $extra=$db->prepare('SELECT records FROM catalog_feed_parts WHERE tld=? ORDER BY part');
    $extra->execute([$tld]);
    while ($part=$extra->fetch()) {
        $items=json_decode($part['records'], true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($items)) throw new RuntimeException('Invalid catalogue part.');
        array_push($records,...$items);
    }
    return ['records'=>$records,'checked_at'=>$row['checked_at']];
}
function scopeflux_domains(PDO $db, ?string $requested, bool $recent=false): array {
    $tlds=scopeflux_tlds($requested);
    $results=[];$feeds=[];
    if ($recent) {
        $placeholders=implode(',',array_fill(0,count($tlds),'?'));
        $since=gmdate('Y-m-d',time()-7*86400);
        $stmt=$db->prepare("SELECT snapshot FROM catalog_history WHERE tld IN ($placeholders) AND release_at>=? AND release_at<? ORDER BY release_at DESC LIMIT 300");
        $stmt->execute([...$tlds,$since,gmdate('c')]);
        foreach ($stmt as $row) {
            $record=json_decode($row['snapshot'],true,512,JSON_THROW_ON_ERROR);
            $date=$record['reportedDrop']['at'] ?? $record['drop'] ?? null;
            if (is_string($date) && !scopeflux_upcoming($date)) $results[]=$record;
        }
        return ['records'=>$results,'feeds'=>[],'historyDays'=>7,'historyTotal'=>count($results)];
    }
    foreach ($tlds as $tld) {
        if ($requested===null) {
            $stmt=$db->prepare('SELECT records,total,checked_at FROM catalog_preview WHERE tld=?');
            $stmt->execute([$tld]);$row=$stmt->fetch();
            if (!$row) continue;
            $records=json_decode($row['records'],true,512,JSON_THROW_ON_ERROR);
            $count=(int)$row['total'];$checked=$row['checked_at'];
        } else {
            $feed=scopeflux_feed_records($db,$tld);
            if (!$feed) {
                $feeds[]=['tld'=>$tld,'source'=>'Stored catalogue','url'=>'','loaded'=>0,'more'=>false,'limited'=>true,'checkedAt'=>gmdate('c'),'error'=>'No imported feed is available yet.'];
                continue;
            }
            $records=$feed['records'];$count=count($records);$checked=$feed['checked_at'];
        }
        $fresh=array_values(array_filter($records,static fn($r)=>is_array($r) && scopeflux_upcoming($r['drop']??null)));
        $results=array_merge($results,$fresh);
        $feeds[]=['tld'=>$tld,'source'=>'Stored catalogue','url'=>'','loaded'=>count($fresh),'more'=>$count>count($fresh),'limited'=>true,'checkedAt'=>$checked,'stored'=>true];
    }
    return ['records'=>$results,'feeds'=>$feeds];
}
