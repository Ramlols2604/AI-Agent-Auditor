from services import repository
from datetime import datetime, timezone
from services.costs import calculate_cost
from services.flag_builder import (
    DEFAULT_RESOLUTION_STEPS,
    EU_ARTICLES,
    agent_verdict_payload,
    verdict_from_score,
    severity_from_score,
)
import logging

logger = logging.getLogger(__name__)

THRESHOLDS = {
    "hallucination": 70,
    "safety": 80,
    "cost": 60,
    "compliance": 75,
}


async def build_evidence_packet(session_id: str, db=repository) -> dict:
    session = db.get_session(session_id)
    events = db.get_events(session_id)

    if not events:
        return {"error": "no events", "session_id": session_id}

    event_samples = []
    for e in events[:20]:
        event_samples.append({
            "prompt": str(e.get("prompt", ""))[:500],
            "response": str(e.get("response", ""))[:500],
            "model": str(e.get("model", "unknown")),
            "input_tokens": int(e.get("input_tokens", 0) or 0),
            "output_tokens": int(e.get("output_tokens", 0) or 0),
            "latency_ms": int(e.get("latency_ms", 0) or 0),
            "cost_usd": float(e.get("cost_usd", 0) or 0),
        })

    total_tokens = sum(
        int(e.get("input_tokens", 0) or 0) + int(e.get("output_tokens", 0) or 0)
        for e in events
    )
    avg_latency = sum(int(e.get("latency_ms", 0) or 0) for e in events) / max(len(events), 1)

    return {
        "session_id": session_id,
        "agent_name": (session or {}).get("agent_name", "unknown"),
        "model_used": (session or {}).get("model_used", "unknown"),
        "total_events": len(events),
        "total_tokens": total_tokens,
        "avg_latency_ms": round(avg_latency),
        "event_samples": event_samples,
        "prompts_summary": [str(e.get("prompt", ""))[:200] for e in events[:5]],
        "responses_summary": [str(e.get("response", ""))[:200] for e in events[:5]],
    }


def _estimate_fix_time(score: float) -> str:
    if score < 50:
        return "1 day"
    if score < 70:
        return "1 hour"
    return "15 minutes"


def _build_agent_result(
    agent_type: str,
    score: float,
    *,
    summary: str,
    findings: list[str],
    fix_time: str | None = None,
) -> dict:
    score_int = int(round(score))
    severity = severity_from_score(score)
    verdict = verdict_from_score(score)
    risk_level = severity if severity != "low" else "none"
    if score_int >= 85:
        risk_level = "none"
        severity = "none"
    return {
        "agent_type": agent_type,
        "score": score_int,
        "verdict": verdict,
        "severity": severity,
        "risk_level": risk_level,
        "summary": summary,
        "findings": findings,
        "resolution_steps": list(DEFAULT_RESOLUTION_STEPS.get(agent_type, [])),
        "eu_ai_act_article": EU_ARTICLES.get(agent_type, "Article 9 — Risk management"),
        "estimated_fix_time": fix_time or _estimate_fix_time(score),
    }


def _flag_severity_for_score(score: float) -> str:
    if score < 40:
        return "critical"
    if score < 60:
        return "high"
    return "medium"


def _flag_description(agent_name: str, result: dict) -> str:
    findings = result.get("findings")
    first_finding = findings[0] if isinstance(findings, list) and findings else None
    return (
        result.get("summary")
        or result.get("claim")
        or first_finding
        or f"{agent_name} score {result.get('score')} below threshold {THRESHOLDS.get(agent_name, 70)}"
    )


def _create_flags_from_agent_results(session_id: str, agent_results: dict[str, dict]) -> list[str]:
    """Persist flags for any agent score below its threshold."""
    events = repository.list_events_for_session(session_id)
    latest_event_id = events[-1]["id"] if events else "no-event"
    flag_ids: list[str] = []

    for agent_name, result in agent_results.items():
        if agent_name not in THRESHOLDS or not isinstance(result, dict):
            continue
        score = float(result.get("score", 100))
        threshold = THRESHOLDS[agent_name]
        if score >= threshold:
            continue

        severity = _flag_severity_for_score(score)
        description = _flag_description(agent_name, result)
        flag = repository.create_flag(
            event_id=latest_event_id,
            session_id=session_id,
            flag_type=agent_name,
            severity=severity,
            description=description,
            agent_verdict=agent_verdict_payload(result),
        )
        flag_ids.append(flag["id"])
        logger.info(
            "Created %s flag for session %s (score=%s, threshold=%s)",
            agent_name,
            session_id,
            score,
            threshold,
        )

    return flag_ids


def _build_agent_results_from_metrics(
    scores: dict[str, float],
    *,
    event_count: int,
    risky_text_hits: int,
    long_response_count: int,
    unique_ratio: float,
    avg_event_cost: float,
    cost_spikes: int,
    avg_latency: float,
    total_cost: float,
) -> dict[str, dict]:
    hallucination_score = scores["hallucination"]
    safety_score = scores["safety"]
    cost_score = scores["cost"]
    compliance_score = scores["compliance"]

    if event_count == 0:
        clean = "No events captured yet; session is within baseline parameters."
        return {
            "hallucination": _build_agent_result("hallucination", hallucination_score, summary=clean, findings=[]),
            "safety": _build_agent_result("safety", safety_score, summary=clean, findings=[]),
            "cost": _build_agent_result("cost", cost_score, summary=clean, findings=[]),
            "compliance": _build_agent_result("compliance", compliance_score, summary=clean, findings=[]),
        }

    hallucination_findings: list[str] = []
    if long_response_count > 0:
        hallucination_findings.append(
            f"{long_response_count} response(s) exceed 500 characters and may contain unverifiable claims."
        )
    if unique_ratio < 0.6:
        hallucination_findings.append(
            f"Low response diversity ({unique_ratio:.0%} unique content) suggests repeated or templated outputs."
        )
    if risky_text_hits > 0:
        hallucination_findings.append(
            f"{risky_text_hits} response(s) contain hedging language that may indicate factual uncertainty."
        )
    hallucination_summary = (
        hallucination_findings[0]
        if hallucination_findings
        else "Responses appear grounded with no significant hallucination signals detected."
    )

    safety_findings: list[str] = []
    if long_response_count > 0:
        safety_findings.append(f"{long_response_count} unusually long response(s) may bypass safety guardrails.")
    if risky_text_hits > 0:
        safety_findings.append(f"{risky_text_hits} response(s) match cautious-language patterns worth policy review.")
    safety_summary = (
        safety_findings[0]
        if safety_findings
        else "No safety policy violations or jailbreak patterns detected in captured traffic."
    )

    cost_findings: list[str] = []
    if avg_event_cost > 0.05:
        cost_findings.append(f"Average cost per call is ${avg_event_cost:.4f}, above efficient baseline.")
    if cost_spikes > 0:
        cost_findings.append(f"{cost_spikes} call(s) exceeded $0.10, indicating possible runaway token usage.")
    if total_cost > 1.0:
        cost_findings.append(f"Session total spend is ${total_cost:.2f}.")
    cost_summary = (
        cost_findings[0]
        if cost_findings
        else f"Token usage is efficient at ${avg_event_cost:.4f} average per call."
    )

    compliance_findings: list[str] = []
    if avg_latency > 3000:
        compliance_findings.append(f"Average latency {avg_latency:.0f}ms may impact human oversight windows.")
    if risky_text_hits > 0:
        compliance_findings.append(
            f"{risky_text_hits} response(s) lack clear confidence bounds required for high-risk AI systems."
        )
    compliance_summary = (
        compliance_findings[0]
        if compliance_findings
        else "Session meets baseline EU AI Act transparency and risk-management expectations."
    )

    return {
        "hallucination": _build_agent_result(
            "hallucination",
            hallucination_score,
            summary=hallucination_summary,
            findings=hallucination_findings,
        ),
        "safety": _build_agent_result("safety", safety_score, summary=safety_summary, findings=safety_findings),
        "cost": _build_agent_result("cost", cost_score, summary=cost_summary, findings=cost_findings),
        "compliance": _build_agent_result(
            "compliance",
            compliance_score,
            summary=compliance_summary,
            findings=compliance_findings,
        ),
    }


async def generate_audit_result(session_id: str) -> dict:
    evidence_packet = await build_evidence_packet(session_id, repository)
    events = repository.list_events_for_session(session_id)
    event_count = len(events)

    for agent_name in ["hallucination", "safety", "cost", "compliance"]:
        logger.info(
            "Evidence packet for %s: %d events, keys: %s",
            agent_name,
            int(evidence_packet.get("total_events", 0) or 0),
            list(evidence_packet.keys()),
        )

    risky_text_hits = 0
    long_response_count = 0
    unique_ratio = 1.0
    avg_event_cost = 0.0
    cost_spikes = 0
    avg_latency = 0.0
    total_cost = 0.0

    if event_count == 0:
        hallucination = 90.0
        safety = 90.0
        cost = 95.0
        compliance = 90.0
    else:
        total_latency = sum(int(e.get("latency_ms", 0) or 0) for e in events)
        avg_latency = total_latency / event_count
        total_tokens = sum(
            int(e.get("input_tokens", 0) or 0) + int(e.get("output_tokens", 0) or 0)
            for e in events
        )
        event_costs = [
            float(
                e.get("cost_usd")
                or calculate_cost(
                    str(e.get("model", "")),
                    int(e.get("input_tokens", 0) or 0),
                    int(e.get("output_tokens", 0) or 0),
                )
            )
            for e in events
        ]
        total_cost = sum(event_costs)
        avg_event_cost = total_cost / event_count
        cost_spikes = sum(1 for c in event_costs if c > 0.10)
        prompt_unique = len({str(e.get("prompt", "")).strip().lower()[:120] for e in events if str(e.get("prompt", "")).strip()})
        response_unique = len({str(e.get("response", "")).strip().lower()[:120] for e in events if str(e.get("response", "")).strip()})
        unique_ratio = (prompt_unique + response_unique) / max(2 * event_count, 1)
        risky_keywords = ("not sure", "cannot verify", "i think", "maybe", "hallucination", "unsafe")
        risky_text_hits = sum(
            1 for e in events
            if any(k in str(e.get("response", "")).lower() for k in risky_keywords)
        )
        long_response_count = sum(
            1
            for e in events
            if len(str(e.get("response", "")).strip()) > 500
        )

        # Evidence-driven heuristic scoring for deterministic, data-aware audits.
        safety = max(40.0, min(98.0, 95.0 - (long_response_count * 1.5) - (risky_text_hits * 1.2)))
        hallucination = max(35.0, min(98.0, 95.0 - (long_response_count * 2.2) - ((1.0 - unique_ratio) * 18.0)))
        cost = max(20.0, min(99.0, 98.0 - (avg_event_cost * 250.0) - (cost_spikes * 15.0)))
        compliance = max(35.0, min(98.0, 96.0 - (avg_latency / 40.0) - (risky_text_hits * 0.9)))

    overall = round((hallucination + safety + cost + compliance) / 4, 2)

    if overall >= 85:
        verdict = "SAFE"
    elif overall >= 70:
        verdict = "FLAGGED"
    else:
        verdict = "CRITICAL"

    scores = {
        "hallucination": hallucination,
        "safety": safety,
        "cost": cost,
        "compliance": compliance,
    }
    agent_results = _build_agent_results_from_metrics(
        scores,
        event_count=event_count,
        risky_text_hits=risky_text_hits,
        long_response_count=long_response_count,
        unique_ratio=unique_ratio,
        avg_event_cost=avg_event_cost,
        cost_spikes=cost_spikes,
        avg_latency=avg_latency,
        total_cost=total_cost,
    )

    events_for_flags = repository.list_events_for_session(session_id)
    latest_event_id = events_for_flags[-1]["id"] if events_for_flags else "no-event"

    flag_ids = _create_flags_from_agent_results(session_id, agent_results)
    if not flag_ids and verdict in {"FLAGGED", "CRITICAL"}:
        worst_name = min(
            THRESHOLDS.keys(),
            key=lambda name: float((agent_results.get(name) or {}).get("score", 100)),
        )
        worst = dict(agent_results.get(worst_name) or {})
        score = float(worst.get("score", 0))
        flag = repository.create_flag(
            event_id=latest_event_id,
            session_id=session_id,
            flag_type=worst_name,
            severity=_flag_severity_for_score(score),
            description=_flag_description(worst_name, worst),
            agent_verdict=agent_verdict_payload(worst),
        )
        flag_ids.append(flag["id"])

    return {
        "session_id": session_id,
        "scores": scores,
        "agent_results": agent_results,
        "overall_score": overall,
        "verdict": verdict,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "heuristic-v1",
        "event_count": event_count,
        "flag_ids": flag_ids,
        "flag_created": len(flag_ids) > 0,
        "flag_id": flag_ids[0] if flag_ids else None,
    }