<?php
/**
 * Just enough WordPress to run seo-tool-bridge.php outside WordPress.
 *
 * The plugin had never executed. Not once — no PHP runs in this repo, no
 * WordPress in CI, and every check written for the integration drove the
 * TypeScript client against a JavaScript stand-in. That stand-in was
 * written from the plugin's source, which is why it caught five wire-
 * format bugs, and it still missed the biggest one: the auth header. A
 * fake can only be as right as whoever read the original.
 *
 * So this runs the real PHP. State lives in arrays, WordPress functions
 * are stubbed to the behaviour the plugin actually depends on, and
 * wp-bridge-test.php calls the REST handlers directly.
 *
 * The stubs are deliberately strict where WordPress is forgiving —
 * get_post() returns null for an unknown id, update_post_meta() records
 * what it stored — because the point is to catch the plugin assuming
 * something WordPress doesn't promise.
 *
 * What this does NOT prove: that real WordPress behaves like these
 * stubs. url_to_postid, wp_kses_post and the REST router in particular
 * are approximations. It proves the plugin's own logic, which is where
 * every bug found so far has been.
 */

// ---------------------------------------------------------------- state

final class WPState
{
    /** @var array<string,mixed> */
    public static array $options = [];
    /** @var array<int,array<string,mixed>> */
    public static array $posts = [];
    /** @var array<int,array<string,mixed>> */
    public static array $meta = [];
    /** @var array<string,array<int,callable>> */
    public static array $actions = [];
    /** @var array<int,array{namespace:string,route:string,config:array}> */
    public static array $routes = [];
    public static int $nextPostId = 500;

    public static function reset(): void
    {
        self::$options = ['stb_connection_key' => 'test-connection-key', 'stb_revisions' => []];
        self::$meta = [];
        self::$nextPostId = 500;
        self::$posts = [
            101 => [
                'ID' => 101,
                'post_title' => 'Hello world',
                'post_content' => '<p>Some words about handmade soap and cold process.</p>',
                'post_type' => 'post',
                'post_status' => 'publish',
                'post_name' => 'hello-world',
                'post_modified' => '2026-01-01 00:00:00',
                'post_excerpt' => '',
            ],
            201 => [
                'ID' => 201,
                'post_title' => 'soap-bars.jpg',
                'post_content' => '',
                'post_type' => 'attachment',
                'post_status' => 'inherit',
                'post_name' => 'soap-bars',
                'post_modified' => '2026-01-01 00:00:00',
                'post_excerpt' => '',
            ],
            202 => [
                'ID' => 202,
                'post_title' => 'lavender.jpg',
                'post_content' => '',
                'post_type' => 'attachment',
                'post_status' => 'inherit',
                'post_name' => 'lavender',
                'post_modified' => '2026-01-01 00:00:00',
                'post_excerpt' => '',
            ],
        ];
        self::$meta[202] = ['_wp_attachment_image_alt' => ['Existing alt text']];
    }
}

WPState::reset();

// ------------------------------------------------------- minimal WP core

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}
if (!defined('OBJECT')) {
    define('OBJECT', 'OBJECT');
}
if (!defined('JSON_UNESCAPED_SLASHES')) {
    define('JSON_UNESCAPED_SLASHES', 64);
}

class WP_Error
{
    public function __construct(private string $code = '', private string $message = '') {}
    public function get_error_message(): string { return $this->message; }
    public function get_error_code(): string { return $this->code; }
}

class WP_REST_Response
{
    public function __construct(public mixed $data = null, public int $status = 200) {}
    public function get_data(): mixed { return $this->data; }
    public function get_status(): int { return $this->status; }
}

/**
 * Stands in for WP_REST_Request. Supports the three access patterns the
 * plugin uses: ArrayAccess for URL params, get_param, get_json_params,
 * and get_header.
 */
class WP_REST_Request implements ArrayAccess
{
    public function __construct(
        private array $params = [],
        private array $json = [],
        private array $headers = [],
    ) {}

    public function get_param(string $k): mixed { return $this->params[$k] ?? null; }
    public function get_json_params(): array { return $this->json; }

    public function get_header(string $name): ?string
    {
        // WordPress normalises header lookups: case-insensitive, and
        // underscores and dashes are equivalent.
        $key = strtolower(str_replace('_', '-', $name));
        foreach ($this->headers as $h => $v) {
            if (strtolower(str_replace('_', '-', $h)) === $key) {
                return $v;
            }
        }
        return null;
    }

    public function offsetExists(mixed $o): bool { return isset($this->params[$o]); }
    public function offsetGet(mixed $o): mixed { return $this->params[$o] ?? null; }
    public function offsetSet(mixed $o, mixed $v): void { $this->params[$o] = $v; }
    public function offsetUnset(mixed $o): void { unset($this->params[$o]); }
}

/** A post object with ->property access, as WordPress returns. */
function stbtest_post_object(array $row): object
{
    return (object)$row;
}

// ------------------------------------------------------------- functions

function get_option(string $k, mixed $default = false): mixed
{
    return array_key_exists($k, WPState::$options) ? WPState::$options[$k] : $default;
}
function update_option(string $k, mixed $v): bool
{
    WPState::$options[$k] = $v;
    return true;
}

function get_post(int|string $id): ?object
{
    $id = (int)$id;
    return isset(WPState::$posts[$id]) ? stbtest_post_object(WPState::$posts[$id]) : null;
}

function get_post_meta(int $id, string $key = '', bool $single = false): mixed
{
    $all = WPState::$meta[$id] ?? [];
    if ($key === '') {
        return $all;
    }
    $vals = $all[$key] ?? [];
    if ($single) {
        return $vals[0] ?? '';
    }
    return $vals;
}
function update_post_meta(int $id, string $key, mixed $value): bool
{
    WPState::$meta[$id][$key] = [$value];
    return true;
}
function delete_post_meta(int $id, string $key): bool
{
    unset(WPState::$meta[$id][$key]);
    return true;
}

function wp_update_post(array $data, bool $wp_error = false): int|WP_Error
{
    $id = (int)($data['ID'] ?? 0);
    if (!isset(WPState::$posts[$id])) {
        return $wp_error ? new WP_Error('invalid_post', 'Invalid post ID.') : 0;
    }
    foreach ($data as $k => $v) {
        if ($k === 'ID') continue;
        WPState::$posts[$id][$k] = $v;
    }
    return $id;
}

function wp_insert_post(array $data, bool $wp_error = false): int|WP_Error
{
    if (($data['post_title'] ?? '') === '' && ($data['post_content'] ?? '') === '') {
        return $wp_error ? new WP_Error('empty_content', 'Content, title, and excerpt are empty.') : 0;
    }
    $id = ++WPState::$nextPostId;
    WPState::$posts[$id] = array_merge([
        'ID' => $id,
        'post_title' => '',
        'post_content' => '',
        'post_excerpt' => '',
        'post_status' => 'draft',
        'post_type' => 'post',
        'post_name' => 'post-' . $id,
        'post_modified' => '2026-01-01 00:00:00',
    ], $data);
    WPState::$posts[$id]['ID'] = $id;
    return $id;
}

function is_wp_error(mixed $v): bool { return $v instanceof WP_Error; }

function get_permalink(int|string $id): string
{
    $id = (int)$id;
    $slug = WPState::$posts[$id]['post_name'] ?? ('p-' . $id);
    return 'https://example.test/' . $slug;
}

function get_posts(array $args = []): array
{
    $type = $args['post_type'] ?? 'post';
    $status = $args['post_status'] ?? 'publish';
    $limit = (int)($args['numberposts'] ?? 5);
    $out = [];
    foreach (WPState::$posts as $p) {
        if ($p['post_type'] !== $type) continue;
        if ($status && $p['post_status'] !== $status) continue;
        $out[] = stbtest_post_object($p);
        if (count($out) >= $limit) break;
    }
    return $out;
}

function get_attached_media(string $type, int $postId): array
{
    // In the fixture, attachment 201 is "uploaded to" post 101.
    if ($type === 'image' && $postId === 101) {
        return [stbtest_post_object(WPState::$posts[201])];
    }
    return [];
}

function get_post_thumbnail_id(int $postId): int { return 0; }

function wp_get_attachment_url(int $id): string
{
    $names = [201 => 'soap-bars.jpg', 202 => 'lavender.jpg'];
    return 'https://example.test/uploads/' . ($names[$id] ?? ($id . '.jpg'));
}

function attachment_url_to_postid(string $url): int
{
    foreach ([201, 202] as $id) {
        if ($url === wp_get_attachment_url($id)) return $id;
    }
    return 0;
}

function url_to_postid(string $url): int
{
    $path = trim((string)parse_url($url, PHP_URL_PATH), '/');
    foreach (WPState::$posts as $p) {
        if ($p['post_type'] === 'attachment') continue;
        if ($p['post_name'] === $path) return (int)$p['ID'];
    }
    return 0;
}

function get_page_by_path(string $slug, string $output = OBJECT, array $types = []): ?object
{
    foreach (WPState::$posts as $p) {
        if ($p['post_name'] === $slug && in_array($p['post_type'], $types ?: ['post', 'page'], true)) {
            return stbtest_post_object($p);
        }
    }
    return null;
}

function home_url(string $path = ''): string { return 'https://example.test' . $path; }
function rest_url(string $path = ''): string { return 'https://example.test/wp-json/' . $path; }
function get_bloginfo(string $what = ''): string { return $what === 'version' ? '6.7' : ''; }

function sanitize_text_field(mixed $s): string
{
    $s = (string)$s;
    $s = strip_tags($s);
    $s = preg_replace('/[\r\n\t]+/', ' ', $s);
    return trim((string)$s);
}
function sanitize_textarea_field(mixed $s): string
{
    return trim(strip_tags((string)$s));
}
function sanitize_key(mixed $s): string
{
    return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string)$s)) ?? '';
}
function wp_kses_post(string $html): string
{
    // Approximation: strip <script> and on* attributes, keep the rest.
    $html = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $html) ?? $html;
    return preg_replace('/\son\w+\s*=\s*"[^"]*"/i', '', $html) ?? $html;
}
function wp_json_encode(mixed $v, int $flags = 0): string|false
{
    return json_encode($v, $flags);
}
function esc_html(mixed $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function esc_attr(mixed $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function esc_url(mixed $s): string
{
    $s = (string)$s;
    // Mirrors the part that matters here: refuse javascript: and friends.
    if (preg_match('#^\s*(javascript|data|vbscript):#i', $s)) return '';
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}
function wp_generate_password(int $len = 12, bool $special = true, bool $extra = false): string
{
    return substr(str_repeat('abcdefghijklmnopqrstuvwxyz0123456789', 4), 0, $len);
}

function add_action(string $hook, callable $cb, int $priority = 10, int $args = 1): void
{
    WPState::$actions[$hook][] = $cb;
}
function do_action(string $hook): void
{
    foreach (WPState::$actions[$hook] ?? [] as $cb) {
        $cb();
    }
}
function register_activation_hook(string $file, callable $cb): void {}
function add_management_page(...$a): void {}
function current_user_can(string $cap): bool { return true; }
function check_admin_referer(string $a, string $b): bool { return true; }
function wp_nonce_field(string $a, string $b): void {}
function is_singular(): bool { return true; }
function wp_date(string $format, ?int $ts = null): string
{
    // Real wp_date renders in the site's timezone. Fixed to UTC here so
    // the assertion doesn't depend on where the test runs.
    return gmdate($format, $ts ?? time());
}
function get_the_ID(): int { return 101; }
function __(string $s, string $domain = ''): string { return $s; }

function register_rest_route(string $ns, string $route, array $config): bool
{
    WPState::$routes[] = ['namespace' => $ns, 'route' => $route, 'config' => $config];
    return true;
}
