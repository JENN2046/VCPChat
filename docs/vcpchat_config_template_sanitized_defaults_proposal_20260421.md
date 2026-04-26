# VCPChat Config Template Sanitized Defaults Proposal

> Date: 2026-04-21
> Scope: `VCPChat config template batch`
> Status: Proposal

## Decision

Yes, this batch should carry a sanitized-defaults proposal.

Reason: both `*.example` files currently contain checkout-specific or developer-specific values, so they are not yet clean enough to serve as safe shared defaults without review.

## Diff Inventory

### `VCPDistributedServer/Plugin/DeepMemo/config.env.example`

Current template keys:

- `VchatDataURL=../../AppData`
- `MaxMemoTokens=60000`
- `RerankSearch=True`
- `RerankUrl=http://your-rerank-api-endpoint/`
- `RerankApi=sk-your-api-key-here`
- `RerankModel=Qwen/Qwen3-Reranker-8B`
- `RerankMaxTokensPerBatch=30000`
- `RerankTopN=5`
- `QueryPreset=`

Local live file:

- `VchatDataURL=A:\VCP\VCPChat`
- `MaxMemoTokens=60000`

Findings:

- The live file is a local runtime override, not a shared default.
- The example file includes a rerank section with placeholder API values that should be reviewed before reuse.
- The example file is already closer to a template than the live file, but it still needs explicit sanitization rules for shared defaults.

### `VCPDistributedServer/Plugin/FileOperator/.env.example`

Current template keys:

- `ALLOWED_DIRECTORIES=/Users/zhaoyuanhao/Documents,/Users/zhaoyuanhao/Desktop,/Users/zhaoyuanhao/Downloads`
- `DEFAULT_DOWNLOAD_DIR=/Users/zhaoyuanhao/Downloads`
- `MAX_FILE_SIZE=10485760`
- `MAX_DIRECTORY_ITEMS=1000`
- `MAX_SEARCH_RESULTS=100`
- `DEBUG_MODE=true`
- `WEBSOCKET_HOST=localhost`
- `WEBSOCKET_PORT=6573`
- `ENABLE_RECURSIVE_OPERATIONS=true`
- `ENABLE_HIDDEN_FILES=false`
- `CREATE_BACKUPS=false`
- `BACKUP_DIRECTORY=/Users/zhaoyuanhao/Documents/VCPToolBox/Plugin/FileOperator/backups`

Local live file:

- `ALLOWED_DIRECTORIES=A:/VCP/VCPToolBox/dailynote,A:/VCP/VCPToolBox/dailynote,A:/VCP/VCPToolBox,A:/VCP,A:/VCP/VCPChat/AppData/Canvas,A:/VCP/VCPChat`
- `DEFAULT_DOWNLOAD_DIR=A:\VCP\Downloads`
- `MAX_FILE_SIZE=10485760`
- `MAX_DIRECTORY_ITEMS=1000`
- `MAX_SEARCH_RESULTS=100`
- `DEBUG_MODE=true`
- `WEBSOCKET_HOST=localhost`
- `WEBSOCKET_PORT=6573`
- `ENABLE_RECURSIVE_OPERATIONS=true`
- `ENABLE_HIDDEN_FILES=false`
- `CREATE_BACKUPS=false`
- `BACKUP_DIRECTORY=A:\VCP\备份`

Findings:

- The example file currently contains a developer-specific user path and a backup path.
- Those values should not be treated as portable defaults.
- This file definitely needs a sanitized-defaults pass before it can be considered a clean example.

## Recommendation

Proceed with a sanitized-defaults proposal for both example files.

The proposal should:

- keep the live runtime files local
- remove developer-specific absolute paths from the example files
- replace any hardcoded user directories with neutral placeholders or repo-relative defaults
- keep optional features explicit, especially rerank and backup-related settings
- avoid introducing new product behavior just to satisfy the examples

## Suggested Sanitization Rules

### DeepMemo

- keep `VchatDataURL` relative or placeholder-based
- keep `MaxMemoTokens` as a neutral numeric default
- keep rerank fields as optional placeholders rather than real endpoints or keys
- do not encode local checkout paths in the example file

### FileOperator

- remove `/Users/zhaoyuanhao/...` from the example file
- use a neutral placeholder directory set or leave the allowlist empty if the plugin supports that safely
- keep `DEBUG_MODE` and other behavior flags explicit
- use a repo-relative or placeholder backup path if a backup default must be shown

## Closeout Condition

This proposal is complete when the example files are rewritten to contain only sanitized, shareable defaults and the live runtime files remain untracked/local.
