#ifndef AppVersion
  #define AppVersion "0.0.0-local"
#endif

#define AppName "GPT-5.4 Workspace"
#define AppPublisher "photohunterd"
#define AppURL "https://github.com/photohunterd-commits/chatGPT_api"
#define AppExeName "ChatGptApi.Desktop.exe"

[Setup]
AppId={{AA2AA6DA-7D09-49F2-9FAF-394DA98DC932}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={localappdata}\Programs\GPT-5.4 Workspace
DefaultGroupName=GPT-5.4 Workspace
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\publish\installer
OutputBaseFilename=gpt54-workspace-setup-{#AppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExeName}
SetupIconFile=..\..\apps\windows-client\ChatGptApi.Desktop\Assets\AppIcon.ico
LicenseFile=..\..\LICENSE

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\publish\windows-client\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb"

[Icons]
Name: "{autoprograms}\GPT-5.4 Workspace"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\GPT-5.4 Workspace"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch GPT-5.4 Workspace"; Flags: nowait postinstall skipifsilent
