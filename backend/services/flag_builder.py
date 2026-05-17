"""Build flag records from committee agent results."""

from __future__ import annotations

from typing import Any

from services import repository

AGENT_ORDER = ("hallucination", "safety", "cost", "compliance")

THRESHOLDS: dict[str, float] = {
    "hallucination": 70,
    "safety": 80,
    "cost": 60,
    "compliance": 75,
}

DEFAULT_RESOLUTION_STEPS: dict[str, list[str]] = {
    "hallucination": [
        "Add a fact-checking layer before the agent responds.",
        "Implement RAG to ground responses in verified sources.",
        "Add explicit uncertainty language to the system prompt.",
        "Test with TruthfulQA benchmark after fixing.",
    ],
    "safety": [
        "Update the system prompt with explicit refusal instructions.",
        "Add input validation to block the triggering pattern.",
        "Implement output filtering before responses reach users.",
        "Re-run safety evaluation on 100 similar prompts.",
    ],
    "cost": [
        "Identify the prompt causing token bloat.",
        "Implement token budgets in the system prompt.",
        "Add response length limits via max_tokens parameter.",
        "Check for prompt injection causing verbose responses.",
    ],
    "compliance": [
        "Add transparency disclosure to agent responses.",
        "Implement human-in-the-loop for high-stakes decisions.",
        "Document the data sources used for this agent type.",
        "Submit updated system prompt for EU AI Act Article 9 review.",
    ],
}

EU_ARTICLES: dict[str, str] = {
    "hallucination": "Article 10 — Data governance",
    "safety": "Article 13 — Transparency",
    "cost": "Article 15 — Accuracy",
    "compliance": "Article 9 — Risk management",
}


def severity_from_score(score: float) -> str:
    if score < 50:
        return "critical"
    if score < 70:
        return "high"
    if score < 85:
        return "medium"
    return "low"


def verdict_from_score(score: float) -> str:
    if score >= 85:
        return "SAFE"
    if score >= 70:
        return "FLAGGED"
    return "CRITICAL"


def flag_description_from_agent(agent_type: str, agent_result: dict[str, Any]) -> str:
    findings = agent_result.get("findings")
    first_finding = None
    if isinstance(findings, list) and findings:
        first_finding = findings[0]
    return (
        agent_result.get("summary")
        or agent_result.get("claim")
        or first_finding
        or f"{agent_type} agent flagged this session"
    )


def agent_verdict_payload(agent_result: dict[str, Any]) -> dict[str, Any]:
    return {
        "score": agent_result.get("score"),
        "findings": agent_result.get("findings", []),
        "resolution_steps": agent_result.get("resolution_steps", []),
        "eu_ai_act_article": agent_result.get("eu_ai_act_article"),
        "estimated_fix_time": agent_result.get("estimated_fix_time"),
        "severity": agent_result.get("severity"),
        "verdict": agent_result.get("verdict"),
        "summary": agent_result.get("summary"),
        "risk_level": agent_result.get("risk_level"),
        "agent_type": agent_result.get("agent_type"),
    }


def agent_should_flag(agent_type: str, agent_result: dict[str, Any]) -> bool:
    score = float(agent_result.get("score", 100))
    threshold = THRESHOLDS.get(agent_type, 70)
    if score < threshold:
        return True
    severity = str(agent_result.get("severity", "none")).lower()
    verdict = str(agent_result.get("verdict", "SAFE")).upper()
    if severity not in {"", "none", "low"}:
        return True
    return verdict in {"FLAGGED", "CRITICAL"}


def create_flags_from_audit(session_id: str, result: dict[str, Any]) -> list[str]:
    """Create one flag per committee agent that flagged the session."""
    events = repository.list_events_for_session(session_id)
    latest_event_id = events[-1]["id"] if events else "no-event"
    agent_results: dict[str, Any] = result.get("agent_results") or {}

    flag_ids: list[str] = []
    for agent_type in AGENT_ORDER:
        agent_result = agent_results.get(agent_type)
        if not isinstance(agent_result, dict):
            continue
        if not agent_should_flag(agent_type, agent_result):
            continue

        severity = str(agent_result.get("severity") or severity_from_score(float(agent_result.get("score", 0))))
        if severity == "none":
            severity = severity_from_score(float(agent_result.get("score", 0)))

        flag = repository.create_flag(
            event_id=latest_event_id,
            session_id=session_id,
            flag_type=agent_type,
            severity=severity,
            description=flag_description_from_agent(agent_type, agent_result),
            agent_verdict=agent_verdict_payload(agent_result),
        )
        flag_ids.append(flag["id"])

    if not flag_ids and str(result.get("verdict", "SAFE")).upper() != "SAFE" and agent_results:
        worst_type = min(
            AGENT_ORDER,
            key=lambda name: float((agent_results.get(name) or {}).get("score", 100)),
        )
        worst = dict(agent_results[worst_type])
        severity = str(worst.get("severity") or severity_from_score(float(worst.get("score", 0))))
        if severity == "none":
            severity = severity_from_score(float(worst.get("score", 0)))
        flag = repository.create_flag(
            event_id=latest_event_id,
            session_id=session_id,
            flag_type=worst_type,
            severity=severity,
            description=flag_description_from_agent(worst_type, worst),
            agent_verdict=agent_verdict_payload(worst),
        )
        flag_ids.append(flag["id"])

    return flag_ids


def first_flag_raised_event(result: dict[str, Any], flag_ids: list[str]) -> dict[str, Any] | None:
    if not flag_ids:
        return None
    agent_results: dict[str, Any] = result.get("agent_results") or {}
    for agent_type in AGENT_ORDER:
        agent_result = agent_results.get(agent_type)
        if not isinstance(agent_result, dict) or not agent_should_flag(agent_type, agent_result):
            continue
        severity = str(agent_result.get("severity") or severity_from_score(float(agent_result.get("score", 0))))
        if severity == "none":
            severity = severity_from_score(float(agent_result.get("score", 0)))
        return {
            "severity": severity,
            "flag_type": agent_type,
            "description": flag_description_from_agent(agent_type, agent_result),
            "flag_id": flag_ids[0],
        }
    return None
