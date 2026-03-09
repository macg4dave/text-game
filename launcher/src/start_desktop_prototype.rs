use anyhow::{anyhow, Result};

use crate::config::resolve_workspace_root_from;
use crate::process::ProcessInvocation;

pub fn run() -> Result<()> {
    let repo_root = resolve_workspace_root_from(&std::env::current_dir()?)?;

    write_step("Checking npm availability");
    let npm_check = ProcessInvocation::new("npm")
        .with_args(["--version"])
        .in_dir(&repo_root)
        .capture();

    match npm_check {
        Ok(capture) if capture.exit_code == Some(0) => {
            if !capture.stdout.is_empty() {
                write_info(&format!("npm: {}", capture.stdout));
            }
        }
        _ => {
            return Err(anyhow!(
                "npm was not found on PATH. Install Node.js 22 LTS, then rerun this prototype launcher."
            ));
        }
    }

    write_step("Starting the desktop prototype");
    write_info("Clearing ELECTRON_RUN_AS_NODE for the child process if it was inherited.");
    ProcessInvocation::new("npm")
        .with_args(["run", "desktop:prototype:dev"])
        .with_env_removed("ELECTRON_RUN_AS_NODE")
        .in_dir(&repo_root)
        .run_checked()?;

    Ok(())
}

fn write_step(message: &str) {
    println!("==> {message}");
}

fn write_info(message: &str) {
    println!("    {message}");
}