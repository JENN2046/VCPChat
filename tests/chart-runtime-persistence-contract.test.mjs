import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  preload: new URL('../preloads/chart.js', import.meta.url),
  handlers: new URL('../modules/ipc/chartHandlers.js', import.meta.url),
  runtime: new URL('../Chartmodules/chart-runtime.js', import.meta.url),
};

const preload = await readFile(files.preload, 'utf8');
const handlers = await readFile(files.handlers, 'utf8');
const runtime = await readFile(files.runtime, 'utf8');

assert.match(preload, /replaceData:\s*request\s*=>\s*ipcRenderer\.invoke\('chart:replace-data'/);
assert.match(preload, /syncShootingPlanner:\s*request\s*=>\s*ipcRenderer\.invoke\('chart:shooting-planner-sync'/);
assert.match(handlers, /chartId !== selectedChartId/);
assert.match(handlers, /CHART_WRITE_SCOPE_FORBIDDEN/);
assert.match(handlers, /expectedDataRevision:\s*request\.expectedDataRevision/);
assert.match(handlers, /chartId !== 'jenn-shooting-planner' \|\| chartId !== selectedChartId/);
assert.match(handlers, /SHOOTING_SYNC_INITIAL_PULL_REQUIRED/);
assert.match(runtime, /const persistence = Object\.freeze/);
assert.match(runtime, /expectedDataRevision:\s*runtime\.snapshot\.manifest\.dataRevision/);
assert.match(runtime, /runtime\.snapshot\.manifest\.dataRevision = result\.dataRevision/);
assert.match(runtime, /const cloudSync = Object\.freeze/);

console.log('PASS chart persistence bridge remains self-scoped and revision-checked');
