
# AGENTS - .NET Best Practices for this Repository

This document outlines recommended conventions and practices for building and maintaining .NET projects in this repository, targeting .NET 10 and using Central Package Management (Directory.Packages.props). It focuses on maintainability, security, CI/CD, dependency management, and performance.

use `dotnet add` for adding package/project references.

## 1. Target platform

- Use .NET 10 (TargetFramework `net10.0`) for all applications and libraries unless there is a strong backward-compatibility reason.

## 2. Centralized package management

- Use Central Package Management by adding a `Directory.Packages.props` at repository root and setting `ManagePackageVersionsCentrally` to `true`.

- Declare all shared package versions in this file, including test libs and build tools (xUnit, Moq, FluentAssertions, Serilog, YoutubeExplode, Polly).

- Use `PackageReference` in project files without version attributes; use `VersionOverride` only when absolutely necessary.

- Consider `GlobalPackageReference` for repository-wide development-only packages (e.g., Nerdbank.GitVersioning).

- If multiple Directory.Packages.props files exist, be mindful of the nearest-file import semantics and import parent files explicitly when needed.

## 3. Project layout and solutions

- Organize projects into meaningful layers: YouTubeCatalog.Api (backend), YouTubeCatalog.Core (domain & services), YouTubeCatalog.UI (Blazor Server or Wasm), YouTubeCatalog.Tests (unit/integration).

- Keep projects small and focused with single responsibility per library.

- Use solution folders to group related projects and keep the repo navigable.

## 4. Dependency and SDK management

- Use SDK-style projects and minimal PackageReference entries; rely on Directory.Packages.props for versions.

- Lock SDK versions by using global.json at repo root to ensure consistent SDK across CI and developers.

- Enable deterministic builds by setting appropriate MSBuild properties (Deterministic, ContinuousIntegrationBuild).

## 5. Build and CI

- Use GitHub Actions to build, test, and publish artifacts. Workflow should target the .NET 10 SDK used by developers.

- Fail fast on restore/build errors. Run unit tests and report code coverage.

- Use caching for NuGet packages in workflows to speed up CI.

- Add a PR checklist and CI gating (build + tests) to prevent regressions.

## 6. Coding standards & analyzers

- Enable Roslyn analyzers and .editorconfig with rules consistent with .NET Foundation recommendations.

- Include code-style analyzers in Directory.Packages.props and enable in projects: Microsoft.CodeAnalysis.NetAnalyzers.

- Treat warnings as errors in CI; allow developers to relax locally with documented guidance.

## 7. Configuration

- Use options pattern (IOptions<T>) for typed configuration bound from appsettings.json and environment-specific files.

- Validate options at startup with ValidateOnStart and fail fast if mandatory configuration is missing.

## 8. Caching strategy

- Prefer IMemoryCache for single-instance deployments and Redis (StackExchange.Redis) for distributed caches.

- Centralize cache key patterns and TTLs in configuration.

- Cache per-channel results (as in PRD) and avoid caching sensitive data.

## 9. Resilience & retry policies

- Use Polly for retry and circuit-breaker policies when calling external services (YoutubeExplode or other HTTP-based services).

- Implement exponential backoff with jitter and a circuit breaker to avoid repeated failures.

## 10. Performance & concurrency

- Limit concurrency when fetching many channels to avoid resource exhaustion (SemaphoreSlim or TPL Dataflow). Tune via configuration.

- Batch requests where possible. Reduce serialization costs by using System.Text.Json with optimized settings.

## 11. Testing

- Unit tests: xUnit with Moq or NSubstitute; keep tests deterministic and fast.

- Integration tests: use TestServer or WebApplicationFactory for API testing; mock external calls or record/playback fixtures for YoutubeExplode.

- UI tests: bUnit for Blazor components and Playwright for E2E flows if needed.

## 12. Security

- Validate and sanitize inputs (channel IDs, search queries) to avoid injection in logs and storage.

- Apply rate-limiting and input bounds (max X, max Y) to protect backend.

- Run dependency scanning and address vulnerabilities promptly.

## 14. Documentation & Onboarding

- Keep README with clear setup steps, how to run locally, run tests, and contribute.

- Provide a Developer Setup guide: required SDK, global.json, dotnet tool installations, and common troubleshooting.

## 15. Release & Versioning

- Use semantic versioning for libraries. Consider GitVersion or Nerdbank.GitVersioning for automated versioning.

- Publish artifacts when releases are created; tag releases with changelogs.

## 16. Additional recommendations from Microsoft Learn

- Adopt Central Package Management and global.json as mentioned in MS Learn guidance.

- Consider `CentralPackageTransitivePinningEnabled` if transitive pinning is needed across frameworks.

- Use `Directory.Packages.props` for GlobalPackageReference scenarios for repo-wide dev-only packages.

---

Last updated: 2026-01-31


