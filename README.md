# AI-Agent-Auditor

[![CI](https://img.shields.io/github/actions/workflow/status/Ramlols2604/AI-Agent-Auditor/ci.yml?branch=main&label=CI)](https://github.com/Ramlols2604/AI-Agent-Auditor/actions)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.1+-009688?logo=fastapi&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

AI-Agent-Auditor is a full-stack observability and compliance platform for LLM-powered applications. It captures agent activity, runs audit evaluations, and provides a dashboard to investigate and resolve risk signals.

## Introduction

As teams move AI agents from prototype to production, governance and traceability become non-negotiable. AI-Agent-Auditor addresses this by combining:

- a FastAPI backend for session/event capture and audit workflows
- a React dashboard for operational visibility
- a flag lifecycle to move from detection to resolution

## Features

- Session and event telemetry capture with persistent storage
- Audit generation with deterministic scoring and severity-based flag creation
- Flag management workflow (list, investigate, resolve)
- Real-time-ready monitoring primitives (SSE stream endpoint)
- Operator dashboard for sessions, events, flags, and report summaries

## Why This Project

- Demonstrates production-minded AI system design (observability + compliance)
- Bridges backend reliability with frontend operability
- Provides a practical foundation for AI governance features in real deployments

## Impact

- Reduces manual debugging effort by centralizing session and event traces.
- Improves operational response with a clear audit -> flag -> resolve workflow.
- Increases release confidence via automated backend tests and CI validation.

## Architecture Overview

```text
LLM App / SDK Wrapper / Middleware
              |
              v
        FastAPI Backend
   (sessions, events, audit, flags, report)
              |
              v
            SQLite
              ^
              |
      React + Vite Dashboard
```

## Screenshots / Demo

_Add screenshots or a short demo GIF here._

- `docs/screenshots/dashboard-overview.png`
- `docs/screenshots/session-detail.png`
- `docs/screenshots/flags-resolve-flow.png`

_Optional: Add a Loom/YouTube walkthrough link._

## Installation

### 1) Clone the repository

```bash
git clone https://github.com/Ramlols2604/AI-Agent-Auditor.git
cd AI-Agent-Auditor
```

### 2) Install backend dependencies

```bash
cd backend
PYENV_VERSION=3.10.14 python -m pip install -r requirements.txt
```

### 3) Install frontend dependencies

```bash
cd ../frontend
npm install
```

## Usage

### Quick start (2 terminals)

Terminal 1:

```bash
cd backend
PYENV_VERSION=3.10.14 python -m uvicorn main:app --reload
```

Terminal 2:

```bash
cd frontend
npm run dev
```

### Run backend API

```bash
cd backend
PYENV_VERSION=3.10.14 python -m uvicorn main:app --reload
```

Backend runs at `http://127.0.0.1:8000`.

### Run frontend dashboard

```bash
cd frontend
npm run dev
```

Frontend runs at `http://127.0.0.1:5173`.

Optional API base override:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### Example API flow

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/sessions
```

### Build frontend

```bash
cd frontend
npm run build
```

## Technologies Used

- **Backend:** Python, FastAPI, Pydantic, SQLite
- **Frontend:** React, Vite, JavaScript, CSS
- **Quality/DevOps:** Pytest, HTTPX, GitHub Actions
- **Protocols:** REST + SSE

## Roadmap

- Pluggable audit models beyond heuristic scoring
- Rich report export pipeline (PDF/CSV + artifact storage)
- Role-based access controls and team-level governance views

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes, then submit a pull request with clear scope, test coverage, and update notes.

_Placeholder: Add `CONTRIBUTING.md` guidelines for branching, commit standards, and review process._

## License

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
