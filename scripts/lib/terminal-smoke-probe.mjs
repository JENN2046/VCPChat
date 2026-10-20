// A complete marker appears only in command output, never in the typed input.
export function terminalSmokeProbe(platform, marker) {
    if (!/^SMOKE_TERM_\d+$/.test(marker)) throw new TypeError('synthetic terminal marker required');
    const suffix = marker.slice('SMOKE_TERM_'.length);
    return platform === 'win32'
        ? `Write-Output ('SMOKE_TERM_' + '${suffix}')`
        : `printf '%s%s\\n' 'SMOKE_TERM_' '${suffix}'`;
}
