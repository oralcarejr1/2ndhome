# AGENTS.md — 2ndhome

## Repository
- Repository: oralcarejr1/2ndhome
- Primary branch: main
- Deployment: Vercel (every push to `main` deploys production; pull requests get preview deployments)

## Collaboration rules
1. Read the latest repository state before editing.
2. For each request, create a short-lived branch from the latest `main` and open a pull request. Do not commit directly to `main`.
3. Preserve changes made by other collaborators.
4. Implement the user's requested changes.
5. Run relevant tests and build checks (`npm test`, `npm run build`) when available.
6. When CI and the Vercel preview pass, merge the pull request yourself (merge commit) and delete the branch if you can.
7. If CI, the preview, tests or a merge conflict fail, do not merge: leave the pull request open and explain the problem.
8. Never force-push or overwrite conflicting changes.
9. Never put home data (address, unit number, floor plan, measurements, backup files) in commits, pull request titles or bodies, or comments. Home data lives only on the password-protected server or in backup files.

## User experience
- Collaborators should only need to describe the changes they want in natural language.
- Handle Git operations (branch, pull request, merge) automatically when authorized.
- Keep responses concise and report whether the changes were merged, with the pull request link.
