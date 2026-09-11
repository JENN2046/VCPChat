$ErrorActionPreference = 'Stop'
$result = [ordered]@{ tpmQuery = 'UNPROVEN'; tpmPresent = $null; tpmReady = $null; tpmEnabled = $null; tpmActivated = $null }
try {
    $t = Get-Tpm
    $result.tpmQuery = 'OBSERVED'
    $result.tpmPresent = $t.TpmPresent
    $result.tpmReady = $t.TpmReady
    $result.tpmEnabled = $t.TpmEnabled
    $result.tpmActivated = $t.TpmActivated
} catch {
    $result.tpmQuery = 'UNAVAILABLE'
    $result.tpmQueryErrorType = $_.Exception.GetType().FullName
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Q2ProviderProbe {
    [DllImport("ncrypt.dll", CharSet = CharSet.Unicode)]
    public static extern int NCryptOpenStorageProvider(out IntPtr handle, string name, int flags);
    [DllImport("ncrypt.dll")]
    public static extern int NCryptFreeObject(IntPtr handle);
}
'@
$handle = [IntPtr]::Zero
try {
    $status = [Q2ProviderProbe]::NCryptOpenStorageProvider([ref]$handle, 'Microsoft Platform Crypto Provider', 0)
    $result.pcpOpenStatus = $status
    $result.pcpOpenSucceeded = ($status -eq 0)
} finally {
    if ($handle -ne [IntPtr]::Zero) { $null = [Q2ProviderProbe]::NCryptFreeObject($handle) }
}
$result.productionEligible = $false
$result.keysCreatedByDiscovery = 0
$result | ConvertTo-Json -Depth 4
