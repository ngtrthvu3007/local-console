# local console

## How to reply

- Reply in Vietnamese. Keep English keywords as-is; translate Japanese text into Vietnamese.
- Answer only what was asked. No unrequested extra information.

## Start of every session

- Read [README.md](README.md): repo & stack, setup, commands, database, **traps & open issues** (section 5), tests.

## Before writing code

- Ticket vague, incomplete, or contradicting the docs → stop and ask. Never guess, never pick one reading and proceed.
- Run `/ponytail` to settle on the smallest correct change.

## Follow the design

- Read values via the Figma MCP tools; never eyeball a screenshot.
- Map values to existing design tokens / CSS variables.

## Follow the codebase

- Read the surrounding code first: naming, folder layout, patterns.
- Reuse existing helpers, types, components instead of adding new ones.
- Keep code and flow consistent with the rest of the repo.

## No hardcoding

- No magic numbers, strings, URLs, IDs, or paths inline in logic — put them in a constant / config / env named for their meaning.
- Limit type assertions.
- Limit fallbacks of 2 levels or more.

## Comments

- Short, in Vietnamese. Explain _why_, not what the code says.

## After writing code

- Run `/ponytail-review` on what was written.

## Never touch git, packages, or AWS

- **No git command that writes, ever — not even when asked.** No `commit`, `add`, `push`, `merge`, `rebase`, `checkout`, `switch`, `branch`, `stash`, `reset`, `tag`, `cherry-pick`, `gh pr create`, or MCP equivalent.
- Read-only is fine: `status`, `log`, `diff`, `show`, `branch --list`, `fetch`.
- The user drives git by hand: leave changes in the working tree, say what is ready, write commit messages / PR descriptions for them to paste.
- "Commit" / "push" in an instruction means "get it ready for me to do that" — say it's ready and stop.
- **Same for packages: never run an install / uninstall / update** (`npm install|add|update|uninstall`, `npx playwright install`, `uv add|sync`, `pip install`, `brew install`, …). Write the exact command for the user to run — with the org's release-age flag (`npm … --min-release-age=7`, `uv … --exclude-newer="1 week"`).
- **Same for AWS: never run any `aws` command yourself — not even read-only, not even when asked.** That covers scripts that call it (`config`, `rds`) and the Keychain entries `aws-cli/*` (`security …`). Write the exact command for the user to run, and read the output they paste back.
