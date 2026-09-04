<?php
/**
 * The plugin's own code, executed.
 *
 * Every claim made about this plugin so far came from reading it. That
 * is how `canonical` sat in the client's request type for months while
 * the handler ignored it and answered {ok: true} — a write that reported
 * success and changed nothing. Reading did not catch it. Running it
 * would have, on the first try.
 *
 * These call the real handlers against the stubs in wp-stubs.php and
 * assert what actually happened to the stored state: the write, the
 * revision, and the undo. Run with:
 *
 *     php wordpress-plugin/tests/run-tests.php
 *
 * Wired into `pnpm test:php`, and into CI alongside the Vitest suite.
 */

define('STB_TESTING', true);

// A real directory, so the "physical robots.txt wins" branch can be
// exercised with a real file rather than a mocked one.
$root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'stb-wp-root' . DIRECTORY_SEPARATOR;
if (!is_dir($root)) {
    mkdir($root, 0777, true);
}
@unlink($root . 'robots.txt');
define('ABSPATH', $root);

require __DIR__ . '/wp-stubs.php';
require __DIR__ . '/../seo-tool-bridge.php';

// ---------------------------------------------------------------- harness

$passed = 0;
$failed = [];

function t(string $name, callable $fn): void
{
    global $passed, $failed;
    wp_reset_state();
    // Printed as it goes, not collected and printed at the end. A test
    // that hard-exits the process — wp_redirect does, in real WordPress —
    // otherwise takes the entire report with it and the run looks like a
    // clean pass with no output.
    try {
        $fn();
        $passed++;
        echo "  ok    $name" . PHP_EOL;
    } catch (Throwable $e) {
        $failed[] = [$name, $e->getMessage()];
        echo "  FAIL  $name" . PHP_EOL;
    }
}

function ok($cond, string $msg): void
{
    if (!$cond) {
        throw new RuntimeException($msg);
    }
}

function eq($actual, $expected, string $msg): void
{
    if ($actual !== $expected) {
        throw new RuntimeException(
            $msg . "\n     expected: " . var_export($expected, true) .
            "\n     actual:   " . var_export($actual, true),
        );
    }
}

function req(array $params = [], $json = null): WP_REST_Request
{
    return new WP_REST_Request($params, $json);
}

// ============================================================
//  Canonical and robots meta — the fields that silently did nothing
// ============================================================

t('canonical: written, read back, and recorded for undo', function () {
    wp_insert_test_post(42);

    $res = stb_rest_update_post_seo(req(['id' => 42], ['canonical' => 'https://example.test/real']));
    $data = $res->get_data();
    ok($data['ok'] === true, 'the write should succeed');
    eq(count($data['changes']), 1, 'exactly one field changed');
    eq($data['changes'][0]['field'], 'canonical', 'the change should name canonical');

    // The whole point: it is actually stored, in every SEO plugin's key.
    eq(get_post_meta(42, '_yoast_wpseo_canonical', true), 'https://example.test/real', 'Yoast key');
    eq(get_post_meta(42, 'rank_math_canonical_url', true), 'https://example.test/real', 'Rank Math key');

    // And it reads back through the GET the agent uses to verify.
    $get = stb_rest_get_post_seo(req(['id' => 42]))->get_data();
    eq($get['canonical'], 'https://example.test/real', 'GET must return what POST wrote');
});

t('canonical: undo restores the previous value exactly', function () {
    wp_insert_test_post(42);
    update_post_meta(42, '_yoast_wpseo_canonical', 'https://example.test/old');

    $res = stb_rest_update_post_seo(req(['id' => 42], ['canonical' => 'https://example.test/new']));
    $rev = $res->get_data()['changes'][0]['rev_id'];

    $undo = stb_rest_undo(req(['rev_id' => $rev]));
    // Assert the status too. Checking only the restored value would have
    // reported this as "undo did not work" without saying that the
    // endpoint had refused outright with a 400.
    eq($undo->get_status(), 200, 'undo must be accepted, not refused');
    eq(
        get_post_meta(42, '_yoast_wpseo_canonical', true),
        'https://example.test/old',
        'undo must put the original canonical back',
    );
});

t('canonical: writing the same value is not a change', function () {
    wp_insert_test_post(42);
    update_post_meta(42, '_yoast_wpseo_canonical', 'https://example.test/a');
    $res = stb_rest_update_post_seo(req(['id' => 42], ['canonical' => 'https://example.test/a']));
    eq(count($res->get_data()['changes']), 0, 'an identical value must not record a revision');
});

t('robots meta: noindex round-trips through both plugins formats', function () {
    wp_insert_test_post(7);

    stb_rest_update_post_seo(req(['id' => 7], ['robots' => 'noindex,nofollow']));
    eq(get_post_meta(7, '_yoast_wpseo_meta-robots-noindex', true), '1', 'Yoast noindex sentinel');
    eq(get_post_meta(7, 'rank_math_robots', true), ['noindex', 'nofollow'], 'Rank Math array');

    $get = stb_rest_get_post_seo(req(['id' => 7]))->get_data();
    eq($get['robots'], 'noindex,nofollow', 'what went in must come back out');
});

t('robots meta: index,follow is stored as the explicit opposite', function () {
    // Removing a noindex must not mean "delete the directive" — an absent
    // value inherits the SEO plugin's site-wide default, which on some
    // setups is the noindex being removed.
    wp_insert_test_post(7);
    stb_rest_update_post_seo(req(['id' => 7], ['robots' => 'index,follow']));
    eq(get_post_meta(7, '_yoast_wpseo_meta-robots-noindex', true), '2', 'Yoast index sentinel');
    $get = stb_rest_get_post_seo(req(['id' => 7]))->get_data();
    eq($get['robots'], 'index,follow', 'must read back as index,follow');
});

t('robots meta: undo restores the previous directive', function () {
    wp_insert_test_post(7);
    stb_rest_update_post_seo(req(['id' => 7], ['robots' => 'noindex']));
    $res = stb_rest_update_post_seo(req(['id' => 7], ['robots' => 'index,follow']));
    $rev = $res->get_data()['changes'][0]['rev_id'];

    $undo = stb_rest_undo(req(['rev_id' => $rev]));
    eq($undo->get_status(), 200, 'undo must be accepted');
    $get = stb_rest_get_post_seo(req(['id' => 7]))->get_data();
    // 'noindex' in, 'noindex' out. Rank Math stores the token list it
    // was given and is read first, so the round-trip is lossless rather
    // than normalised to a noindex/nofollow pair — which is what this
    // assertion originally expected, wrongly.
    eq($get['robots'], 'noindex', 'the previous directive comes back unchanged');
});

t('title and description still work', function () {
    wp_insert_test_post(1, ['post_title' => 'Old']);
    $res = stb_rest_update_post_seo(req(['id' => 1], [
        'title' => 'New title',
        'meta_description' => 'New description.',
    ]));
    eq(count($res->get_data()['changes']), 2, 'both fields change');
    eq(get_post(1)->post_title, 'New title', 'title written');
    eq(stb_get_meta_description(1), 'New description.', 'description written');
});

t('a missing post is refused rather than silently creating meta', function () {
    $res = stb_rest_update_post_seo(req(['id' => 999], ['canonical' => 'https://x.test/']));
    eq($res->get_status(), 404, 'unknown post must 404');
});

// ============================================================
//  robots.txt
// ============================================================

t('robots.txt: stored, served through the filter, and undoable', function () {
    $body = "User-agent: *\nDisallow: /wp-admin/\n\nUser-agent: GPTBot\nDisallow: /\n";

    $res = stb_rest_set_robots_txt(req([], ['content' => $body]));
    ok($res->get_data()['ok'] === true, 'write should succeed');

    // Newlines survive. This is why the handler must not use
    // sanitize_text_field, which collapses them — a one-line robots.txt
    // is a broken robots.txt.
    eq(get_option('stb_robots_txt'), $body, 'newlines must be preserved verbatim');
    ok(substr_count(get_option('stb_robots_txt'), "\n") >= 4, 'multi-line');

    // And it is what WordPress would actually serve.
    eq(apply_filters('robots_txt', "default\n", true), $body, 'the filter must return ours');

    $rev = $res->get_data()['changes'][0]['rev_id'];
    stb_rest_undo(req(['rev_id' => $rev]));
    eq(get_option('stb_robots_txt', ''), '', 'undo must remove what we added');
    eq(apply_filters('robots_txt', "default\n", true), "default\n", 'and stop overriding');
});

t('robots.txt: undo restores a previous body rather than clearing it', function () {
    update_option('stb_robots_txt', "User-agent: *\nAllow: /\n");
    $res = stb_rest_set_robots_txt(req([], ['content' => "User-agent: *\nDisallow: /\n"]));
    $rev = $res->get_data()['changes'][0]['rev_id'];

    stb_rest_undo(req(['rev_id' => $rev]));
    eq(get_option('stb_robots_txt'), "User-agent: *\nAllow: /\n", 'the earlier body comes back');
});

t('robots.txt: a real file on disk wins and the write is refused', function () {
    // WordPress ignores the robots_txt filter entirely when a physical
    // file exists. Accepting the write would report a success the user
    // could only disprove by loading the URL.
    file_put_contents(ABSPATH . 'robots.txt', "User-agent: *\n");
    try {
        $res = stb_rest_set_robots_txt(req([], ['content' => "User-agent: *\nDisallow: /\n"]));
        eq($res->get_status(), 409, 'must refuse with a conflict');
        ok(str_contains($res->get_data()['error'], 'on disk'), 'and say why');
        eq(get_option('stb_robots_txt', ''), '', 'and store nothing');

        $get = stb_rest_get_robots_txt(req())->get_data();
        eq($get['physical_file'], true, 'GET must report the physical file');
        eq($get['managed'], false, 'and must not claim to be managing robots.txt');
    } finally {
        @unlink(ABSPATH . 'robots.txt');
    }
});

t('robots.txt: content is required', function () {
    eq(stb_rest_set_robots_txt(req([], []))->get_status(), 400, 'no content is a 400');
});

// ============================================================
//  Redirects
// ============================================================

t('redirects: stored normalised and applied on a 404', function () {
    stb_rest_set_redirects(req([], ['redirects' => [
        ['from' => 'https://example.test/old-page/', 'to' => '/new-page', 'code' => 301],
    ]]));

    $stored = get_option('stb_redirects');
    eq($stored[0]['from'], '/old-page', 'from is stored home-relative with no trailing slash');

    $GLOBALS['wp_is_404'] = true;
    $_SERVER['REQUEST_URI'] = '/old-page/';
    // The stub throws where WordPress would exit.
    try {
        stb_apply_redirects();
        ok(false, 'a matching rule should have redirected');
    } catch (StbRedirected $e) {
        // expected
    }
    eq(count($GLOBALS['wp_redirects']), 1, 'one redirect fired');
    eq($GLOBALS['wp_redirects'][0]['to'], '/new-page', 'to the right place');
    eq($GLOBALS['wp_redirects'][0]['status'], 301, 'with the right code');
});

t('redirects: never fire on a page that exists', function () {
    // The rule that stops a redirect permanently shadowing a real page
    // somebody publishes later.
    stb_rest_set_redirects(req([], ['redirects' => [
        ['from' => '/live', 'to' => '/somewhere', 'code' => 301],
    ]]));
    $GLOBALS['wp_is_404'] = false;
    $_SERVER['REQUEST_URI'] = '/live';
    stb_apply_redirects();
    eq(count($GLOBALS['wp_redirects']), 0, 'a 200 page must never be redirected');
});

t('redirects: a self-referencing rule is dropped, not stored', function () {
    // Storing it produces ERR_TOO_MANY_REDIRECTS on a live page.
    stb_rest_set_redirects(req([], ['redirects' => [
        ['from' => '/loop', 'to' => '/loop', 'code' => 301],
        ['from' => '/fine', 'to' => '/ok', 'code' => 301],
    ]]));
    $stored = get_option('stb_redirects');
    eq(count($stored), 1, 'only the sane rule survives');
    eq($stored[0]['from'], '/fine', 'and it is the right one');
});

t('redirects: an unknown status code falls back to 301', function () {
    stb_rest_set_redirects(req([], ['redirects' => [
        ['from' => '/a', 'to' => '/b', 'code' => 418],
    ]]));
    eq(get_option('stb_redirects')[0]['code'], 301, 'teapots are not redirects');
});

t('redirects: undo restores the previous map', function () {
    stb_rest_set_redirects(req([], ['redirects' => [['from' => '/a', 'to' => '/b', 'code' => 301]]]));
    $res = stb_rest_set_redirects(req([], ['redirects' => [['from' => '/c', 'to' => '/d', 'code' => 301]]]));
    $rev = $res->get_data()['changes'][0]['rev_id'];

    stb_rest_undo(req(['rev_id' => $rev]));
    $stored = get_option('stb_redirects');
    eq(count($stored), 1, 'one rule');
    eq($stored[0]['from'], '/a', 'the previous map is back');
});

// ============================================================
//  Hardening
// ============================================================

t('hardening: every toggle defaults to off', function () {
    $h = stb_rest_get_hardening(req())->get_data()['hardening'];
    foreach ($h as $k => $v) {
        eq($v, false, "$k must default to off — installing the plugin changes nothing");
    }
    ok(count($h) === 6, 'six toggles');
});

t('hardening: a partial patch leaves the others alone', function () {
    stb_rest_set_hardening(req([], ['disable_xmlrpc' => true, 'disable_emoji' => true]));
    stb_rest_set_hardening(req([], ['disable_emoji' => false]));

    $h = stb_rest_get_hardening(req())->get_data()['hardening'];
    eq($h['disable_xmlrpc'], true, 'untouched key keeps its value');
    eq($h['disable_emoji'], false, 'patched key changes');
});

t('hardening: noindex author archives only applies on author pages', function () {
    stb_rest_set_hardening(req([], ['noindex_author_archives' => true]));

    $GLOBALS['wp_is_author'] = true;
    $robots = stb_robots_author_archives(['index' => true]);
    eq($robots['noindex'] ?? null, true, 'author archive gets noindex');
    ok(!isset($robots['index']), 'and index is removed, not left contradicting it');

    $GLOBALS['wp_is_author'] = false;
    $robots = stb_robots_author_archives(['index' => true]);
    ok(!isset($robots['noindex']), 'every other page is untouched');
});

t('hardening: undo restores the whole previous toggle set', function () {
    stb_rest_set_hardening(req([], ['disable_xmlrpc' => true]));
    $res = stb_rest_set_hardening(req([], ['hide_wp_version' => true, 'disable_xmlrpc' => false]));
    $rev = $res->get_data()['changes'][0]['rev_id'];

    stb_rest_undo(req(['rev_id' => $rev]));
    $h = stb_rest_get_hardening(req())->get_data()['hardening'];
    eq($h['disable_xmlrpc'], true, 'restored');
    eq($h['hide_wp_version'], false, 'and the new one is gone');
});

// ============================================================
//  The revision log itself
// ============================================================

t('revision ids stay unique past the 500-entry cap', function () {
    // The list is capped at 500. Taking the next id from count() meant
    // every revision after the 500th was id 501, and /undo/501 restored
    // a value from hundreds of edits ago to a live site, reporting
    // success.
    for ($i = 0; $i < 520; $i++) {
        stb_record_revision('title', 'post:1', "old$i", "new$i");
    }
    $revs = get_option('stb_revisions');
    $ids = array_column($revs, 'rev_id');
    eq(count($ids), count(array_unique($ids)), 'no duplicate revision ids');
    eq(max($ids), 520, 'ids keep climbing past the cap');
});

t('an unidentifiable revision target is refused, not applied to object 0', function () {
    $revs = get_option('stb_revisions', []);
    $revs[] = ['rev_id' => 1, 'ts' => time(), 'field' => 'title', 'object' => 'garbage', 'old' => 'a', 'new' => 'b'];
    update_option('stb_revisions', $revs);

    eq(stb_rest_undo(req(['rev_id' => 1]))->get_status(), 422, 'must refuse');
});

t('site-level revisions are identifiable', function () {
    // The guard above required "<thing>:<digits>". Every site-level
    // change would have been refused as unidentifiable while the UI
    // still offered an undo button.
    $res = stb_rest_set_robots_txt(req([], ['content' => "User-agent: *\n"]));
    $rev = $res->get_data()['changes'][0]['rev_id'];
    eq(stb_rest_undo(req(['rev_id' => $rev]))->get_status(), 200, 'site targets must undo cleanly');
});

// Split into its own file: these need output buffering and a couple of
// extra stubs, and keeping them here made this file harder to read than
// the thing it tests.
require __DIR__ . '/head-tests.php';

// ---------------------------------------------------------------- report

echo "\n";
foreach ($failed as [$name, $msg]) {
    echo "  FAIL  $name\n        $msg\n\n";
}
$total = $passed + count($failed);
echo $failed
    ? sprintf("  %d of %d passed, %d FAILED\n\n", $passed, $total, count($failed))
    : sprintf("  all %d plugin tests passed\n\n", $total);

exit($failed ? 1 : 0);
