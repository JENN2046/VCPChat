'use strict';
require('node:child_process').execFileSync(process.execPath,[require('node:path').resolve(__dirname,'../../vcptoolbox-mobile-pwa-r7/scripts/build-mobile-pwa.cjs')],{windowsHide:true,stdio:'inherit'});
process.argv.push('--real-host=wp08','--toolbox-service','--full-toolbox','--mobile-pwa');
require('./test-native-sync-r3.cjs');
