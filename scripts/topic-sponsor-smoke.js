const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const sourcePlugin = path.join(repoRoot, 'VCPDistributedServer', 'Plugin', 'TopicSponsor', 'topicsponsor.js');
const sourceRoots = path.join(repoRoot, 'modules', 'utils', 'vcpPathRoots.js');
const scratchRoot = path.join(repoRoot, 'AppData', 'topic-sponsor-smoke');
const agentId = 'agent-topic-sponsor-smoke';
const agentName = 'SmokeMaid';
const topicName = 'TopicSponsor smoke topic';
const initialMessage = 'TopicSponsor isolated write-path smoke message.';

async function main() {
  const fakeWorkspace = await createFakeWorkspace();
  const pluginEntry = path.join(fakeWorkspace, 'VCPDistributedServer', 'Plugin', 'TopicSponsor', 'topicsponsor.js');
  const appData = path.join(fakeWorkspace, 'AppData');
  const agentDir = path.join(appData, 'Agents', agentId);

  await writeFixture(fakeWorkspace, agentDir);

  const created = await runTopicSponsor(pluginEntry, {
    command: 'CreateTopic',
    maid: agentName,
    topic_name: topicName,
    initial_message: initialMessage,
  });

  assertEqual(created.status, 'success', 'CreateTopic status');
  const topicId = created.result && created.result.topic_id;
  assert(topicId && topicId.startsWith('topic_'), 'CreateTopic returned a topic id');

  const historyPath = path.join(appData, 'UserData', agentId, 'topics', topicId, 'history.json');
  const history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
  assertEqual(history.length, 1, 'history message count');
  assertEqual(history[0].content, initialMessage, 'history initial message');
  assertEqual(history[0]._metadata.topicCreator, agentName, 'history topicCreator metadata');
  assertEqual(history[0]._metadata.creatorAgentId, agentId, 'history creatorAgentId metadata');

  const configPath = path.join(agentDir, 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const topic = (config.topics || [])[0];
  assert(topic, 'agent config topic entry was created');
  assertEqual(config.current_topic_id, topicId, 'agent current_topic_id');
  assertEqual(topic.id, topicId, 'agent topic id');
  assertEqual(topic.locked, false, 'agent topic locked flag');
  assertEqual(topic.unread, true, 'agent topic unread flag');
  assertEqual(topic.creatorSource, 'plugin:TopicCreator', 'agent topic creatorSource');

  const read = await runTopicSponsor(pluginEntry, {
    command: 'ReadTopicContent',
    maid: agentName,
    topic_id: topicId,
  });
  assertEqual(read.status, 'success', 'ReadTopicContent status');
  assertEqual(read.result.message_count, 1, 'ReadTopicContent message_count');
  assertEqual(read.result.messages[0].content, initialMessage, 'ReadTopicContent initial message');

  const ownership = await runTopicSponsor(pluginEntry, {
    command: 'CheckTopicOwnership',
    maid: agentName,
    topic_id: topicId,
    caller_name: agentName,
  });
  assertEqual(ownership.status, 'success', 'CheckTopicOwnership status');
  assertEqual(ownership.result.is_owner, true, 'CheckTopicOwnership owner result');

  console.log(JSON.stringify({
    status: 'success',
    workspace: fakeWorkspace,
    topic_id: topicId,
    checks: [
      'CreateTopic',
      'history.json',
      'config.json',
      'ReadTopicContent',
      'CheckTopicOwnership',
    ],
  }, null, 2));
}

async function createFakeWorkspace() {
  await fs.mkdir(scratchRoot, { recursive: true });
  const fakeWorkspace = await fs.mkdtemp(path.join(scratchRoot, 'workspace-'));

  const fakePluginDir = path.join(fakeWorkspace, 'VCPDistributedServer', 'Plugin', 'TopicSponsor');
  const fakeUtilsDir = path.join(fakeWorkspace, 'modules', 'utils');
  await fs.mkdir(fakePluginDir, { recursive: true });
  await fs.mkdir(fakeUtilsDir, { recursive: true });
  await fs.copyFile(sourcePlugin, path.join(fakePluginDir, 'topicsponsor.js'));
  await fs.copyFile(sourceRoots, path.join(fakeUtilsDir, 'vcpPathRoots.js'));

  return fakeWorkspace;
}

async function writeFixture(fakeWorkspace, agentDir) {
  await fs.mkdir(agentDir, { recursive: true });
  await fs.mkdir(path.join(fakeWorkspace, 'AppData', 'UserData', agentId, 'topics'), { recursive: true });
  await fs.writeFile(path.join(agentDir, 'config.json'), JSON.stringify({
    name: agentName,
    avatarColor: 'rgb(96,106,116)',
    topics: [],
    current_topic_id: null,
  }, null, 2), 'utf8');
}

function runTopicSponsor(pluginEntry, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pluginEntry], {
      cwd: path.dirname(pluginEntry),
      env: {
        ...process.env,
        NODE_PATH: path.join(repoRoot, 'node_modules'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`TopicSponsor exited with code ${code}: ${stderr || stdout}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`TopicSponsor returned invalid JSON: ${stdout}\n${error.message}`));
      }
    });

    child.stdin.end(JSON.stringify(input));
  });
}

function assert(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'error', error: error.message }, null, 2));
  process.exit(1);
});
