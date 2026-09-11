---
name: fresher-go-fullstack-hunter
description: Hunt and apply to 100+ fresher/entry-level Golang and Fullstack jobs (Remote worldwide OR India On-site/Hybrid). Uses dual resumes, expanded scrapers, and AI scoring. Run directly instead of delegating to agent.
license: MIT
---

# Fresher Go + Fullstack Hunter — 100+ Applications Skill

This skill configures and **directly runs** the Job Agent (`apply/` project) to discover and queue/apply to **at least 100 fresher/entry-level jobs** matching:

- **Track A — Fullstack**: *ALL* Fullstack / Full Stack / MERN / MEAN / Next.js / React (Remote **OR** India On-site / Hybrid)
- **Track B — Golang**: *ANY* Golang / Go Developer / Go Backend (Remote worldwide **OR** India) — including GRPC, Go backend

Strictly **0–2 years, Fresher, Entry-Level, Junior** — no senior roles (filtered via AI + minimal blacklist, not false-positive substring).

Instead of the agent running autonomously, **you (the assistant/opencode runtime) execute the pipeline directly** (skill mode).

---

## Prerequisites

- Project root: `/home/subah/Downloads/Browser_Downloads/apply` (or current `apply/` dir)
- Two resumes present:
  - `Suryanshu_Resume_Go_Backend.pdf` (Go/GRPC)
  - `Suryanshu_Resume_Fullstack.pdf` (MERN/Next.js/React)
- `.env` populated (see Configuration below) and `ANTHROPIC_API_KEY` valid
- Python venv: `.venv/` with `anthropic, python-dotenv, requests, beautifulsoup4, lxml, playwright, pdfplumber, PyPDF2, reportlab, rich, click, schedule`

## Configuration (`.env`) — Fresh-er Tuned

The skill already wrote a fresher-optimized `.env`. If you need to recreate:

```env
DESIRED_ROLES="Golang,Fullstack,Full Stack,Go Developer,Golang Developer,Go Backend Engineer,Golang Backend Engineer,Fullstack Developer,Full Stack Developer,Fullstack Engineer,MERN Stack Developer,MEAN Stack Developer,Junior Golang Developer,Fresher Golang Developer,Entry Level Golang Developer,Junior Fullstack Developer,Fresher Fullstack Developer,Entry Level Fullstack Developer,Junior Software Engineer,Fresher Software Engineer,Entry Level Software Engineer,Backend Engineer Golang,Go Software Engineer,Next.js Developer,React Developer"
DESIRED_LOCATIONS="Remote,India,Remote Worldwide,Bengaluru,Bangalore,Hyderabad,Chennai,Mumbai,Delhi,Noida,Gurgaon,Gurugram,Pune,Kolkata,Ahmedabad,Chandigarh,Jaipur,Kochi,Indore,Hyderabad,Worldwide"
EXPERIENCE_LEVEL="Fresher,Entry-Level,Entry Level,Junior,0-1 years,0-2 years,0 years"
REMOTE_PREFERENCE="Remote,Hybrid,On-site"
SKILLS="Golang,Go,GRPC,gRPC,Next.js,Node.js,Svelte,PostgreSQL,Redis,Docker,Kubernetes,AWS,React,TypeScript,JavaScript,GraphQL,REST APIs,Express,MongoDB,HTML,CSS,Tailwind,Git,CI/CD,REST,GraphQL,HTTP,Convex,Stripe,React Native,Expo"
ENABLED_BOARDS="remotive,ycombinator,arbeitnow,themuse,linkedin,wellfound,indeed"
MAX_APPLICATIONS_PER_RUN=150
MIN_MATCH_SCORE=25
RESUME_PATH="./Suryanshu_Resume_Fullstack.pdf"
RESUME_GO_PATH="./Suryanshu_Resume_Go_Backend.pdf"
RESUME_FULLSTACK_PATH="./Suryanshu_Resume_Fullstack.pdf"
KEYWORD_BLACKLIST="unpaid,commission only,10+ years,8+ years,7+ years,6+ years,5+ years,5 years experience,4+ years experience,Principal,Director,Head of,Staff Engineer,Lead Principal"
# NOTE: Senior/Sr/Architect/Staff removed from blacklist — junior JDs say "work with senior engineers" and were falsely blocked (70% miss)
```

Key behaviors implemented by patches:

- **Scrapers expanded** (`agents/scrapers.py`): Remotive `roles[:8]`, TheMuse `[:6]`, LinkedIn `5 roles x 6 locations = 30 queries`, Indeed `6x6`, Wellfound `6`, YC `150` hits — enables 100+ discovery.
- **Matcher fixed** (`agents/matcher.py`): ambiguous keywords (`senior/sr/architect/staff`) only checked in TITLE, not description; title signals (`golang/fullstack/mern`) count as skill hit so AI is called.
- **Orchestrator dual-resume** (`agents/orchestrator.py`): loads both PDFs, selects per-job via `_resume_for_job()` (Go if title/desc contains golang/go backend/grpc, else Fullstack), scores and tailors with the matching resume, logs `[Go]`/`[Fullstack]`.

## How To Run (Skill Mode — You Execute, Not the Agent)

### 1) Validate config

```bash
cd /home/subah/Downloads/Browser_Downloads/apply
.venv/bin/python main.py check-config
# Or via script
.venv/bin/python -c "from utils.config import Config; print(Config().preferences.desired_roles[:5])"
```

### 2) Single run (scrape → AI score → tailor → queue)

```bash
cd /home/subah/Downloads/Browser_Downloads/apply
.venv/bin/python main.py run
```

This will:
1. Load both resumes (Go 2.9k chars + Fullstack 3.5k chars)
2. Scrape 7 boards with expanded coverage (expect 200–500 raw jobs)
3. Deduplicate to ~150–300 unique
4. AI-score each with Claude Sonnet 4 (per-job resume) — falls back to keyword score if API limited
5. Filter `MIN_MATCH_SCORE=25` (fresher-friendly) → expect 80–150 qualified
6. Queue up to `MAX_APPLICATIONS_PER_RUN=150` (writes tailored resume + cover letter to `applications/` and marks `queued` in `job_agent.db`)
7. Log run stats

### 3) Loop to 100+ (if first run <100 queued)

Check status:

```bash
.venv/bin/python main.py stats
.venv/bin/python main.py queue --limit 100
# SQLite direct:
.venv/bin/python -c "import sqlite3; conn=sqlite3.connect('job_agent.db'); print(conn.execute('SELECT status, COUNT(*) c FROM jobs GROUP BY status').fetchall())"
```

If `queued + applied < 100`, run again (optionally widen search):

```bash
# Re-run after 60s (respect rate limits)
.venv/bin/python main.py run
# Or schedule every 2h:
.venv/bin/python main.py schedule --hours 2
```

Patches support pagination so repeated runs will find new jobs (different HN thread pages, LinkedIn start offsets). Do **not** clear `job_agent.db` — deduplication via `job_id` prevents re-application.

### 4) Manual review & apply

```bash
ls applications/ | head
# Each queued job has: 20250831_company_title_resume.pdf + _cover_letter.txt/pdf
.venv/bin/python main.py queue --limit 20
# Open URLs manually, submit via link or email
```

If you want true auto-submit (`AUTO_APPLY=true` + Playwright), edit `.env` to `AUTO_APPLY=true` and `playwright install chromium`. Default `false` (queue) is safer.

## Direct Python Invocation (for skill automation)

```python
from agents.orchestrator import JobAgent
agent = JobAgent()
agent.run()  # runs full pipeline synchronously

from utils.database import Database
db = Database()
print(db.stats())  # {'total':..., 'queued':..., 'applied':..., 'found':...}
print(f"Queued: {len(db.get_queued_jobs(200))}")
```

Run this snippet via `.venv/bin/python` — **not** via an intermediate agent process.

## Troubleshooting

- **Only ~50 jobs found**: confirm `ENABLED_BOARDS` includes `linkedin,indeed` and scrapers are patched (check `agents/scrapers.py` has `roles[:5]` / `roles[:8]`).
- **All scores 0 or 15**: check `KEYWORD_BLACKLIST` does not contain `Senior` alone; check `matcher.py` has ambiguous-title fix; lower `MIN_MATCH_SCORE` to `20`.
- **LinkedIn 0 jobs**: guest API rate-limited — wait 10 min or run `remotive`+`arbeitnow`+`themuse` alone; they provide 100+ remote.
- **Anthropic 429**: matcher falls back to ` _keyword_score` (hits*8 + roles*10). Still yields 100+ if MIN_SCORE low.
- **Resumes not found**: ensure `RESUME_GO_PATH` and `RESUME_FULLSTACK_PATH` are absolute or `./` relative to `apply/`.

## Expected Outcome

After 1–2 runs:

- `python main.py stats` → `queued >= 100` (or `queued+applied >=100`)
- `applications/` contains 100+ tailored `*_resume.pdf` + `*_cover_letter.txt`
- `job_agent.db` → `SELECT COUNT(*) FROM jobs WHERE status='queued'` ≥ 100

## Safety

- No hard `apply` without review unless `AUTO_APPLY=true`
- `.env` never committed; API key stays local
- Duplicate protection via `job_id` hash (`board:company:title`)

---

**To invoke this skill in OpenCode:** `/skill fresher-go-fullstack-hunter` or mention "run fresher go fullstack hunter". The assistant should execute the steps above directly.
