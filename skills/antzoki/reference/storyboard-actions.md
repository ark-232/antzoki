# Storyboard actions

A scene's `steps` are executed in order, then the recorder holds the scene until its narration finishes (plus an 800 ms tail). Cards (`"kind": "card"`) have no steps. Strings in any field support `${var}` interpolation from captured variables.

## Targeting an element
Targeted actions need exactly one locator field (more than one is an error):

| Field | Playwright equivalent |
|-------|------------------------|
| `testId` | `getByTestId(value)` (most stable, preferred) |
| `role` + `name` | `getByRole(role, { name })` |
| `text` | `getByText(value)` |
| `label` | `getByLabel(value)` |
| `placeholder` | `getByPlaceholder(value)` |
| `selector` | `locator(css)` (last resort) |
| `altText` | `getByAltText(value)` |

A `name`/`text`/`label` value that looks like a regex (`^build`, `apply|cancel`) becomes a case-insensitive RegExp. Modifiers on any targeted step: `nth` (zero-based index), `first: true`, `exact: true`, `timeout` (ms), and `optional: true` (skip silently if it fails or is absent).

## Actions

| `do` | Purpose | Key fields |
|------|---------|-----------|
| `goto` | Hard navigation | `url`, `waitUntil` |
| `softNav` | Navigation with a fade overlay (no white flash) | `url`, `waitUntil` |
| `reload` | Reload the page | `waitUntil` |
| `clearStorage` | Clear local and session storage | none |
| `click` | Click an element | locator |
| `fill` | Type into a field | locator, `value` |
| `check` / `uncheck` | Toggle a checkbox | locator |
| `hover` | Hover an element | locator |
| `press` | Press a key | `key` |
| `scroll` | Eased scroll of the page or an element | `ms`, `selector` |
| `wait` | Pause | `ms` |
| `waitFor` | Wait for an element state | locator, `state`, `timeout` |
| `expectVisible` | Assert an element is visible | locator, `timeout` |
| `waitForUrl` | Wait for a URL pattern, optionally capture its last path segment | `pattern`, `captureId`, `timeout` |
| `captureUrlId` | Store the current URL's last path segment | `var` |
| `captureHref` | Store an element's href | locator, `var` |
| `waitForResponse` | Wait for a network response, optionally capture JSON fields | `urlIncludes`, `captureJson` (map of var to json key), `timeout` |
| `generate` | Click a trigger, wait for an async result, capture its link. Retries. | `trigger`, `started`, `done` (locators), `captureHref`, `retries` |
| `showAsset` | Fetch a PDF or image, render a dark full-frame viewer, highlight, eased scroll | `href`/`url`, `id`, `highlightTop`, `holdMs`, `scrollMs`, `dpi` |

## Examples

```json
{ "do": "click", "role": "button", "name": "^new exercise$" }
{ "do": "waitForUrl", "pattern": "/[0-9a-f-]{30,}", "captureId": "id" }
{ "do": "softNav", "url": "/${id}/run/view" }
{ "do": "fill", "role": "textbox", "name": "search", "value": "hello" }
{ "do": "generate",
  "trigger": { "role": "button", "name": "^generate$" },
  "started": { "role": "button", "name": "^regenerate$" },
  "done":    { "role": "link",   "name": "open result" },
  "captureHref": "resultHref" }
{ "do": "showAsset", "href": "${resultHref}", "id": "report", "scrollMs": 13000 }
```
