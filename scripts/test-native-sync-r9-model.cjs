'use strict';
if(!process.argv.some(x=>x.startsWith('--r9-resume=')))require('node:child_process').execFileSync(process.execPath,[require('node:path').resolve(__dirname,'../../vcptoolbox-android-r9/scripts/build-mobile-pwa.cjs')],{windowsHide:true,stdio:'inherit'});
process.argv.push('--r9-model','--real-host=wp08','--toolbox-service','--full-toolbox','--coexist-services');
require('./test-native-sync-r3.cjs');
