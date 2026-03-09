//! SunRay: Rust launcher and automation harness for text-game

mod process;
mod env;
mod logging;
mod error;
mod config;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "SunRay")]
#[command(about = "Rust launcher and automation harness for text-game", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    StartDev {
        #[arg(long)]
        no_browser: bool,
    },
    TestLocalAiWorkflow {
        #[arg(long)]
        selection_only: bool,
    },
    TestSetupBrowserSmoke,
    ValidateLocalGpuProfileMatrix,
    ValidateLitellmDefaultConfig,
    StartDesktopPrototype,
}

fn main() -> anyhow::Result<()> {
    env_logger::init();
    let cli = Cli::parse();
    match cli.command {
        Commands::StartDev { no_browser } => {
            println!("[stub] Would run start-dev (no_browser={})", no_browser);
        }
        Commands::TestLocalAiWorkflow { selection_only } => {
            println!("[stub] Would run test-local-ai-workflow (selection_only={})", selection_only);
        }
        Commands::TestSetupBrowserSmoke => {
            println!("[stub] Would run test-setup-browser-smoke");
        }
        Commands::ValidateLocalGpuProfileMatrix => {
            println!("[stub] Would run validate-local-gpu-profile-matrix");
        }
        Commands::ValidateLitellmDefaultConfig => {
            println!("[stub] Would run validate-litellm-default-config");
        }
        Commands::StartDesktopPrototype => {
            println!("[stub] Would run start-desktop-prototype");
        }
    }
    Ok(())
}
