---
name: bun
description: 'Helps use Bun runtime, package manager, and APIs to their fullest potential. Use when working with Bun projects, Bun-specific APIs, or needing Bun best practices.'
---

# Bun Skill

This skill provides guidance for using [Bun](https://bun.com/) - a fast all-in-one JavaScript runtime, bundler, transpiler, and package manager.

## Getting Up-to-Date Information

Bun evolves rapidly. To ensure you have the latest and most accurate information:

1. **First**, fetch the main LLM documentation using the #fetch tool from `https://bun.com/llms.txt`

2. **Then**, based on the specific topic needed, fetch additional documentation from the URLs provided in `llms.txt`. Common areas include:
   - Runtime APIs
   - Package management
   - Bundler configuration
   - Test runner
   - HTTP server (`Bun.serve()`)
   - File I/O (`Bun.file()`, `Bun.write()`)
   - SQLite support
   - Shell scripting

## When to Use This Skill

- Setting up a new Bun project
- Migrating from Node.js to Bun
- Using Bun-specific APIs (e.g., `Bun.serve()`, `Bun.file()`, `Bun.write()`)
- Optimizing performance with Bun features
- Configuring `bunfig.toml`
- Using Bun's built-in test runner
- Working with Bun's native SQLite support

## Workflow

1. Identify the Bun feature or API needed
2. Fetch `https://bun.com/llms.txt` to get the documentation index
3. Fetch specific documentation pages based on the task
4. Apply the latest patterns and APIs from the documentation

## Example Usage

When a user asks about Bun HTTP servers:
1. Fetch `https://bun.com/llms.txt`
2. Find the relevant HTTP/server documentation URL
3. Fetch that specific documentation
4. Provide guidance based on current Bun APIs