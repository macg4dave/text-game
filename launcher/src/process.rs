use std::path::PathBuf;
use std::process::Command;

use anyhow::Result;

use crate::error::SunrayError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessInvocation {
	pub program: String,
	pub args: Vec<String>,
	pub cwd: Option<PathBuf>,
}

impl ProcessInvocation {
	pub fn new(program: impl Into<String>) -> Self {
		Self {
			program: program.into(),
			args: Vec::new(),
			cwd: None,
		}
	}

	pub fn with_args(mut self, args: impl IntoIterator<Item = impl Into<String>>) -> Self {
		self.args = args.into_iter().map(Into::into).collect();
		self
	}

	pub fn in_dir(mut self, cwd: impl Into<PathBuf>) -> Self {
		self.cwd = Some(cwd.into());
		self
	}

	pub fn render(&self) -> String {
		render_command_preview(&self.program, &self.args)
	}

	pub fn run_checked(&self) -> Result<()> {
		let mut command = Command::new(&self.program);
		command.args(&self.args);

		if let Some(cwd) = &self.cwd {
			command.current_dir(cwd);
		}

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
}
