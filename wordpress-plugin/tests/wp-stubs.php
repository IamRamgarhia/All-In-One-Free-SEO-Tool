<?php
/**
 * Just enough WordPress to run the plugin's own code.
 *
 * Why this exists: the plugin runs inside other people's live sites and
 * had never been executed anywhere. Everything claimed about it was
 * inferred from reading it — including, for months, the claim that it
 * wrote canonical tags, which it did not. Unit tests on the TypeScript
 * client prove what goes onto the wire; they say nothing about what the
 * PHP does when it arrives.
 *
 * These are stubs, not a WordPress. They implement the small set of
 * behaviours the plugin actually depends on — options, post meta, the
 * REST request/response shapes, and the hook registry — so the plugin's
 * real handlers can be called and their real effects observed. Anything
 * that needs a database, a theme or an HTTP stack is out of scope and is
 * marked as such where it matters.
 */

// ---------------------------------------------------------------- state

$GLOBALS['wp_options'] = [];
$GLOBALS['wp_postmeta'] = [];
$GLOBALS['wp_posts'] = [];
$GLOBALS['wp_filters'] = [];
$GLOBALS['wp_actions'] = [];
$GLOBALS['wp_redirects'] = [];
$GLOBALS['wp_is_404'] = false;
$GLOBALS['wp_is_author'] = false;
$GLOBALS['wp_is_singular'] = false;
$GLOBALS['wp_current_post'] = 0;
$GLOBALS['wp_exited'] = false;

// Set by the test runner before this file loads, so a real robots.txt
// can be created on disk. file_exists() is a PHP builtin and cannot be
// replaced, so the only honest way to exercise that branch is a real
// file in a real directory.
if (!defined('ABSPATH')) {
    define('ABSPATH', sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'stb-wp-root' . DIRECTORY_SEPARATOR);
}
if (!is_dir(ABSPATH)) {
    mkdir(ABSPATH, 0777, true);
}

function wp_reset_state(): void
{
    $GLOBALS['wp_options'] = [];
    $GLOBALS['wp_postmeta'] = [];
    $GLOBALS['wp_posts'] = [];
    $GLOBALS['wp_redirects'] = [];
    $GLOBALS['wp_is_404'] = false;
    $GLOBALS['wp_is_author'] = false;
    $GLOBALS['wp_is_singular'] = false;
    $GLOBALS['wp_current_post'] = 0;
    $GLOBALS['wp_exited'] = false;
}

// --------------------------------------------------------------- options

function get_option($key, $default = false)
{
    return array_key_exists($key, $GLOBALS['wp_options'])
        ? $GLOBALS['wp_options'][$key]
        : $default;
}

function update_option($key, $value, $autoload = null): bool
{
    $GLOBALS['wp_options'][$key] = $value;
    return true;
}

function delete_option($key): bool
{
    unset($GLOBALS['wp_options'][$key]);
    return true;
}

// ------------------------------------------------------------- post meta

function get_post_meta($post_id, $key = '', $single = false)
{
    $v = $GLOBALS['wp_postmeta'][$post_id][$key] ?? '';
    return $single ? $v : ($v === '' ? [] : [$v]);
}

function update_post_meta($post_id, $key, $value): bool
{
    $GLOBALS['wp_postmeta'][$post_id][$key] = $value;
    return true;
}

function delete_post_meta($post_id, $key): bool
{
    unset($GLOBALS['wp_postmeta'][$post_id][$key]);
    return true;
}

// ----------------------------------------------------------------- posts

function wp_insert_test_post(int $id, array $fields = []): void
{
    $GLOBALS['wp_posts'][$id] = (object)array_merge([
        'ID' => $id,
        'post_title' => 'A title',
        'post_content' => 'Body text.',
        'post_status' => 'publish',
        'post_type' => 'post',
        'post_modified' => '2026-09-04 00:00:00',
    ], $fields);
}

function get_post($id = 0)
{
    return $GLOBALS['wp_posts'][(int)$id] ?? null;
}

function wp_update_post($args, $wp_error = false)
{
    $id = (int)($args['ID'] ?? 0);
    if (!isset($GLOBALS['wp_posts'][$id])) {
        return $wp_error ? new WP_Error('invalid', 'No such post') : 0;
    }
    foreach ($args as $k => $v) {
        if ($k === 'ID') {
            continue;
        }
        $GLOBALS['wp_posts'][$id]->$k = $v;
    }
    return $id;
}

function get_permalink($id = 0)
{
    return 'https://example.test/?p=' . (int)$id;
}

function url_to_postid($url)
{
    foreach ($GLOBALS['wp_posts'] as $id => $p) {
        if (get_permalink($id) === $url) {
            return $id;
        }
    }
    return 0;
}

// ------------------------------------------------------------ misc/core

function home_url($path = '')
{
    return 'https://example.test' . $path;
}

function site_url($path = '')
{
    return home_url($path);
}

function get_bloginfo($what = '')
{
    return $what === 'name' ? 'Example Site' : '';
}

function sanitize_text_field($str)
{
    // Core strips tags, then collapses whitespace including newlines.
    // The collapse is the part that matters here: it is why robots.txt
    // must NOT go through this function.
    $s = strip_tags((string)$str);
    $s = preg_replace('/[\r\n\t]+/', ' ', $s);
    return trim(preg_replace('/\s{2,}/', ' ', $s));
}

function esc_url_raw($url)
{
    $u = trim((string)$url);
    if ($u === '') {
        return '';
    }
    // Close enough to core for our purposes: refuse anything that is not
    // http(s) or a relative path.
    if (preg_match('#^(https?:)?//#i', $u) || str_starts_with($u, '/')) {
        return $u;
    }
    return preg_match('#^https?://#i', $u) ? $u : '';
}

function wp_json_encode($data, $options = 0, $depth = 512)
{
    return json_encode($data, $options, $depth);
}

function wp_generate_password($length = 12, $special = true, $extra = false)
{
    return substr(str_repeat('abcdef0123456789', 8), 0, $length);
}

function absint($v)
{
    return abs((int)$v);
}

function is_wp_error($thing)
{
    return $thing instanceof WP_Error;
}

function __return_false()
{
    return false;
}

function __return_true()
{
    return true;
}

function __return_empty_string()
{
    return '';
}

function current_time($type = 'timestamp', $gmt = 0)
{
    return time();
}

function is_admin()
{
    return false;
}

function is_singular($types = '')
{
    return (bool)($GLOBALS['wp_is_singular'] ?? false);
}

function get_the_ID()
{
    return $GLOBALS['wp_current_post'] ?? 0;
}

function esc_url($u)
{
    return esc_url_raw($u);
}

function is_404()
{
    return (bool)$GLOBALS['wp_is_404'];
}

function is_author()
{
    return (bool)$GLOBALS['wp_is_author'];
}

/**
 * Records the redirect and then throws.
 *
 * WordPress code calls exit immediately after wp_redirect, which is
 * correct in a web request and fatal in a test runner: the first
 * redirect test killed the whole process, and because every assertion
 * result was printed at the end, the run produced zero output and exit
 * code 0. It looked like nothing had happened rather than like a
 * failure — the exact silent-success shape this suite exists to catch.
 */
class StbRedirected extends RuntimeException
{
    public function __construct(public string $to, public int $status)
    {
        parent::__construct("redirect to $to ($status)");
    }
}

function wp_redirect($location, $status = 302, $x = null)
{
    $GLOBALS['wp_redirects'][] = ['to' => $location, 'status' => $status];
    throw new StbRedirected((string)$location, (int)$status);
}

function wp_deregister_script($handle): void
{
}

function wp_safe_redirect($location, $status = 302)
{
    return wp_redirect($location, $status);
}

// --------------------------------------------------------------- hooks

function add_filter($tag, $cb, $priority = 10, $args = 1): bool
{
    $GLOBALS['wp_filters'][$tag][] = ['cb' => $cb, 'priority' => $priority];
    return true;
}

function add_action($tag, $cb, $priority = 10, $args = 1): bool
{
    $GLOBALS['wp_actions'][$tag][] = ['cb' => $cb, 'priority' => $priority];
    return true;
}

function remove_action($tag, $cb, $priority = 10): bool
{
    if (!isset($GLOBALS['wp_actions'][$tag])) {
        return false;
    }
    $GLOBALS['wp_actions'][$tag] = array_values(array_filter(
        $GLOBALS['wp_actions'][$tag],
        static fn($e) => $e['cb'] !== $cb,
    ));
    return true;
}

function remove_filter($tag, $cb, $priority = 10): bool
{
    return remove_action($tag, $cb, $priority);
}

function has_filter($tag, $cb = false): bool
{
    if (!isset($GLOBALS['wp_filters'][$tag])) {
        return false;
    }
    if ($cb === false) {
        return true;
    }
    foreach ($GLOBALS['wp_filters'][$tag] as $e) {
        if ($e['cb'] === $cb) {
            return true;
        }
    }
    return false;
}

/** Run every callback registered on a filter, in priority order. */
function apply_filters($tag, $value, ...$args)
{
    $entries = $GLOBALS['wp_filters'][$tag] ?? [];
    usort($entries, static fn($a, $b) => $a['priority'] <=> $b['priority']);
    foreach ($entries as $e) {
        $value = call_user_func_array($e['cb'], array_merge([$value], $args));
    }
    return $value;
}

/** Run every callback registered on an action, in priority order. */
function do_action($tag, ...$args): void
{
    $entries = $GLOBALS['wp_actions'][$tag] ?? [];
    usort($entries, static fn($a, $b) => $a['priority'] <=> $b['priority']);
    foreach ($entries as $e) {
        call_user_func_array($e['cb'], $args);
    }
}

function register_rest_route($ns, $route, $args = []): bool
{
    $GLOBALS['wp_rest_routes'][$ns . $route] = $args;
    return true;
}

function register_activation_hook($file, $cb): void
{
}

function add_menu_page(...$a): void
{
}

function add_management_page(...$a): void
{
}

function esc_html($t)
{
    return htmlspecialchars((string)$t, ENT_QUOTES);
}

function esc_attr($t)
{
    return esc_html($t);
}

function esc_html__($t, $d = null)
{
    return esc_html($t);
}

function wp_nonce_field(...$a): void
{
}

function check_admin_referer(...$a): bool
{
    return true;
}

function current_user_can($cap): bool
{
    return true;
}

function admin_url($p = '')
{
    return home_url('/wp-admin/' . $p);
}

// WordPress return-shape constants, used by get_page_by_path and friends.
define('OBJECT', 'OBJECT');
define('ARRAY_A', 'ARRAY_A');
define('ARRAY_N', 'ARRAY_N');

// ------------------------------------------------------------ media

function get_post_thumbnail_id($post_id = 0)
{
    return (int)get_post_meta((int)$post_id, '_thumbnail_id', true);
}

/** Attachments whose parent is this post, filtered by mime prefix. */
function get_attached_media($type, $post_id = 0): array
{
    $out = [];
    foreach ($GLOBALS['wp_posts'] as $p) {
        if (
            ($p->post_type ?? '') === 'attachment'
            && (int)($p->post_parent ?? 0) === (int)$post_id
            && str_starts_with((string)($p->post_mime_type ?? 'image/jpeg'), (string)$type)
        ) {
            $out[] = $p;
        }
    }
    return $out;
}

function wp_get_attachment_url($id)
{
    $p = $GLOBALS['wp_posts'][(int)$id] ?? null;
    if (!$p) {
        return false;
    }
    return $p->guid ?? home_url('/wp-content/uploads/' . (int)$id . '.jpg');
}

function wp_get_attachment_image($id, $size = 'thumbnail', $icon = false, $attr = []): string
{
    $url = wp_get_attachment_url($id);
    if (!$url) {
        return '';
    }
    $alt = esc_attr((string)get_post_meta((int)$id, '_wp_attachment_image_alt', true));
    return sprintf('<img src="%s" alt="%s" />', esc_url($url), $alt);
}

// ----------------------------------------------------------- database

/**
 * Just enough of WordPress's $wpdb for the one query the plugin runs:
 * find posts whose content mentions wp-image-<id>, so alt text written
 * to the media library can also be applied to the markup.
 *
 * Backed by the same in-memory posts as everything else here, rather
 * than by parsing the SQL — the needle is read back out of the query.
 * It is an approximation, and the file says so at the end of its run.
 */
class StbTestWpdb
{
    public string $posts = 'wp_posts';

    public function prepare($sql, ...$args)
    {
        foreach ($args as $a) {
            $sql = preg_replace('/%s/', (string)$a, (string)$sql, 1);
        }
        return $sql;
    }

    public function esc_like($text)
    {
        return addcslashes((string)$text, '_%\\');
    }

    public function get_results($sql): array
    {
        if (!preg_match('/wp-image-(\d+)/', (string)$sql, $m)) {
            return [];
        }
        $needle = 'wp-image-' . $m[1];
        $out = [];
        foreach ($GLOBALS['wp_posts'] as $p) {
            if (in_array($p->post_status ?? 'publish', ['trash', 'auto-draft'], true)) {
                continue;
            }
            if (in_array($p->post_type ?? 'post', ['revision', 'attachment'], true)) {
                continue;
            }
            if (str_contains((string)($p->post_content ?? ''), $needle)) {
                $out[] = (object)['ID' => $p->ID, 'post_content' => $p->post_content];
            }
            if (count($out) >= 20) {
                break;
            }
        }
        return $out;
    }
}

$GLOBALS['wpdb'] = new StbTestWpdb();

// ------------------------------------------------- posts, dates, text

function get_posts(array $args = []): array
{
    $type = $args['post_type'] ?? 'post';
    $limit = (int)($args['numberposts'] ?? $args['posts_per_page'] ?? 5);
    $exclude = (array)($args['exclude'] ?? []);
    $out = [];
    foreach ($GLOBALS['wp_posts'] as $p) {
        if (($p->post_type ?? 'post') !== $type) {
            continue;
        }
        if (in_array((int)$p->ID, array_map('intval', $exclude), true)) {
            continue;
        }
        if (($p->post_status ?? 'publish') !== 'publish') {
            continue;
        }
        $out[] = $p;
        if ($limit > 0 && count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

function wp_insert_post($args, $wp_error = false)
{
    $id = (int)(max(array_map('intval', array_keys($GLOBALS['wp_posts']))) + 1);
    if ($id < 2) {
        $id = 2;
    }
    wp_insert_test_post($id, $args);
    return $id;
}

function get_page_by_path($path, $output = null, $post_types = ['page'])
{
    foreach ($GLOBALS['wp_posts'] as $p) {
        if (($p->post_name ?? '') === $path) {
            return $p;
        }
    }
    return null;
}

function wp_date($format, $timestamp = null, $timezone = null)
{
    return gmdate($format, $timestamp ?? time());
}

function sanitize_key($key)
{
    return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string)$key));
}

function sanitize_textarea_field($str)
{
    return trim(strip_tags((string)$str));
}

/** Real wp_kses_post strips disallowed HTML; the plugin's own escaping is what these tests assert. */
function wp_kses_post($content)
{
    return (string)$content;
}

function rest_url($path = '')
{
    return home_url('/wp-json/' . ltrim((string)$path, '/'));
}

/**
 * WordPress returns a path relative to the plugins directory, such as
 * "seo-tool-bridge/seo-tool-bridge.php". The plugin calls this while
 * loading, to build the plugin_action_links_<basename> filter tag for
 * its Settings link — so without this stub the whole suite fatals on
 * require, before a single test runs. It did, from the commit that
 * added the Settings link until this one: CI only runs the PHP tests on
 * a pull request, and there had not been one since.
 */
function plugin_basename($file)
{
    return basename(dirname($file)) . '/' . basename($file);
}

// ------------------------------------------------------------ REST types

class WP_Error
{
    private string $code;
    private string $message;

    public function __construct($code = '', $message = '', $data = null)
    {
        $this->code = (string)$code;
        $this->message = (string)$message;
    }

    public function get_error_message(): string
    {
        return $this->message;
    }

    public function get_error_code(): string
    {
        return $this->code;
    }
}

class WP_REST_Request implements ArrayAccess
{
    private array $params;
    private $json;
    private array $headers;

    public function __construct(array $params = [], $json = null, array $headers = [])
    {
        $this->params = $params;
        $this->json = $json;
        // Normalised on the way in, as WordPress does. get_header() only
        // lowercased the name it was asked for, so a header given as
        // "X-STB-Key" was never found — which made the auth tests pass
        // for the wrong reason: every request was unauthenticated, so
        // "rejects a wrong key" was true no matter what the key was.
        $this->headers = array_change_key_case($headers, CASE_LOWER);
    }

    public function offsetExists(mixed $k): bool
    {
        return isset($this->params[$k]);
    }

    public function offsetGet(mixed $k): mixed
    {
        return $this->params[$k] ?? null;
    }

    public function offsetSet(mixed $k, mixed $v): void
    {
        $this->params[$k] = $v;
    }

    public function offsetUnset(mixed $k): void
    {
        unset($this->params[$k]);
    }

    public function __get($k)
    {
        return $this->params[$k] ?? null;
    }

    public function get_param($k)
    {
        return $this->params[$k] ?? null;
    }

    public function get_json_params()
    {
        return $this->json;
    }

    public function get_header($k)
    {
        return $this->headers[strtolower($k)] ?? null;
    }
}

class WP_REST_Response
{
    public $data;
    public int $status;

    public function __construct($data = null, $status = 200, $headers = [])
    {
        $this->data = $data;
        $this->status = $status;
    }

    public function get_data()
    {
        return $this->data;
    }

    public function get_status(): int
    {
        return $this->status;
    }
}
