; Windows installer for the SEO tool.
;
; Built only in CI — see .github/workflows/installer.yml. ISCC is not on
; a typical developer machine and this script has never been compiled
; outside the workflow; installer/README.md says what that means.
;
; WHAT GOES IN:
;   app\      the prebuilt payload (server.js, .next, node_modules,
;             migrations) from scripts/build-payload.mjs
;   node\     a portable node.exe, SHA-256 verified against Node's own
;             SHASUMS256.txt by the workflow before it is packaged
;   SEO Tool.exe   the WebView2 host from installer/host
;
; WHAT DOES NOT:
;   - the database. Created per user under %LOCALAPPDATA%\SEO Tool on
;     first run. Shipping one would hand every user a copy of the
;     maintainer's clients, which this project has already caught in its
;     build output once.
;   - Chromium. Playwright downloads it on first use, because adding
;     ~150 MB to an installer whose pitch is "small" is the wrong trade.
;   - .NET. The host is published self-contained.

#define AppName "SEO Tool"
#define AppPublisher "DiceCodes"
#define AppUrl "https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool"
; Passed in by the workflow: ISCC /DAppVersion=0.10.1
#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif
#ifndef PayloadDir
  #define PayloadDir "..\dist\installer-payload"
#endif
#ifndef HostDir
  #define HostDir "..\dist\installer-host"
#endif
#ifndef NodeDir
  #define NodeDir "..\dist\installer-node"
#endif

[Setup]
AppId={{8E6F2C14-7B3A-4D95-9E2F-5A1C3B7D8042}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppUrl}
AppSupportURL={#AppUrl}/issues
AppUpdatesURL={#AppUrl}/releases

; Per-user install, no elevation.
;
; Deliberate: asking for admin to install an SEO tool is a prompt most
; people should decline, and it buys nothing here — nothing needs
; Program Files, no service is registered, and no driver is installed.
; It also means an uninstall cannot touch another account's data.
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=no

OutputDir=..\dist
OutputBaseFilename=SEO-Tool-Setup-{#AppVersion}
; public\icon.ico, NOT favicon.ico.
;
; This said favicon.ico and there is no such file. The project's icon is
; public/icon.ico (42 KB, a valid single-image ICO); src/app/favicon.ico
; is Next's own route convention, not a public asset. ISCC aborts the
; whole compile on a missing SetupIconFile, and that is what broke the
; first real run of the installer workflow.
;
; Found by that CI run, which is the only way it could have been found:
; Inno Setup is not installed on the machine this was written on.
SetupIconFile=..\public\icon.ico
UninstallDisplayIcon={app}\SEO Tool.exe

; LZMA2 at max: the payload is a few hundred MB of JavaScript, which
; compresses extremely well, and download size is what people judge.
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

LicenseFile=..\LICENSE

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "{#HostDir}\SEO Tool.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\public\icon.ico"; DestDir: "{app}"; DestName: "app.ico"; Flags: ignoreversion

; The app payload. recursesubdirs + createallsubdirs because node_modules
; is thousands of files deep.
Source: "{#PayloadDir}\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs

; Portable Node. Verified against Node's published SHASUMS256.txt in the
; workflow — an installer that fetches a runtime it has not checked is an
; installer that can be made to ship somebody else's binary.
Source: "{#NodeDir}\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\SEO Tool.exe"; IconFilename: "{app}\app.ico"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\SEO Tool.exe"; IconFilename: "{app}\app.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\SEO Tool.exe"; Description: "Open {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Written at runtime next to the app, so Inno does not know about them
; and would otherwise leave the folder behind.
Type: files; Name: "{app}\server.log"
Type: files; Name: "{app}\host-error.log"
Type: filesandordirs; Name: "{app}\webview-data"
; NOT the database. It lives in %LOCALAPPDATA%\SEO Tool and is the
; user's own work — an uninstaller that deletes somebody's client data
; without asking is unforgivable, and "reinstall to fix it" is a thing
; people do.

[Code]
// Refuse to install over a running copy.
//
// Overwriting a locked SEO Tool.exe fails halfway and leaves a mixed
// install: new payload, old host, or the reverse. Checked by looking for
// the window rather than the process name, because the process is called
// "SEO Tool" and so is the installer's own window title.
function InitializeSetup(): Boolean;
begin
  Result := True;
  if FindWindowByClassName('WindowsForms10.Window.8.app.0.141b42a_r6_ad1') <> 0 then
  begin
    if MsgBox(
      'SEO Tool appears to be running. Close it first, then run this '
      + 'installer again.' + #13#10#13#10 + 'Continue anyway?',
      mbConfirmation, MB_YESNO) = IDNO then
      Result := False;
  end;
end;
