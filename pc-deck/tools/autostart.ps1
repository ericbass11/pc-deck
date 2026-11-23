# PC Deck: liga/desliga a inicializacao automatica com o Windows.
#
#   powershell -ExecutionPolicy Bypass -File tools\autostart.ps1 install     # liga
#   powershell -ExecutionPolicy Bypass -File tools\autostart.ps1 start       # inicia agora
#   powershell -ExecutionPolicy Bypass -File tools\autostart.ps1 status
#   powershell -ExecutionPolicy Bypass -File tools\autostart.ps1 uninstall   # remove e para o agente
#
# Cria a tarefa "PC Deck" no Agendador de Tarefas do usuario (sem administrador), que abre
# start-service.cmd sem janela (via tools\run-hidden.vbs): no login, ao desbloquear a tela (volta da suspensao/hibernacao)
# e a cada 5 minutos como garantia. O start-service nao abre uma segunda copia e religa o
# agente se ele cair. Se o Agendador estiver bloqueado, usa a pasta Inicializar como reserva.
param([ValidateSet('install', 'uninstall', 'status', 'start')][string]$Action = 'status')

$ErrorActionPreference = 'Stop'
$deckDir = Split-Path -Parent $PSScriptRoot
$service = Join-Path $deckDir 'start-service.cmd'
$taskName = 'PC Deck'
$vbs = Join-Path ([Environment]::GetFolderPath('Startup')) 'PC Deck.vbs'
$user = "$env:USERDOMAIN\$env:USERNAME"

function Stop-Deck {
  # so processos desta pasta. O laco (cmd) primeiro, senao ele religa o node.
  $mine = { param($p) $p.CommandLine -and $p.CommandLine.IndexOf($deckDir, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { & $mine $_ } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { & $mine $_ } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

$launcher = Join-Path $PSScriptRoot 'run-hidden.vbs'

function Write-Launcher {
  # abre o start-service.cmd sem janela (0) e sem esperar (False)
  $content = 'CreateObject("WScript.Shell").Run """' + $service + '""", 0, False'
  Set-Content -Path $launcher -Value $content -Encoding Unicode
}

function Install-Task {
  Write-Launcher
  # //B: modo silencioso, nunca abre caixa de erro (uma caixa aberta travaria os próximos disparos)
  $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //NoLogo `"$launcher`""
  $logon = New-ScheduledTaskTrigger -AtLogOn -User $user
  $every5 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
  $unlockClass = Get-CimClass -Namespace Root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskSessionStateChangeTrigger
  $unlock = New-CimInstance -CimClass $unlockClass -ClientOnly -Property @{ StateChange = 8; UserId = $user; Enabled = $true } # 8 = desbloqueio
  # o lancador sai na hora; quem mantem o agente vivo e o laco do start-service (e o gatilho de 5 min)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logon, $unlock, $every5) -Settings $settings -Principal $principal `
    -Description 'PC Deck: agente dos atalhos do celular (https://github.com/ericbass11/pc-deck)' -Force | Out-Null
}

function Install-StartupFolder {
  Write-Launcher
  Copy-Item $launcher $vbs -Force
}

switch ($Action) {
  'install' {
    if (-not (Test-Path $service)) { throw "Nao achei $service" }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node nao encontrado no PATH. Instale o Node 18 ou mais novo.' }
    try {
      Install-Task
      Remove-Item $vbs -ErrorAction SilentlyContinue # a tarefa substitui a pasta Inicializar
      Write-Host "Tarefa '$taskName' criada no Agendador: no login, ao desbloquear e a cada 5 min."
    } catch {
      Install-StartupFolder
      Write-Host "Agendador indisponivel ($($_.Exception.Message)). Usando a pasta Inicializar: $vbs"
    }
    Write-Host "Agente: $deckDir"
  }
  'start' {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName $taskName }
    elseif (Test-Path $vbs) { Start-Process wscript.exe -ArgumentList "`"$vbs`"" -WindowStyle Hidden }
    else { throw 'Rode primeiro: autostart.ps1 install' }
    Write-Host 'Agente iniciado em segundo plano.'
  }
  'uninstall' {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item $vbs, $launcher -ErrorAction SilentlyContinue
    Stop-Deck
    Write-Host 'Inicializacao automatica removida e agente parado.'
  }
  'status' {
    $t = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Write-Host ("Tarefa no Agendador: " + $(if ($t) { "$($t.State)" } else { 'nao existe' }))
    Write-Host ("Pasta Inicializar: " + $(if (Test-Path $vbs) { 'ligada' } else { 'nao usada' }))
    $listening = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
    Write-Host ("Agente na porta 8787: " + $(if ($listening) { 'rodando' } else { 'parado' }))
  }
}
