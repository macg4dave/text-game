use anyhow::{anyhow, Result};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreflightIssue {
    severity: &'static str,
    area: &'static str,
    code: &'static str,
    title: String,
    message: String,
    recovery: Vec<String>,
    env_vars: Vec<String>,
    details: Option<Value>,
}

impl PreflightIssue {
    pub fn blocker(
        area: &'static str,
        code: &'static str,
        title: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            severity: "blocker",
            area,
            code,
            title: title.into(),
            message: message.into(),
            recovery: Vec::new(),
            env_vars: Vec::new(),
            details: None,
        }
    }

    pub fn with_recovery<I, S>(mut self, recovery: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.recovery = recovery.into_iter().map(Into::into).collect();
        self
    }

    pub fn with_env_vars<I, S>(mut self, env_vars: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.env_vars = env_vars.into_iter().map(Into::into).collect();
        self
    }

    pub fn with_details(mut self, details: Value) -> Self {
        self.details = Some(details);
        self
    }

    pub fn format(&self) -> String {
        let mut lines = vec![
            format!("[{}] {}", self.severity.to_uppercase(), self.title),
            self.message.clone(),
        ];

        if let Some(first) = self.recovery.first() {
            lines.push(format!("Recommended next step: {first}"));
        }

        if !self.env_vars.is_empty() {
            lines.push(format!("Env vars: {}", self.env_vars.join(", ")));
        }

        if let Some(details) = &self.details {
            lines.push("Advanced details:".to_string());
            lines.push(
                serde_json::to_string_pretty(details).unwrap_or_else(|_| details.to_string()),
            );
        }

        lines.join("\n")
    }
}

pub fn fail_issue(issue: PreflightIssue) -> Result<()> {
    Err(anyhow!(issue.format()))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::PreflightIssue;

    #[test]
    fn formatted_issue_includes_recovery_env_vars_and_details() {
        let issue = PreflightIssue::blocker(
            "host",
            "docker_missing",
            "Install Docker",
            "Docker was not found.",
        )
        .with_recovery(["Install Docker Desktop."])
        .with_env_vars(["AI_PROVIDER"])
        .with_details(json!({"check": "docker"}));

        let formatted = issue.format();
        assert!(formatted.contains("[BLOCKER] Install Docker"));
        assert!(formatted.contains("Recommended next step: Install Docker Desktop."));
        assert!(formatted.contains("Env vars: AI_PROVIDER"));
        assert!(formatted.contains("\"check\": \"docker\""));
    }
}
