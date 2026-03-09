pub mod config;
pub mod env;
pub mod error;
pub mod logging;
pub mod process;

use std::env as std_env;

use anyhow::Result;
use clap::{CommandFactory, Parser, Subcommand};

use crate::config::{command_contracts, resolve_workspace_root_from, SunrayCommand};
use crate::env::load_repo_env;

#[derive(Parser, Debug, PartialEq, Eq)]
#[command(name = "SunRay")]
#[command(about = "Rust launcher and automation harness for text-game")]
#[command(long_about = "SunRay is the Rust command surface replacing legacy PowerShell automation one script at a time. It orchestrates the existing Docker, Node, npm, browser, and Electron flows without replacing those runtimes.")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug, PartialEq, Eq)]
pub enum Commands {
    /// Launcher and Docker preflight parity target for scripts/start-dev.ps1.
    StartDev {
        /// Skip opening the browser after the app becomes ready.
        #[arg(long)]
        no_browser: bool,
    },
    /// Local AI harness parity target for scripts/test-local-ai-workflow.ps1.
    TestLocalAiWorkflow {
        /// Run only deterministic contract checks and skip live provider smoke.
        #[arg(long)]
        selection_only: bool,
    },
    /// Browser setup smoke parity target for scripts/test-setup-browser-smoke.ps1.
    TestSetupBrowserSmoke,
    /// GPU matrix validator parity target for scripts/validate-local-gpu-profile-matrix.ps1.
    ValidateLocalGpuProfileMatrix,
    /// LiteLLM config validator parity target for scripts/validate-litellm-default-config.ps1.
    ValidateLitellmDefaultConfig,
    /// Electron prototype wrapper parity target for scripts/start-desktop-prototype.ps1.
    StartDesktopPrototype,
}

pub fn run(cli: Cli) -> Result<()> {
    logging::init_logging();

    match cli.command {
        Commands::StartDev { no_browser } => run_contract_stub(
            SunrayCommand::StartDev,
            &[format!("--no-browser={no_browser}")],
        ),
        Commands::TestLocalAiWorkflow { selection_only } => run_contract_stub(
            SunrayCommand::TestLocalAiWorkflow,
            &[format!("--selection-only={selection_only}")],
        ),
        Commands::TestSetupBrowserSmoke => run_contract_stub(SunrayCommand::TestSetupBrowserSmoke, &[]),
        Commands::ValidateLocalGpuProfileMatrix => {
            run_contract_stub(SunrayCommand::ValidateLocalGpuProfileMatrix, &[])
        }
        Commands::ValidateLitellmDefaultConfig => {
            run_contract_stub(SunrayCommand::ValidateLitellmDefaultConfig, &[])
        }
        Commands::StartDesktopPrototype => run_contract_stub(SunrayCommand::StartDesktopPrototype, &[]),
    }
}

fn run_contract_stub(command: SunrayCommand, parsed_flags: &[String]) -> Result<()> {
    let current_dir = std_env::current_dir()?;
    let repo_root = resolve_workspace_root_from(&current_dir).unwrap_or(current_dir.clone());
    let repo_env = load_repo_env(&repo_root)?;
    let contract = command.contract();

    println!("SunRay command contract ready: {}", contract.name);
    println!("Summary: {}", contract.summary);
    println!("Legacy parity target: {}", contract.legacy_script);
    println!("Backlog slice: {}", contract.backlog_task);
    println!("Workspace root: {}", repo_root.display());

    if repo_env.exists {
        println!("Detected workspace .env: {}", repo_env.path.display());
    } else {
        println!("Detected workspace .env: none");
    }

    if parsed_flags.is_empty() {
        println!("Parsed flags: none");
    } else {
        println!("Parsed flags: {}", parsed_flags.join(", "));
    }

    println!();
    println!("Status: CLI surface established; behavior parity is still pending.");
    println!(
        "Next step: implement {} in Rust, validate parity, then delete {}.",
        contract.backlog_task, contract.legacy_script
    );

    Ok(())
}

pub fn cli_command_names() -> Vec<&'static str> {
    command_contracts().iter().map(|contract| contract.name).collect()
}

pub fn clap_command_names() -> Vec<String> {
    Cli::command()
        .get_subcommands()
        .map(|command| command.get_name().to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::{clap_command_names, cli_command_names, Cli, Commands};

    #[test]
    fn command_contract_and_clap_surface_match() {
        let expected = cli_command_names();
        let actual = clap_command_names();

        assert_eq!(
            actual,
            expected
                .into_iter()
                .map(std::string::ToString::to_string)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn start_dev_accepts_no_browser_flag() {
        let cli = Cli::parse_from(["SunRay", "start-dev", "--no-browser"]);
        assert_eq!(
            cli.command,
            Commands::StartDev {
                no_browser: true,
            }
        );
    }

    #[test]
    fn test_local_ai_workflow_accepts_selection_only_flag() {
        let cli = Cli::parse_from(["SunRay", "test-local-ai-workflow", "--selection-only"]);
        assert_eq!(
            cli.command,
            Commands::TestLocalAiWorkflow {
                selection_only: true,
            }
        );
    }
}