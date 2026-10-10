[CmdletBinding()]
param(
    [ValidateSet('Start', 'Stop', 'RunBackend', 'RunFrontend')]
    [string]$Action = 'Start',
    [switch]$NoBrowser,
    [string]$OwnerToken
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeDirectory = Join-Path $projectRoot '.local-run'
$backendDirectory = Join-Path $projectRoot 'backend'
$frontendDirectory = Join-Path $projectRoot 'frontend'
$frontendPort = 5173
$backendPort = 8081
$scriptPath = $PSCommandPath
$windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

# Read only the port; database credentials remain in the ignored .env file.
$configPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $configPath) {
    foreach ($line in [IO.File]::ReadAllLines($configPath)) {
        if ($line -match '^\s*BACKEND_PORT\s*=\s*"?(\d+)"?\s*$') {
            $backendPort = [int]$Matches[1]
        }
    }
}
if ($env:BACKEND_PORT) { $backendPort = [int]$env:BACKEND_PORT }
if ($backendPort -lt 1 -or $backendPort -gt 65535 -or $backendPort -eq $frontendPort) {
    throw 'BACKEND_PORT mora biti ispravan port, razlicit od 5173.'
}

# Workers stay alive while Maven/npm run. Their descendants can then be stopped
# using recorded process identity rather than broad java/node process-name kills.
if ($Action -in @('RunBackend', 'RunFrontend')) {
    if ($OwnerToken -notmatch '^[a-f0-9]{32}$') { throw 'Nedostaje identifikator pokretaca.' }
    $ErrorActionPreference = 'Continue'
    if ($Action -eq 'RunBackend') {
        Set-Location -LiteralPath $backendDirectory
        & mvn.cmd -B -ntp spring-boot:run
    } else {
        Set-Location -LiteralPath $frontendDirectory
        & npm.cmd run dev
    }
    exit $LASTEXITCODE
}

function Get-StatePath([string]$Service) {
    return Join-Path $runtimeDirectory ($Service + '.json')
}

function Get-ProcessRecord([int]$ProcessId) {
    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        return [pscustomobject]@{
            Id = $ProcessId
            StartTicks = $process.StartTime.ToUniversalTime().Ticks.ToString()
        }
    } catch { return $null }
}

function Test-ProcessRecord($Record) {
    if (-not $Record) { return $false }
    $current = Get-ProcessRecord ([int]$Record.Id)
    return $current -and $current.StartTicks -eq [string]$Record.StartTicks
}

function Get-OwnedWorker([string]$Service) {
    $path = Get-StatePath $Service
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try {
        $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        if (-not (Test-ProcessRecord $record)) { return $null }
        if ($record.Token -notmatch '^[a-f0-9]{32}$') { return $null }
        $process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$record.Id)
        $workerAction = if ($Service -eq 'backend') { 'RunBackend' } else { 'RunFrontend' }
        if ($process.Name -ne 'powershell.exe' -or
            $process.CommandLine.IndexOf($scriptPath, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
            $process.CommandLine -notmatch ('-Action\s+' + $workerAction + '\b') -or
            $process.CommandLine -notmatch ('-OwnerToken\s+' + $record.Token + '\b')) {
            return $null
        }
        return $record
    } catch { return $null }
}

function Get-Listener([int]$Port) {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    $owners = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -gt 1) { throw "Port $Port koristi vise procesa. Necu ih automatski menjati." }
    if ($owners.Count -eq 0) { return $null }
    return Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$owners[0])
}

function Test-ProjectListener($Process, [string]$Service) {
    if (-not $Process -or -not $Process.CommandLine) { return $false }
    $worker = Get-OwnedWorker $Service
    if ($worker) {
        $ancestor = $Process
        for ($depth = 0; $depth -lt 32 -and $ancestor; $depth++) {
            $identity = Get-ProcessRecord ([int]$ancestor.ProcessId)
            if (-not $identity -or [long]$identity.StartTicks -lt [long]$worker.StartTicks) { break }
            if ([int]$ancestor.ProcessId -eq [int]$worker.Id) { return Test-ProcessRecord $worker }
            if ([int]$ancestor.ParentProcessId -le 0) { break }
            $ancestor = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$ancestor.ParentProcessId)
        }
    }
    if ($Service -eq 'backend') {
        if ($Process.Name -ne 'java.exe' -or
            -not $Process.CommandLine.Contains('rs.stefanoluic.volleyball.VolleyballApplication')) { return $false }
        $classes = Join-Path $backendDirectory 'target\classes'
        if ($Process.CommandLine.IndexOf($classes, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
        $argumentFile = [regex]::Match($Process.CommandLine, '(?:-cp|-classpath)\s+@(?:"([^"]+)"|(\S+))')
        if ($argumentFile.Success) {
            $path = if ($argumentFile.Groups[1].Success) { $argumentFile.Groups[1].Value } else { $argumentFile.Groups[2].Value }
            try {
                $file = Get-Item -LiteralPath $path -ErrorAction Stop
                if ($file.Name -match '^spring-boot-.*\.argfile$' -and $file.Length -le 1048576) {
                    return [IO.File]::ReadAllText($file.FullName).IndexOf($classes, [StringComparison]::OrdinalIgnoreCase) -ge 0
                }
            } catch { return $false }
        }
        return $false
    }
    $vitePath = Join-Path $frontendDirectory 'node_modules\vite\bin\vite.js'
    if ($Process.Name -ne 'node.exe') { return $false }
    $argument = [regex]::Match($Process.CommandLine, '"([^"]*vite[\\/]+bin[\\/]+vite\.js)"|(\S*vite[\\/]+bin[\\/]+vite\.js)')
    if (-not $argument.Success) { return $false }
    $path = if ($argument.Groups[1].Success) { $argument.Groups[1].Value } else { $argument.Groups[2].Value }
    try {
        return [IO.Path]::GetFullPath($path).Equals($vitePath, [StringComparison]::OrdinalIgnoreCase)
    } catch { return $false }
}

function Assert-ServicePort([string]$Service, [int]$Port) {
    $listener = Get-Listener $Port
    if ($listener -and -not (Test-ProjectListener $listener $Service)) {
        throw "Port $Port je zauzet drugom aplikacijom. Necu pokretati dupli server niti gasiti taj proces."
    }
    return $listener
}

function Stop-WorkerTree($Record) {
    if (-not (Test-ProcessRecord $Record)) { return }
    $snapshot = @(Get-CimInstance Win32_Process)
    $records = [Collections.Generic.List[object]]::new()
    function Find-Children([int]$ParentId) {
        foreach ($child in $snapshot) {
            if ([int]$child.ParentProcessId -eq $ParentId -and [int]$child.ProcessId -ne $ParentId) {
                $childRecord = Get-ProcessRecord ([int]$child.ProcessId)
                if ($childRecord -and [long]$childRecord.StartTicks -ge [long]$Record.StartTicks) {
                    Find-Children ([int]$child.ProcessId)
                    $records.Add($childRecord)
                }
            }
        }
    }
    Find-Children ([int]$Record.Id)
    $records.Add($Record)
    foreach ($processRecord in $records) {
        if (Test-ProcessRecord $processRecord) {
            Stop-Process -Id ([int]$processRecord.Id) -Force -ErrorAction SilentlyContinue
        }
    }
}

function Stop-AppService([string]$Service, [int]$Port) {
    $record = Get-OwnedWorker $Service
    if ($record) {
        Stop-WorkerTree $record
        Write-Host "$Service je zaustavljen."
    } else {
        $listener = Get-Listener $Port
        if ($listener -and (Test-ProjectListener $listener $Service)) {
            $identity = Get-ProcessRecord ([int]$listener.ProcessId)
            # A manual project server is stopped only after rechecking its
            # start time and its exact project-specific command line.
            $current = Get-Listener $Port
            if ((Test-ProcessRecord $identity) -and (Test-ProjectListener $current $Service) -and
                [int]$current.ProcessId -eq [int]$identity.Id) {
                Stop-Process -Id ([int]$identity.Id) -Force
                Write-Host "$Service je zaustavljen (bio je pokrenut rucno)."
            }
        } elseif ($listener) {
            Write-Host "Port $Port koristi druga aplikacija; ostavljam je ukljucenu."
        } else {
            Write-Host "$Service vec nije pokrenut."
        }
    }
    $statePath = Get-StatePath $Service
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
}

function Test-Docker {
    try {
        $result = & docker.exe info --format '{{.OSType}}' 2>$null
        return $LASTEXITCODE -eq 0 -and $result -eq 'linux'
    } catch { return $false }
}

function Start-Docker {
    if (Test-Docker) { return }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
    )
    $desktop = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $desktop) { throw 'Pokreni Docker Desktop rucno, pa ponovo pokreni Pokreni.cmd.' }
    Write-Host 'Pokrecem Docker Desktop. Prvo pokretanje moze potrajati...'
    Start-Process -FilePath $desktop -WindowStyle Hidden | Out-Null
    $deadline = (Get-Date).AddSeconds(180)
    do {
        Start-Sleep -Seconds 2
        if (Test-Docker) { return }
    } while ((Get-Date) -lt $deadline)
    throw 'Docker nije spreman. Otvori Docker Desktop, proveri da radi Linux engine i pokusaj ponovo.'
}

function Test-ServiceReady([string]$Service, [int]$Port) {
    try {
        if ($Service -eq 'backend') {
            $response = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $Port + '/api/system/health') -TimeoutSec 3
            return $response.status -eq 'UP'
        }
        $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:" + $Port) -TimeoutSec 3
        return $response.StatusCode -eq 200 -and $response.Content.Contains('/@vite/client')
    } catch { return $false }
}

function Start-ServiceWorker([string]$Service) {
    $token = [Guid]::NewGuid().ToString('N')
    $prefix = $Service + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $token.Substring(0, 6)
    $stdout = Join-Path $runtimeDirectory ($prefix + '.out.log')
    $stderr = Join-Path $runtimeDirectory ($prefix + '.err.log')
    $workerAction = if ($Service -eq 'backend') { 'RunBackend' } else { 'RunFrontend' }
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'),
        '-Action', $workerAction, '-OwnerToken', $token)
    $startOptions = @{
        FilePath = $windowsPowerShell
        ArgumentList = $arguments
        WorkingDirectory = $projectRoot
        WindowStyle = 'Hidden'
        RedirectStandardOutput = $stdout
        RedirectStandardError = $stderr
        PassThru = $true
    }
    $process = Start-Process @startOptions
    $identity = Get-ProcessRecord $process.Id
    if (-not $identity) { throw "$Service nije uspeo da se pokrene. Pogledaj logove u .local-run." }
    $record = [pscustomobject]@{
        Id = $identity.Id
        StartTicks = $identity.StartTicks
        Token = $token
        OutputLog = $stdout
        ErrorLog = $stderr
    }
    $record | ConvertTo-Json | Set-Content -LiteralPath (Get-StatePath $Service) -Encoding UTF8
    return $record
}

function Wait-Service([string]$Service, [int]$Port) {
    $deadline = (Get-Date).AddSeconds(180)
    do {
        $listener = Assert-ServicePort $Service $Port
        if ($listener -and (Test-ServiceReady $Service $Port)) { return }
        if (-not $listener -and -not (Get-OwnedWorker $Service)) {
            throw "$Service se ugasio tokom pokretanja. Pogledaj poslednje logove u .local-run."
        }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    throw "$Service nije spreman posle 3 minuta. Pogledaj poslednje logove u .local-run."
}

$hash = [Security.Cryptography.SHA256]::Create()
try { $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant()))).Replace('-', '') }
finally { $hash.Dispose() }
$mutex = [Threading.Mutex]::new($false, ('Local\VolleyballLauncher-' + $key.Substring(0, 16)))
$locked = $false
$started = [Collections.Generic.List[string]]::new()
try {
    try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Pokretanje ili zaustavljanje je vec u toku. Sacekaj da se zavrsi.' }
    Set-Location -LiteralPath $projectRoot

    if ($Action -eq 'Stop') {
        Stop-AppService 'frontend' $frontendPort
        Stop-AppService 'backend' $backendPort
        if (Get-Command docker.exe -ErrorAction SilentlyContinue) {
            if (Test-Docker) {
                & docker.exe compose stop database
                if ($LASTEXITCODE -ne 0) { throw 'Serveri su zaustavljeni, ali bazu treba zaustaviti u Docker Desktop-u.' }
            } else { Write-Host 'Docker engine nije pokrenut; baza vec nije dostupna.' }
        }
        Write-Host 'Aplikacija je zaustavljena. Podaci baze i logovi nisu obrisani.'
        exit 0
    }

    foreach ($command in @('java.exe', 'mvn.cmd', 'npm.cmd', 'docker.exe')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Nedostaje $command. Proveri instalaciju i PATH, pa pokusaj ponovo."
        }
    }
    if (-not (Test-Path -LiteralPath $configPath)) {
        throw 'Nedostaje .env. Napravi ga prema .env.example i postavi lokalnu lozinku; postojeci .env nemoj prepisivati.'
    }
    $backendListener = Assert-ServicePort 'backend' $backendPort
    $frontendListener = Assert-ServicePort 'frontend' $frontendPort
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    Start-Docker
    Write-Host 'Pokrecem/proveravam bazu...'
    & docker.exe compose up -d --wait --wait-timeout 90 database
    if ($LASTEXITCODE -ne 0) { throw 'Baza nije spremna. Proveri Docker Desktop i .env konfiguraciju.' }

    if (-not (Test-Path -LiteralPath (Join-Path $frontendDirectory 'node_modules\.bin\vite.cmd'))) {
        Write-Host 'Instaliram frontend pakete iz package-lock.json...'
        Push-Location -LiteralPath $frontendDirectory
        try {
            & npm.cmd ci
            if ($LASTEXITCODE -ne 0) { throw 'Instalacija frontend paketa nije uspela.' }
        } finally { Pop-Location }
    }
    foreach ($service in @('backend', 'frontend')) {
        $port = if ($service -eq 'backend') { $backendPort } else { $frontendPort }
        $listener = Assert-ServicePort $service $port
        if ($listener -or (Get-OwnedWorker $service)) {
            Write-Host "$service vec radi ili se pokrece; ne pravim dupli proces."
        } else {
            Write-Host "Pokrecem $service u pozadini..."
            Start-ServiceWorker $service | Out-Null
            $started.Add($service)
        }
        Wait-Service $service $port
    }
    $url = 'http://localhost:5173'
    Write-Host "Aplikacija je spremna: $url"
    Write-Host 'Za zaustavljanje koristi Zaustavi.cmd. Logovi su u .local-run.'
    if (-not $NoBrowser) {
        try { Start-Process $url | Out-Null }
        catch { Write-Host "Browser nije otvoren automatski; otvori $url rucno." }
    }
    exit 0
} catch {
    foreach ($service in $started) {
        $record = Get-OwnedWorker $service
        if ($record) { Stop-WorkerTree $record }
    }
    Write-Host ''
    Write-Host ('GRESKA: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Podaci baze nisu obrisani. Ako postoje logovi, nalaze se u .local-run.'
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
