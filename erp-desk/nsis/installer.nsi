; ERP UNIFORM STUDIO (pour DIGITAL-TEX S.A.) — installateur Windows
; Français, par utilisateur (aucun droit administrateur), cohabite avec Uniform Studio 3D 3.3.0.
; Options : /S = silencieux (mises à jour automatiques) ; /RELANCER = relancer l'application après installation.
Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define APPNAME "ERP Uniform Studio"
!define TITRE "ERP UNIFORM STUDIO (pour DIGITAL-TEX S.A.)"
!define COMPANY "DIGITAL-TEX S.A."
!define EXE "ERP Uniform Studio.exe"
!define REGKEY "Software\DigitalTex\ERPUniformStudio"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ERPUniformStudio"

Name "${TITRE}"
Caption "${TITRE} — installation ${VERSION}"
OutFile "..\dist\ERP-Uniform-Studio-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "${REGKEY}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
BrandingText "${COMPANY}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1036 "ProductName" "${TITRE}"
VIAddVersionKey /LANG=1036 "CompanyName" "${COMPANY}"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation de ${APPNAME}"
VIAddVersionKey /LANG=1036 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "LegalCopyright" "© ${COMPANY}"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${TITRE}"
!define MUI_WELCOMEPAGE_TEXT "Version ${VERSION}.$\r$\n$\r$\nL’application ouvre l’ERP de DIGITAL-TEX (app.vethypro.com) dans sa propre fenêtre : Studio 3D, commandes, BL, factures, production, stocks, paramètres — selon les droits de votre compte.$\r$\n$\r$\nUne connexion Internet est nécessaire. Les données restent sur le serveur de l’ERP.$\r$\n$\r$\nL’ancienne application « Uniform Studio 3D » n’est pas modifiée."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer ${APPNAME}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

Function .onInit
  ; une mise à jour attend la fermeture de l'application (jusqu'à 15 s)
  StrCpy $0 0
  boucle:
    FindWindow $1 "" "ERP UNIFORM STUDIO — DIGITAL-TEX S.A."
    StrCmp $1 0 fini
    IntOp $0 $0 + 1
    IntCmp $0 30 fini
    Sleep 500
    Goto boucle
  fini:
FunctionEnd

Section "Installer"
  SetOutPath "$INSTDIR"
  ; une mise à jour remplace l'ancienne version (aucune donnée métier n'est stockée ici)
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "..\dist\win-unpacked\*.*"
  WriteUninstaller "$INSTDIR\Désinstaller ${APPNAME}.exe"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Désinstaller ${APPNAME}.lnk" "$INSTDIR\Désinstaller ${APPNAME}.exe"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}"
  CreateDirectory "$DOCUMENTS\ERP Uniform Studio"
  WriteRegStr HKCU "${REGKEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "Version" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${TITRE}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${COMPANY}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Désinstaller ${APPNAME}.exe"'
  WriteRegStr HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Désinstaller ${APPNAME}.exe" /S'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"
  ; relance après une mise à jour silencieuse
  ${GetParameters} $R0
  ${GetOptions} $R0 "/RELANCER" $R1
  IfErrors +2 0
    Exec '"$INSTDIR\${EXE}"'
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "${REGKEY}"
  ; les documents téléchargés (Documents\ERP Uniform Studio) sont conservés
SectionEnd
