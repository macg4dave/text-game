use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum SunrayError {
    #[error("Could not find the text-game workspace root from any of: {start_dirs:?}")]
    WorkspaceRootNotFound { start_dirs: Vec<PathBuf> },

    #[error("Could not parse dotenv file {path} at line {line_number}; expected KEY=VALUE")]
    InvalidDotEnvLine { path: PathBuf, line_number: usize },

    #[error("Command `{program}` failed with status {status}")]
    ExternalCommandFailed { program: String, status: String },
}
