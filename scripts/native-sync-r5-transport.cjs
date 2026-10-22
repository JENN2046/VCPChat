'use strict';
const path = require('node:path');
const { RealHostTransport } = require('./native-sync-r4-transport.cjs');
const files = [
    'Plugin.js', 'FileFetcherServer.js', 'server.js', 'native-sync-service-host.cjs',
    'modules/apiBearerAuth.js', 'modules/captchaDecoder.js', 'modules/foldProtocol.js',
    'modules/jevClient.js', 'modules/jevThirdPartyRegistry.js', 'modules/pluginBridgeRegistry.js',
    'modules/toolApprovalManager.js', 'modules/toolCallRecordInternalFilter.js', 'modules/toolCallRecordStore.js',
    'modules/toolLifecycleVcpInfo.js', 'modules/toolResultPrivacyGuard.js', 'modules/vcpLoop/toolMarkerFuzzyMatcher.js',
    'Plugin/NativeSync/plugin-manifest.json', 'Plugin/NativeSync/native-sync.js', 'Plugin/NativeSync/SOURCE_PROVENANCE.json',
    'Plugin/NativeSync/sync/centralStore.js', 'Plugin/NativeSync/sync/protocol.js', 'Plugin/NativeSync/sync/httpService.js',
    'Plugin/NativeSync/sync/canonical/canonical.js', 'Plugin/NativeSync/sync/canonical/hash.js',
];
module.exports.prepare = ({ localRoot }) => RealHostTransport.prepare({
    sourceRoot: path.resolve(__dirname, '../../vcptoolbox-native-sync-r5'), localRoot,
    profile: { kind: 'native-sync-r5', files, entry: 'native-sync-service-host.cjs' },
});
