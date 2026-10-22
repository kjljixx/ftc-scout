param(
  [int]$IntervalSeconds = 3,
  [string]$ProcessName = "node",
  [int]$HeartbeatMinutes = 10
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class EcoQos {
  [StructLayout(LayoutKind.Sequential)]
  public struct PowerThrottling { public uint Version; public uint ControlMask; public uint StateMask; }
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool SetProcessInformation(IntPtr process, int infoClass, ref PowerThrottling info, int size);
  public static int OptOut(IntPtr process) {
    var info = new PowerThrottling { Version = 1, ControlMask = 1, StateMask = 0 };
    return SetProcessInformation(process, 4, ref info, Marshal.SizeOf(typeof(PowerThrottling))) ? 0 : Marshal.GetLastWin32Error();
  }
}
"@

function Write-Log($message) {
  Write-Output ("{0} [efficiency-optout] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message)
}

Write-Log "started: process=$ProcessName interval=${IntervalSeconds}s heartbeat=${HeartbeatMinutes}min"

$handled = @{}
$optedOut = 0
$failed = 0
$nextHeartbeat = (Get-Date).AddMinutes($HeartbeatMinutes)

while ($true) {
  $live = @{}
  foreach ($proc in Get-Process -Name $ProcessName -ErrorAction SilentlyContinue) {
    $key = "$($proc.Id)@$($proc.StartTime.Ticks)"
    $live[$key] = $true
    if ($handled.ContainsKey($key)) { continue }

    $error_code = [EcoQos]::OptOut($proc.Handle)
    $handled[$key] = $true
    if ($error_code -eq 0) {
      $optedOut++
      Write-Log "opted out pid=$($proc.Id) started=$($proc.StartTime.ToString('HH:mm:ss'))"
    } else {
      $failed++
      Write-Log "FAILED pid=$($proc.Id) win32_error=$error_code"
    }
  }

  foreach ($key in @($handled.Keys)) {
    if (-not $live.ContainsKey($key)) { $handled.Remove($key) }
  }

  if ((Get-Date) -ge $nextHeartbeat) {
    Write-Log "heartbeat: tracking=$($handled.Count) optedOutTotal=$optedOut failedTotal=$failed"
    $nextHeartbeat = (Get-Date).AddMinutes($HeartbeatMinutes)
  }

  Start-Sleep -Seconds $IntervalSeconds
}
