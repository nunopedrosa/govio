<?php
/** Development-only reproducible vendor refresh. Deploy committed bundles, not downloads. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = dirname(__DIR__);
$config = require $root . '/config.php';
$lock = json_decode((string) file_get_contents(__DIR__ . '/mediabunny-lock.json'), true, 512, JSON_THROW_ON_ERROR);
if ($config['mediabunny']['version'] !== $lock['version']) {
    fwrite(STDERR, "Configured Mediabunny version differs from the reviewed lock. Update the lock before refreshing.\n"); exit(1);
}
$check = ($argc === 2 && $argv[1] === '--check');
if ($argc > 1 && !$check) { fwrite(STDERR, "Usage: php tools/fetch_mediabunny.php [--check]\n"); exit(1); }
$dest = $root . '/vendor/mediabunny';
foreach ([$root . '/vendor', $dest] as $directory) {
    if (is_link($directory)) { fwrite(STDERR, "Refusing symlinked vendor directory.\n"); exit(1); }
}
function matchesVendor(string $file, array $meta): bool {
    return !is_link($file) && is_file($file) && filesize($file) === $meta['size'] && hash_file('sha256', $file) === $meta['sha256'];
}
if ($check) {
    foreach ($lock['files'] as $name => $meta) {
        if (!matchesVendor($dest . '/' . $name, $meta)) { fwrite(STDERR, "Missing or checksum-mismatched vendor file: {$name}\n"); exit(1); }
    }
    echo "Mediabunny v{$lock['version']}: pinned vendor files verified.\n"; exit;
}
if (!is_dir($dest) && !mkdir($dest, 0755, true) && !is_dir($dest)) { fwrite(STDERR, "Cannot create vendor directory.\n"); exit(1); }
$staged = [];
$status = 0;
try {
    foreach ($lock['files'] as $name => $meta) {
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $name) || is_link($dest . '/' . $name)) { throw new RuntimeException('Unsafe vendor target.'); }
        if (matchesVendor($dest . '/' . $name, $meta)) { echo "Already verified: {$name}\n"; continue; }
        $url = "https://github.com/Vanilagy/mediabunny/releases/download/v{$lock['version']}/{$name}";
        echo "Downloading {$url}\n";
        $context = stream_context_create(['http' => ['follow_location' => 1, 'timeout' => 180, 'user_agent' => 'VIO-Converter-Vendor/3.0'], 'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
        $in = @fopen($url, 'rb', false, $context);
        if (!$in) { throw new RuntimeException("Download failed: {$name}"); }
        $temp = tempnam($dest, '.vendor-');
        if ($temp === false) { fclose($in); throw new RuntimeException('Cannot stage vendor file.'); }
        $staged[$name] = $temp;
        $out = fopen($temp, 'wb');
        if (!$out) { fclose($in); throw new RuntimeException('Cannot open staged vendor file.'); }
        // Bound the download and detect both truncation and unexpected extra bytes.
        stream_copy_to_stream($in, $out, $meta['size'] + 1); fclose($in); fclose($out);
        clearstatcache(true, $temp);
        if (!matchesVendor($temp, $meta)) { throw new RuntimeException("Size/SHA-256 mismatch: {$name}"); }
        chmod($temp, 0644);
    }
    foreach ($staged as $name => $temp) {
        if (is_link($dest . '/' . $name) || !rename($temp, $dest . '/' . $name)) { throw new RuntimeException("Cannot install {$name}"); }
    }
    echo "Mediabunny v{$lock['version']} ready. Review and commit vendor files before deployment.\n";
} catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . "\n"); $status = 1; }
finally { foreach ($staged as $temp) { if (is_file($temp)) { unlink($temp); } } }

exit($status);
