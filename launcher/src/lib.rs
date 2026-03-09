pub mod config;
pub mod env;
pub mod error;
pub mod logging;
pub mod process;
pub mod start_desktop_prototype;
pub mod start_dev;
pub mod test_local_ai_workflow;
pub mod test_setup_browser_smoke;
pub mod validators;

use anyhow::Result;
use clap::{CommandFactory, Parser, Subcommand};

use crate::config::command_contracts;
use crate::start_dev::StartDevOptions;
use crate::test_local_ai_workflow::TestLocalAiWorkflowOptions;

#[derive(Parser, Debug, PartialEq, Eq)]
#[command(name = "SunRay")]
#[command(about = "Rust launcher and automation harness for text-game")]
#[command(long_about = "SunRay is the supported Rust command surface for launcher, harness, smoke, and validation work. It orchestrates the existing Docker, Node, npm, browser, and Electron flows without replacing those runtimes.")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug, PartialEq, Eq)]
pub enum Commands {
    /// Start the supported launcher and Docker preflight flow.
    StartDev {
        /// Skip opening the browser after the app becomes ready.
        #[arg(long)]
        no_browser: bool,
        /// Rebuild the app image without cache before launch.
        #[arg(long)]
        rebuild: bool,
    },
    /// Run the local AI workflow regression harness.
    TestLocalAiWorkflow {
        /// Run only deterministic contract checks and skip live provider smoke.
        #[arg(long)]
        selection_only: bool,
    },
    /// Run the targeted browser setup smoke harness.
    TestSetupBrowserSmoke,
    /// Validate the launcher-owned local GPU profile matrix.
    ValidateLocalGpuProfileMatrix,
    /// Validate the default LiteLLM config wiring.
    ValidateLitellmDefaultConfig,
    /// Start the Electron desktop prototype wrapper flow.
    StartDesktopPrototype,
}

pub fn run(cli: Cli) -> Result<()> {
    logging::init_logging();

    match cli.command {
        Commands::StartDev {
            no_browser,
            rebuild,
        } => start_dev::run(StartDevOptions {
            no_browser,
            rebuild,
        }),
        Commands::TestLocalAiWorkflow { selection_only } => {
            test_local_ai_workflow::run(TestLocalAiWorkflowOptions { selection_only })
        }
        Commands::TestSetupBrowserSmoke => test_setup_browser_smoke::run(),
        Commands::ValidateLocalGpuProfileMatrix => {
            validators::run_validate_local_gpu_profile_matrix()
        }
        Commands::ValidateLitellmDefaultConfig => {
            validators::run_validate_litellm_default_config()
        }
        Commands::StartDesktopPrototype => start_desktop_prototype::run(),
    }
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
                rebuild: false,
            }
        );
    }

    #[test]
    fn start_dev_accepts_rebuild_flag() {
        let cli = Cli::parse_from(["SunRay", "start-dev", "--rebuild"]);
        assert_eq!(
            cli.command,
            Commands::StartDev {
                no_browser: false,
                rebuild: true,
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
