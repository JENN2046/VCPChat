"""Bounded read-only checks of an owned R9 experiment, never production data."""
from pathlib import Path
import json, re, sqlite3, sys

root = Path(sys.argv[1])
assert root.parent == Path('/home/admin/VCPKF/vcp/artifacts/native-sync-r7')
assert re.fullmatch(r'run-\d+', root.name)
db = sqlite3.connect((root / 'data/native-sync/central.sqlite').as_uri() + '?mode=ro', uri=True)
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
entries = [dict(zip(['ownerType','ownerId','topicId','msgId','hash','deleted','seq'], row)) for row in db.execute('SELECT owner_type,owner_id,topic_id,msg_id,hash,deleted,last_seq FROM messages ORDER BY last_seq')]
jobs = [dict(zip(['id','state','attempts','replyId'], row)) for row in db.execute('SELECT id,state,attempts,reply_message_id FROM mobile_executions ORDER BY created_at')]
for job in jobs:
    matches = [entry for entry in entries if entry['msgId'] == 'reply_' + job['id']]
    assert len(matches) == (1 if job['state'] == 'completed' else 0)
assert not db.execute('SELECT count(*) FROM mobile_executions WHERE pending_operation IS NOT NULL').fetchone()[0]
metrics = {'headSeq':db.execute('SELECT coalesce(max(seq),0) FROM journal').fetchone()[0], 'journalRows':db.execute('SELECT count(*) FROM journal').fetchone()[0], 'liveMessages':sum(not row['deleted'] for row in entries), 'appliedOps':db.execute('SELECT count(*) FROM applied_ops').fetchone()[0]}
ledger = json.loads((root / 'PROVIDER_TRANSPORT_RECORDS.json').read_text())
assert ledger['model'] == 'doubao-seed-2.0-mini'
hosts = []
for file in root.glob('host-start-*.json'):
    pid = json.loads(file.read_text())['pid']
    cwd = Path('/proc') / str(pid) / 'cwd'
    item={'pid':pid, 'sameExperimentStillRunning':cwd.exists() and cwd.resolve()==root/'source'}
    exit_file=root/f'host-exit-{pid}.json'
    if exit_file.exists():
        exited=json.loads(exit_file.read_text());item.update({key:exited[key] for key in ['exitCode','bootReady','lifecycle','pluginReadyAfterShutdown']})
        assert item['exitCode']==0 and not item['pluginReadyAfterShutdown']
        assert item['lifecycle']['initialized']==item['lifecycle']['shutdowns']
    else:assert item['sameExperimentStillRunning'], 'Missing shutdown receipt for an owned host'
    hosts.append(item)
connectors=[]
for value in sys.argv[2].split(',') if len(sys.argv)>2 else []:
    assert value.isdigit();file=Path('/proc')/value/'cmdline'
    owned=file.exists() and str(root).encode() in file.read_bytes()
    assert not owned
    connectors.append({'pid':int(value),'ownedConnectorStillRunning':False})
proof = {'result':'PASS','readMode':'Python SQLite mode=ro; no credential/config/log reads','root':str(root),'integrity':'ok','metrics':metrics,'entries':entries,'executions':jobs,'provider':ledger,'hosts':hosts,'connectors':connectors}
(root / 'R9_INDEPENDENT_SQLITE_PROOF.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'result':'PASS','metrics':metrics,'jobs':len(jobs),'providerCalls':len(ledger['calls']),'runningOwnedHosts':sum(x['sameExperimentStillRunning'] for x in hosts)}))
