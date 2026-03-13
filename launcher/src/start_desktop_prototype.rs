use anyhow::{anyhow, Result};

use crate::config::resolve_workspace_root;
use crate::process::ProcessInvocation;
use crate::start_dev::output::{write_info, write_step};

pub fn run() -> Result<()> {
    let repo_root = resolve_workspace_root()?;

    write_step("Checking npm availability");
    let npm_check = ProcessInvocation::new("npm")
        .with_args(["--version"])
        .in_dir(&repo_root)
        .capture_checked()
        .map_err(|_| {
            anyhow!(
                "npm was not found on PATH. Install Node.js 22 LTS, then rerun this prototype launcher."
            )
        })?;

    if !npm_check.stdout.is_empty() {
        write_info(&format!("npm: {}", npm_check.stdout));
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
