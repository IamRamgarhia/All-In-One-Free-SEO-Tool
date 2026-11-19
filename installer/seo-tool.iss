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
; Shown in the installer's own file properties and in Add/Remove
; Programs. AppPublisher alone only reaches the latter.
AppCopyright=© {#AppPublisher} — MIT licensed, free to use and modify
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

; UPDATING AN EXISTING INSTALL MUST FEEL LIKE AN UPDATE.
;
; This was DisableDirPage=no, so every run asked where to install —
; including a run over an existing copy, which then read as "replacing
; my installation" rather than "updating it". Inno does reuse the
; previous directory (UsePreviousAppDir defaults to yes), so nothing
; moved and no data was lost; it simply asked a question it already
; knew the answer to, and asking it is what made it look like a fresh
; install.
;
; `auto` is the setting for exactly this: ask on a first install, skip
; it when a previous install of this AppId is found.
DisableDirPage=auto

; Same reasoning. "Ready to install" exists to summarise choices, and
; on an update there are none to summarise.
DisableReadyPage=yes

; Only one installer at a time. Without this, two copies can write the
; same files at once and the loser leaves a half-install behind.
SetupMutex=SeoToolSetup_8E6F2C14

; Shut the app down and restart it rather than demanding a reboot.
; `RestartApplications=no` because this is a per-user app with no
; services or shell extensions — a reboot prompt would be theatre.
CloseApplications=yes
RestartApplications=no

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

; The wizard's own branding, generated from the same icon by
; scripts/build-installer-art.mjs so it cannot drift from the app's.
;
; Without these the installer wears Inno's stock artwork, which is the
; first thing anyone sees of this product and says nothing about it.
; Dark panels, because a dark app whose installer flashes white reads
; as two different programs.
WizardImageFile=art\wizard-large.bmp
WizardSmallImageFile=art\wizard-small.bmp
WizardImageStretch=no
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
; The WHOLE host output, not just the exe.
;
; This said `{#HostDir}\SEO Tool.exe` and shipped exactly that one file.
; PublishSingleFile bundles the MANAGED assemblies and the .NET runtime
; into the exe — but NOT native ones. WebView2Loader.dll is native, and
; the publish leaves it as a sibling file, which this line then left
; behind.
;
; The result, on the first machine the installer was ever run on:
; GetAvailableBrowserVersionString P/Invokes into that missing DLL,
; throws DllNotFoundException, the host's catch-all returns false, and
; the app says "This app needs the Microsoft Edge WebView2 runtime,
; which is missing on this computer."
;
; WebView2 was installed on that computer. Version 158.0.4370.26, in
; HKLM, with the runtime folder on disk. The app blamed the user's
; machine for a file we forgot to ship — and there is no way to debug
; that from the message.
;
; recursesubdirs because a publish can emit runtimes\ subfolders.
Source: "{#HostDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
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
// SAY "UPDATE" WHEN IT IS AN UPDATE.
//
// Inno has no idea it is upgrading. DisableDirPage=auto and
// DisableReadyPage=yes skip the PAGES on a second run, but every word
// on the remaining ones still says install — "This will install SEO
// Tool version 0.10.2 on your computer" — over a copy the user already
// has. That reads as "this is going to replace what I have", which is
// the question they asked, and the honest answer is that it keeps
// their data and only swaps the program.
//
// Detected from the uninstall key Inno itself writes. PrivilegesRequired
// is lowest, so it lands in HKCU; HKLM is checked too in case an older
// build was installed for all users.

const
  AppGuid = '8E6F2C14-7B3A-4D95-9E2F-5A1C3B7D8042';

function UninstallKey(): String;
begin
  // Assembled rather than written as a literal: a '{' in an .iss string
  // is the start of a constant, and escaping it here is less readable
  // than concatenating it.
  Result := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\'
    + '{' + AppGuid + '}_is1';
end;

/// The version already installed, or '' when this is a first install.
function InstalledVersion(): String;
begin
  Result := '';
  if not RegQueryStringValue(HKCU, UninstallKey(), 'DisplayVersion', Result) then
    if not RegQueryStringValue(HKLM, UninstallKey(), 'DisplayVersion', Result) then
      Result := '';
end;

procedure InitializeWizard;
var
  Previous: String;
begin
  Previous := InstalledVersion();
  if Previous = '' then
    exit;

  WizardForm.WelcomeLabel1.Caption := 'Update {#AppName}';

  if Previous = '{#AppVersion}' then
    // Reinstalling the same version is a repair, and calling it an
    // update to 0.10.2 when 0.10.2 is already there is just wrong.
    WizardForm.WelcomeLabel2.Caption :=
      'Version {#AppVersion} is already installed. This will reinstall it.'
      + #13#10#13#10
      + 'Your clients, audits, keywords and settings are not touched — '
      + 'they live outside the program folder.'
  else
    WizardForm.WelcomeLabel2.Caption :=
      'This will update {#AppName} from version ' + Previous
      + ' to {#AppVersion}.'
      + #13#10#13#10
      + 'Your clients, audits, keywords and settings are kept. Only the '
      + 'program itself is replaced.';
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if InstalledVersion() = '' then
    exit;

  // The button says "Install" right up to the moment it runs, and the
  // finished page congratulates you on an installation you did not do.
  //
  // Matched on the CAPTION rather than on a page id, because which page
  // carries the Install button depends on which pages are enabled —
  // DisableReadyPage=yes moves it to Select Tasks, and keying off
  // wpReady would silently never fire.
  if WizardForm.NextButton.Caption = SetupMessage(msgButtonInstall) then
    WizardForm.NextButton.Caption := '&Update';

  if CurPageID = wpInstalling then
    WizardForm.PageNameLabel.Caption := 'Updating {#AppName}';

  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedHeadingLabel.Caption := '{#AppName} has been updated';
    WizardForm.FinishedLabel.Caption :=
      '{#AppName} is now at version {#AppVersion}. Your data was left '
      + 'exactly as it was.';
  end;
end;

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
