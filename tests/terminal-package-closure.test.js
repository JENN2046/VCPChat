
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {minimatch}=require('minimatch');const root=path.resolve(__dirname,'..');const pkg=require('../package.json');
// Exclusions are not positive admissions: minimatch(path, '!other') alone is true.
function packaged(relative, patterns = pkg.build.files) {
 return patterns.some(pattern => !pattern.startsWith('!') && minimatch(relative, pattern)) &&
  !patterns.some(pattern => pattern.startsWith('!') && minimatch(relative, pattern.slice(1)));
}
test('package admission requires a positive match and honors exclusions', () => {
 assert.equal(packaged('config.env', ['main.js', '!assets/private/**']), false);
 assert.equal(packaged('Plugin/config.env', ['Plugin/**', '!**/config.env']), false);
 assert.equal(packaged('Plugin/main.js', ['Plugin/**', '!**/config.env']), true);
});
// 执行器及其同目录模块里用 require('./x') 引到的文件，都得跟着打进包里
function localRequires(prefix,entries){
 const seen=new Set();const queue=[...entries];
 while(queue.length){const file=queue.shift();if(seen.has(file))continue;seen.add(file);
  const source=fs.readFileSync(path.join(root,prefix,file),'utf8');
  for(const [,,spec] of source.matchAll(/require\(\s*(['"])\.\/([^'"]+)\1\s*\)/g))queue.push(spec.endsWith('.js')?spec:spec+'.js');}
 return [...seen];
}
test('packaged terminal includes its executor, GUI, admin helper and native dependencies',()=>{
 const prefix='VCPDistributedServer/Plugin/PowerShellExecutor/';
 const modules=localRequires(prefix,['PowerShellExecutor.js','commandRunStore.js']);
 for(const file of ['commandRunStore.js','terminalOutputSanitizer.js','command-output-parser.js','nativeHelperPath.js'])assert.ok(modules.includes(file),file);
 const required=[...modules,'plugin-manifest.json','AdminConfirm.py',...fs.readdirSync(path.join(root,prefix,'gui'),{recursive:true}).map(file=>'gui/'+String(file).replaceAll('\\','/'))];
 for(const file of required){const relative=prefix+file;if(fs.statSync(path.join(root,relative)).isFile())assert.ok(packaged(relative),relative);}
 for(const dependency of ['node-pty','tmp','chokidar','xterm','xterm-addon-fit'])assert.ok(pkg.dependencies[dependency],dependency);
 assert.ok(pkg.build.asarUnpack.includes('node_modules/node-pty/**/*'));
 assert.ok(pkg.build.asarUnpack.some(pattern=>minimatch(prefix+'AdminConfirm.py',pattern)),'Python script must be physically unpacked for external execution');
 assert.equal(packaged(prefix+'config.env'),false,'local configuration stays outside the package');
});
test('the command run store loads without side effects so the main process can read runs without the executor',()=>{
 const {execFileSync}=require('node:child_process');
 // 单独起一个 Node：没有 Electron 也能加载，并且不会把执行器一起拉进来
 const script="const store=require(process.argv[1]);const loaded=Object.keys(require.cache).map(f=>f.replaceAll('\\\\','/')).filter(f=>!f.includes('/node_modules/'));process.stdout.write(JSON.stringify({exports:Object.keys(store),loaded}));";
 const out=JSON.parse(execFileSync(process.execPath,['-e',script,path.join(root,'VCPDistributedServer/Plugin/PowerShellExecutor/commandRunStore.js')],{encoding:'utf8'}));
 assert.deepEqual(out.exports.sort(),['COMMAND_RUN_RAW_LIMIT','appendCommandRunOutput','beginCommandRun','finishCommandRun','getCommandRun','listCommandRuns','subscribeCommandRuns']);
 assert.deepEqual(out.loaded.map(f=>path.basename(f)).sort(),['commandRunStore.js','terminalOutputSanitizer.js']);
});
test('packaged POSIX terminal includes its local module and GUI closure without runtime configuration',()=>{
 const prefix='VCPDistributedServer/Plugin/PTYShellExecutor/';
 const modules=localRequires(prefix,['PTYShellExecutor.js','commandRunStore.js']);
 assert.ok(modules.includes('PTYShellExecutor.impl.js'));
 assert.ok(modules.includes('AdminConfirm.js'));
 for(const file of [...modules,'plugin-manifest.json',...fs.readdirSync(path.join(root,prefix,'gui')).map(file=>'gui/'+file)]) {
  assert.ok(packaged(prefix+file),prefix+file);
 }
 for(const file of ['config.env','.env','reports/private.json'])assert.equal(packaged(prefix+file),false,file);
});
