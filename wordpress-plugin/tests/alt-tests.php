<?php
/**
 * Alt text reaching the page, not just the database.
 *
 * The third write found to be fictional by running this on a real
 * WordPress. Setting an attachment's `_wp_attachment_image_alt` stored
 * the text, answered {ok: true}, and read back correctly through this
 * plugin's own /images endpoint — while the page carried on serving
 * alt="".
 *
 * The block editor writes the <img> straight into post_content with its
 * alt baked in. Attachment meta is read by wp_get_attachment_image();
 * an inline <img> does not consult it. So on essentially every modern
 * WordPress image, the agent reported the finding fixed and nothing on
 * the page changed.
 *
 * These cover the rewriting, which is string surgery on live post
 * content and therefore the riskiest thing in the plugin after
 * robots.txt.
 *
 * Included by run-tests.php.
 */

t('alt: rewrites the inline img for that attachment', function () {
    $before = '<figure class="wp-block-image">'
        . '<img src="/x.png" alt="" class="wp-image-6"/></figure>';
    $after = stb_rewrite_img_alt($before, 6, 'A grey pixel');
    ok(str_contains($after, 'alt="A grey pixel"'), 'the alt must be replaced');
    ok(str_contains($after, 'class="wp-image-6"'), 'the class must survive');
    ok(str_contains($after, 'src="/x.png"'), 'the src must survive');
});

t('alt: leaves other images completely alone', function () {
    // The failure that would matter most: rewriting the wrong picture.
    $before = '<img src="/a.png" alt="keep me" class="wp-image-7"/>'
        . '<img src="/b.png" alt="" class="wp-image-6"/>';
    $after = stb_rewrite_img_alt($before, 6, 'new text');
    ok(str_contains($after, 'alt="keep me"'), 'the other image is untouched');
    ok(str_contains($after, 'alt="new text"'), 'ours is changed');
});

t('alt: wp-image-6 never matches wp-image-60', function () {
    // A substring match here silently edits an unrelated image on a site
    // with more than nine uploads, which is all of them.
    $before = '<img src="/x.png" alt="sixty" class="wp-image-60"/>';
    eq(stb_rewrite_img_alt($before, 6, 'six'), $before, 'no change at all');
});

t('alt: adds the attribute when the tag has none', function () {
    $before = '<img src="/x.png" class="wp-image-6"/>';
    $after = stb_rewrite_img_alt($before, 6, 'Added');
    ok(str_contains($after, 'alt="Added"'), 'alt is added');
    ok(str_ends_with(trim($after), '/>'), 'the tag stays well formed');
});

t('alt: handles single-quoted attributes', function () {
    // Hand-written HTML in a classic-editor post.
    $before = "<img src='/x.png' alt='old' class='wp-image-6'/>";
    $after = stb_rewrite_img_alt($before, 6, 'new');
    ok(str_contains($after, 'new'), 'still rewritten');
    ok(!str_contains($after, 'old'), 'the previous text is gone');
});

t('alt: escapes text that would break out of the attribute', function () {
    $before = '<img src="/x.png" alt="" class="wp-image-6"/>';
    $after = stb_rewrite_img_alt($before, 6, 'He said "hi" & left');
    ok(!str_contains($after, 'alt="He said "hi"'), 'quotes must be escaped');
    // One img in, one img out — a broken quote would fragment the tag.
    eq(substr_count($after, '<img'), 1, 'still exactly one tag');
});

t('alt: an image with no class is not touched', function () {
    // No class means no way to know which attachment it is, and guessing
    // would edit an image nobody asked us to.
    $before = '<img src="/x.png" alt=""/>';
    eq(stb_rewrite_img_alt($before, 6, 'x'), $before, 'left alone');
});

t('alt: content with no matching image is returned unchanged', function () {
    // Unchanged is what lets the caller report "nothing to do" rather
    // than writing an identical post and recording a revision for it.
    $before = '<p>No images here.</p>';
    eq(stb_rewrite_img_alt($before, 6, 'x'), $before, 'identical');
});
