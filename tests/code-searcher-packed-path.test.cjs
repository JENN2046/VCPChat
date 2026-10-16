const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const plugin='VCPDistributedServer/Plugin/CodeSearcher';
const source=fs.readFileSync(plugin+'/CodeSearcher.js','utf8');
function candidates(dirname) {
    const context={__dirname:dirname,require,module:{exports:{}},process:{platform:'win32',arch:'x64'}};
    vm.runInNewContext(source.replace(/main\(\);\s*$/,'module.exports = getCandidates(getTarget());'),context);
    return [...context.module.exports];
}
test('packed native candidates are outside app.asar',()=>{
    const values=candidates('/fixture/resources/app.asar/'+plugin);
    assert.ok(values.every(p=>p.startsWith(path.join('/fixture/resources/app.asar.unpacked',plugin))));
    assert.equal(values[0],path.join('/fixture/resources/app.asar.unpacked',plugin,'CodeSearcher-x86_64-pc-windows-msvc.exe'));
});
test('source and already-unpacked native paths remain unchanged',()=>{
    for(const root of ['/fixture/source','/fixture/resources/app.asar.unpacked','/fixture/app.asar-other']) {
        assert.ok(candidates(root+'/'+plugin).every(p=>p.startsWith(path.join(root,plugin))));
    }
});
test('package includes exact bridge, manifest and unpacked Windows artifact',()=>{
    const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
    for(const file of ['CodeSearcher.js','plugin-manifest.json','CodeSearcher-x86_64-pc-windows-msvc.exe']) {
        assert.ok(pkg.build.files.includes(plugin+'/'+file));
    }
    assert.ok(pkg.build.asarUnpack.includes(plugin+'/CodeSearcher-x86_64-pc-windows-msvc.exe'));
    assert.ok(!pkg.build.files.includes(plugin+'/config.env'));
});

test('spawn uses physical working directory in packages and preserves source root',()=>{
    for(const root of ['/fixture/source','/fixture/resources/app.asar','/fixture/resources/app.asar.unpacked']) {
        let launch;
        const stream={pipe(){}};
        const fakeProcess={platform:'win32',arch:'x64',env:{},stdin:stream,stdout:stream,stderr:{write(){}},once(){}};
        const fakeRequire=name=>name==='child_process'?{spawn(executable,args,options){
            launch={executable,args,options};
            return {stdin:stream,stdout:stream,stderr:stream,on(){}};
        }}:name==='fs'?{constants:{F_OK:0},accessSync(){}}:require(name);
        vm.runInNewContext(source,{__dirname:root+'/'+plugin,require:fakeRequire,process:fakeProcess});
        const physical=root.endsWith('/app.asar')?root+'.unpacked':root;
        assert.equal(launch.options.cwd,path.resolve(physical,'VCPDistributedServer'));
        assert.ok(launch.executable.startsWith(path.join(physical,plugin)));
        assert.deepEqual(Object.keys(launch.options.env),[]);
    }
});
