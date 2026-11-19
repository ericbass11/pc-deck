# PC Deck: liga/desliga a inicializacao automatica com o Windows.
#
#   powershell -ExecutionPolicy Bypass -File tools\autostart.ps1 install     # liga no login, escondido
#   powershell -ExecutionPolicy Bypass -File tools\autostart.ps1 uninstall   # remove e para o agente
#   powershell -ExecutionPolicy Bypass -File tools\autostart.ps1 status
#
# Cria "PC Deck.vbs" na pasta Inicializar do usuario. Ele abre start-service.cmd sem janela,
# e o start-service religa o agente se ele parar. Nao precisa de administrador.
param([ValidateSet('install', 'uninstall', 'status', 'start')][string]$Action = 'status')

$deckDir = Split-Path -Parent $PSScriptRoot
$service = Join-Path $deckDir 'start-service.cmd'
$startup = [Environment]::GetFolderPath('Startup')
$vbs = Join-Path $startup 'PC Deck.vbs'

function Stop-Deck {
  # só processos desta pasta. O laço (cmd) primeiro, senão ele religa o node.
  $mine = { param($p) $p.CommandLine -and $p.CommandLine.IndexOf($deckDir, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { & $mine $_ } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { & $mine $_ } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Start-Deck {
  Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$vbs`"" -WindowStyle Hidden
}

switch ($Action) {
  'install' {
    if (-not (Test-Path $service)) { throw "Nao achei $service" }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node nao encontrado no PATH. Instale o Node 18 ou mais novo.' }
    # VBS: roda o .cmd com a janela escondida (0) e sem esperar (False)
    $content = 'CreateObject("WScript.Shell").Run """' + $service + '""", 0, False'
    Set-Content -Path $vbs -Value $content -Encoding Unicode
    Write-Host "Inicializacao automatica ligada: $vbs"
    Write-Host "Agente: $deckDir"
  }
  'start' {
    if (-not (Test-Path $vbs)) { throw 'Rode primeiro: autostart.ps1 install' }
    Start-Deck
    Write-Host 'Agente iniciado em segundo plano.'
  }
  'uninstall' {
    Stop-Deck
    Remove-Item $vbs -ErrorAction SilentlyContinue
    Write-Host 'Inicializacao automatica removida e agente parado.'
  }
  'status' {
    Write-Host ("Inicializacao automatica: " + $(if (Test-Path $vbs) { "ligada ($vbs)" } else { 'desligada' }))
    $listening = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
    Write-Host ("Agente na porta 8787: " + $(if ($listening) { 'rodando' } else { 'parado' }))
  }
}
