import base64
import ast
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import tempfile
import unittest

MODULE=Path(__file__).resolve().parents[1]/'ci_projection_handoff.py'
spec=importlib.util.spec_from_file_location('ci_projection_handoff',MODULE)
handoff=importlib.util.module_from_spec(spec);spec.loader.exec_module(handoff)
ENV={'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':'JENN2046/VCPChat','GITHUB_SHA':'a'*40,'GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'2'}
def fixture():
    data=b'public fixture\n'; name='tests/fixture.txt'
    row={'path':name,'type':'blob','mode':'100644','size':len(data),'blob':hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest(),'sha256':handoff.sha(data)}
    context={'schema':'vcpchat-ci-source-context/v1','repository':handoff.REPOSITORY,'event':{'commit':ENV['GITHUB_SHA']},'projection':[row]}
    return {'schema':handoff.SCHEMA,'binding':handoff.binding(ENV),'context':context,'files':{name:base64.b64encode(data).decode()}}

class TransferTests(unittest.TestCase):
    def test_exact_roundtrip_and_fresh_placement(self):
        envelope=fixture()
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=root/'input'; (source/'tests').mkdir(parents=True)
            (source/'tests/fixture.txt').write_bytes(b'public fixture\n')
            context=root/'context.json'; context.write_text(json.dumps(envelope['context']))
            bundle=root/'bundle.json'
            digest=handoff.pack(source,context,handoff.sha(context.read_bytes()),handoff.binding(ENV),bundle)
            output,new_context,_=handoff.unpack(bundle,digest,handoff.binding(ENV),root)
            self.assertEqual((output/'tests/fixture.txt').read_bytes(),b'public fixture\n')
            self.assertEqual(json.loads(new_context.read_bytes()),envelope['context'])
            other,_,_=handoff.unpack(bundle,digest,handoff.binding(ENV),root)
            self.assertNotEqual(output,other)

    def test_tampered_bundle_rejected_before_placement(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); bundle=root/'bundle.json'; bundle.write_text(json.dumps(fixture()))
            before=set(root.iterdir())
            with self.assertRaises(ValueError): handoff.unpack(bundle,'0'*64,handoff.binding(ENV),root)
            self.assertEqual(set(root.iterdir()),before)

    def test_cross_run_attempt_commit_repository_rejected(self):
        for key in ['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA','GITHUB_REPOSITORY']:
            envelope=fixture(); envelope['binding'][key]='changed'
            with self.subTest(key=key),self.assertRaises(ValueError):handoff.validate(envelope,handoff.binding(ENV))

    def test_context_commit_rejected(self):
        envelope=fixture();envelope['context']['event']['commit']='b'*40
        with self.assertRaises(ValueError):handoff.validate(envelope,handoff.binding(ENV))

    def test_missing_extra_and_tampered_files(self):
        for kind in ['missing','extra','changed','oid']:
            envelope=fixture()
            if kind=='missing':envelope['files'].clear()
            if kind=='extra':envelope['files']['extra.txt']=''
            if kind=='changed':envelope['files']['tests/fixture.txt']='aW5qZWN0aW9u'
            if kind=='oid':envelope['context']['projection'][0]['blob']='0'*40
            with self.subTest(kind=kind),self.assertRaises(ValueError):handoff.validate(envelope,handoff.binding(ENV))

    def test_held_traversal_and_windows_alias_paths_rejected(self):
        for name in ['../escape','/absolute','C:/x','a\\b','a/b:stream','NUL.txt','a./b','a /b','.git/config','config.env','.env','state-private/x','secrets/x','a.db']:
            with self.subTest(name=name),self.assertRaises(ValueError):handoff.safe_path(name)
        self.assertEqual(handoff.safe_path('config.env.example'),'config.env.example')

    def test_case_and_parent_collisions_rejected(self):
        for name in ['tests/FIXTURE.txt','tests/fixture.txt/child']:
            envelope=fixture(); row=copy.deepcopy(envelope['context']['projection'][0]);row['path']=name
            envelope['context']['projection'].append(row);envelope['files'][name]=envelope['files']['tests/fixture.txt']
            with self.assertRaises(ValueError):handoff.validate(envelope,handoff.binding(ENV))

    def test_duplicate_json_rejected(self):
        with self.assertRaises(ValueError):handoff.strict_json('{"files":{},"files":{}}')

    def test_non_ci_rejected(self):
        with self.assertRaises(ValueError):handoff.binding({**ENV,'GITHUB_ACTIONS':'false'})

    @unittest.skipIf(os.name=='nt','symlink setup needs separate Windows privilege')
    def test_source_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'source').mkdir();(root/'target').mkdir()
            (root/'target/fixture.txt').write_text('public fixture\n')
            (root/'source/tests').symlink_to(root/'target',target_is_directory=True)
            context=root/'context.json';context.write_text(json.dumps(fixture()['context']))
            with self.assertRaises(ValueError):handoff.pack(root/'source',context,handoff.sha(context.read_bytes()),handoff.binding(ENV),root/'bundle.json')
            self.assertFalse((root/'bundle.json').exists())

    def test_workflows_keep_verified_entry_and_failure_propagation(self):
        root=MODULE.parents[2]
        for name in ['side_pane_e2e.yml','side_pane_windows.yml']:
            text=(root/'.github/workflows'/name).read_text(encoding='utf-8')
            self.assertNotIn('actions/checkout',text)
            self.assertNotIn('continue-on-error',text)
            self.assertNotIn('contents: write',text)
            self.assertNotIn('    defaults:',text)
            # setup-node's cache hashFiles cannot resolve private temp projections
            # outside GITHUB_WORKSPACE. Installation remains locked and blocking.
            self.assertNotIn('cache: npm',text)
            self.assertIn('no checkout or fallback',text)
            self.assertEqual(len(re.findall(r'^\s+PINS = ',text,re.M)),1)
            # Compile every inline control script, including literal backslashes.
            for match in re.finditer(r"          python(?:3)? -I -B - <<'PY'\n(.*?)          PY",text,re.S):
                script='\n'.join(line[10:] for line in match[1].splitlines())
                ast.parse(script)
        windows=(root/'.github/workflows/side_pane_windows.yml').read_text(encoding='utf-8')
        self.assertIn("HELPER_SHA256 = '"+handoff.sha(MODULE.read_bytes())+"'",windows)
        self.assertIn('needs: source',windows)
        self.assertIn('name: side-pane-windows-source-${{ github.run_attempt }}',windows)

if __name__=='__main__':unittest.main()
