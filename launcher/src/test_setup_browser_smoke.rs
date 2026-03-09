use std::path::Path;

use anyhow::Result;

use crate::config::resolve_workspace_root_from;
use crate::process::ProcessInvocation;

pub fn run() -> Result<()> {
    let repo_root = resolve_workspace_root_from(&std::env::current_dir()?)?;

    write_step("Building the app image so Docker test runs see the latest UI harness files");
    docker_compose(&repo_root)
        .with_args(["build", "app"])
        .run_checked()?;

    write_step("Running TypeScript type-check for the browser smoke harness");
    docker_compose(&repo_root)
        .with_args(["run", "--rm", "--no-deps", "app", "npm", "run", "type-check"])
        .run_checked()?;

    write_step("Running the targeted setup browser smoke tests");
    docker_compose(&repo_root)
        .with_args([
            "run",
            "--rm",
            "--no-deps",
            "app",
            "npx",
            "tsx",
            "--test",
            "src/ui/setup-view.test.ts",
            "src/ui/launch-view.test.ts",
            "src/ui/setup-browser-smoke.test.ts",
        ])
        .run_checked()?;

    write_step("Rebuilding the browser bundle to confirm the current UI still compiles");
    docker_compose(&repo_root)
        .with_args(["run", "--rm", "--no-deps", "app", "npm", "run", "build:client"])
        .run_checked()?;

    println!();
    println!("Setup browser smoke path passed.");
    Ok(())
}

fn write_step(message: &str) {
    println!("==> {message}");
}

fn docker_compose(repo_root: &Path) -> ProcessInvocation {
    ProcessInvocation::new("docker")
        .with_args([
            "compose",
            "-f",
            repo_root.join("docker-compose.yml").to_string_lossy().as_ref(),
            "-f",
            repo_root.join("docker-compose.gpu.yml").to_string_lossy().as_ref(),
        ])
        .in_dir(repo_root)
}