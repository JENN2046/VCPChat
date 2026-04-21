# VCPChat Config Template PR Body

## Title

`docs(vcpchat): sanitize config templates for portable defaults`

## Summary

This PR cleans up the shared example config files so they no longer encode developer-specific absolute paths.

It keeps the live runtime config files local and out of repo history.

## Included

- `VCPDistributedServer/Plugin/DeepMemo/config.env.example`
- `VCPDistributedServer/Plugin/FileOperator/.env.example`
- `docs/vcpchat_config_template_scope_freeze_draft_20260421.md`
- `docs/vcpchat_config_template_execution_checklist_20260421.md`
- `docs/vcpchat_config_template_sanitized_defaults_proposal_20260421.md`
- `docs/vcpchat_config_template_placeholder_rules_20260421.md`
- `docs/vcpchat_config_template_execution_summary_20260421.md`

## Excluded

- `VCPDistributedServer/Plugin/DeepMemo/config.env`
- `VCPDistributedServer/Plugin/FileOperator/.env`
- feature work
- plugin boundary work
- shell / IPC cleanup
- AI image experiment changes

## Result

The example files now use portable placeholders and checkout-agnostic defaults.

The local runtime env files remain unchanged and should stay local unless a separate config hygiene decision says otherwise.
