# pilates_mcp

`pilates_mcp` is a local-first MCP server for Pilates center promotional posters. It creates editable HTML/CSS poster sources, stores them in a local archive, searches and reuses past posters, records design feedback, and can render PNG/PDF artifacts with headless Chromium.

Phase 1 deliberately does not store member names, phone numbers, schedules, health data, payment data, or other member personal information.

## Project Structure

This repository was empty at implementation time, so the server is implemented as a TypeScript + Node.js MCP server.

```text
src/
  server.ts        MCP stdio JSON-RPC transport and tool dispatch
  service.ts       poster workflow orchestration
  repository.ts    local poster archive search/read/write
  renderer.ts      Playwright PNG/PDF renderer
  templates.ts     HTML/CSS template layer
  feedback.ts      design feedback storage
  profile.ts       center profile storage
  themes.ts        design token presets
  types.ts         domain types
data/
  posters/YYYY/<poster-id>/
    poster.html
    poster.css
    metadata.json
    content.json
    preview.png    optional
    poster.pdf     optional
    revisions/     update backups
  feedback/
    global.json
    table.json
    standard.json
    poster-<poster-id>.json
  config/
    center-profile.json
```

## Install

```bash
npm install
npx playwright install chromium
```

## Development

```bash
npm run build
npm test
npm run dev
```

`PILATES_MCP_DATA_DIR` can point the archive to another local data directory. If unset, the server uses `./data`.

## MCP Client Connection

Use the built server as a stdio MCP command:

```json
{
  "mcpServers": {
    "pilates_mcp": {
      "command": "node",
      "args": ["G:/pilates_mcp/dist/src/server.js"],
      "env": {
        "PILATES_MCP_DATA_DIR": "G:/pilates_mcp/data"
      }
    }
  }
}
```

## Tools

- `get_center_profile`
- `update_center_profile`
- `search_posters`
- `get_poster`
- `create_poster`
- `update_poster`
- `reuse_poster_template`
- `import_poster`
- `render_poster`
- `add_design_feedback`
- `get_design_feedback`
- `recommend_poster_style`

## Poster Creation Flow

`create_poster` reads the center profile, applies center defaults, validates the `PosterBrief`, gathers relevant feedback, resolves the layout and theme, renders static HTML/CSS, writes metadata/content/source files, and optionally renders PNG/PDF.

The required order is:

```text
user request
-> center profile defaults
-> PosterBrief
-> validation
-> ask only missing questions
-> past posters and feedback
-> HTML/CSS
-> optional render
-> archive save
```

Required poster brief decisions are validated before generation:

- `eventName`
- `programSeparation`
- `tablePreference`
- `tableStyle` when a table is required or provided
- `vatPolicy` when price content exists

The server returns `valid: false`, `missing`, and Korean `questions` instead of guessing missing event names, VAT policy, or program separation.

`programSeparation` and `tableStyle` are separate decisions. For example, group/private products can use `programSeparation: "table"` with `tableStyle: "split"` to render separate GROUP/PRIVATE table blocks. `tablePreference` represents user intent; `layout` is the final renderer choice.

Center defaults can reduce repeated questions:

```json
{
  "posterDefaults": {
    "programSeparation": "table",
    "tablePreference": "required",
    "tableStyle": "split",
    "vatPolicy": "excluded"
  }
}
```

Priority is: current request and `PosterBrief`, then center profile defaults, then a validation response asking the user for only missing values. VAT is never inferred.

## Examples

### 8월 회원권 가격표 포스터 생성

```json
{
  "title": "8월 회원권 이벤트",
  "purpose": "event",
  "brief": {
    "eventName": "8월 회원권 이벤트",
    "programCategories": ["private", "duet"],
    "programSeparation": "table",
    "tablePreference": "required",
    "tableStyle": "comparison",
    "vatPolicy": "excluded"
  },
  "content": {
    "subtitle": "이번 달 특별 혜택",
    "badge": "8월 EVENT",
    "table": {
      "columns": ["상품", "정상가", "이벤트가"],
      "rows": [
        ["1:1 개인레슨 10회", "800,000원", "650,000원"],
        ["듀엣레슨 10회", "500,000원", "390,000원"]
      ],
      "highlightColumn": 2
    },
    "footer": "선착순 마감"
  },
  "style": "premium",
  "render": { "png": true, "pdf": true, "size": "instagram-portrait" }
}
```

### 작년 9월 포스터 틀 재사용

```json
{
  "sourcePosterId": "poster_20250901_ab12cd34",
  "title": "2026년 9월 신규회원 이벤트",
  "brief": {
    "eventName": "9월 신규회원 이벤트",
    "vatPolicy": "excluded"
  },
  "content": {
    "subtitle": "올해 가격으로 업데이트",
    "table": {
      "columns": ["상품", "정상가", "이벤트가"],
      "rows": [["1:1 개인레슨 10회", "820,000원", "670,000원"]],
      "highlightColumn": 2
    }
  }
}
```

### 최근 1년 기록 기반 스타일 추천

```json
{
  "purpose": "event",
  "month": 9,
  "recentMonths": 12
}
```

## Feedback

Feedback is stored in JSON files, not hard-coded. `create_poster` retrieves active global and layout-scoped feedback and includes it in the result as `appliedFeedback`.

Example:

```json
{
  "scope": "table",
  "text": "이벤트가는 정상가보다 확실히 강조."
}
```

## Rendering

`render_poster` uses Playwright Chromium with JavaScript disabled. Supported sizes:

- `instagram-portrait`: 1080 x 1350
- `instagram-square`: 1080 x 1080
- `story`: 1080 x 1920
- `a4-portrait`: A4 portrait

HTML/CSS are the source of truth. PNG/PDF are optional rendered artifacts.

## Security And Privacy

The archive uses generated poster IDs and validates poster IDs before file access. Archive-relative imports are checked to block `../` traversal and root escape. Generated poster HTML is static, user text is HTML-escaped, and remote scripts are not part of the template. Rendering disables JavaScript.

Phase 1 excludes member management, reservations, payments, SMS, Instagram posting, StudioMate integration, external design scraping, image generation AI, cloud DB requirements, and SaaS authentication.

## Extension Points

The service/repository split keeps room for future semantic search or another index. External design references can be added later behind a provider interface such as:

```ts
interface DesignReferenceProvider {
  search(query: string): Promise<DesignReference[]>;
}
```

Phase 1 does not implement scraping or copying external templates.
