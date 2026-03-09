use std::path::{Path, PathBuf};

use crate::error::SunrayError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SunrayCommand {
	StartDev,
	TestLocalAiWorkflow,
	TestSetupBrowserSmoke,
	ValidateLocalGpuProfileMatrix,
	ValidateLitellmDefaultConfig,
	StartDesktopPrototype,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CommandContract {
	pub name: &'static str,
	pub summary: &'static str,
	pub legacy_script: &'static str,
	pub backlog_task: &'static str,
}

pub const COMMAND_CONTRACTS: [CommandContract; 6] = [
	CommandContract {
		name: "start-dev",
		summary: "Launcher and Docker preflight entrypoint replacing scripts/start-dev.ps1.",
		legacy_script: "scripts/start-dev.ps1",
		backlog_task: "T65b",
	},
	CommandContract {
		name: "test-local-ai-workflow",
		summary: "Local AI workflow harness replacing scripts/test-local-ai-workflow.ps1.",
		legacy_script: "scripts/test-local-ai-workflow.ps1",
		backlog_task: "T65c",
	},
	CommandContract {
		name: "test-setup-browser-smoke",
		summary: "Setup browser smoke harness replacing scripts/test-setup-browser-smoke.ps1.",
		legacy_script: "scripts/test-setup-browser-smoke.ps1",
		backlog_task: "T65e",
	},
	CommandContract {
		name: "validate-local-gpu-profile-matrix",
		summary: "Local GPU matrix validator replacing scripts/validate-local-gpu-profile-matrix.ps1.",
		legacy_script: "scripts/validate-local-gpu-profile-matrix.ps1",
		backlog_task: "T65d",
	},
	CommandContract {
		name: "validate-litellm-default-config",
		summary: "LiteLLM default-config validator replacing scripts/validate-litellm-default-config.ps1.",
		legacy_script: "scripts/validate-litellm-default-config.ps1",
		backlog_task: "T65d",
	},
	CommandContract {
		name: "start-desktop-prototype",
		summary: "Electron prototype wrapper replacing scripts/start-desktop-prototype.ps1.",
		legacy_script: "scripts/start-desktop-prototype.ps1",
		backlog_task: "T65e",
	},
];

impl SunrayCommand {
	pub fn contract(self) -> &'static CommandContract {
		match self {
			SunrayCommand::StartDev => &COMMAND_CONTRACTS[0],
			SunrayCommand::TestLocalAiWorkflow => &COMMAND_CONTRACTS[1],
			SunrayCommand::TestSetupBrowserSmoke => &COMMAND_CONTRACTS[2],
			SunrayCommand::ValidateLocalGpuProfileMatrix => &COMMAND_CONTRACTS[3],
			SunrayCommand::ValidateLitellmDefaultConfig => &COMMAND_CONTRACTS[4],
			SunrayCommand::StartDesktopPrototype => &COMMAND_CONTRACTS[5],
		}
	}
}

pub fn command_contracts() -> &'static [CommandContract] {
	&COMMAND_CONTRACTS
}

pub fn resolve_workspace_root_from(start_dir: &Path) -> Result<PathBuf, SunrayError> {
	for candidate in start_dir.ancestors() {
		if candidate.join("package.json").exists()
			&& candidate.join("sunray_backlog.md").exists()
			&& candidate.join("launcher").join("Cargo.toml").exists()
		{
			return Ok(candidate.to_path_buf());
		}
	}

	Err(SunrayError::WorkspaceRootNotFound {
		start_dir: start_dir.to_path_buf(),
	})
}

#[cfg(test)]
mod tests {
	use std::collections::BTreeSet;
	use std::path::Path;

	use super::{command_contracts, resolve_workspace_root_from};

	#[test]
	fn command_contracts_keep_unique_names_and_scripts() {
		let contracts = command_contracts();
		let names = contracts.iter().map(|contract| contract.name).collect::<BTreeSet<_>>();
		let scripts = contracts
			.iter()
			.map(|contract| contract.legacy_script)
			.collect::<BTreeSet<_>>();

		assert_eq!(contracts.len(), names.len());
		assert_eq!(contracts.len(), scripts.len());
	}

	#[test]
	fn workspace_root_resolves_from_launcher_src() {
		let root = resolve_workspace_root_from(Path::new(env!("CARGO_MANIFEST_DIR")).join("src").as_path())
			.expect("workspace root should resolve from launcher/src");

		assert!(root.join("package.json").exists());
		assert!(root.join("sunray_backlog.md").exists());
	}
}
