# AI-Agent-Auditor

Real-time monitoring and auditing platform for LLM agents: capture sessions, detect anomalies, score compliance, and stream audit insights.

## Backend

```bash
cd backend
PYENV_VERSION=3.10.14 python -m pip install -r requirements.txt
PYENV_VERSION=3.10.14 python -m uvicorn main:app --reload
```

Backend API runs at `http://127.0.0.1:8000`.

## Frontend Dashboard

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://127.0.0.1:5173` and expects the backend at `http://127.0.0.1:8000`.

To override API base URL, set:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Frontend Build

```bash
cd frontend
npm run build
```
