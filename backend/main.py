# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.sessions import router as sessions_router
from api.stream import router as stream_router
from api.health import router as health_router
from api.flags import router as flags_router
from api.audit import router as audit_router
from sdk.middleware import AuditCaptureMiddleware

app = FastAPI(
    title="AI Agent Auditor API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(sessions_router)
app.include_router(stream_router)
app.include_router(flags_router)
app.include_router(audit_router)

app.add_middleware(
    AuditCaptureMiddleware,
    auditor_url="http://127.0.0.1:8000",
)