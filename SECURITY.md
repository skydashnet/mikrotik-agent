# Security Policy

## Supported versions

Security fixes are provided for the latest version available on the default branch. Older releases, forks, and modified deployments should update to the current version before requesting a fix.

## Reporting a vulnerability

Do not report vulnerabilities through GitHub Issues, public discussions, or community channels.

Use [GitHub Security Advisories](https://github.com/skydashnet/mikrotik-agent/security/advisories/new) to submit a private report. If private vulnerability reporting is not available, contact the GitHub organization owner and request a secure reporting channel before sharing technical details.

Include the following information:

- A concise description of the vulnerability and its impact.
- The affected component and version.
- The conditions required to reproduce the issue.
- Minimal reproduction steps.
- A proof of concept that contains no credentials or user data.
- A suggested mitigation, when available.

Do not include production credentials, encryption keys, API keys, database dumps, private network addresses, or personal data in the report.

## Response process

- Receipt of a report is targeted within three business days.
- An initial assessment is targeted within seven business days.
- The reporter will receive updates when the impact, mitigation, or remediation schedule changes.
- Technical details will be disclosed after a fix is available and users have had reasonable time to update.

Response targets may change based on complexity, impact, and coordination requirements with third-party components.

## Scope

Relevant security reports include:

- Authentication or authorization bypasses.
- Exposure of router credentials, provider keys, sessions, or encryption keys.
- Cross-user access to routers, conversations, memory, or attachments.
- RouterOS mutation through the read-only AI boundary.
- Injection, request forgery, path traversal, and malicious file upload issues.
- Cryptographic or secret-storage weaknesses.
- Sensitive data exposure through logs or error responses.

Configuration issues in RouterOS, the AI provider, reverse proxy, PostgreSQL, firewall, or operating system may be outside the project scope. Reports will still be reviewed when there is evidence that the application creates or mishandles the unsafe condition.

## Safe harbor

Good-faith research must be limited to accounts, routers, and data owned by the researcher. Avoid service disruption, social engineering, persistence, excessive data access, and access to third-party systems.

Researchers who follow this policy, keep the report confidential, and allow reasonable time for remediation will be treated as acting in good faith.
