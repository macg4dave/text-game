use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::error::SunrayError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepoEnv {
	pub path: PathBuf,
	pub exists: bool,
	pub values: BTreeMap<String, String>,
}

pub fn load_repo_env(repo_root: &Path) -> Result<RepoEnv> {
	let env_path = repo_root.join(".env");
	if !env_path.exists() {
		return Ok(RepoEnv {
			path: env_path,
			exists: false,
			values: BTreeMap::new(),
		});
	}

	let contents = fs::read_to_string(&env_path)?;
	let values = parse_dotenv(&contents, &env_path)?;

	Ok(RepoEnv {
		path: env_path,
		exists: true,
		values,
	})
}

pub fn parse_dotenv(contents: &str, path: &Path) -> Result<BTreeMap<String, String>> {
	let mut values = BTreeMap::new();

	for (index, raw_line) in contents.lines().enumerate() {
		let line_number = index + 1;
		let line = raw_line.trim();

		if line.is_empty() || line.starts_with('#') {
			continue;
		}

		let line = line.strip_prefix("export ").unwrap_or(line);
		let Some((key, value)) = line.split_once('=') else {
			return Err(SunrayError::InvalidDotEnvLine {
				path: path.to_path_buf(),
				line_number,
			}
			.into());
		};

		let key = key.trim();
		let value = strip_optional_quotes(value.trim());
		values.insert(key.to_string(), value);
	}

	Ok(values)
}

fn strip_optional_quotes(value: &str) -> String {
	if value.len() >= 2 {
		let quoted_with_double = value.starts_with('"') && value.ends_with('"');
		let quoted_with_single = value.starts_with('\'') && value.ends_with('\'');
		if quoted_with_double || quoted_with_single {
			return value[1..value.len() - 1].to_string();
		}
	}

	value.to_string()
}

#[cfg(test)]
mod tests {
	use std::path::Path;

	use super::parse_dotenv;

	#[test]
	fn dotenv_parser_supports_comments_export_and_quotes() {
		let parsed = parse_dotenv(
			"# comment\nexport FOO=bar\nBAR=\"two words\"\nBAZ='kept'\n",
			Path::new(".env"),
		)
		.expect("dotenv parsing should succeed");

		assert_eq!(parsed.get("FOO"), Some(&"bar".to_string()));
		assert_eq!(parsed.get("BAR"), Some(&"two words".to_string()));
		assert_eq!(parsed.get("BAZ"), Some(&"kept".to_string()));
	}
}
