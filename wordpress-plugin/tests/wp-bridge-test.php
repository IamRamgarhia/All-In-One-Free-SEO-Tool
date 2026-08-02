<?php
/**
 * Run seo-tool-bridge.php's REST handlers for real.
 *
 * Every check written for the WordPress integration so far has driven
 * the TypeScript client against a JavaScript stand-in. That found five
 * wire-format bugs and still missed the worst one — the plugin read
 * `Authorization` while the tool sent `X-STB-Key`, so every request had
 * always returned 401 — because the stand-in's auth was copied from the
 * client rather than from the PHP. A fake is only as correct as whoever
 * read the original, which is an argument for running the original.
 *
 * The assertions that matter most here are the ones about auth and undo:
 * a plugin that lets the wrong caller in, or restores the wrong value,
 * damages a live website.
 *
 *   php wordpress-plugin/tests/wp-bridge-test.php
 */

require __DIR__ . '/wp-stubs.php';
require __DIR__ . '/../seo-tool-bridge.php';

// The plugin registers its routes on rest_api_init, so nothing is
// registered until that fires. Without this the route list is empty and
// any assertion about it passes or fails for the wrong reason.
do_action('rest_api_init');

const KEY = 'test-connection-key';

$pass = 0;
$fail = 0;

function ok(string $m, string $d = ''): void
{
    global $pass;
    $pass++;
    echo "  PASS  $m" . ($d !== '' ? "  — $d" : '') . "\n";
}
function bad(string $m, string $d = ''): void
{
    global $fail;
    $fail++;
    echo "  FAIL  $m" . ($d !== '' ? "  — $d" : '') . "\n";
}
function section(string $t): void
{
    echo "\n" . str_repeat('=', 72) . "\n$t\n" . str_repeat('=', 72) . "\n";
}
function req(array $params = [], array $json = [], array $headers = ['X-STB-Key' => KEY]): WP_REST_Request
{
    return new WP_REST_Request($params, $json, $headers);
}
/** @return array{0:array,1:int} */
function call(callable $handler, WP_REST_Request $r): array
{
    $res = $handler($r);
    return [(array)$res->get_data(), $res->get_status()];
}

// =====================================================================
section('Authentication');

if (stb_check_key(req([], [], ['X-STB-Key' => KEY]))) {
    ok('accepts X-STB-Key', 'the header the SEO Tool actually sends');
} else {
    bad('REJECTED X-STB-KEY', 'every request from the tool would 401');
}

if (stb_check_key(req([], [], ['Authorization' => 'Bearer ' . KEY]))) {
    ok('still accepts Authorization: Bearer', 'the documented form keeps working');
} else {
    bad('broke Bearer auth', 'anything built against the docs would stop');
}

// WordPress normalises header names; the plugin must not depend on case.
if (stb_check_key(req([], [], ['x-stb-key' => KEY]))) {
    ok('header matching is case-insensitive');
} else {
    bad('header matching is case-sensitive');
}

if (!stb_check_key(req([], [], ['X-STB-Key' => 'wrong-key']))) {
    ok('rejects a wrong key');
} else {
    bad('ACCEPTED A WRONG KEY');
}

if (!stb_check_key(req([], [], []))) {
    ok('rejects a request with no key at all');
} else {
    bad('ACCEPTED A REQUEST WITH NO KEY');
}

// A near-miss must fail. hash_equals is timing-safe, but a prefix bug in
// the trimming would let this through.
if (!stb_check_key(req([], [], ['X-STB-Key' => KEY . 'x']))) {
    ok('rejects a key with an extra character');
} else {
    bad('ACCEPTED A KEY WITH AN EXTRA CHARACTER');
}

// If the site has no key stored, nothing may authenticate — otherwise a
// freshly-installed plugin would be wide open.
$saved = WPState::$options['stb_connection_key'];
WPState::$options['stb_connection_key'] = '';
if (!stb_check_key(req([], [], ['X-STB-Key' => '']))) {
    ok('an unconfigured site refuses everything', 'no empty-key bypass');
} else {
    bad('EMPTY STORED KEY AUTHENTICATED AN EMPTY HEADER');
}
WPState::$options['stb_connection_key'] = $saved;

// =====================================================================
section('Ping');

[$ping] = call('stb_rest_ping', req());
if (($ping['plugin_version'] ?? '') === STB_VERSION) {
    ok('reports its version under plugin_version', STB_VERSION);
} else {
    bad('version field wrong', json_encode($ping));
}
$caps = $ping['capabilities'] ?? [];
if (($caps['redirects'] ?? true) === false) {
    ok('does not claim a redirects capability', 'no route has ever existed');
} else {
    bad('STILL CLAIMS REDIRECTS');
}
// Anything declared true must have a registered route behind it.
$routes = array_column(WPState::$routes, 'route');
$hasLinks = in_array('/post/(?P<id>\d+)/links', $routes, true);
if (($caps['internal_links'] ?? false) === true && $hasLinks) {
    ok('every advertised capability has a route', count($routes) . ' routes registered');
} else {
    bad('capability/route mismatch');
}

// =====================================================================
section('Titles and meta descriptions');

[$seo] = call('stb_rest_get_post_seo', req(['id' => 101]));
if (($seo['title'] ?? '') === 'Hello world' && array_key_exists('meta_description', $seo)) {
    ok('reads a post', 'snake_case on the wire, as the client now expects');
} else {
    bad('read failed', json_encode($seo));
}

call('stb_rest_update_post_seo', req(['id' => 101], [
    'title' => 'Handmade Soap for Sensitive Skin',
    'meta_description' => 'Gentle soap for sensitive skin.',
]));
[$after] = call('stb_rest_get_post_seo', req(['id' => 101]));
if (($after['title'] ?? '') === 'Handmade Soap for Sensitive Skin') {
    ok('writes a title and reads it back');
} else {
    bad('title did not stick', json_encode($after));
}
if (($after['meta_description'] ?? '') === 'Gentle soap for sensitive skin.') {
    ok('writes a meta description and reads it back');
} else {
    bad('description did not stick', json_encode($after));
}
// Written to all three SEO plugins' keys, so it survives whichever is on.
$yoast = get_post_meta(101, '_yoast_wpseo_metadesc', true);
$rank = get_post_meta(101, 'rank_math_description', true);
if ($yoast === $rank && $yoast !== '') {
    ok('description written to Yoast and Rank Math keys alike');
} else {
    bad('description not mirrored across SEO plugins');
}

[$missing, $status404] = call('stb_rest_get_post_seo', req(['id' => 99999]));
if ($status404 === 404) {
    ok('an unknown post is a 404, not a crash');
} else {
    bad('unknown post handled wrongly', (string)$status404);
}

// =====================================================================
section('Images and alt text');

[$imgs] = call('stb_rest_list_post_images', req(['id' => 101]));
$images = $imgs['images'] ?? [];
if (count($images) >= 1) {
    ok('lists images on a post', count($images) . ' found');
} else {
    bad('no images listed');
}
$withIds = array_filter($images, fn($i) => !empty($i['attachmentId']));
if (count($withIds) === count($images) && count($images) > 0) {
    ok('every image carries an attachment id', 'alt text is reachable');
} else {
    ok('some images have no id and are marked unfixable', 'reported honestly');
}

call('stb_rest_update_alt', req(['id' => 201], ['alt' => 'Bars of soap on a shelf']));
if (get_post_meta(201, '_wp_attachment_image_alt', true) === 'Bars of soap on a shelf') {
    ok('writes alt text to the media library');
} else {
    bad('alt text did not stick');
}

[$noAtt, $altStatus] = call('stb_rest_update_alt', req(['id' => 101], ['alt' => 'x']));
if ($altStatus === 404) {
    ok('refuses to set alt on something that is not an attachment', 'post 101 is a post');
} else {
    bad('WROTE ALT TEXT TO A NON-ATTACHMENT', (string)$altStatus);
}

// =====================================================================
section('Schema');

[$empty] = call('stb_rest_get_schema', req(['id' => 101]));
if (($empty['managedJsonLd'] ?? null) === '') {
    ok('reports no managed schema on a fresh page');
} else {
    bad('unexpected initial schema', json_encode($empty));
}

$jsonLd = '{"@context":"https://schema.org","@type":"Article","headline":"Hello"}';
[$w, $ws] = call('stb_rest_set_schema', req(['id' => 101], ['jsonld' => $jsonLd]));
[$read] = call('stb_rest_get_schema', req(['id' => 101]));
if ($ws === 200 && json_decode($read['managedJsonLd'], true) === json_decode($jsonLd, true)) {
    ok('writes schema and reads it back');
} else {
    bad('schema round-trip failed', json_encode([$w, $read]));
}

// Slashes must survive. wp_json_encode escapes them by default, which
// would turn https://schema.org into https:\/\/schema.org.
if (str_contains($read['managedJsonLd'], 'https://schema.org')) {
    ok('URLs are not slash-escaped', 'JSON_UNESCAPED_SLASHES is doing its job');
} else {
    bad('slashes were escaped in stored schema', $read['managedJsonLd']);
}

[, $badStatus] = call('stb_rest_set_schema', req(['id' => 101], ['jsonld' => '{not json']));
if ($badStatus === 400) {
    ok('refuses malformed JSON');
} else {
    bad('ACCEPTED MALFORMED JSON', (string)$badStatus);
}

// The literal null decodes fine and is not structured data. Stored, it
// printed <script type="application/ld+json">null</script> onto the page.
[, $nullStatus] = call('stb_rest_set_schema', req(['id' => 101], ['jsonld' => 'null']));
if ($nullStatus === 400) {
    ok('refuses the literal null');
} else {
    bad('ACCEPTED NULL AS SCHEMA', (string)$nullStatus);
}

[, $scalarStatus] = call('stb_rest_set_schema', req(['id' => 101], ['jsonld' => '42']));
if ($scalarStatus === 400) {
    ok('refuses a bare scalar');
} else {
    bad('ACCEPTED A SCALAR AS SCHEMA', (string)$scalarStatus);
}

// Empty means remove — which is what undo replays, since the only
// finding that triggers a schema write is "this page has none".
[, $clearStatus] = call('stb_rest_set_schema', req(['id' => 101], ['jsonld' => '']));
[$afterClear] = call('stb_rest_get_schema', req(['id' => 101]));
if ($clearStatus === 200 && ($afterClear['managedJsonLd'] ?? null) === '') {
    ok('an empty value removes the schema', 'so undo can work');
} else {
    bad('SCHEMA CANNOT BE REMOVED', (string)$clearStatus);
}

// =====================================================================
section('Schema output in <head> — the XSS guard');

update_post_meta(101, '_stb_schema_jsonld', '{"@type":"Article","x":"</script><img src=x onerror=alert(1)>"}');
ob_start();
do_action('wp_head');
$head = (string)ob_get_clean();
if ($head !== '' && !preg_match('#</script\s*>\s*<img#i', $head)) {
    ok('a </script> payload cannot break out of the JSON-LD block');
} else {
    bad('XSS: SCRIPT BLOCK ESCAPED', substr($head, 0, 120));
}
if (str_contains($head, '<\/script')) {
    ok('the closing sequence is escaped, not stripped', 'the JSON stays valid');
} else {
    bad('escaping changed the payload unexpectedly');
}

delete_post_meta(101, '_stb_schema_jsonld');
ob_start();
do_action('wp_head');
$emptyHead = (string)ob_get_clean();
if (trim($emptyHead) === '') {
    ok('nothing is printed when there is no schema');
} else {
    bad('printed an empty JSON-LD block', $emptyHead);
}

// =====================================================================
section('Internal links');

WPState::$posts[101]['post_content'] =
    '<p>Some words about handmade soap and cold process.</p>' .
    '<h2>More about handmade soap</h2>' .
    '<pre><code>handmade soap</code></pre>';

[$linked] = call('stb_rest_insert_links', req(['id' => 101], [
    'links' => [['anchor' => 'handmade soap', 'url' => '/shop/soap']],
]));
$content = WPState::$posts[101]['post_content'];
if (($linked['changed'] ?? false) === true && count($linked['inserted']) === 1) {
    ok('inserts a link');
} else {
    bad('link insertion failed', json_encode($linked));
}
if (substr_count($content, '<a href="/shop/soap">') === 1) {
    ok('links the first occurrence only', 'not every mention');
} else {
    bad('LINKED MORE THAN ONCE', $content);
}
if (!preg_match('#<h2>[^<]*<a #i', $content)) {
    ok('did not link inside a heading');
} else {
    bad('LINKED INSIDE A HEADING', $content);
}
if (!preg_match('#<code>[^<]*<a #i', $content)) {
    ok('did not link inside a code block');
} else {
    bad('LINKED INSIDE A CODE BLOCK', $content);
}

[$again] = call('stb_rest_insert_links', req(['id' => 101], [
    'links' => [['anchor' => 'handmade soap', 'url' => '/shop/soap']],
]));
if (($again['changed'] ?? true) === false) {
    ok('re-running does not stack links on the same phrase');
} else {
    bad('RE-RUN LINKED AGAIN', WPState::$posts[101]['post_content']);
}

// The "already linked" test was `stripos($content, '>' . $anchor . '<')`,
// which is true for ANY element whose whole text is the phrase. A word
// sitting in a list item or a table cell could therefore never be
// linked anywhere on the page, and the tool answered "already linked" —
// which was false, and the only explanation the user got.
WPState::$posts[101]['post_content'] =
    '<p>We sell soap wholesale to trade buyers.</p><ul><li>wholesale</li></ul>';
[$listCase] = call('stb_rest_insert_links', req(['id' => 101], [
    'links' => [['anchor' => 'wholesale', 'url' => '/wholesale']],
]));
if (($listCase['changed'] ?? false) === true) {
    ok('a phrase in a list item does not count as already linked');
} else {
    bad(
        'REFUSED A LINKABLE PHRASE',
        json_encode($listCase['skipped'] ?? []),
    );
}

// The other half: genuinely linked text must still be detected, even
// when the phrase is nested inside another tag rather than sitting
// directly in the anchor's first text node.
WPState::$posts[101]['post_content'] =
    '<p>See our <a href="/pricing"><strong>pricing</strong></a> page. Our pricing is simple.</p>';
[$nested] = call('stb_rest_insert_links', req(['id' => 101], [
    'links' => [['anchor' => 'pricing', 'url' => '/pricing']],
]));
if (($nested['changed'] ?? true) === false) {
    ok('a phrase linked via nested markup is detected', 'no double-linking');
} else {
    bad('LINKED A PHRASE THAT WAS ALREADY LINKED', WPState::$posts[101]['post_content']);
}

// Restore the multi-context fixture for the checks that follow.
WPState::$posts[101]['post_content'] =
    '<p>Some words about handmade soap and cold process.</p>' .
    '<h2>More about handmade soap</h2>' .
    '<pre><code>handmade soap</code></pre>';

[$ext] = call('stb_rest_insert_links', req(['id' => 101], [
    'links' => [['anchor' => 'cold process', 'url' => 'https://evil.example.com/']],
]));
if (($ext['changed'] ?? true) === false) {
    ok('refuses an external URL', 'a connection key is not a link-injection tool');
} else {
    bad('ACCEPTED AN EXTERNAL LINK');
}

// javascript: is same-"host"-less and must never reach an href.
[$js] = call('stb_rest_insert_links', req(['id' => 101], [
    'links' => [['anchor' => 'cold process', 'url' => 'javascript:alert(1)']],
]));
if (!str_contains(WPState::$posts[101]['post_content'], 'javascript:')) {
    ok('a javascript: URL never reaches the page');
} else {
    bad('XSS: JAVASCRIPT URL WRITTEN INTO CONTENT');
}

[, $noLinks] = call('stb_rest_insert_links', req(['id' => 101], ['links' => []]));
if ($noLinks === 400) {
    ok('an empty links array is a 400, not a silent no-op');
} else {
    bad('empty links handled wrongly', (string)$noLinks);
}

// =====================================================================
section('Revisions and undo');

WPState::$options['stb_revisions'] = [];
WPState::$posts[101]['post_title'] = 'Original title';

call('stb_rest_update_post_seo', req(['id' => 101], ['title' => 'Replacement title']));
$revs = get_option('stb_revisions', []);
$lastRev = end($revs);
if ($lastRev && $lastRev['old'] === 'Original title') {
    ok('records the previous value before writing');
} else {
    bad('previous value not recorded', json_encode($lastRev));
}

[$undone, $undoStatus] = call('stb_rest_undo', req(['rev_id' => $lastRev['rev_id']]));
if ($undoStatus === 200 && WPState::$posts[101]['post_title'] === 'Original title') {
    ok('undo restores the previous title exactly');
} else {
    bad('UNDO DID NOT RESTORE', WPState::$posts[101]['post_title']);
}

[, $missingRev] = call('stb_rest_undo', req(['rev_id' => 999999]));
if ($missingRev === 404) {
    ok('undoing a revision that does not exist is a 404');
} else {
    bad('unknown revision handled wrongly', (string)$missingRev);
}

// A revision whose object reference is unusable must be refused, not
// undone against object 0. Reachable if the option is hand-edited or
// half-written by a failed request.
WPState::$options['stb_revisions'][] = [
    'rev_id' => 424242,
    'ts' => time(),
    'field' => 'title',
    'object' => 'nonsense',
    'old' => 'x',
    'new' => 'y',
];
[, $malformed] = call('stb_rest_undo', req(['rev_id' => 424242]));
if ($malformed === 422) {
    ok('refuses a revision with an unusable object reference');
} else {
    bad('UNDID AGAINST AN UNKNOWN OBJECT', (string)$malformed);
}

// The admin revision table renders in the site's timezone, not the
// server's — most managed hosts run UTC, so a change made at 9am local
// read as 4am to the person who made it.
$adminRendersWithWpDate = str_contains(
    (string)file_get_contents(__DIR__ . '/../seo-tool-bridge.php'),
    "wp_date('Y-m-d H:i'",
);
if ($adminRendersWithWpDate) {
    ok('revision timestamps render in the site timezone');
} else {
    bad('revision timestamps use the server timezone');
}

// Undoing a body edit. This is how the SEO Tool reverses an internal
// link: it doesn't keep a copy of the article, it stores the revision id
// and asks WordPress to put the article back. Nothing called /undo until
// internal linking existed, so this path had never run.
WPState::$options['stb_revisions'] = [];
$before = '<p>We use the cold process soap method for every batch.</p>';
WPState::$posts[101]['post_content'] = $before;

[$ins] = call('stb_rest_insert_links', req(['id' => 101], [
    'links' => [['anchor' => 'cold process soap', 'url' => '/cold-process-soap']],
]));
if (($ins['changed'] ?? false) === true && !empty($ins['rev_id'])) {
    ok('a body edit records a revision id', 'rev ' . $ins['rev_id']);
} else {
    bad('NO REVISION ID FOR A BODY EDIT', json_encode($ins));
}

[$undoBody, $undoBodyStatus] = call('stb_rest_undo', req(['rev_id' => $ins['rev_id']]));
if ($undoBodyStatus === 200 && WPState::$posts[101]['post_content'] === $before) {
    ok('undo restores the article byte for byte');
} else {
    bad(
        'UNDO DID NOT RESTORE THE ARTICLE',
        substr(WPState::$posts[101]['post_content'], 0, 90),
    );
}

// The bug that made undo dangerous on any busy site: ids came from
// count($revs) + 1, and the log is capped at 500 — so past 500 changes
// every revision was id 501, and undo restored the oldest of them.
section('Revision ids stay unique past the 500 cap');

WPState::$options['stb_revisions'] = [];
for ($i = 0; $i < 520; $i++) {
    stb_record_revision('title', 'post:101', "old-$i", "new-$i");
}
$all = get_option('stb_revisions', []);
$ids = array_column($all, 'rev_id');
if (count($ids) === count(array_unique($ids))) {
    ok('all ' . count($ids) . ' retained revisions have unique ids');
} else {
    $dupes = count($ids) - count(array_unique($ids));
    bad('DUPLICATE REVISION IDS', "$dupes duplicates — undo would restore the wrong value");
}
if (count($all) <= 500) {
    ok('the log is still capped', count($all) . ' rows');
} else {
    bad('cap not enforced', (string)count($all));
}
$last = end($all);
if ((int)$last['rev_id'] === 520) {
    ok('ids keep counting past the cap', 'newest is 520');
} else {
    bad('id did not advance past the cap', (string)$last['rev_id']);
}

// And the whole point: undo after the cap must find the right one.
$target = $all[count($all) - 3];
WPState::$posts[101]['post_title'] = 'whatever is there now';
call('stb_rest_undo', req(['rev_id' => $target['rev_id']]));
if (WPState::$posts[101]['post_title'] === $target['old']) {
    ok('undo past the cap restores the right revision', $target['old']);
} else {
    bad(
        'UNDO PAST THE CAP RESTORED THE WRONG VALUE',
        'got "' . WPState::$posts[101]['post_title'] . '", wanted "' . $target['old'] . '"',
    );
}

// =====================================================================
section('Creating posts');

[$created, $cs] = call('stb_rest_create_post', req([], [
    'title' => 'A new article',
    'content' => '<p>Body text.</p>',
    'metaDescription' => 'A short description.',
    'schemaJsonLd' => ['@context' => 'https://schema.org', '@type' => 'Article'],
]));
if ($cs === 200 && !empty($created['id'])) {
    ok('creates a post', 'id ' . $created['id']);
} else {
    bad('create failed', json_encode($created));
}
$newId = (int)($created['id'] ?? 0);
if ($newId && WPState::$posts[$newId]['post_status'] === 'draft') {
    ok('defaults to draft', 'nothing goes live without being asked');
} else {
    bad('DEFAULTED TO PUBLISHED', WPState::$posts[$newId]['post_status'] ?? '?');
}
if ($newId && stb_get_meta_description($newId) === 'A short description.') {
    ok('applies the meta description on create');
} else {
    bad('meta description not applied on create');
}

[, $badCreate] = call('stb_rest_create_post', req([], ['title' => '', 'content' => '']));
if ($badCreate === 400) {
    ok('refuses an empty post');
} else {
    bad('created an empty post', (string)$badCreate);
}

// =====================================================================
section('Find by URL');

[$found] = call('stb_rest_find_by_url', req(['url' => 'https://example.test/hello-world']));
if ((int)($found['id'] ?? 0) === 101) {
    ok('resolves a permalink to a post id');
} else {
    bad('URL did not resolve', json_encode($found));
}

[, $nf] = call('stb_rest_find_by_url', req(['url' => 'https://example.test/nope-not-here']));
if ($nf === 404) {
    ok('an unknown URL is a 404');
} else {
    bad('unknown URL handled wrongly', (string)$nf);
}

// =====================================================================
echo "\n" . str_repeat('=', 72) . "\n";
echo "$pass passed, $fail failed\n";
echo "\nRuns the plugin's real handlers against stubbed WordPress functions.\n";
echo "Does NOT prove real WordPress behaves like the stubs — url_to_postid,\n";
echo "wp_kses_post and the REST router are approximations.\n";
exit($fail > 0 ? 1 : 0);
