'use strict';
// Reuse the R3 complete application acceptance, with real Ubuntu storage and
// lifecycle controls in place of the local in-process center.
process.argv.push('--real-host=wp08');
require('./test-native-sync-r3.cjs');
