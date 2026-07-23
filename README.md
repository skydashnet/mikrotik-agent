<div align="center">

<h1>MikroTik Agent</h1>

<p>An AI-assisted RouterOS inspection workspace with read-only access, conversational context, and image analysis.</p>

<p>
  <img alt="SvelteKit" src="https://img.shields.io/badge/SvelteKit-2-FF3E00?style=flat-square&logo=svelte&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?style=flat-square&logo=postgresql&logoColor=white">
  <img alt="RouterOS" src="https://img.shields.io/badge/RouterOS-v6%20%7C%20v7-293239?style=flat-square&logo=mikrotik&logoColor=white">
</p>

<p>
  <img alt="Read-only AI access" src="https://img.shields.io/badge/AI%20Access-Read%20Only-176B45?style=flat-square">
  <img alt="AES-256-GCM encryption" src="https://img.shields.io/badge/Secrets-AES--256--GCM-5C4B8A?style=flat-square">
  <img alt="Active project status" src="https://img.shields.io/badge/Status-Active-D6EF4F?style=flat-square&labelColor=293239">
  <a href="LICENSE"><img alt="GNU AGPL v3.0 license" src="https://img.shields.io/badge/License-AGPL--3.0-663399?style=flat-square"></a>
</p>

</div>

## Overview

MikroTik Agent helps network operators inspect RouterOS status and configuration through natural language conversations. It combines direct router connectivity, an OpenAI-compatible assistant, persistent chat history, contextual memory, and RouterOS documentation retrieval in a single workspace.

The assistant is restricted to inspection operations. It may present recommended commands for operator review, but it is not given any tool capable of changing router configuration.

## Core capabilities

- Manage multiple RouterOS endpoints for each user.
- Connect through RouterOS REST API v7 or Binary API v6 and v7.
- Refresh router connection status automatically with short-lived server-side caching.
- Perform read-only RouterOS analysis through streaming conversations.
- Keep user-facing AI responses in Indonesian and bridge provider-bound text to English for compatible sky routes.
- Preserve chat sessions, compacted memory, and long-running conversational context.
- Accept up to four JPEG, PNG, WebP, or GIF images through file selection, paste, or drag and drop for multimodal analysis, with a 5 MB per-file and 12 MB total limit.
- Undo the latest conversation turn and delete sessions with their attachments.
- Retrieve relevant RouterOS documentation from a local index.
- Configure one OpenAI-compatible provider endpoint and active model independently for each user.
- Provide a responsive interface for desktop and mobile devices.

## System components

| Component | Responsibility |
| --- | --- |
| Web application | User interface, authentication, internal APIs, and conversation streaming |
| PostgreSQL | Accounts, routers, AI settings, sessions, messages, memory, and attachment metadata |
| RouterOS | Network data source through REST API or Binary API |
| AI provider | Conversation reasoning, read-only tool calls, and multimodal analysis |
| Documentation index | Local retrieval of relevant RouterOS references |

## Security

Security is enforced as a system boundary, not merely as an instruction to the AI model.

- Router credentials and AI provider keys are encrypted with AES-256-GCM before storage.
- Account passwords are processed with Argon2, and authenticated sessions use HttpOnly cookies with SameSite protection.
- Router data, live connections, conversations, and attachments are isolated by user ownership.
- The AI receives inspection tools only and has no configuration mutation tool.
- Image attachments are size-limited, validated by file signature, and stored as private files.
- Undo and deletion workflows remove related database records transactionally and clean up associated attachment files after commit.
- TLS is recommended for RouterOS, the reverse proxy, and the AI provider.

Binary API TLS can be used with devices that rely on internal or self-signed certificates. Because certificate trust depends on the deployment environment, router access must still be protected through network segmentation, firewall rules, and least-privilege accounts.

Never commit environment files, production credentials, database dumps, or user attachments. Use a secret manager or private deployment configuration for sensitive values.

See the [Security Policy](SECURITY.md) for vulnerability reporting and disclosure procedures.

## Requirements

- Node.js 20.19 or newer, or Node.js 22.12 or newer.
- PostgreSQL 14 or newer.
- A reachable RouterOS device with REST API or Binary API enabled.
- An OpenAI-compatible provider for conversational features.
- A multimodal model when image analysis is required.
- A TLS-enabled reverse proxy for production deployments.

## Getting started

1. Prepare PostgreSQL and a database account with the minimum privileges required by the application.
2. Copy the environment template and provide the encryption key, database connection, and optional provider fallback.
3. Install dependencies, initialize the database schema, and prepare the documentation index when local retrieval is needed.
4. Run type checks and automated tests before creating a production build.
5. Run the generated build through a process manager and place it behind a TLS reverse proxy.

The application port is controlled by the deployment environment. In production, only the reverse proxy or an administrative network should be able to reach the application port directly.

## Operations

- Rotate bootstrap credentials and temporary secrets after provisioning.
- Back up the database and attachment storage consistently.
- Monitor failed logins, provider configuration changes, router availability, and application errors.
- Restrict the RouterOS account to the exact policies required for inspection.
- Test recovery procedures before applying production updates.

## Validation

A change should be considered ready only after Svelte and TypeScript checks, the complete automated test suite, and the production build finish without errors. Router connectivity changes should also be tested against each supported REST API and Binary API variant.

## Contributing

Bug reports and improvement proposals are welcome through GitHub Issues. Never submit vulnerabilities, credentials, private network addresses, or production data through a public issue.

For code changes, describe the problem being solved, the user impact, and the validation performed in the pull request.

## License

Copyright (c) 2026 SkydashNET.

MikroTik Agent is licensed under the [GNU Affero General Public License v3.0 only](LICENSE). Modified versions made available over a network must offer their corresponding source to the users interacting with them, as required by the license.
