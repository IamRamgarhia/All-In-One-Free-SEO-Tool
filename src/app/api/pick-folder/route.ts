/**
 * Open the operating system's own "choose a folder" dialog and return the
 * path that was picked.
 *
 * A browser cannot do this: <input webkitdirectory> and the File System
 * Access API hide the full path on purpose, and the path is the whole
 * point here (it ends up in task prompts for a coding assistant).
 *
 * The dialog opens on the machine the server runs on, so it only makes
 * sense when that is also the machine the person is sitting at. A request
 * from anywhere else is refused rather than popping a window on a server
 * nobody is looking at.
 *
 *   POST { start?: string }  →  { ok: true, path: string | null }
 *                               path is null when the dialog was cancelled
 *
 * Windows uses PowerShell, macOS osascript, Linux zenity or kdialog. No
 * extra dependencies; the start folder travels in an environment variable
 * so it is never spliced into a script.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, statSync } from "node:fs";
import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { hostAgentGuard } from "@/lib/host-agent";

const exec = promisify(execFile);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The standard Windows folder picker (the Explorer-style one with an
 * address bar), not WinForms' FolderBrowserDialog, which is the old tree
 * view. PowerShell 5.1 has no wrapper for it, so this talks to the
 * IFileOpenDialog COM object directly in "pick folders" mode.
 */
const WINDOWS_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FolderPick {
  [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")] class FileOpenDialogRCW {}
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, out IntPtr ppszName);
    void GetAttributes(uint mask, out uint attribs);
    void Compare(IShellItem psi, uint hint, out int order);
  }
  [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint c, IntPtr types);
    void SetFileTypeIndex(uint i);
    void GetFileTypeIndex(out uint i);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint o);
    void GetOptions(out uint o);
    void SetDefaultFolder(IShellItem s);
    void SetFolder(IShellItem s);
    void GetFolder(out IShellItem s);
    void GetCurrentSelection(out IShellItem s);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
    void GetResult(out IShellItem s);
  }
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  // Windows only lets the foreground app bring a window to the front. A
  // synthetic Alt press counts as input, which lifts that restriction.
  public static void Front(IntPtr h) {
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(h);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr bc, ref Guid riid, out IShellItem item);
  public static string Pick(IntPtr owner, string start) {
    var d = (IFileDialog)new FileOpenDialogRCW();
    uint o; d.GetOptions(out o);
    d.SetOptions(o | 0x20 | 0x40); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
    d.SetTitle("Choose the project folder");
    if (!string.IsNullOrEmpty(start)) {
      try { Guid g = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"); IShellItem it; SHCreateItemFromParsingName(start, IntPtr.Zero, ref g, out it); d.SetFolder(it); } catch { }
    }
    if (d.Show(owner) != 0) return null; // cancelled
    IShellItem r; d.GetResult(out r);
    IntPtr p; r.GetDisplayName(0x80058000, out p); // SIGDN_FILESYSPATH
    string s = Marshal.PtrToStringUni(p); Marshal.FreeCoTaskMem(p);
    return s;
  }
}
'@
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; StartPosition = 'Manual'; Location = New-Object System.Drawing.Point(-32000, -32000); Size = New-Object System.Drawing.Size(1, 1) }
$owner.Show(); [FolderPick]::Front($owner.Handle)
$path = [FolderPick]::Pick($owner.Handle, $env:SEO_PICK_START)
if ($path) { Write-Output $path }
$owner.Dispose()
`.trim();

const MAC_SCRIPT = `
set startDir to system attribute "SEO_PICK_START"
if startDir is "" then
  set theFolder to choose folder with prompt "Choose the project folder"
else
  set theFolder to choose folder with prompt "Choose the project folder" default location (POSIX file startDir)
end if
POSIX path of theFolder
`.trim();

async function pick(start: string): Promise<string | null> {
  const env = { ...process.env, SEO_PICK_START: start };
  const opts = { env, timeout: 5 * 60_000, windowsHide: false, encoding: "utf8" as const };

  if (process.platform === "win32") {
    const { stdout } = await exec(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", WINDOWS_SCRIPT],
      opts,
    );
    return stdout.trim() || null;
  }

  if (process.platform === "darwin") {
    try {
      const { stdout } = await exec("osascript", ["-e", MAC_SCRIPT], opts);
      return stdout.trim().replace(/\/$/, "") || null;
    } catch (err) {
      // osascript exits 1 with "User canceled" when the dialog is dismissed.
      if (/-128|cancel/i.test(String((err as { stderr?: string }).stderr))) return null;
      throw err;
    }
  }

  // Linux and friends: whichever dialog helper is installed.
  const attempts: [string, string[]][] = [
    ["zenity", ["--file-selection", "--directory", "--title=Choose the project folder", ...(start ? [`--filename=${start}/`] : [])]],
    ["kdialog", ["--getexistingdirectory", start || "."]],
  ];
  for (const [cmd, args] of attempts) {
    try {
      const { stdout } = await exec(cmd, args, opts);
      return stdout.trim() || null;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue; // helper not installed, try the next
      return null; // non-zero exit = cancelled
    }
  }
  throw new Error("No folder dialog available. Install zenity or kdialog, or type the path.");
}

export async function POST(req: Request) {
  const denied = await guardAdminRequest(req);
  if (denied) return denied;
  const off = hostAgentGuard();
  if (off) return off;

  // guardAdminRequest lets a signed-in owner through from anywhere; the
  // dialog still has to appear on the screen the person is looking at.
  if (!isLocalRequest(req)) {
    return Response.json(
      {
        ok: false,
        error:
          "Folder picker only works when you open the app on the same computer that runs it. Type the path instead.",
      },
      { status: 400 },
    );
  }

  let start = "";
  try {
    const body = (await req.json()) as { start?: unknown };
    if (typeof body.start === "string") start = body.start.trim().slice(0, 500);
  } catch {
    // no body is fine
  }
  try {
    if (start && !(existsSync(start) && statSync(start).isDirectory())) start = "";
  } catch {
    start = "";
  }

  try {
    return Response.json({ ok: true, path: await pick(start) });
  } catch (err) {
    // execFile's own message is the whole command line, script included.
    const e = err as { stderr?: string; message: string };
    const detail = (e.stderr || "").trim().split(/\r?\n/)[0] || "";
    const msg = e.message.startsWith("Command failed")
      ? `The folder dialog closed unexpectedly${detail ? `: ${detail}` : ""}. Type the path instead.`
      : e.message;
    return Response.json({ ok: false, error: msg.slice(0, 200) }, { status: 500 });
  }
}
