#define AppName "AeN Shift"
#define AppVersion "1.0.0-musubi.1"
#define AppNumericVersion "1.0.0.1"
#define AppPublisher "AeN Shift"
#define AppId "{{D99BE16A-C785-455D-B9A2-C46D1541D519}"

#ifndef SaaSUrl
  #error SaaSUrl must be provided at build time (for example: /DSaaSUrl=https://example.invalid)
#endif

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} Release 1 - Musubi Trial
AppPublisher={#AppPublisher}
AppPublisherURL={#SaaSUrl}
AppSupportURL={#SaaSUrl}
AppUpdatesURL={#SaaSUrl}
DefaultDirName={localappdata}\Programs\AeN Shift
DefaultGroupName=AeN Shift
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=output
OutputBaseFilename=AeN-Shift-Release-1-Musubi-Trial
SetupIconFile=..\assets\AeNShift.ico
UninstallDisplayIcon={app}\AeNShift.ico
UninstallDisplayName=AeN Shift Release 1 - Musubi Trial
VersionInfoVersion={#AppNumericVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription=AeN Shift SaaS launcher installer
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
MinVersion=10.0

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[Tasks]
Name: "desktopicon"; Description: "デスクトップにAeN Shiftのアイコンを作成する"; GroupDescription: "追加アイコン:"; Flags: checkedonce

[Files]
Source: "..\assets\AeNShift.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\assets\release-info.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\AeN Shift"; Filename: "{#SaaSUrl}"; IconFilename: "{app}\AeNShift.ico"; Comment: "AeN Shift SaaSを開く"
Name: "{group}\AeN Shift Release情報"; Filename: "{app}\release-info.txt"
Name: "{group}\AeN Shiftをアンインストール"; Filename: "{uninstallexe}"
Name: "{autodesktop}\AeN Shift"; Filename: "{#SaaSUrl}"; IconFilename: "{app}\AeNShift.ico"; Tasks: desktopicon; Comment: "AeN Shift SaaSを開く"

[Run]
Filename: "{#SaaSUrl}"; Description: "AeN Shiftを開く"; Flags: shellexec postinstall skipifsilent nowait

[Code]
function InitializeSetup(): Boolean;
begin
  Result := Pos('https://', Lowercase('{#SaaSUrl}')) = 1;
  if not Result then
    MsgBox('安全のため、AeN Shiftの接続先にはHTTPS URLが必要です。', mbError, MB_OK);
end;
