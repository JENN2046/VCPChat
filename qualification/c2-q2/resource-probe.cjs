'use strict';
// Read-only platform discovery; no device initialization or security-policy mutation.
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const output = path.join(__dirname, 'evidence');
fs.mkdirSync(output, { recursive: true });
function run(file, args) {
  const r = cp.spawnSync(file, args, { encoding: 'utf8', timeout: 90000 });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim(), error: r.error?.code || null };
}
const result = { platform: process.platform, arch: process.arch, node: process.version,
  runnerEnvironment: process.env.RUNNER_ENVIRONMENT || 'unknown',
  productionEligible: false, humanInputProvenance: 'UNPROVEN', mutations: [] };
if (process.platform === 'win32') {
  result.platform = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'windows-resource.ps1')]);
  if (result.platform.status !== 0) throw new Error('WINDOWS_RESOURCE_PROBE_FAILED: ' + result.platform.stderr);
  result.windows = JSON.parse(result.platform.stdout);
} else if (process.platform === 'darwin') {
  result.model = run('/usr/sbin/sysctl', ['-n', 'hw.model']);
  result.version = run('/usr/bin/sw_vers', ['-productVersion']);
  result.enclave = run('/usr/bin/swift', ['-e', 'import CryptoKit; print(SecureEnclave.isAvailable ? "AVAILABLE" : "UNAVAILABLE")']);
  if (result.enclave.status !== 0) result.enclaveAvailability = 'UNPROVEN';
  else if (!['AVAILABLE', 'UNAVAILABLE'].includes(result.enclave.stdout)) throw new Error('UNEXPECTED_ENCLAVE_RESULT');
  else result.enclaveAvailability = result.enclave.stdout;
  result.enclaveCreation = run('/usr/bin/swift', [path.join(__dirname, 'enclave-probe.swift')]);
  if (result.enclaveCreation.status !== 0) throw new Error('SWIFT_ENCLAVE_DIAGNOSTIC_FAILED: ' + result.enclaveCreation.stderr);
  result.enclaveCreationObserved = JSON.parse(result.enclaveCreation.stdout);
} else throw new Error('TARGET_PLATFORM_REQUIRED');
fs.writeFileSync(path.join(output, 'RESOURCE_PROBE.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
