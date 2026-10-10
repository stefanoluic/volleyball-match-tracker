$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$scriptPath = Join-Path $projectRoot 'scripts\local-app.ps1'
$backendDirectory = Join-Path $projectRoot 'backend'
$frontendDirectory = Join-Path $projectRoot 'frontend'
$runtimeDirectory = Join-Path $projectRoot ('.local-run\tests-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw 'Launcher has syntax errors.' }
foreach ($statement in $ast.EndBlock.Statements) {
    if ($statement -is [Management.Automation.Language.FunctionDefinitionAst]) {
        Invoke-Expression $statement.Extent.Text
    }
}

# All process operations below are fakes: these tests cannot stop real processes.
$script:fakeIdentities = @{}
$script:fakeProcesses = @{}
$script:stoppedIds = [Collections.Generic.List[int]]::new()
$script:assertions = 0
function Get-ProcessRecord([int]$ProcessId) { return $script:fakeIdentities[$ProcessId] }
function Get-CimInstance {
    param([string]$ClassName, [string]$Filter)
    if ($Filter -match 'ProcessId = (\d+)') { return $script:fakeProcesses[[int]$Matches[1]] }
    return @($script:fakeProcesses.Values)
}
function Stop-Process {
    param([int]$Id, [switch]$Force, [string]$ErrorAction)
    $script:stoppedIds.Add($Id)
    $script:fakeIdentities.Remove($Id)
}
function Assert-Launcher([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "FAILED: $Message" }
    $script:assertions++
}
function Set-TestProcess([int]$Id, [int]$ParentId, [long]$Ticks, [string]$Name, [string]$CommandLine) {
    $script:fakeIdentities[$Id] = [pscustomobject]@{ Id = $Id; StartTicks = $Ticks.ToString() }
    $script:fakeProcesses[$Id] = [pscustomobject]@{
        ProcessId = $Id; ParentProcessId = $ParentId; Name = $Name; CommandLine = $CommandLine
    }
}
function Save-TestState($Record) {
    $Record | ConvertTo-Json | Set-Content -LiteralPath (Get-StatePath 'backend') -Encoding UTF8
}

try {
    $backend = [pscustomobject]@{
        ProcessId = 7; ParentProcessId = 0; Name = 'java.exe'
        CommandLine = 'java -cp "' + $backendDirectory + '\target\classes" rs.stefanoluic.volleyball.VolleyballApplication'
    }
    Assert-Launcher (Test-ProjectListener $backend 'backend') 'Recognizes this project backend'
    $other = [pscustomobject]@{ ProcessId = 8; ParentProcessId = 0; Name = 'java.exe'; CommandLine = 'java -cp C:\other rs.stefanoluic.volleyball.VolleyballApplication' }
    Assert-Launcher (-not (Test-ProjectListener $other 'backend')) 'Rejects a different project'
    $other.Name = 'node.exe'
    Assert-Launcher (-not (Test-ProjectListener $other 'backend')) 'Rejects wrong executable'
    $frontend = [pscustomobject]@{ ProcessId = 9; ParentProcessId = 0; Name = 'node.exe'; CommandLine = 'node "' + $frontendDirectory + '\node_modules\vite\bin\vite.js"' }
    Assert-Launcher (Test-ProjectListener $frontend 'frontend') 'Recognizes this project Vite'
    $frontend.CommandLine = 'node "' + $frontendDirectory + '\node_modules\.bin\\..\vite\bin\vite.js" --host 127.0.0.1'
    Assert-Launcher (Test-ProjectListener $frontend 'frontend') 'Normalizes npm shim paths'
    $frontend.CommandLine = 'node C:\other\node_modules\vite\bin\vite.js'
    Assert-Launcher (-not (Test-ProjectListener $frontend 'frontend')) 'Rejects other Vite projects'
    Assert-Launcher (-not (Test-ProjectListener $null 'backend')) 'Rejects missing listener'

    $argumentPath = Join-Path $runtimeDirectory 'spring-boot-test.argfile'
    Set-Content -LiteralPath $argumentPath -Value ($backendDirectory + '\target\classes;C:\other.jar') -Encoding UTF8
    $backend.CommandLine = 'java -cp @"' + $argumentPath + '" rs.stefanoluic.volleyball.VolleyballApplication'
    Assert-Launcher (Test-ProjectListener $backend 'backend') 'Recognizes manual Spring Boot argument-file launch'
    Set-Content -LiteralPath $argumentPath -Value 'C:\different\target\classes;C:\other.jar' -Encoding UTF8
    Assert-Launcher (-not (Test-ProjectListener $backend 'backend')) 'Rejects other project in argument file'

    $token = 'a' * 32
    Set-TestProcess 100 0 100 'powershell.exe' ('powershell -File "' + $scriptPath + '" -Action RunBackend -OwnerToken ' + $token)
    $root = [pscustomobject]@{ Id = 100; StartTicks = '100'; Token = $token }
    Save-TestState $root
    Assert-Launcher ([bool](Get-OwnedWorker 'backend')) 'Accepts matching worker identity'
    $root.StartTicks = '99'
    Save-TestState $root
    Assert-Launcher (-not (Get-OwnedWorker 'backend')) 'Rejects reused process ID'
    $root.StartTicks = '100'
    $root.Token = 'b' * 32
    Save-TestState $root
    Assert-Launcher (-not (Get-OwnedWorker 'backend')) 'Rejects mismatched ownership token'
    $root.Token = $token
    Save-TestState $root
    $script:fakeProcesses[100].CommandLine = 'powershell -File C:\other.ps1 -Action RunBackend -OwnerToken ' + $token
    Assert-Launcher (-not (Get-OwnedWorker 'backend')) 'Rejects a different worker script'
    $script:fakeProcesses[100].CommandLine = 'powershell -File "' + $scriptPath + '" -Action RunFrontend -OwnerToken ' + $token
    Assert-Launcher (-not (Get-OwnedWorker 'backend')) 'Rejects wrong worker mode'
    $script:fakeProcesses[100].CommandLine = 'powershell -File "' + $scriptPath + '" -Action RunBackend -OwnerToken ' + $token

    Set-TestProcess 110 100 110 'cmd.exe' 'mvn.cmd spring-boot:run'
    Set-TestProcess 111 110 120 'java.exe' 'java @temporary-arguments'
    Set-TestProcess 112 100 50 'node.exe' 'unrelated process with stale parent ID'
    Set-TestProcess 200 0 50 'node.exe' 'unrelated application'
    Assert-Launcher (Test-ProjectListener $script:fakeProcesses[111] 'backend') 'Recognizes owned descendants using argument files'
    Assert-Launcher (-not (Test-ProjectListener $script:fakeProcesses[200] 'backend')) 'Does not adopt unrelated process'
    Assert-Launcher (-not (Test-ProjectListener $script:fakeProcesses[112] 'backend')) 'Rejects stale parent ID ancestry'

    Stop-WorkerTree $root
    Assert-Launcher (($script:stoppedIds -join ',') -eq '111,110,100') 'Stops descendants before the owning worker'
    Assert-Launcher ($script:fakeIdentities.ContainsKey(200)) 'Preserves unrelated process'
    Assert-Launcher ($script:fakeIdentities.ContainsKey(112)) 'Preserves stale-parent process'
    $script:stoppedIds.Clear()
    Stop-WorkerTree $root
    Assert-Launcher ($script:stoppedIds.Count -eq 0) 'Stopping stale state is harmless'
    Set-TestProcess 100 0 999 'powershell.exe' 'different process'
    Stop-WorkerTree $root
    Assert-Launcher ($script:stoppedIds.Count -eq 0) 'Never stops reused PID'
    Set-Content -LiteralPath (Get-StatePath 'backend') -Value '{invalid json' -Encoding UTF8
    Assert-Launcher (-not (Get-OwnedWorker 'backend')) 'Handles corrupted state safely'

    Write-Host ("PASS: " + $script:assertions + ' launcher safety assertions; no real processes were stopped.')
} finally {
    $statePath = Get-StatePath 'backend'
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
    if ($argumentPath -and (Test-Path -LiteralPath $argumentPath)) { Remove-Item -LiteralPath $argumentPath }
    Remove-Item -LiteralPath $runtimeDirectory
}
