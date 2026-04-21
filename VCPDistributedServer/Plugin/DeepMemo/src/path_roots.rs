use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct PathRoots {
    pub workspace_root: PathBuf,
    pub server_root: PathBuf,
    pub plugin_root: PathBuf,
    pub runtime_data_root: PathBuf,
}

pub fn create_plugin_roots(plugin_root: impl AsRef<Path>) -> PathRoots {
    let plugin_root = plugin_root.as_ref().to_path_buf();
    let server_root = plugin_root
        .parent()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| plugin_root.clone());
    let workspace_root = server_root
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| server_root.clone());

    PathRoots {
        workspace_root: workspace_root.clone(),
        server_root: server_root.clone(),
        plugin_root: plugin_root.clone(),
        runtime_data_root: workspace_root.join("AppData"),
    }
}

pub fn expand_template_path(raw_value: &str, roots: &PathRoots) -> PathBuf {
    let trimmed = raw_value.trim();
    if trimmed.is_empty() {
        return PathBuf::new();
    }

    if let Some(rest) = trimmed.strip_prefix("<workspace>") {
        return roots.workspace_root.join(rest.trim_start_matches(['/', '\\']));
    }

    if let Some(rest) = trimmed.strip_prefix("<runtime>") {
        return roots.runtime_data_root.join(rest.trim_start_matches(['/', '\\']));
    }

    if let Some(rest) = trimmed.strip_prefix("<server>") {
        return roots.server_root.join(rest.trim_start_matches(['/', '\\']));
    }

    if let Some(rest) = trimmed.strip_prefix("<plugin>") {
        return roots.plugin_root.join(rest.trim_start_matches(['/', '\\']));
    }

    PathBuf::from(trimmed)
}

pub fn resolve_configured_path(
    raw_value: Option<&str>,
    roots: &PathRoots,
    fallback: impl AsRef<Path>,
) -> PathBuf {
    let fallback = fallback.as_ref().to_path_buf();

    match raw_value {
        Some(value) if !value.trim().is_empty() => {
            let candidate = expand_template_path(value, roots);
            if candidate.is_absolute() {
                candidate
            } else {
                roots.workspace_root.join(candidate)
            }
        }
        _ => fallback,
    }
}
