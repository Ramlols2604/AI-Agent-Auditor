#!/usr/bin/env python3
"""
Seed all 7 real benchmark datasets into Sentinel.

Run from backend/ (API must be up on :8000):
  PYENV_VERSION=3.10.14 pip install -r requirements.txt
  python scripts/seed_all_datasets.py

Optional:
  python scripts/seed_all_datasets.py --only toxicchat truthfulqa
  python scripts/seed_all_datasets.py --api-url http://127.0.0.1:8000 --sleep-ms 30
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import tarfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterator
from urllib.request import Request, urlopen

import httpx

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Sentinel/1.0)",
    "Accept": "text/csv,text/html,application/json,*/*",
}

API_DEFAULT = "http://127.0.0.1:8000"
LIVE_URL_DEFAULT = "http://127.0.0.1:3000/live"


@dataclass
class SeedEvent:
    prompt: str
    response: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    raw_json: dict


def _token_estimate(text: str) -> int:
    return max(1, int(len(text.split()) * 1.3))


def _require_datasets():
    try:
        from datasets import load_dataset  # type: ignore
    except Exception as exc:
        raise RuntimeError("Install datasets: pip install datasets huggingface_hub") from exc
    return load_dataset


def _clip(text: str, limit: int = 2000) -> str:
    value = str(text or "").strip()
    return value[:limit] if value else "—"


class Seeder:
    def __init__(self, client: httpx.Client, api_url: str, sleep_ms: int, verbose: bool) -> None:
        self.client = client
        self.api_url = api_url.rstrip("/")
        self.sleep_ms = sleep_ms
        self.verbose = verbose
        self.session_ids: list[tuple[str, str]] = []

    def create_session(self, agent_name: str, model: str) -> str:
        res = self.client.post(
            f"{self.api_url}/sessions",
            json={"agent_name": agent_name, "model_used": model},
            timeout=60.0,
        )
        res.raise_for_status()
        sid = str(res.json()["id"])
        self.session_ids.append((agent_name, sid))
        print(f"\n✓ Session '{agent_name}': {sid}")
        return sid

    def post_events(self, session_id: str, events: list[SeedEvent]) -> int:
        for idx, event in enumerate(events, start=1):
            payload = {
                "sequence_num": idx,
                "prompt": _clip(event.prompt, 4000),
                "response": _clip(event.response, 4000),
                "model": event.model,
                "input_tokens": event.input_tokens,
                "output_tokens": event.output_tokens,
                "latency_ms": event.latency_ms,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "raw_json": event.raw_json,
            }
            res = self.client.post(
                f"{self.api_url}/sessions/{session_id}/events",
                json=payload,
                timeout=60.0,
            )
            res.raise_for_status()
            if self.verbose:
                print(f"    event {idx}/{len(events)}")
            if self.sleep_ms > 0:
                time.sleep(self.sleep_ms / 1000.0)
        return len(events)

    def seed_named(self, name: str, agent_name: str, model: str, build: Callable[[], list[SeedEvent]]) -> None:
        print(f"\n=== {name} ===")
        try:
            events = build()
            if not events:
                print("  (no events — skipped)")
                return
            sid = self.create_session(agent_name, model)
            count = self.post_events(sid, events)
            print(f"  Seeded {count} events")
        except Exception as exc:
            print(f"  Failed: {exc}")


def _events_toxicchat(limit: int) -> list[SeedEvent]:
    load_dataset = _require_datasets()
    ds = load_dataset("lmsys/toxic-chat", "toxicchat0124", split="train")
    rows = [r for r in ds if int(r.get("toxicity") or 0) == 1][:limit]
    events: list[SeedEvent] = []
    for i, row in enumerate(rows):
        prompt = str(row.get("user_input") or row.get("prompt") or "")
        response = str(row.get("model_output") or row.get("response") or "")
        if not prompt and not response:
            continue
        events.append(
            SeedEvent(
                prompt=prompt or "User message",
                response=response or "Model response",
                model="vicuna-13b",
                input_tokens=_token_estimate(prompt),
                output_tokens=_token_estimate(response),
                latency_ms=400 + (i * 17) % 350,
                raw_json={
                    "dataset": "toxicchat",
                    "toxicity": 1,
                    "jailbreaking": int(row.get("jailbreaking") or 0),
                },
            )
        )
    return events


def _events_truthfulqa(limit: int) -> list[SeedEvent]:
    load_dataset = _require_datasets()
    ds = load_dataset("truthful_qa", "generation", split="validation")
    events: list[SeedEvent] = []
    for i, row in enumerate(ds.select(range(min(limit, len(ds))))):
        question = str(row.get("question") or "TruthfulQA question")
        incorrect = row.get("incorrect_answers") or []
        wrong = str(incorrect[0]) if incorrect else str(row.get("best_answer") or "Unknown")
        events.append(
            SeedEvent(
                prompt=question,
                response=wrong,
                model="gpt-3.5-turbo",
                input_tokens=_token_estimate(question),
                output_tokens=_token_estimate(wrong),
                latency_ms=280 + (i * 13) % 320,
                raw_json={
                    "dataset": "truthfulqa",
                    "is_hallucinated": True,
                    "category": row.get("category"),
                },
            )
        )
    return events


def _events_legal(limit: int) -> list[SeedEvent]:
    load_dataset = _require_datasets()
    try:
        ds = load_dataset("reglab/legal_hallucinations", split="train")
    except Exception:
        from huggingface_hub import hf_hub_download  # type: ignore
        import csv
        from pathlib import Path

        csv_path = hf_hub_download(
            repo_id="reglab/legal_hallucinations",
            repo_type="dataset",
            filename="dataset.csv",
        )
        rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
        events = []
        for i, row in enumerate(rows[:limit]):
            prompt = str(row.get("question") or row.get("query") or row.get("example_question") or "Legal query")
            response = str(
                row.get("llm_output")
                or row.get("hallucinated_answer")
                or row.get("example_correct_answer")
                or ""
            )
            events.append(
                SeedEvent(
                    prompt=prompt,
                    response=response or "Legal response",
                    model="gpt-4",
                    input_tokens=_token_estimate(prompt),
                    output_tokens=_token_estimate(response),
                    latency_ms=360 + (i * 19) % 300,
                    raw_json={"dataset": "legal_hallucinations", "is_hallucinated": True},
                )
            )
        return events

    events = []
    for i, row in enumerate(ds.select(range(min(limit, len(ds))))):
        prompt = str(row.get("question") or row.get("query") or row.get("prompt") or "Legal query")
        response = str(row.get("response") or row.get("answer") or row.get("llm_output") or "")
        label = row.get("hallucination_label")
        events.append(
            SeedEvent(
                prompt=prompt,
                response=response or "Legal response",
                model="gpt-4",
                input_tokens=_token_estimate(prompt),
                output_tokens=_token_estimate(response),
                latency_ms=340 + (i * 11) % 280,
                raw_json={
                    "dataset": "legal_hallucinations",
                    "hallucination_label": label,
                    "is_hallucinated": True,
                },
            )
        )
    return events


def _load_aiid_incidents(limit: int) -> list[dict]:
    """Load incidents from AIID snapshot archive (GraphQL often returns 403)."""
    with urlopen(
        Request("https://incidentdatabase.ai/research/snapshots/", headers=HTTP_HEADERS),
        timeout=45,
    ) as response:
        html = response.read().decode("utf-8", errors="replace")
    marker = ".tar.bz2"
    idx = html.find(marker)
    if idx == -1:
        raise RuntimeError("Could not locate AIID snapshot archive URL.")
    start = html.rfind("https://", 0, idx)
    if start == -1:
        raise RuntimeError("AIID snapshot link parse failed.")
    archive_url = html[start : idx + len(marker)]
    with urlopen(Request(archive_url, headers=HTTP_HEADERS), timeout=120) as response:
        blob = response.read()
    tmp_archive = Path(__file__).resolve().parent / ".incident_snapshot.tar.bz2"
    tmp_archive.write_bytes(blob)
    try:
        with tarfile.open(tmp_archive, "r:bz2") as tf:
            member = next((m for m in tf.getmembers() if m.name.endswith("incidents.csv")), None)
            if member is None:
                raise RuntimeError("incidents.csv not found in AIID snapshot.")
            extracted = tf.extractfile(member)
            if extracted is None:
                raise RuntimeError("Failed to extract incidents.csv.")
            text = extracted.read().decode("utf-8", errors="replace")
    finally:
        tmp_archive.unlink(missing_ok=True)
    rows = list(csv.DictReader(text.splitlines()))
    if not rows:
        raise RuntimeError("No incident rows in AIID snapshot.")
    return [
        {
            "incident_id": r.get("id") or r.get("incident_id"),
            "title": r.get("title") or r.get("name"),
            "description": r.get("description") or r.get("summary"),
        }
        for r in rows[:limit]
    ]


def _events_aiid(limit: int) -> list[SeedEvent]:
    incidents: list[dict] = []
    query = """
    {
      incidents(limit: %d) {
        incident_id
        title
        description
      }
    }
    """ % (
        limit,
    )
    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.post(
                "https://incidentdatabase.ai/api/graphql",
                json={"query": query},
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (compatible; Sentinel/1.0)",
                },
            )
            if res.status_code == 200:
                incidents = (res.json().get("data") or {}).get("incidents") or []
    except Exception:
        incidents = []

    if not incidents:
        incidents = _load_aiid_incidents(limit)
    events: list[SeedEvent] = []
    for i, inc in enumerate(incidents[:limit]):
        title = str(inc.get("title") or "AI incident")
        desc = str(inc.get("description") or "No description available")
        prompt = f"Analyze this AI incident: {title}"
        response = desc[:800]
        events.append(
            SeedEvent(
                prompt=prompt,
                response=response,
                model="gpt-4o",
                input_tokens=_token_estimate(prompt),
                output_tokens=_token_estimate(response),
                latency_ms=420 + (i * 9) % 250,
                raw_json={
                    "dataset": "ai_incident_database",
                    "incident_id": inc.get("incident_id"),
                    "source": "AIID",
                    "real_incident": True,
                },
            )
        )
    return events


def _events_beavertails(limit: int) -> list[SeedEvent]:
    load_dataset = _require_datasets()
    try:
        ds = load_dataset("PKU-Alignment/BeaverTails", split="330k_train")
    except Exception:
        ds = load_dataset("PKU-Alignment/BeaverTails", split="30k_train")
    try:
        unsafe_ds = ds.filter(lambda x: x.get("is_safe") is False)
        rows = list(unsafe_ds.select(range(limit)))
    except Exception:
        rows = [r for r in ds if r.get("is_safe") is False][:limit]
    events: list[SeedEvent] = []
    for i, row in enumerate(rows):
        prompt = str(row.get("prompt") or "")
        response = str(row.get("response") or "")
        if not prompt:
            continue
        events.append(
            SeedEvent(
                prompt=prompt,
                response=response or "Unsafe response",
                model="alpaca-7b",
                input_tokens=_token_estimate(prompt),
                output_tokens=_token_estimate(response),
                latency_ms=380 + (i * 23) % 400,
                raw_json={
                    "dataset": "beavertails",
                    "is_safe": False,
                    "category": row.get("category"),
                },
            )
        )
    return events


def _events_lmsys(limit: int) -> list[SeedEvent]:
    load_dataset = _require_datasets()
    stream = load_dataset("lmsys/lmsys-chat-1m", split="train", streaming=True)
    events: list[SeedEvent] = []
    for i, row in enumerate(stream):
        if i >= limit:
            break
        model = str(row.get("model") or "gpt-4")
        conversation = row.get("conversation") or []
        if not conversation:
            continue
        # conversation is typically a list of {role, content} dicts
        user_parts: list[str] = []
        assistant_parts: list[str] = []
        for turn in conversation:
            if not isinstance(turn, dict):
                continue
            role = str(turn.get("role") or turn.get("from") or "").lower()
            content = str(turn.get("content") or turn.get("value") or "")
            if "user" in role or role == "human":
                user_parts.append(content)
            elif "assistant" in role or role in {"gpt", "bot", "chatgpt"}:
                assistant_parts.append(content)
        prompt = user_parts[-1] if user_parts else str(conversation[0])[:500]
        response = assistant_parts[-1] if assistant_parts else str(conversation[-1])[:500]
        events.append(
            SeedEvent(
                prompt=_clip(prompt, 1500),
                response=_clip(response, 1500),
                model=model[:120],
                input_tokens=_token_estimate(prompt),
                output_tokens=_token_estimate(response),
                latency_ms=300 + (i * 7) % 500,
                raw_json={
                    "dataset": "lmsys-chat-1m",
                    "language": row.get("language"),
                    "turn_count": len(conversation),
                },
            )
        )
    return events


def _events_halueval2(limit_per_split: int) -> list[SeedEvent]:
    load_dataset = _require_datasets()
    events: list[SeedEvent] = []
    splits = ["qa", "dialogue", "summarization", "general"]
    per_split = max(5, limit_per_split // len(splits))
    for split_name in splits:
        try:
            ds = load_dataset("pminervini/HaluEval", split_name)
        except Exception:
            continue
        data = ds.get("data") if hasattr(ds, "get") else ds
        if data is None:
            continue
        rows = list(data.select(range(min(per_split, len(data)))))
        for i, row in enumerate(rows):
            prompt = str(row.get("question") or row.get("query") or row.get("user_query") or "HaluEval query")
            hallucinated = str(
                row.get("hallucinated_answer")
                or row.get("hallucination")
                or row.get("wrong_answer")
                or ""
            )
            right = str(row.get("right_answer") or row.get("answer") or row.get("gold_answer") or "")
            response = hallucinated or right or "Hallucinated response"
            events.append(
                SeedEvent(
                    prompt=prompt,
                    response=response,
                    model="gpt-4o",
                    input_tokens=_token_estimate(prompt),
                    output_tokens=_token_estimate(response),
                    latency_ms=310 + (i * 15) % 360,
                    raw_json={
                        "dataset": "halueval2",
                        "split": split_name,
                        "is_hallucinated": bool(hallucinated),
                    },
                )
            )
    return events[:limit_per_split]


DATASET_BUILDERS: dict[str, tuple[str, str, Callable[[int], list[SeedEvent]]]] = {
    "toxicchat": ("toxicchat-safety-agent", "vicuna-13b", _events_toxicchat),
    "truthfulqa": ("truthfulqa-hallucination-agent", "gpt-3.5-turbo", _events_truthfulqa),
    "legal": ("legal-compliance-agent", "gpt-4", _events_legal),
    "aiid": ("ai-incident-audit-agent", "gpt-4o", _events_aiid),
    "beavertails": ("beavertails-safety-agent", "alpaca-7b", _events_beavertails),
    "lmsys": ("lmsys-cost-volume-agent", "gpt-4", _events_lmsys),
    "halueval2": ("halueval2-hallucination-agent", "gpt-4o", _events_halueval2),
}

DEFAULT_LIMITS = {
    "toxicchat": 30,
    "truthfulqa": 40,
    "legal": 40,
    "aiid": 30,
    "beavertails": 30,
    "lmsys": 100,
    "halueval2": 40,
}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed all 7 real datasets into the Sentinel API.")
    parser.add_argument("--api-url", default=API_DEFAULT)
    parser.add_argument("--live-url", default=LIVE_URL_DEFAULT)
    parser.add_argument(
        "--only",
        nargs="*",
        choices=list(DATASET_BUILDERS.keys()),
        help="Subset of datasets to seed (default: all).",
    )
    parser.add_argument("--limit", type=int, default=0, help="Override per-dataset event limit (0 = use defaults).")
    parser.add_argument("--sleep-ms", type=int, default=50)
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    selected = args.only or list(DATASET_BUILDERS.keys())

    try:
        health = httpx.get(f"{args.api_url.rstrip('/')}/health", timeout=5.0)
        health.raise_for_status()
    except Exception as exc:
        print(f"API not reachable at {args.api_url}: {exc}", file=sys.stderr)
        print("Start backend: cd backend && uvicorn main:app --reload", file=sys.stderr)
        return 1

    with httpx.Client() as client:
        seeder = Seeder(client, args.api_url, args.sleep_ms, args.verbose)
        for key in selected:
            agent_name, model, builder = DATASET_BUILDERS[key]
            limit = args.limit or DEFAULT_LIMITS[key]

            def _build(lim: int = limit, fn: Callable[[int], list[SeedEvent]] = builder) -> list[SeedEvent]:
                return fn(lim)

            seeder.seed_named(key.upper(), agent_name, model, _build)

    print("\n" + "=" * 50)
    print("✓ Seeding complete")
    print("=" * 50)
    for name, sid in seeder.session_ids:
        print(f"  {name}: {sid}")
    print(f"\nOpen {args.live_url} to run audits on these sessions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
