# Security Policy

## Supported Versions

MCRS is currently under active development. Security fixes are provided for the following versions:

| Version | Supported |
|---|---|
| `main` (development) | Yes |
| Pre-release versions | Best effort |
| Older commits and snapshots | No |

Security support for released versions will be defined when stable releases are introduced.

## Reporting a Vulnerability

If you discover a security vulnerability in MCRS, please report it responsibly.

**Do not disclose security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, use GitHub's **Private Vulnerability Reporting** feature:

1. Visit the [MCRS Security tab](https://github.com/Philip44-0/mcrs/security).
2. Select **Report a vulnerability**.
3. Provide a description of the vulnerability and the steps needed to reproduce it.

If private vulnerability reporting is unavailable, open a GitHub issue requesting a private reporting contact. Do not include vulnerability details in that issue.

### What to Include

When reporting a vulnerability, please provide as much of the following information as possible:

- A clear description of the vulnerability.
- The affected MCRS version or commit.
- The affected component or module.
- Steps to reproduce the issue.
- The potential security impact.
- Relevant logs, screenshots, or proof-of-concept material, with sensitive information removed.
- Any suggested mitigation, if available.

Please avoid including real customer data, credentials, session cookies, or other sensitive information in your report.

## Scope

Security reports concerning the following components are particularly welcome:

- Authentication and session management.
- Authorization and role-based access control.
- API route access restrictions.
- Module loading, registration and capability handling.
- Storage providers and data isolation.
- Input validation and data handling.
- Server-Sent Events and real-time communication.
- Configuration handling and sensitive information exposure.
- Dependency vulnerabilities affecting MCRS.

## Responsible Disclosure

Please follow these guidelines when researching and reporting vulnerabilities:

- Do not access, modify, or delete data belonging to other users.
- Do not disrupt services or intentionally degrade availability.
- Do not perform testing against systems without authorization.
- Do not publicly disclose vulnerabilities before coordinating with the maintainer.
- Give the maintainer a reasonable opportunity to investigate and address the issue.

The maintainer will make a reasonable effort to:

1. Acknowledge the report.
2. Investigate and assess the reported vulnerability.
3. Determine the affected versions and components.
4. Develop and release an appropriate fix.
5. Coordinate public disclosure once a fix or mitigation is available.

## Security Updates

Security fixes will be published through the project's GitHub repository.

Users should keep their MCRS installations and dependencies up to date.

Security-relevant changes may be documented in release notes or GitHub Security Advisories.

## Disclaimer

MCRS is an open-source project currently under development.

It is not a certified fiscal cash register system. Users are responsible for evaluating the security and regulatory requirements of their deployment environment.

The absence of known vulnerabilities does not guarantee that MCRS is free of security issues.
