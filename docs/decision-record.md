# PM Tool Evaluation for Hybrid Hardware-Software Teams

## Decision Record — February 2026

---

## Context and Requirements

We manage small teams (5-10 people) working on projects that combine electrical design (Altium, KiCad), mechanical CAD (SolidWorks), and software. The PM/lead engineer role doubles as core technical contributor (primary PCB and software person) and has ADHD, making context-switching between tools genuinely expensive — inline CAD previews in the PM tool aren't a nice-to-have, they're a workflow accessibility need.

### Hard Requirements

- **NDA firewalling** between projects (Secret/Private project visibility)
- **Self-hosted** (academic institution budget; cloud SaaS costs are awkward to expense)
- **Inline hardware artifact previews** (schematics, PCB layouts, mechanical renders visible directly in issues without opening external tools)
- **Good software git integration** (not all projects are software-primary, but integration quality matters when it is)
- **Custom metadata for hardware** (PCB revision, part numbers, BOM references, mechanical assembly tracking)
- **Unified visibility** across electrical, mechanical, and software domains in one tool

### Nice-to-haves

- AI integration (flexible provider choice, not locked to one vendor)
- Linear-quality UX (keyboard-first, clean, fast)
- Extensible for future needs we haven't identified yet

---

## Options Evaluated

### Path 1: Linear + Duro PLM + Sidecar Services

**The commercial "just pay for it" option.**

Linear's GraphQL API is comprehensive for automation — external services can create issues, post Markdown comments with embedded images, and attach structured link cards. Webhooks cover every major entity. The agent system lets OAuth apps respond to @mentions.

But Linear's UI is a sealed box. Embed formats (Mermaid, Figma, YouTube, Loom, Descript) are a hardcoded, non-extensible set. No custom fields, no custom blocks, no iframe extensions, no plugin system. Hardware artifacts would always be second-class citizens living in comments and link cards, never native objects.

Duro PLM ($9,000/year) has a native Linear integration that auto-creates tickets from Engineering Change Orders with bidirectional status sync. It handles BOMs, change orders, and CAD versioning with SolidWorks and Altium 365 add-ins.

**Cost**: ~$140/mo Linear Business (10 seats, minimum tier for private teams) + ~$750/mo Duro = **$890/month**.

**Rejected**: Cost is prohibitive for an academic institution. ~$10,700/year for tooling that still treats hardware artifacts as second-class citizens. The sealed UI means we'll always be fighting the tool rather than extending it.

### Path 2: Huly Self-Hosted

**The "everything free, unlimited users" option with the deepest theoretical extensibility.**

Huly's UX is the closest to Linear among open-source alternatives. It's an all-in-one platform (PM + real-time chat + docs + video calls). Unlimited users on all tiers including free self-hosted. Private projects built in. No feature restrictions.

The plugin architecture is theoretically powerful — TraceX (a full QMS product) is built on it, proving specialized domain applications can be constructed. Custom issue types, fields, and views could all be implemented as platform plugins with native UI rendering.

**But the extensibility story fell apart under scrutiny:**

- **No webhook system.** The API is self-described as "basic" with exactly two examples (list issues, create issue). No documented way to react to events from outside the platform.
- **Plugin development requires working inside the platform monorepo** with Rush build tooling and a custom reactive framework (TypeScript/Svelte). Sparse documentation. Not "install a package and register a plugin" — it's "clone the platform repo and build a new module alongside their existing ones."
- **Infrastructure complexity**: CockroachDB, Redpanda (Kafka-compatible), Elasticsearch, MinIO, nginx, plus 5+ application services. The v6 to v7 migration changed database engines (MongoDB to CockroachDB). Community docs note configs "might not be production-ready."
- **AI locked to OpenAI only.** No provider flexibility.

For the preview pipeline specifically, the API client can push rendered images into issues, but without webhooks Huly is a dumb recipient — all intelligence lives in the CI/git side. This works, but limits future integration depth.

**Rejected as primary tool**: Too much infrastructure complexity, too little extensibility payoff for the investment. The plugin architecture is a trap — high theoretical ceiling, but the floor is undocumented and the walls are bespoke. Remains viable as a "use as-is, don't extend" option if Plane doesn't work out.

*Side note: Huly is developed by "Hardcore Engineering" and the name is phonetically equivalent to "Hooli" from Silicon Valley. Once you hear it, you can't unhear it.*

### Path 3: Plane Community Edition (Fork)

**The "conventional stack, build what you need" option. This is our choice.**

Plane CE is AGPL-3.0, Django 4.2 + DRF backend, Next.js frontend, PostgreSQL 15, Redis (Valkey), RabbitMQ, Celery, MinIO. Bog-standard modern web app architecture. The codebase is a pnpm monorepo with Turborepo, MobX for frontend state.

#### What's genuinely good in CE (free, no restrictions)

- Issues, cycles, modules, pages, kanban/list/gantt/calendar views, basic analytics
- **Secret projects** (NDA firewalling works out of the box)
- Workspace-level role-based permissions (4 pre-defined roles)
- No user limits, no issue limits
- Webhooks with HMAC signing, event filtering, and full request/response logging
- AI integration backend that **already supports Anthropic, OpenAI, and Gemini** via a provider abstraction (env vars: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`). The admin UI only shows OpenAI fields, but the backend routing works for all three. Swapping in a custom LLM backend (Ollama, Letta, custom Rust service via PyO3) is a one-function change.
- Editor AI features ("Ask Pi") work in CE with any configured provider
- Docker Compose deployment, 2 CPU / 4GB RAM minimum, straightforward ops

#### What's paywalled (Commercial Edition, closed source, separate codebase)

- Custom Work Item Types and Custom Properties
- GitHub/GitLab integrations (bidirectional sync)
- Integrations marketplace
- Time tracking, dashboards, teamspaces
- Granular RBAC (Business tier, $13/seat)

#### The CE/Commercial split architecture

This is the key insight that makes forking viable. The split is implemented via a **TypeScript path alias**:

```
// apps/web/tsconfig.json
"@/plane-web/*": ["./ce/*"]
```

All feature-gated code imports from `@/plane-web/whatever`. In the open-source repo, this resolves to `./ce/*` which contains **stub components with correct prop interfaces but empty renders**. The commercial edition swaps in a parallel directory (likely `./ee/`) with full implementations.

The `core/` directory is the shared foundation — everything that works identically in both editions. `ce/` is just a thin layer of feature boundaries. This means:

- Our changes live in a renamed `hw/` directory (or we keep `ce/` and modify in place)
- We never touch `core/`
- Upstream updates to `core/` can be pulled in with minimal conflict
- The merge surface is narrow and predictable

#### What we need to build (and why it's tractable)

The `IssueType` model already exists in the CE database schema. There are zero API endpoints for it — no serializers, no views, no URL routes. The table gets created by migrations, but nothing exposes it over HTTP.

For custom properties (field definitions and values), there's no model at all in the CE codebase.

All the frontend extension points are already wired into `core/` — the components just render nothing. We fill in the stubs. See the companion technical document for the full implementation plan.

**Cost**: $0. Ongoing maintenance cost is periodic rebasing onto upstream releases (quarterly is fine). The `ce/` directory pattern means our changes are concentrated where upstream barely touches.

### Other Tools Considered (Brief)

- **Jira**: Richest hardware/PLM integration ecosystem, but UX is rated 3.2/5 vs Linear's 4.6/5. Step backward for teams that value Linear's design philosophy.
- **monday.com / Asana**: Flexible enough to model hardware workflows via custom boards, but no developer-centric features (keyboard-first, git depth) and no CAD/PLM integrations.
- **Taiga**: Closest to "Linear feel" in traditional open-source space, but lacks CAD integration capabilities.
- **OpenProject**: Good Gantt-chart waterfall workflows (common in hardware), but dated enterprise UI.
- **Leantime**: Interesting neurodiversity-focused UX (designed for ADHD/dyslexic users), but PHP stack with scaling concerns and limited integrations.

No PLM tool can serve as the primary PM system. Arena PLM, Duro, Aligni, Windchill, and Teamcenter all lack modern issue tracking and developer workflow integration. **The correct pattern is always PM + PLM, bridged via API**, but for our team size and budget, a lightweight PLM approach (git-based versioning + CI rendering) is more appropriate than a dedicated PLM product.

---

## Key Tradeoffs Accepted

### We're building features from scratch, not unlocking them

The custom fields and issue types in Plane's Commercial Edition are closed source. We're not uncommenting a paywall check — we're implementing a JSONB property system, serializers, views, and frontend components. The estimate is 5-7 days of focused work. This is real Django/React development, not configuration.

### Git integration needs to be built ourselves

Plane CE doesn't include the GitHub/GitLab bidirectional sync. We need our own webhook receiver for git events. The upside is this is well-trodden territory (Django + GitHub webhooks = thousands of existing examples) and we can tailor it to hardware file commits specifically rather than using a generic integration.

### We own the infrastructure

Docker Compose on a modest server. Postgres backups, Redis, MinIO storage. For an academic team with server access, this is manageable. The deployment is significantly simpler than Huly's multi-database stack.

### Fork maintenance is a real cost

Even with the clean `ce/` separation, Django migration conflicts will occasionally require `makemigrations --merge`. Security patches in upstream need to be pulled. The recommendation is to rebase onto tagged releases quarterly, and hard-fork only if that becomes genuinely painful — at which point we'd have concrete evidence of where incompatibilities are.

---

## CAD Preview Pipeline (Tool-Agnostic)

The inline preview problem is mostly orthogonal to PM tool choice. Any tool supporting markdown images via API works. The pipeline is:

### KiCad (Best Automation Story)

`kicad-cli` + KiBot render schematics and PCB layouts to SVG/PNG in CI. Tools in the ecosystem: KiRI (visual diff under git), CADLAB.io (web-based visual version control), AllSpice.io (git-native platform with visual diffs, built on Gitea, supports both Altium and KiCad).

**Pipeline**: Commit KiCad files → CI extracts issue IDs from commit messages → KiBot generates renders → API posts comment with embedded images + link to full viewer.

### Altium

Altium 365 provides shareable web viewer URLs. No headless rendering without a license. Integration is link cards and manual export, not automated rendering. For projects using Altium 365 already, the viewer URLs work well as embedded links.

### SolidWorks (Hardest Problem)

Binary blobs, no meaningful git diffing, no headless rendering. Best automation path: STEP/STL export → web viewer (three.js, 3DViewer.net, Autodesk Viewer). eDrawings can export to WebHTML but isn't automatable in CI without Windows + SolidWorks.

Realistically, SolidWorks previews are "someone exports a screenshot or STEP, the pipeline attaches it" rather than fully automated. This is a workflow discipline problem, not a tooling problem.

---

## Rollout Plan

1. **Deploy Plane CE** for a new shorter-timeline KiCad + SolidWorks project (team member interested in self-hosting)
2. **Build the KiCad preview pipeline** (KiBot + GitHub Actions + Plane webhook/API integration) — this is the highest-value automation and validates the approach
3. **Implement issue types and custom properties** in the fork — the 5-7 day focused work block
4. **Evaluate after the trial project** whether to migrate the existing larger Altium + SolidWorks project at its next natural stage boundary
5. **AI integration** refinements as needed (update provider model lists, add admin UI for provider selection, explore custom backend integration)

Note: The KiCad project will have a smoother preview experience than the Altium project. This is somewhat misleading about how well the setup works for the primary (Altium) project — keep expectations calibrated.

---

## Decision

**Fork Plane CE. Build issue types, custom properties, and the CAD preview pipeline. Keep upstream rebasing viable for as long as possible. Evaluate quarterly.**

The conventional Django + Next.js stack means we're never blocked by framework arcana. The `ce/` directory pattern gives us a clean separation between our changes and upstream core. The AI backend already works with multiple providers. The cost is $0 plus our time.

If it doesn't work out, the fallback is Huly as-is (no modifications, just use it and accept API limitations) or — if we've learned enough about what we actually need — building something purpose-built. But the Plane fork is the pragmatic starting point that gets a team using a real PM tool fastest.
