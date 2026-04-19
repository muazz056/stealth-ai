@echo off
echo ========================================
echo  Interview Stealth Assist - Builder
echo ========================================
echo.

:menu
echo Choose build option:
echo [1] Build for Windows only
echo [2] Build for macOS only
echo [3] Build for Linux only
echo [4] Build for ALL platforms
echo [5] Just build frontend (no packaging)
echo [0] Exit
echo.
set /p choice="Enter your choice (0-5): "

if "%choice%"=="1" goto build_win
if "%choice%"=="2" goto build_mac
if "%choice%"=="3" goto build_linux
if "%choice%"=="4" goto build_all
if "%choice%"=="5" goto build_frontend
if "%choice%"=="0" goto end
echo Invalid choice! Please try again.
echo.
goto menu

:build_win
echo.
echo Building for Windows...
call npm run dist:win
goto done

:build_mac
echo.
echo Building for macOS...
echo Note: This requires a Mac computer!
call npm run dist:mac
goto done

:build_linux
echo.
echo Building for Linux...
call npm run dist:linux
goto done

:build_all
echo.
echo Building for ALL platforms...
echo Note: Cross-platform building may require additional setup!
call npm run dist:all
goto done

:build_frontend
echo.
echo Building frontend only...
call npm run build
goto done

:done
echo.
echo ========================================
echo Build completed!
echo Check the 'dist-electron' folder for your executable.
echo ========================================
echo.
pause
goto end

:end

