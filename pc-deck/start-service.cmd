@echo off
rem PC Deck em segundo plano: roda o agente e religa sozinho se ele parar.
rem Usado pela inicializacao automatica (tools\autostart.ps1). Para uso manual, prefira start.cmd.
setlocal
cd /d "%~dp0"

rem ja tem um agente ouvindo na porta? entao nao abre outro (a tarefa roda no login, ao desbloquear e a cada 5 min)
netstat -ano -p TCP | findstr /R /C:"127\.0\.0\.1:8787 .*LISTENING" /C:"0\.0\.0\.0:8787 .*LISTENING" >nul && exit /b 0

:loop
rem log com no maximo ~1 MB (guarda a versao anterior em agent.old.log)
if exist agent.log for %%A in (agent.log) do if %%~zA GTR 1048576 move /y agent.log agent.old.log >nul
echo [%date% %time%] iniciando o agente>> agent.log
node "%~dp0server.js" >> agent.log 2>&1
echo [%date% %time%] o agente parou (codigo %errorlevel%); religando em 5 s>> agent.log
timeout /t 5 /nobreak >nul
goto loop
