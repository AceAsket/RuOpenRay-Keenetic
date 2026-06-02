param(
  [string]$Router = $(if ($env:RUOPENRAY_ROUTER) { $env:RUOPENRAY_ROUTER } else { '192.168.1.1' }),
  [int]$PanelPort = $(if ($env:RUOPENRAY_PANEL_PORT) { [int]$env:RUOPENRAY_PANEL_PORT } else { 9090 }),
  [string]$PanelPassword = $(if ($env:RUOPENRAY_PANEL_PASSWORD) { $env:RUOPENRAY_PANEL_PASSWORD } else { 'admin' }),
  [string]$LanClientIp = $(if ($env:RUOPENRAY_LAN_CLIENT_IP) { $env:RUOPENRAY_LAN_CLIENT_IP } else { '192.168.1.190' }),
  [string]$HttpUrl = $(if ($env:RUOPENRAY_TEST_HTTP_URL) { $env:RUOPENRAY_TEST_HTTP_URL } else { 'http://example.com/' }),
  [string]$HttpsUrl = $(if ($env:RUOPENRAY_TEST_HTTPS_URL) { $env:RUOPENRAY_TEST_HTTPS_URL } else { 'https://www.gstatic.com/generate_204' }),
  [string]$DnsServer = $(if ($env:RUOPENRAY_TEST_DNS_SERVER) { $env:RUOPENRAY_TEST_DNS_SERVER } else { '192.168.50.1:53' }),
  [int]$BasePort = 18081,
  [int]$CurlTimeoutSeconds = 25,
  [switch]$Quick,
  [switch]$SkipTransparent,
  [switch]$SkipFirewallModes,
  [switch]$SkipDns,
  [switch]$KeepTemp
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tempDir = Join-Path $repoRoot '.tmp-xray-tests'
$sshBaseArgs = @('-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=NUL', '-o', 'LogLevel=ERROR', "root@$Router")
$apiBase = "http://${Router}:${PanelPort}/api"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$results = New-Object System.Collections.Generic.List[object]

function Invoke-Api {
  param(
    [string]$Path,
    [string]$Method = 'GET',
    [object]$Body = $null
  )
  $params = @{
    Uri = "$apiBase$Path"
    Method = $Method
    Headers = $script:Headers
  }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 100)
  }
  Invoke-RestMethod @params
}

function Invoke-Router {
  param([string]$Command)
  & ssh.exe @sshBaseArgs $Command
}

function Copy-ToRouter {
  param([string]$Path)
  & scp.exe -O -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o LogLevel=ERROR $Path "root@${Router}:/tmp/"
}

function Write-TestConfig {
  param(
    [object]$Config,
    [string]$Name,
    [string]$OutboundTag,
    [int]$Port
  )
  $testConfig = [ordered]@{
    log = @{
      loglevel = 'debug'
      access = "/tmp/ruopenray-$Name-access.log"
      error = "/tmp/ruopenray-$Name-error.log"
    }
    dns = $Config.dns
    inbounds = @(@{
      tag = "test-$Name-socks"
      listen = '0.0.0.0'
      port = $Port
      protocol = 'socks'
      settings = @{ udp = $true }
    })
    outbounds = $Config.outbounds
    routing = @{
      domainStrategy = 'AsIs'
      rules = @(@{
        type = 'field'
        inboundTag = @("test-$Name-socks")
        outboundTag = $OutboundTag
      })
    }
  }
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
  $file = Join-Path $tempDir "ruopenray-test-$Name.json"
  [System.IO.File]::WriteAllText($file, ($testConfig | ConvertTo-Json -Depth 100), $utf8NoBom)
  Copy-ToRouter $file | Out-Null
  return $file
}

function Start-RemoteXray {
  param([string]$Name)
  Invoke-Router "kill `$(cat /tmp/ruopenray-$Name.pid 2>/dev/null) 2>/dev/null || true; rm -f /tmp/ruopenray-$Name.out /tmp/ruopenray-$Name-access.log /tmp/ruopenray-$Name-error.log /tmp/ruopenray-$Name.pid" | Out-Null
  $remote = "sh -c 'echo `$`$ >/tmp/ruopenray-$Name.pid; export XRAY_LOCATION_ASSET=/usr/share/xray; export V2RAY_LOCATION_ASSET=/usr/share/xray; exec xray run -config /tmp/ruopenray-test-$Name.json >/tmp/ruopenray-$Name.out 2>&1'"
  $args = @('-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=NUL', '-o', 'LogLevel=ERROR', "root@$Router", $remote)
  $process = Start-Process -FilePath 'ssh.exe' -ArgumentList $args -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 2
  return $process
}

function Stop-RemoteXray {
  param([string]$Name, [object]$Process)
  Invoke-Router "kill `$(cat /tmp/ruopenray-$Name.pid 2>/dev/null) 2>/dev/null || true" | Out-Null
  Start-Sleep -Milliseconds 500
  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-CurlHead {
  param(
    [string[]]$CurlArgs,
    [int]$TimeoutSeconds = $CurlTimeoutSeconds
  )
  function ConvertTo-ProcessArgument {
    param([string]$Value)
    if ($Value -notmatch '[\s"]') { return $Value }
    '"' + ($Value -replace '\\', '\\' -replace '"', '\"') + '"'
  }
  $connectTimeout = [Math]::Min(12, [Math]::Max(3, $TimeoutSeconds - 3))
  $allArgs = @('-sS') + $CurlArgs + @('--connect-timeout', "$connectTimeout", '--max-time', "$TimeoutSeconds", '-w', "HTTP_CODE=%{http_code}`n")
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'curl.exe'
  $psi.Arguments = (($allArgs | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join ' ')
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $process = [System.Diagnostics.Process]::Start($psi)
  if (-not $process.WaitForExit(($TimeoutSeconds + 3) * 1000)) {
    try { $process.Kill($true) } catch {}
    return [pscustomobject]@{ exit = 124; http = '000'; status = ''; output = 'curl timed out' }
  }
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $output = (($stdout + "`n" + $stderr) -split "`r?`n") | Where-Object { $_ -ne '' }
  $exit = $process.ExitCode
  $http = (($output | Select-String -Pattern 'HTTP_CODE=' | Select-Object -Last 1).Line -replace 'HTTP_CODE=', '')
  $status = ($output | Select-String -Pattern '^HTTP/' | Select-Object -Last 1).Line
  [pscustomobject]@{ exit = $exit; http = $http; status = $status; output = ($output -join "`n") }
}

function Add-Result {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Mode,
    [string]$Detail
  )
  $results.Add([pscustomobject]@{
    ok = $Ok
    name = $Name
    mode = $Mode
    detail = $Detail
  })
}

function Clone-Json {
  param([object]$Value)
  $Value | ConvertTo-Json -Depth 100 | ConvertFrom-Json
}

function Apply-Config {
  param([object]$Config)
  $result = Invoke-Api -Path '/config/apply' -Method 'POST' -Body @{ config = $Config }
  if (-not $result.ok) {
    throw "config apply failed: $($result | ConvertTo-Json -Depth 20)"
  }
  Start-Sleep -Seconds 3
}

function Reset-XrayStats {
  Invoke-Router "xray api statsquery --server=127.0.0.1:10085 -timeout 3 -pattern outbound -reset >/dev/null 2>&1 || true" | Out-Null
}

function Get-RawOutboundStats {
  (Invoke-Router "xray api statsquery --server=127.0.0.1:10085 -timeout 3 -pattern outbound || true") -join "`n"
}

function Get-RawStatsForTag {
  param([string]$Tag)
  $safeTag = $Tag.Replace("'", "'\''")
  (Invoke-Router "xray api statsquery --server=127.0.0.1:10085 -timeout 3 -pattern outbound | grep -A2 '$safeTag' || true") -join "`n"
}

function Test-SocksOutbound {
  param(
    [object]$Config,
    [string]$Name,
    [string]$Tag,
    [int]$Port,
    [bool]$ExpectPass
  )
  Write-TestConfig -Config $Config -Name $Name -OutboundTag $Tag -Port $Port | Out-Null
  $testOutput = Invoke-Router "XRAY_LOCATION_ASSET=/usr/share/xray V2RAY_LOCATION_ASSET=/usr/share/xray xray run -test -config /tmp/ruopenray-test-$Name.json -format json 2>&1 | tail -4"
  if (($testOutput -join "`n") -notmatch 'Configuration OK') {
    Add-Result -Name $Name -Mode 'socks-config' -Ok $false -Detail ($testOutput -join ' ')
    return
  }
  $process = $null
  try {
    $process = Start-RemoteXray -Name $Name
    $curl = Invoke-CurlHead -CurlArgs @('-x', "socks5h://${Router}:$Port", '-I', $HttpsUrl)
    $ok = if ($ExpectPass) { $curl.exit -eq 0 -and $curl.http -match '^(200|204)$' } else { $curl.exit -ne 0 -or $curl.http -eq '000' }
    $access = (Invoke-Router "tail -6 /tmp/ruopenray-$Name-access.log 2>/dev/null || true; tail -10 /tmp/ruopenray-$Name-error.log 2>/dev/null | grep 'taking detour' || true") -join ' / '
    Add-Result -Name $Name -Mode 'socks-https' -Ok $ok -Detail "exit=$($curl.exit), http=$($curl.http), $access"
  } finally {
    Stop-RemoteXray -Name $Name -Process $process
  }
}

function Test-TransparentToTag {
  param(
    [object]$OriginalConfig,
    [string]$Tag
  )
  $cfg = Clone-Json $OriginalConfig
  $proxyTags = @($OriginalConfig.outbounds | Where-Object { @('freedom', 'blackhole', 'dns') -notcontains $_.protocol } | ForEach-Object { $_.tag })
  $changed = $false
  foreach ($rule in $cfg.routing.rules) {
    if ($rule.outboundTag -eq 'proxy' -or $rule.port -eq '0-65535' -or $proxyTags -contains $rule.outboundTag) {
      $rule.outboundTag = $Tag
      $changed = $true
    }
  }
  if (-not $changed) {
    $cfg.routing.rules += @{ type = 'field'; outboundTag = $Tag; port = '0-65535' }
  }
  Apply-Config $cfg
  Reset-XrayStats
  $http = Invoke-CurlHead -CurlArgs @('-4', '--interface', $LanClientIp, '-I', $HttpUrl)
  $https = Invoke-CurlHead -CurlArgs @('-4', '--interface', $LanClientIp, '-I', $HttpsUrl)
  Start-Sleep -Seconds 1
  $raw = Get-RawStatsForTag $Tag
  $values = [regex]::Matches($raw, '"value":\s*(\d+)') | ForEach-Object { [int64]$_.Groups[1].Value }
  $grew = ($values | Where-Object { $_ -gt 0 } | Measure-Object).Count -gt 0
  $ok = $http.exit -eq 0 -and $http.http -match '^(200|204)$' -and $https.exit -eq 0 -and $https.http -match '^(200|204)$' -and $grew
  Add-Result -Name "transparent:$Tag" -Mode 'tproxy' -Ok $ok -Detail "http=$($http.http), https=$($https.http), stats=$($values -join ',')"
}

function Apply-FirewallMode {
  param(
    [string]$RouterMode,
    [string]$BypassMode
  )
  $payload = @{
    routerMode = $RouterMode
    bypassMode = $BypassMode
    deviceMode = 'all'
    devices = @()
    portMode = 'custom'
    ports = @('80', '443')
    blockQuic = $true
    transparentPort = 52345
    lanInterface = 'br-lan'
  }
  Invoke-Api -Path '/firewall/apply' -Method 'POST' -Body $payload
}

function Set-TransparentInboundMode {
  param(
    [object]$OriginalConfig,
    [string]$RouterMode
  )
  $cfg = Clone-Json $OriginalConfig
  foreach ($inbound in $cfg.inbounds) {
    if ($inbound.tag -eq 'transparent_ipv4' -or $inbound.streamSettings.sockopt.tproxy) {
      if (-not $inbound.settings) {
        $inbound | Add-Member -MemberType NoteProperty -Name settings -Value @{} -Force
      }
      $inbound.settings.followRedirect = $true
      $inbound.settings.network = $(if ($RouterMode -eq 'redirect') { 'tcp' } else { 'tcp,udp' })
      if (-not $inbound.streamSettings) {
        $inbound | Add-Member -MemberType NoteProperty -Name streamSettings -Value @{} -Force
      }
      if (-not $inbound.streamSettings.sockopt) {
        $inbound.streamSettings | Add-Member -MemberType NoteProperty -Name sockopt -Value @{} -Force
      }
      $inbound.streamSettings.sockopt.tproxy = $RouterMode
    }
  }
  Apply-Config $cfg
}

function Test-FirewallMode {
  param(
    [string]$Name,
    [string]$RouterMode,
    [string]$BypassMode
  )
  Set-TransparentInboundMode -OriginalConfig $config -RouterMode $RouterMode
  $apply = Apply-FirewallMode -RouterMode $RouterMode -BypassMode $BypassMode
  if (-not $apply.ok) {
    Add-Result -Name $Name -Mode 'firewall-apply' -Ok $false -Detail ($apply | ConvertTo-Json -Depth 12)
    return
  }
  Reset-XrayStats
  $http = Invoke-CurlHead -CurlArgs @('-4', '--interface', $LanClientIp, '-I', $HttpUrl)
  $https = Invoke-CurlHead -CurlArgs @('-4', '--interface', $LanClientIp, '-I', $HttpsUrl)
  Start-Sleep -Seconds 1
  $raw = Get-RawOutboundStats
  $values = [regex]::Matches($raw, '"value":\s*(\d+)') | ForEach-Object { [int64]$_.Groups[1].Value }
  $grew = ($values | Where-Object { $_ -gt 0 } | Measure-Object).Count -gt 0
  $ok = $http.exit -eq 0 -and $http.http -match '^(200|204)$' -and $https.exit -eq 0 -and $https.http -match '^(200|204)$' -and $grew
  Add-Result -Name $Name -Mode 'firewall-mode' -Ok $ok -Detail "router=$RouterMode, bypass=$BypassMode, http=$($http.http), https=$($https.http), stats=$($values -join ',')"
}

function Test-DnsScenario {
  $check = Invoke-Api -Path '/dns/check' -Method 'POST' -Body @{ server = $DnsServer; host = 'example.com' }
  $addresses = @()
  if ($check.addresses) { $addresses += @($check.addresses) }
  if ($check.a) { $addresses += @($check.a) }
  $ok = $check.ok -and $addresses.Count -gt 0
  Add-Result -Name "dns-check:$DnsServer" -Mode 'dns' -Ok $ok -Detail "addresses=$($addresses -join ',')"

  $xrayPlan = Invoke-Api -Path '/dns/lan-upstream' -Method 'POST' -Body @{ mode = 'xray'; dryRun = $true; restart = $false }
  Add-Result -Name 'dnsmasq-plan:xray' -Mode 'dns-dry-run' -Ok ([bool]$xrayPlan.ok) -Detail (($xrayPlan.plan.display -join ' / '))

  $upstreamPlan = Invoke-Api -Path '/dns/lan-upstream' -Method 'POST' -Body @{ mode = 'upstream'; upstream = $DnsServer; dryRun = $true; restart = $false }
  Add-Result -Name 'dnsmasq-plan:upstream' -Mode 'dns-dry-run' -Ok ([bool]$upstreamPlan.ok) -Detail (($upstreamPlan.plan.display -join ' / '))
}

function Get-NftCounterBytes {
  param([string]$Text)
  $sum = [int64]0
  foreach ($match in [regex]::Matches($Text, 'counter\s+packets\s+\d+\s+bytes\s+(\d+)')) {
    $sum += [int64]$match.Groups[1].Value
  }
  $sum
}

function Test-CurrentRouterState {
  param([object]$Config)
  $test = Invoke-Api -Path '/config/test' -Method 'POST' -Body @{ config = $Config }
  Add-Result -Name 'xray-config' -Mode 'config' -Ok ([bool]$test.ok) -Detail (($test.stdout + $test.stderr) -replace "`r?`n", ' ')

  $firewall = Invoke-Api -Path '/firewall/status'
  $firewallOk = [bool]($firewall.active -and $firewall.persistent -and ($firewall.routerMode -ne 'tproxy' -or ($firewall.ipRule -and $firewall.ipRoute)))
  Add-Result -Name 'firewall-active' -Mode 'firewall' -Ok $firewallOk -Detail "mode=$($firewall.routerMode), active=$($firewall.active), persistent=$($firewall.persistent), ipRule=$($firewall.ipRule), ipRoute=$($firewall.ipRoute)"

  $lanDns = Invoke-Api -Path '/dns/lan-upstream'
  $lanDnsOk = [bool]($lanDns.ok -and ($lanDns.mode -ne 'xray' -or $lanDns.readiness.ready))
  Add-Result -Name 'lan-dns' -Mode 'dns' -Ok $lanDnsOk -Detail "mode=$($lanDns.mode), servers=$(@($lanDns.servers) -join ',')"

  $before = Invoke-Api -Path '/firewall/status'
  if ($before.routerMode -eq 'tproxy' -and $before.bypassMode -eq 'redirect') {
    Add-Result -Name 'transparent-counter' -Mode 'traffic-skip' -Ok $true -Detail 'skipped: REDIRECT intercepts only proxy nftset addresses, arbitrary URL may bypass by design'
  } else {
    $curl = Invoke-CurlHead -CurlArgs @('-4', '--interface', $LanClientIp, '-I', $HttpsUrl) -TimeoutSeconds $CurlTimeoutSeconds
    Start-Sleep -Seconds 1
    $after = Invoke-Api -Path '/firewall/status'
    $beforeBytes = Get-NftCounterBytes ([string]$before.nft.stdout)
    $afterBytes = Get-NftCounterBytes ([string]$after.nft.stdout)
    $counterGrew = $afterBytes -gt $beforeBytes
    $curlOk = $curl.exit -eq 0 -and $curl.http -match '^(200|204)$'
    Add-Result -Name 'transparent-counter' -Mode 'traffic' -Ok ($curlOk -and $counterGrew) -Detail "http=$($curl.http), exit=$($curl.exit), nftBytes=$beforeBytes->$afterBytes"
  }

  $stats = Invoke-Api -Path '/xray/stats'
  $proxy = $stats.groups.proxy
  $direct = $stats.groups.direct
  $statsOk = [bool]($stats.ok -and $stats.enabled -and @($stats.outbounds).Count -gt 0)
  Add-Result -Name 'xray-stats-api' -Mode 'traffic' -Ok $statsOk -Detail "outbounds=$(@($stats.outbounds).Count), proxy=$($proxy.downlink)↓/$($proxy.uplink)↑, direct=$($direct.downlink)↓/$($direct.uplink)↑"
}

try {
  $login = Invoke-RestMethod -Method Post -Uri "$apiBase/login" -ContentType 'application/json' -Body (@{ password = $PanelPassword } | ConvertTo-Json)
  $script:Headers = @{ Authorization = "Bearer $($login.token)" }
  $config = Invoke-Api -Path '/config'
  $proxyOutbounds = @($config.outbounds | Where-Object { @('freedom', 'blackhole', 'dns') -notcontains $_.protocol })
  if (-not $proxyOutbounds.Count) {
    throw 'No proxy outbounds in the current router config.'
  }

  if ($Quick) {
    Test-CurrentRouterState -Config $config
    if (-not $SkipDns) {
      Test-DnsScenario
    }
  } else {
    $caseIndex = 0
    foreach ($outbound in $proxyOutbounds) {
      Test-SocksOutbound -Config $config -Name "proxy-$caseIndex" -Tag $outbound.tag -Port ($BasePort + $caseIndex) -ExpectPass $true
      $caseIndex++
    }
    if ($config.outbounds | Where-Object { $_.tag -eq 'direct' }) {
      Test-SocksOutbound -Config $config -Name 'direct' -Tag 'direct' -Port ($BasePort + $caseIndex) -ExpectPass $true
      $caseIndex++
    }
    if ($config.outbounds | Where-Object { $_.tag -eq 'block' }) {
      Test-SocksOutbound -Config $config -Name 'block' -Tag 'block' -Port ($BasePort + $caseIndex) -ExpectPass $false
      $caseIndex++
    }

    if (-not $SkipTransparent) {
      foreach ($outbound in $proxyOutbounds) {
        Test-TransparentToTag -OriginalConfig $config -Tag $outbound.tag
      }
      Apply-Config $config
    }

    if (-not $SkipFirewallModes) {
      Test-FirewallMode -Name 'firewall:tproxy-off' -RouterMode 'tproxy' -BypassMode 'off'
      Test-FirewallMode -Name 'firewall:tproxy-bypass' -RouterMode 'tproxy' -BypassMode 'bypass'
      Test-FirewallMode -Name 'firewall:redirect-off' -RouterMode 'redirect' -BypassMode 'off'
      Apply-FirewallMode -RouterMode 'tproxy' -BypassMode 'off' | Out-Null
    }

    if (-not $SkipDns) {
      Test-DnsScenario
    }
  }
} finally {
  try {
    if ($config) { Apply-Config $config }
  } catch {
    Write-Warning "Could not restore original config: $_"
  }
  if (-not $KeepTemp) {
    try {
      Invoke-Router "rm -f /tmp/ruopenray-test-*.json /tmp/ruopenray-*-access.log /tmp/ruopenray-*-error.log /tmp/ruopenray-*.out /tmp/ruopenray-*.pid" | Out-Null
    } catch {}
  }
}

$results | Format-Table -AutoSize
$failed = @($results | Where-Object { -not $_.ok })
if ($failed.Count) {
  Write-Error "$($failed.Count) router regression checks failed."
  exit 1
}
Write-Host "All router regression checks passed." -ForegroundColor Green
