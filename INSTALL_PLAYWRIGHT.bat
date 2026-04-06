@echo off
echo ========================================
echo  Installation de Playwright pour The Clip Deal
echo ========================================
echo.
echo Etape 1: Installation du package Python playwright...
pip install playwright
echo.
echo Etape 2: Telechargement de Chromium (navigateur headless)...
playwright install chromium --with-deps
echo.
echo ========================================
echo  Installation terminee !
echo  Relancez le serveur backend: python server.py
echo ========================================
pause
