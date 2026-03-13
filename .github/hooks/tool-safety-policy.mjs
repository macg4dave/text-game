export const TOOL_SAFETY_POLICY = {
  monitoredToolNames: ["run_in_terminal", "create_and_run_task", "run_vscode_command"],
  globalAllowPatterns: [
    // Add repo-local exceptions here when you want a specific command pattern to bypass a rule.
    // Example:
    // /\b(?:rm|Remove-Item)\b[\s\S]{0,120}\b(?:dist|public\/app\.js)\b/i
  ],
  rules: [
    {
      id: "remote-access",
      decision: "deny",
      reason:
        "Remote access commands are blocked by workspace policy. Do not use SSH, SCP, SFTP, rsync-to-remote, Plink/PSCP, or Windows remoting from this workspace.",
      patterns: [
        /(^|[^\w-])ssh(?:\.exe)?(?=\s|$)/i,
        /(^|[^\w-])scp(?:\.exe)?(?=\s|$)/i,
        /(^|[^\w-])sftp(?:\.exe)?(?=\s|$)/i,
        /(^|[^\w-])plink(?:\.exe)?(?=\s|$)/i,
        /(^|[^\w-])pscp(?:\.exe)?(?=\s|$)/i,
        /(^|[^\w-])sshpass(?=\s|$)/i,
        /\b(Enter-PSSession|New-PSSession)\b/i,
        /\bInvoke-Command\b[\s\S]{0,120}\b-ComputerName\b/i,
        /\brsync\b[\s\S]{0,200}\b[\w.-]+@[\w.-]+:/i
      ],
      excludePatterns: []
    },
    {
      id: "unsafe-command",
      decision: "ask",
      reason:
        "Unsafe local shell commands require explicit user approval before they run.",
      patterns: [
        /(^|[^\w-])(rm|del|erase)(?:\.exe)?(?=\s|$)/i,
        /\bRemove-Item\b/i,
        /(^|[^\w-])(rmdir)(?:\.exe)?(?=\s|$)/i,
        /\bMove-Item\b/i,
        /(^|[^\w-])(mv|move|ren|rename)(?:\.exe)?(?=\s|$)/i,
        /\bRename-Item\b/i,
        /\bgit\b[\s\S]{0,80}\b(push|reset\s+--hard|clean\s+-fd)\b/i,
        /\bdocker\b[\s\S]{0,80}\bcompose\b[\s\S]{0,40}\bdown\b[\s\S]{0,20}\b-v\b/i,
        /\b(format|mkfs|diskpart|shutdown|reboot)\b/i
      ],
      excludePatterns: [
        // Add repo-local allow patterns here for safe housekeeping commands you want to stop prompting for.
        // Example:
        // /\b(?:mv|Move-Item)\b[\s\S]{0,120}\bREADME\.tmp\b[\s\S]{0,120}\bREADME\.md\b/i
      ]
    }
  ]
};
