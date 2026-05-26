---
description: Produce a narrated 4K demo video of a web app (analyze, interview, record, narrate, composite).
argument-hint: "[url-or-path] [project-name]"
---
Create a narrated demo video using the **antzoki** skill.

- Target (a running URL or a codebase path): $1
- Project name: $2

Follow the antzoki skill workflow end to end: analyze the target with the `demo-analyzer` agent, interview me for the story and branding, draft and refine `demo.json`, dry-run with the local voice until clean, then render the final 4K video and open it for review.

If the target ($1) is empty, ask me for it before doing anything else. Confirm the app is running and reachable first.
