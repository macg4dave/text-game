pub mod config;
pub mod env;
pub mod error;
pub mod logging;
pub mod process;
pub mod start_dev;
pub mod test_local_ai_workflow;
pub mod test_setup_browser_smoke;
pub mod validators;

use anyhow::Result;
use clap::{CommandFactory, Parser, Subcommand};
use std::path::PathBuf;

use crate::config::command_contracts;
use crate::start_dev::StartDevOptions;
use crate::test_local_ai_workflow::{TestLocalAiWorkflowOptions, TestPlayerPersonaChoice};

#[derive(Parser, Debug, PartialEq, Eq)]
#[command(name = "SunRay")]
#[command(about = "Rust launcher and automation harness for text-game")]
#[command(
    long_about = "SunRay is the supported Rust command surface for launcher, harness, smoke, and validation work. It orchestrates the existing Docker, Node, npm, and browser flows without replacing the app runtime."
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand, Debug, PartialEq, Eq)]
pub enum Commands {
    /// Start the supported launcher and Docker preflight flow.
    StartDev(StartDevOptions),
    /// Run the local AI workflow regression harness.
    TestLocalAiWorkflow {
        /// Run only deterministic contract checks and skip live provider smoke.
        #[arg(long)]
        selection_only: bool,
        /// Force the live AI smoke to use one specific test-player persona.
        #[arg(long, value_enum)]
        persona: Option<TestPlayerPersonaChoice>,
        /// Seed the live AI smoke persona picker for repeatable runs.
        #[arg(long)]
        persona_seed: Option<u64>,
        /// Write a machine-readable validation report to the given JSON path.
        #[arg(long)]
        report_json: Option<PathBuf>,
    },
    /// Run the targeted browser setup smoke harness.
    TestSetupBrowserSmoke,
    /// Validate the launcher-owned local GPU profile matrix.
    ValidateLocalGpuProfileMatrix,
    /// Validate the default LiteLLM config wiring.
    ValidateLitellmDefaultConfig,
}

pub fn run(cli: Cli) -> Result<()> {
    logging::init_logging();

    match cli.command {
        None => start_dev::run(StartDevOptions::default()),
        Some(Commands::StartDev(options)) => start_dev::run(options),
        Some(Commands::TestLocalAiWorkflow {
            selection_only,
            persona,
            persona_seed,
            report_json,
        }) => test_local_ai_workflow::run(TestLocalAiWorkflowOptions {
            selection_only,
            persona,
            persona_seed,
            report_json,
        }),
        Some(Commands::TestSetupBrowserSmoke) => test_setup_browser_smoke::run(),
        Some(Commands::ValidateLocalGpuProfileMatrix) => {
            validators::run_validate_local_gpu_profile_matrix()
        }
        Some(Commands::ValidateLitellmDefaultConfig) => {
            validators::run_validate_litellm_default_config()
        }
    }
}

pub fn cli_command_names() -> Vec<&'static str> {
    command_contracts()
        .iter()
        .map(|contract| contract.name)
        .collect()
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
    use std::path::PathBuf;

    use crate::start_dev::StartDevOptions;

    use super::{clap_command_names, cli_command_names, Cli, Commands, TestPlayerPersonaChoice};

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
            cli,
            Cli {
                command: Some(Commands::StartDev(StartDevOptions {
                    no_browser: true,
                    rebuild: false,
                })),
            }
        );
    }

    #[test]
    fn start_dev_accepts_rebuild_flag() {
        let cli = Cli::parse_from(["SunRay", "start-dev", "--rebuild"]);
        assert_eq!(
            cli,
            Cli {
                command: Some(Commands::StartDev(StartDevOptions {
                    no_browser: false,
                    rebuild: true,
                })),
            }
        );
    }

    #[test]
    fn test_local_ai_workflow_accepts_selection_only_flag() {
        let cli = Cli::parse_from(["SunRay", "test-local-ai-workflow", "--selection-only"]);
        assert_eq!(
            cli,
            Cli {
                command: Some(Commands::TestLocalAiWorkflow {
                    selection_only: true,
                    persona: None,
                    persona_seed: None,
                    report_json: None,
                }),
            }
        );
    }

    #[test]
    fn test_local_ai_workflow_accepts_persona_and_seed_flags() {
        let cli = Cli::parse_from([
            "SunRay",
            "test-local-ai-workflow",
            "--persona",
            "practical-fixer",
            "--persona-seed",
            "7",
        ]);
        assert_eq!(
            cli,
            Cli {
                command: Some(Commands::TestLocalAiWorkflow {
                    selection_only: false,
                    persona: Some(TestPlayerPersonaChoice::PracticalFixer),
                    persona_seed: Some(7),
                    report_json: None,
                }),
            }
        );
    }

    #[test]
    fn test_local_ai_workflow_accepts_report_json_flag() {
        let cli = Cli::parse_from([
            "SunRay",
            "test-local-ai-workflow",
            "--selection-only",
            "--report-json",
            "reports/ai-manifest.json",
        ]);
        assert_eq!(
            cli,
            Cli {
                command: Some(Commands::TestLocalAiWorkflow {
                    selection_only: true,
                    persona: None,
                    persona_seed: None,
                    report_json: Some(PathBuf::from("reports/ai-manifest.json")),
                }),
            }
        );
    }

    #[test]
    fn no_args_default_to_start_dev() {
        let cli = Cli::parse_from(["SunRay"]);
        assert_eq!(cli, Cli { command: None });
    }

    #[test]
    fn root_start_dev_flags_require_the_start_dev_subcommand() {
        let error = Cli::try_parse_from(["SunRay", "--no-browser"])
            .expect_err("root launcher flow should not accept start-dev-only flags");

        assert!(error.to_string().contains("--no-browser"));
    }
}
