# VCPChat Directory Migration Fourth-Pass Reference Surface

> Date: 2026-04-21  
> Scope: `VCPChat directory migration`

## Frozen Reference Mappings

### `Promptmodules`

- `main.html`
  - `<link rel="stylesheet" href="Promptmodules/prompt-modules.css">`
  - `<script src="Promptmodules/original-prompt-module.js"></script>`
  - `<script src="Promptmodules/modular-prompt-module.js"></script>`
  - `<script src="Promptmodules/preset-prompt-module.js"></script>`
  - `<script src="Promptmodules/prompt-manager.js"></script>`

### `Groupmodules`

- `main.js`
  - `require('./Groupmodules/groupchat')`
- `modules/ipc/groupChatHandlers.js`
  - `require('../../Groupmodules/groupchat')`
- `main.html`
  - `<script src="Groupmodules/groupSettingsMarkup.js"></script>`
  - `<script src="Groupmodules/grouprenderer.js"></script>`

### `Musicmodules`

- `modules/ipc/musicHandlers.js`
  - `musicWindow.loadFile(path.join(__dirname, '..', '..', 'Musicmodules', 'music.html'))`

### `Voicechatmodules`

- `main.html`
  - `placeholder="默认: Voicechatmodules/recognizer.html"`
- `main.js`
  - `voiceChatWindow.loadFile(path.join(__dirname, 'Voicechatmodules/voicechat.html'))`
  - `recognizerPagePath: settings?.speechRecognizerPagePath || 'Voicechatmodules/recognizer.html'`
- `renderer.js`
  - `speechRecognizerPagePath: 'Voicechatmodules/recognizer.html'`
  - `safeSet('speechRecognizerPagePath', globalSettings.speechRecognizerPagePath || 'Voicechatmodules/recognizer.html')`
- `modules/speechRecognizer.js`
  - `path.join(__dirname, '..', 'Voicechatmodules', 'recognizer.html')`
- `modules/utils/appSettingsManager.js`
  - default `speechRecognizerPagePath`
- `modules/renderer/domBuilder.js`
  - `.includes('/Voicechatmodules/')`
