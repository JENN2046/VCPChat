'use strict';
const {invoke}=require('../core/define');
module.exports={handlers:['modules/ipc/nativeConversationHandlers.js'],roles:['chat'],api:{prepareNativeConversation:invoke('native-conversation:prepare','payload'),executeNativeConversation:invoke('native-conversation:execute','payload'),proposeNativeConversation:invoke('native-conversation:propose','payload'),presentNativeConversation:invoke('native-conversation:presented','payload'),invalidateNativeConversation:invoke('native-conversation:invalidate','payload')}};
