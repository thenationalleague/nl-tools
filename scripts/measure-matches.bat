@echo off
rem ---------------------------------------------------------------------------
rem  Brand Exposure - measure sponsor boards in match video.
rem
rem  Two ways to use it, neither of which needs a terminal:
rem
rem    Double-click it        - measures every video in the inbox folder.
rem    Drag videos onto it    - measures just those.
rem
rem  Name each file after the fixture so nothing has to be typed:
rem
rem       2026-08-23 Sutton United v Hartlepool United.mp4
rem
rem  The home club decides which reference folder is searched alongside the
rem  league partner marks, which is why the name matters and why a file it
rem  cannot read is skipped rather than guessed at.
rem
rem  Rename this file to whatever you like - Windows does not care.
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"
title Brand Exposure

where python >nul 2>&1
if errorlevel 1 goto nopython
if not exist "board-exposure-match.py" goto noscript

if "%~1"=="" goto inbox

rem --- files were dropped onto this .bat -------------------------------------
:dropped
echo.
echo ========================================================================
echo   %~nx1
echo ========================================================================
python board-exposure-match.py --video "%~1" --refs refs --out-dir reports
shift
if not "%~1"=="" goto dropped
goto finish

rem --- double-clicked: do the whole inbox ------------------------------------
:inbox
if not exist "inbox" mkdir inbox
python board-exposure-match.py --batch inbox --refs refs
goto finish

:nopython
echo.
echo   Python is not installed.
echo.
echo   Open PowerShell and type:  python3
echo   Windows will offer to install it from the Store - no admin rights needed.
echo   Then run:  python -m pip install opencv-python-headless numpy
goto end

:noscript
echo.
echo   board-exposure-match.py is not in this folder.
echo   Put this .bat next to the three .py files.
goto end

:finish
echo.
echo   Finished. Reports are in the "reports" folder - open the .html files.
echo   The -data.json files are the ones to add to Brand Exposure.

:end
echo.
pause
