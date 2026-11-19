// A native Windows window for the SEO tool.
//
// WHY A HOST AT ALL: without one, "the app" is a terminal window plus a
// browser tab the user has to find and keep straight. Everything about
// that says "developer tool you are borrowing" rather than "program on
// your computer" — and the audience this exists for is the one that will
// not open a terminal.
//
// WHAT IT DOES: starts the bundled Node server as a child process on a
// free port, waits for it to answer /api/v1/health, and shows it in a
// WebView2 control. Closing the window stops the server. There is no
// address bar, no tab strip, and no way to navigate off the app.
//
// WHAT IT DELIBERATELY DOES NOT DO:
//   - no auto-update (bin/seo-update-zip.mjs owns that, and a window
//     that rewrote its own binary mid-run is a way to produce a broken
//     install with no recovery path)
//   - no bundled Chromium. WebView2 is the Edge runtime that ships with
//     Windows 10/11; bundling a browser would add ~150 MB to an
//     installer whose whole pitch is that it is small.
//
// BUILD: not on a developer machine — this needs the .NET SDK and
// WebView2 SDK, and is compiled by .github/workflows/installer.yml on a
// windows-latest runner. See installer/README.md.

using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SeoTool
{
    internal static class Program
    {
        /// <summary>Exit code when the host's own files are incomplete.</summary>
        private const int ExitOwnInstallBroken = 2;

        /// <summary>Exit code when WebView2 is genuinely not on the machine.</summary>
        private const int ExitNoWebView2Runtime = 3;

        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // --self-test: answer "can this build open a window?" without
            // opening one, so CI can ask.
            //
            // WHY: the workflow's check was `test -f "SEO Tool.exe"`. The
            // exe existed perfectly and could not open a window, because
            // the installer had left WebView2Loader.dll behind. An
            // existence check cannot catch that, and the only thing that
            // did was a person double-clicking it on their own machine
            // and being told their computer was at fault.
            //
            // The payload builder already does the equivalent — it does
            // not check that better-sqlite3 is present, it opens a
            // database and reads a row back. This is that, for the host.
            //
            // The exit codes separate OUR fault from the machine's,
            // because a CI runner without the WebView2 runtime is not a
            // broken build and must not fail one.
            //
            // A WinExe has no console attached, so the reason goes to a
            // file the caller can read rather than to a stdout nobody
            // receives.
            if (Array.IndexOf(args, "--self-test") >= 0)
            {
                var selfTest = WebView2Problem();
                var where = Path.Combine(AppContext.BaseDirectory, "selftest.log");
                try
                {
                    File.WriteAllText(where, selfTest ?? "ok");
                }
                catch
                {
                    // The exit code still carries the answer.
                }
                if (selfTest == null) Environment.Exit(0);
                Environment.Exit(
                    selfTest.Contains("problem with the installer")
                        ? ExitOwnInstallBroken
                        : ExitNoWebView2Runtime);
            }

            // WebView2 missing is the one failure a user cannot debug
            // from a stack trace, and it has a one-click fix. Checked
            // before anything else so the message is about the real
            // cause rather than a managed exception from the control.
            var problem = WebView2Problem();
            if (problem != null)
            {
                TryLog("startup refused: " + problem.Replace("\n", " "));
                MessageBox.Show(
                    problem,
                    "SEO Tool — cannot open",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            try
            {
                Application.Run(new MainWindow(args));
            }
            catch (Exception ex)
            {
                // Written next to the app rather than only shown: the
                // person who hits this is usually reporting it to
                // somebody else.
                TryLog("fatal: " + ex);
                MessageBox.Show(
                    "SEO Tool could not start.\n\n"
                        + ex.Message
                        + "\n\nDetails were written to host-error.log next to the app.",
                    "SEO Tool",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        /// <summary>
        /// Why WebView2 could not be used, or null when it can be.
        /// </summary>
        /// <remarks>
        /// This returned a bool, and the caller turned false into "the
        /// WebView2 runtime is missing on this computer". On the first
        /// machine this installer ever ran on, that message appeared
        /// while WebView2 WAS installed — 158.0.4370.26, in HKLM, with
        /// the runtime folder on disk.
        ///
        /// The real cause was that the installer shipped only the exe
        /// and left WebView2Loader.dll behind, so the P/Invoke threw
        /// DllNotFoundException and a blanket catch turned our own
        /// packaging bug into an accusation about the user's machine —
        /// one they cannot act on, because the thing they would go and
        /// install is already there.
        ///
        /// The exceptions are distinguishable, so they are now
        /// distinguished. WebView2RuntimeNotFoundException genuinely
        /// means "go and install it". Anything else means this install
        /// is broken and says so.
        /// </remarks>
        private static string? WebView2Problem()
        {
            try
            {
                var version = CoreWebView2Environment.GetAvailableBrowserVersionString(null);
                if (string.IsNullOrEmpty(version))
                {
                    return
                        "This app needs the Microsoft Edge WebView2 runtime, which is "
                        + "missing on this computer.\n\n"
                        + "It is a free Microsoft component and most Windows 10 and 11 "
                        + "machines already have it. Install it from:\n\n"
                        + "https://developer.microsoft.com/microsoft-edge/webview2/\n\n"
                        + "Then start this app again.";
                }
                return null;
            }
            catch (WebView2RuntimeNotFoundException)
            {
                return
                    "This app needs the Microsoft Edge WebView2 runtime, which is "
                    + "missing on this computer.\n\n"
                    + "It is a free Microsoft component and most Windows 10 and 11 "
                    + "machines already have it. Install it from:\n\n"
                    + "https://developer.microsoft.com/microsoft-edge/webview2/\n\n"
                    + "Then start this app again.";
            }
            catch (DllNotFoundException)
            {
                // OUR fault, every time. Never send someone to install
                // something they may already have because we dropped a
                // file out of the installer.
                return
                    "This copy of SEO Tool is missing one of its own files "
                    + "(WebView2Loader.dll), so it cannot open its window.\n\n"
                    + "This is a problem with the installer, not with your "
                    + "computer — installing anything else will not fix it.\n\n"
                    + "Download the installer again and re-run it. If it keeps "
                    + "happening, please report it:\n\n"
                    + "https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool/issues";
            }
            catch (Exception ex)
            {
                // Still say what happened rather than guessing at a cause.
                return
                    "SEO Tool could not start its window.\n\n"
                    + ex.GetType().Name + ": " + ex.Message + "\n\n"
                    + "Please report this with the message above:\n\n"
                    + "https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool/issues";
            }
        }

        internal static void TryLog(string line)
        {
            try
            {
                File.AppendAllText(
                    Path.Combine(AppContext.BaseDirectory, "host-error.log"),
                    DateTime.Now.ToString("o") + "  " + line + Environment.NewLine);
            }
            catch
            {
                // Logging must never be the thing that crashes the app.
            }
        }
    }

    internal sealed class MainWindow : Form
    {
        private readonly WebView2 _web = new WebView2();
        private readonly Label _status = new Label();
        private Process? _server;
        private int _port;
        private readonly bool _devTools;

        public MainWindow(string[] args)
        {
            _devTools = Array.Exists(args, a => a == "--devtools");

            Text = "SEO Tool";
            Width = 1360;
            Height = 900;
            MinimumSize = new System.Drawing.Size(900, 600);
            StartPosition = FormStartPosition.CenterScreen;
            // Dark, because the app is dark. A white flash before the
            // first paint looks like a crash.
            BackColor = System.Drawing.Color.FromArgb(10, 10, 12);

            var icon = Path.Combine(AppContext.BaseDirectory, "app.ico");
            if (File.Exists(icon))
            {
                try { Icon = new System.Drawing.Icon(icon); } catch { }
            }

            _status.Text = "Starting…";
            _status.ForeColor = System.Drawing.Color.FromArgb(180, 180, 190);
            _status.BackColor = BackColor;
            _status.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            _status.Dock = DockStyle.Fill;
            Controls.Add(_status);

            _web.Dock = DockStyle.Fill;
            _web.Visible = false;
            Controls.Add(_web);

            Shown += async (_, _) => await StartAsync();
            FormClosing += (_, _) => StopServer();
        }

        private async Task StartAsync()
        {
            try
            {
                _port = FreePort();
                SetStatus("Starting the SEO tool…");
                StartServer(_port);

                var url = $"http://127.0.0.1:{_port}";
                var ready = await WaitForHealth(url, TimeSpan.FromSeconds(120));
                if (!ready)
                {
                    SetStatus(
                        "The app did not start. See server.log next to this "
                            + "program for what it reported.");
                    return;
                }

                await _web.EnsureCoreWebView2Async(
                    await CoreWebView2Environment.CreateAsync(
                        null,
                        // Profile beside the app, not in the user's roaming
                        // profile: this keeps an uninstall complete and
                        // means a portable copy carries its own state.
                        Path.Combine(AppContext.BaseDirectory, "webview-data")));

                var s = _web.CoreWebView2.Settings;
                s.AreDefaultContextMenusEnabled = true;
                s.IsStatusBarEnabled = false;
                s.AreDevToolsEnabled = _devTools;
                s.IsZoomControlEnabled = true;

                // An external link must open in the real browser. A
                // target=_blank that replaced the app's own window with
                // GitHub, with no back button, would strand the user.
                _web.CoreWebView2.NewWindowRequested += (_, e) =>
                {
                    e.Handled = true;
                    OpenExternally(e.Uri);
                };

                // And a same-window navigation away from localhost. The
                // app links to Google's documentation in a dozen places.
                _web.CoreWebView2.NavigationStarting += (_, e) =>
                {
                    if (!IsOurs(e.Uri))
                    {
                        e.Cancel = true;
                        OpenExternally(e.Uri);
                    }
                };

                _web.Source = new Uri(url);
                _web.Visible = true;
                _status.Visible = false;
            }
            catch (Exception ex)
            {
                Program.TryLog("start: " + ex);
                SetStatus("Could not start: " + ex.Message);
            }
        }

        private bool IsOurs(string uri)
        {
            return Uri.TryCreate(uri, UriKind.Absolute, out var u)
                && (u.IsLoopback || u.Scheme == "about" || u.Scheme == "data");
        }

        private static void OpenExternally(string uri)
        {
            // Only http(s). Without this check a page could hand the
            // shell a file:// or ms-settings: URI and have Windows open
            // it — the app's own content is trusted, but its AI output
            // and the websites it crawls are not.
            if (!Uri.TryCreate(uri, UriKind.Absolute, out var u)) return;
            if (u.Scheme != "http" && u.Scheme != "https") return;
            try
            {
                Process.Start(new ProcessStartInfo(u.ToString()) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Program.TryLog("open external: " + ex.Message);
            }
        }

        private void SetStatus(string text)
        {
            if (InvokeRequired) { BeginInvoke(new Action(() => SetStatus(text))); return; }
            _status.Text = text;
            _status.Visible = true;
        }

        /// <summary>Ask the OS for a port nobody is using.</summary>
        private static int FreePort()
        {
            // Port 0 and read back what was assigned, rather than
            // probing 3000 and incrementing. 3000 is the most contended
            // port in local development, and "something answered" is
            // not the same as "ours answered" — a lesson this project
            // already learned from .seo-port.
            var l = new TcpListener(IPAddress.Loopback, 0);
            l.Start();
            var port = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            return port;
        }

        private void StartServer(int port)
        {
            var dir = AppContext.BaseDirectory;
            var node = Path.Combine(dir, "node", "node.exe");
            var server = Path.Combine(dir, "app", "server.js");

            if (!File.Exists(node)) throw new FileNotFoundException("Bundled Node is missing.", node);
            if (!File.Exists(server)) throw new FileNotFoundException("The app payload is missing.", server);

            var psi = new ProcessStartInfo
            {
                FileName = node,
                WorkingDirectory = Path.Combine(dir, "app"),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            psi.ArgumentList.Add(server);

            psi.EnvironmentVariables["PORT"] = port.ToString();
            // Loopback only. The server has no password by default, and
            // a window on someone's laptop must not publish their
            // clients' data to the coffee-shop wifi.
            psi.EnvironmentVariables["HOSTNAME"] = "127.0.0.1";
            psi.EnvironmentVariables["SEO_BIND_ADDR"] = "127.0.0.1";
            psi.EnvironmentVariables["NODE_ENV"] = "production";
            // Per-user data, so two accounts on one PC do not share a
            // database and an uninstall does not delete someone's work.
            psi.EnvironmentVariables["SEO_DATA_DIR"] = DataDir();
            psi.EnvironmentVariables["SEO_LAUNCHED_BY"] = "windows-host";

            var log = Path.Combine(dir, "server.log");
            try { File.WriteAllText(log, ""); } catch { }

            _server = new Process { StartInfo = psi, EnableRaisingEvents = true };
            _server.OutputDataReceived += (_, e) => Append(log, e.Data);
            _server.ErrorDataReceived += (_, e) => Append(log, e.Data);
            _server.Start();
            _server.BeginOutputReadLine();
            _server.BeginErrorReadLine();
        }

        private static string DataDir()
        {
            // %LOCALAPPDATA%, not Documents. Measured on a developer
            // machine: mkdir inside Documents HUNG past a five-minute
            // timeout with the folder carrying the ReadOnly attribute,
            // because Documents is routinely redirected into OneDrive
            // and watched by sync and AV filter drivers. LOCALAPPDATA
            // took 2ms. The same reason backups moved there.
            var root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var dir = Path.Combine(root, "SEO Tool");
            Directory.CreateDirectory(dir);
            return dir;
        }

        private static void Append(string path, string? line)
        {
            if (string.IsNullOrEmpty(line)) return;
            try { File.AppendAllText(path, line + Environment.NewLine); } catch { }
        }

        private async Task<bool> WaitForHealth(string baseUrl, TimeSpan timeout)
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
            var deadline = DateTime.UtcNow + timeout;
            var attempt = 0;

            while (DateTime.UtcNow < deadline)
            {
                // A server that exited is a definite answer. Without
                // this the window sits on "Starting…" for the full two
                // minutes after an immediate crash.
                if (_server != null && _server.HasExited)
                {
                    Program.TryLog($"server exited early with code {_server.ExitCode}");
                    return false;
                }

                try
                {
                    var r = await http.GetAsync(baseUrl + "/api/v1/health");
                    if (r.IsSuccessStatusCode) return true;
                }
                catch
                {
                    // Not yet listening. Expected for the first second or two.
                }

                attempt++;
                if (attempt == 8)
                {
                    SetStatus(
                        "Still starting — the first run applies database "
                            + "migrations and can take a minute.");
                }
                await Task.Delay(500);
            }
            return false;
        }

        private void StopServer()
        {
            try
            {
                if (_server == null || _server.HasExited) return;
                // Kill the whole tree. The server spawns Playwright
                // browsers; killing only the parent leaves headless
                // Chrome processes running after the window closes, and
                // the user has no way to find them.
                _server.Kill(entireProcessTree: true);
                _server.WaitForExit(5000);
            }
            catch (Exception ex)
            {
                Program.TryLog("stop: " + ex.Message);
            }
        }
    }
}
