@echo off
setlocal EnableExtensions DisableDelayedExpansion
if "%~1"=="" exit /b 2
if not "%~2"=="" if not "%~2"=="--fault-fixture" exit /b 2
if not "%~3"=="" exit /b 2
set "OUT=%~f1"
set "EXTRA_DEFINE="
if "%~2"=="--fault-fixture" set "EXTRA_DEFINE=/DAITEST_FAULT_FIXTURE"
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" exit /b 3
set "VSROOT="
for /f "usebackq delims=" %%V in (`"%VSWHERE%" -latest -products * -property installationPath`) do set "VSROOT=%%V"
if not defined VSROOT exit /b 4
call "%VSROOT%\Common7\Tools\VsDevCmd.bat" -arch=amd64 -host_arch=amd64 >nul
if errorlevel 1 exit /b 5
if not exist "%OUT%" mkdir "%OUT%"
if errorlevel 1 exit /b 6
cl.exe /nologo /std:c++17 /EHsc /W4 /WX /O2 %EXTRA_DEFINE% /Fo:"%OUT%\windows-file-helper.obj" /Fe:"%OUT%\windows-file-helper.exe" "%~dp0..\native\windows-file-helper.cpp" ntdll.lib bcrypt.lib
if errorlevel 1 exit /b 7
exit /b 0
