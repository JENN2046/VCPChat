"""Independent synthetic history/CDS/central-hash checks after R9 shutdown."""
from pathlib import Path
import json, socket, sqlite3, sys

root = Path(sys.argv[1]).resolve()
assert root.parent == Path('P:/VCPKF/vcp/artifacts/native-sync-r9').resolve()
receipt = json.loads((root/'R9_APP_RECEIPT.json').read_text())
assert receipt.get('message') == 'R9_ANDROID_HOME_SCREEN_INSTALL_UNVERIFIED' or receipt['result']=='R9_ANDROID_REAL_MODEL_PASS'
remote = json.loads((root/'REMOTE_STORAGE_PROOF.json').read_text())
assert remote['integrity']=='ok' and not any(x['sameExperimentStillRunning'] for x in remote['hosts'])
center = {(x['ownerType'],x['ownerId'],x['topicId'],x['msgId']):x['hash'] for x in remote['entries'] if not x['deleted']}
proof = {'result':'PASS','readMode':'Python SQLite mode=ro; no Node CDS database access','central':remote['metrics'],'clients':[],'cdsExits':[],'closedPorts':[]}
ports=set()
for launch in receipt['launches']:
    assert launch['exitCode']==0
    service=launch['coexistence'];ports.update([service['httpPort'],service['wsPort']])
    closed=json.loads((Path(launch['appData'])/f"R8_CDS_EXIT_{service['cdsPid']}.json").read_text())
    assert closed['code']==0 and closed['signal'] is None
    proof['cdsExits'].append(closed)
for name in ['Windows-A','Windows-B','Sync-Off']:
    folder=root/name
    db=sqlite3.connect((folder/'databases/chat_data.sqlite3').as_uri()+'?mode=ro',uri=True)
    assert db.execute('pragma integrity_check').fetchone()[0]=='ok'
    rows={tuple(x[:4]):x[4:] for x in db.execute('select owner_type,owner_id,topic_id,msg_id,message_hash,content_raw from messages where deleted_at is null')}
    physical={}
    for kind,owner,topic in [('agent','R3Agent','r3-topic'),('agent','R3Agent','r3-other'),('group','R3Group','r3-group-topic')]:
        for message in json.loads((folder/'UserData'/owner/'topics'/topic/'history.json').read_text(encoding='utf-8')):
            physical[(kind,owner,topic,message['id'])]=message
    assert set(rows)==set(physical)
    assert all(rows[key][1]==value['content'] for key,value in physical.items())
    revisions=list(db.execute('select content_revision,indexed_revision from topics where deleted_at is null'))
    indexed=all(a==b for a,b in revisions)
    entry={'client':name,'messages':len(rows),'integrity':'ok','physicalHistoryAndCdsIdsAndTextEqual':True,'indexedRevisionsEqual':indexed,'revisions':revisions}
    if name!='Sync-Off':
        assert indexed
        assert {key:value[0] for key,value in rows.items()}==center
        state=json.loads((folder/'.native-sync/state.json').read_text())
        assert state['cursor']==remote['metrics']['headSeq'] and not state['outbox'] and not state['pending']
        entry.update({'centralHashesEqual':True,'cursor':state['cursor'],'outbox':0,'pending':False})
    else:
        assert not (folder/'.native-sync/state.json').exists()
        if not indexed:entry['qualification']='This save-only control stopped without waiting for asynchronous indexing; index convergence is NOT verified in this run. R8 standalone index control is separate evidence.'
    proof['clients'].append(entry);db.close()
for port in sorted(ports):
    with socket.socket() as s:
        s.settimeout(.2);assert s.connect_ex(('127.0.0.1',port))!=0
    proof['closedPorts'].append(port)
(root/'INDEPENDENT_STORAGE_INDEX_SHUTDOWN_PROOF.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'result':'PASS','central':proof['central'],'clientMessageCounts':[x['messages'] for x in proof['clients']],'cdsExitZero':len(proof['cdsExits'])}))
