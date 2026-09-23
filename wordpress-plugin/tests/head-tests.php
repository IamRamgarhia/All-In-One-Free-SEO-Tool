<?php
/**
 * Rendering the tags we store.
 *
 * Found the first time this plugin ran on a real WordPress. Writing a
 * meta description stored it in three SEO plugins' meta keys, the REST
 * API read it back correctly, and the page served zero description tags
 * — because none of those plugins was installed and nothing else reads
 * those keys. The canonical was worse: we wrote one pointing elsewhere
 * and WordPress core's own rel_canonical kept winning, so the API
 * reported a change that had no effect on anything Google sees.
 *
 * Every layer was telling the truth. The client sent the right JSON, the
 * handler stored the right value, the read-back matched. The site just
 * did not change. That is the exact failure this codebase keeps
 * producing, and only loading the page found it.
 *
 * Included by run-tests.php.
 */

/** Capture what the plugin prints into <head> for one post. */
function head_output(int $postId): string
{
    $GLOBALS['wp_is_singular'] = true;
    $GLOBALS['wp_current_post'] = $postId;
    ob_start();
    stb_render_head_tags();
    return (string)ob_get_clean();
}

t('head: renders the description and canonical we stored', function () {
    wp_insert_test_post(1);
    stb_set_meta_description(1, 'A description somebody asked us to write.');
    stb_set_canonical(1, 'https://example.test/real');

    $out = head_output(1);
    ok(str_contains($out, 'name="description"'), 'a description tag must be printed');
    ok(str_contains($out, 'A description somebody asked us to write.'), 'with our text');
    ok(str_contains($out, 'rel="canonical"'), 'a canonical must be printed');
    ok(str_contains($out, 'https://example.test/real'), 'with our URL');
    eq(substr_count($out, 'rel="canonical"'), 1, 'exactly one canonical, never two');
});

t('head: removes core rel_canonical so there is only ever one', function () {
    // Core prints its own at priority 10. Leaving it registered gives
    // the page two canonicals pointing at different URLs, which is worse
    // than the problem being fixed.
    wp_insert_test_post(1);
    stb_set_canonical(1, 'https://example.test/real');
    add_action('wp_head', 'rel_canonical', 10);

    head_output(1);
    $still = array_filter(
        $GLOBALS['wp_actions']['wp_head'] ?? [],
        static fn($e) => $e['cb'] === 'rel_canonical',
    );
    eq(count($still), 0, "core's canonical must be unhooked");
});

t('head: prints nothing when there is nothing stored', function () {
    wp_insert_test_post(1);
    eq(head_output(1), '', 'an empty value must not print an empty tag');
});

t('head: prints the robots directive when one is set', function () {
    wp_insert_test_post(1);
    stb_set_robots_meta(1, 'noindex,follow');
    $out = head_output(1);
    ok(str_contains($out, 'name="robots"'), 'a robots tag must be printed');
    ok(str_contains($out, 'noindex'), 'with the directive we stored');
});

t('head: escapes what it prints', function () {
    // The description is user-supplied through the REST API. An
    // unescaped quote would break out of the attribute.
    wp_insert_test_post(1);
    stb_set_meta_description(1, 'He said "hi" & left');
    $out = head_output(1);
    ok(!str_contains($out, 'content="He said "hi"'), 'quotes must be escaped');
    ok(str_contains($out, '&amp;') || str_contains($out, '&#038;'), 'ampersand escaped');
});

t('head: is silent on anything that is not a single post', function () {
    wp_insert_test_post(1);
    stb_set_meta_description(1, 'Something.');
    $GLOBALS['wp_is_singular'] = false;
    $GLOBALS['wp_current_post'] = 1;
    ob_start();
    stb_render_head_tags();
    eq((string)ob_get_clean(), '', 'archives and the home page are left alone');
});
