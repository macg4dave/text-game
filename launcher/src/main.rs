use clap::Parser;

use sunray::{run, Cli};

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    run(cli)
}
