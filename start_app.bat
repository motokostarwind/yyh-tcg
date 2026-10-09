@echo off
title Yu Yu Hakusho TCG Database ^& Deck Builder
echo ==============================================================
echo  Launching Yu Yu Hakusho TCG Database ^& Deck Builder...
echo ==============================================================
echo.
echo Starting local web server on http://localhost:8000 ...
echo.
start "" "http://localhost:8000"
python server.py 8000
pause
