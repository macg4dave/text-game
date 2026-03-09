use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::process::Command;

use anyhow::Result;

use crate::error::SunrayError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessInvocation {
	pub program: String,
	pub args: Vec<String>,
	pub cwd: Option<PathBuf>,
	pub env_overrides: BTreeMap<String, String>,
	pub env_removals: BTreeSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessCapture {
	pub exit_code: Option<i32>,
	pub stdout: String,
	pub stderr: String,
}

impl ProcessInvocation {
	pub fn new(program: impl Into<String>) -> Self {
		Self {
			program: program.into(),
			args: Vec::new(),
			cwd: None,
			env_overrides: BTreeMap::new(),
			env_removals: BTreeSet::new(),
		}
	}

	pub fn with_args(mut self, args: impl IntoIterator<Item = impl Into<String>>) -> Self {
		self.args.extend(args.into_iter().map(Into::into));
		self
	}

	pub fn in_dir(mut self, cwd: impl Into<PathBuf>) -> Self {
		self.cwd = Some(cwd.into());
		self
	}

	pub fn with_env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
		self.env_overrides.insert(key.into(), value.into());
		self
	}

	pub fn with_envs<I, K, V>(mut self, envs: I) -> Self
	where
		I: IntoIterator<Item = (K, V)>,
		K: Into<String>,
		V: Into<String>,
	{
		self.env_overrides
			.extend(envs.into_iter().map(|(key, value)| (key.into(), value.into())));
		self
	}

	pub fn with_env_removed(mut self, key: impl Into<String>) -> Self {
		self.env_removals.insert(key.into());
		self
	}

	pub fn render(&self) -> String {
		render_command_preview(&self.program, &self.args)
	}

	pub fn run_checked(&self) -> Result<()> {
		let mut command = self.to_command();

		let status = command.status()?;
		if status.success() {
			return Ok(());
		}

		Err(SunrayError::ExternalCommandFailed {
			program: self.program.clone(),
			status: status
				.code()
				.map(|code| code.to_string())
				.unwrap_or_else(|| "terminated by signal".to_string()),
		}
		.into())
	}

	pub fn capture(&self) -> Result<ProcessCapture> {
		let output = self.to_command().output()?;
		Ok(ProcessCapture {
			exit_code: output.status.code(),
			stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
			stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
		})
	}

	fn to_command(&self) -> Command {
		let mut command = Command::new(&self.program);
		command.args(&self.args);

		if let Some(cwd) = &self.cwd {
			command.current_dir(cwd);
		}

		if !self.env_overrides.is_empty() {
			command.envs(&self.env_overrides);
		}

		for key in &self.env_removals {
			command.env_remove(key);
		}

		command
	}
}

pub fn render_command_preview(program: &str, args: &[String]) -> String {
	std::iter::once(program.to_string())
		.chain(args.iter().map(|arg| quote_arg(arg)))
		.collect::<Vec<_>>()
		.join(" ")
}

fn quote_arg(value: &str) -> String {
	if value.is_empty() {
		return "\"\"".to_string();
	}

	if value.chars().any(|ch| ch.is_whitespace() || ch == '"') {
		format!("\"{}\"", value.replace('"', "\\\""))
	} else {
		value.to_string()
	}
}

#[cfg(test)]
mod tests {
	use super::{render_command_preview, ProcessInvocation};

	#[test]
	fn command_preview_quotes_spacey_args() {
		let preview = render_command_preview(
			"docker",
			&[
				"compose".to_string(),
				"run task".to_string(),
				"quote\"here".to_string(),
			],
		);

		assert_eq!(preview, "docker compose \"run task\" \"quote\\\"here\"");
	}

	#[test]
	fn invocation_render_uses_preview_format() {
		let invocation = ProcessInvocation::new("cargo").with_args(["test", "--help"]);
		assert_eq!(invocation.render(), "cargo test --help");
	}

	#[test]
	fn invocation_stores_env_overrides() {
		let invocation = ProcessInvocation::new("cargo").with_env("PORT", "3100");
		assert_eq!(invocation.env_overrides.get("PORT"), Some(&"3100".to_string()));
	}

	#[test]
	fn invocation_stores_env_removals() {
		let invocation = ProcessInvocation::new("npm").with_env_removed("ELECTRON_RUN_AS_NODE");
		assert!(invocation.env_removals.contains("ELECTRON_RUN_AS_NODE"));
	}
}
