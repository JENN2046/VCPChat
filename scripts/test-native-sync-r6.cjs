'use strict';
process.argv.push('--real-host=wp08', '--toolbox-service', '--full-toolbox');
require('./test-native-sync-r3.cjs');
