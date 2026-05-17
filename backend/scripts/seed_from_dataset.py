#!/usr/bin/env python3
"""Seed Sentinel sessions/events from real datasets.

Supported dataset sources:
- HaluEval (local clone JSON files)
- TruthfulQA (via huggingface datasets)
- Legal Hallucinations (via huggingface datasets)
- AI Incident Database CSV (remote/local CSV)

Examples:
  python scripts/seed_from_dataset.py --dataset halueval --halueval-root ../HaluEval/data --limit 50
  python scripts/seed_from_dataset.py --dataset truthfulqa --limit 50
  python scripts/seed_from_dataset.py --dataset legal --limit 50
  python scripts/seed_from_dataset.py --dataset incidents --limit 50 --incident-csv ./incidents.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
import tarfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator
from urllib.request import Request, urlopen

import httpx


INCIDENT_CSV_URL = "https://incidentdatabase.ai/api/incidents/csv"
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Sentinel/1.0)",
    "Accept": "text/csv,text/html,application/json,*/*",
}


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
    # Lightweight token estimate for synthetic metrics.
    return max(1, int(len(text.split()) * 1.3))


def _load_halueval_records(root: Path) -> list[dict]:
    files = [
        root / "qa_data.json",
        root / "dialogue_data.json",
        root / "summarization_data.json",
        root / "general_data.json",
    ]
    records: list[dict] = []
    for file in files:
        if not file.exists():
            continue
        text = file.read_text(encoding="utf-8")
        payload = None
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, list):
            records.extend(payload)
            continue
        if isinstance(payload, dict):
            records.append(payload)
            continue
        # Fallback for JSONL-formatted files.
        for line in text.splitlines():
            raw = line.strip()
            if not raw:
                continue
            try:
                item = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(item, dict):
                records.append(item)
    if not records:
        raise RuntimeError(
            f"No HaluEval records found under {root}. "
            "Expected qa_data.json/dialogue_data.json/summarization_data.json/general_data.json."
        )
    return records


def _events_from_halueval(records: list[dict], limit: int, hallucination_rate: float) -> Iterator[SeedEvent]:
    random.shuffle(records)
    for i, row in enumerate(records[:limit]):
        prompt = str(row.get("question") or row.get("query") or row.get("prompt") or "Unknown prompt")
        right = str(row.get("right_answer") or row.get("answer") or row.get("gold_answer") or "")
        hallucinated = str(row.get("hallucinated_answer") or row.get("hallucinated") or right)
        use_hallucinated = random.random() < hallucination_rate and bool(hallucinated)
        response = hallucinated if use_hallucinated else right
        yield SeedEvent(
            prompt=prompt,
            response=response,
            model="gpt-4o",
            input_tokens=_token_estimate(prompt),
            output_tokens=_token_estimate(response),
            latency_ms=350 + ((i * 17) % 400),
            raw_json={
                "dataset": "halueval",
                "is_hallucinated": use_hallucinated,
                "row_index": i,
            },
        )


def _require_datasets_lib():
    try:
        from datasets import load_dataset  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "This dataset source requires `datasets`.\n"
            "Install with: pip install datasets"
        ) from exc
    return load_dataset


def _events_from_truthfulqa(limit: int) -> Iterator[SeedEvent]:
    load_dataset = _require_datasets_lib()
    ds = load_dataset("truthful_qa", "generation", split="validation")
    for i, row in enumerate(ds.select(range(min(limit, len(ds))))):
        prompt = str(row.get("question") or "TruthfulQA question")
        best = row.get("best_answer")
        incorrect = row.get("incorrect_answers") or []
        use_incorrect = bool(incorrect) and i % 3 == 0
        response = str(incorrect[0] if use_incorrect else (best or "No answer available"))
        yield SeedEvent(
            prompt=prompt,
            response=response,
            model="gpt-4o-mini",
            input_tokens=_token_estimate(prompt),
            output_tokens=_token_estimate(response),
            latency_ms=250 + ((i * 13) % 300),
            raw_json={
                "dataset": "truthfulqa",
                "is_hallucinated": use_incorrect,
                "category": row.get("category"),
                "source": row.get("source"),
            },
        )


def _events_from_legal(limit: int) -> Iterator[SeedEvent]:
    try:
        from huggingface_hub import hf_hub_download  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Legal dataset seeding requires huggingface_hub (installed with datasets)."
        ) from exc

    csv_path = hf_hub_download(
        repo_id="reglab/legal_hallucinations",
        repo_type="dataset",
        filename="dataset.csv",
    )
    with open(csv_path, "r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    for i, row in enumerate(rows[:limit]):
        prompt = str(
            row.get("question")
            or row.get("prompt")
            or row.get("query")
            or row.get("example_question")
            or "Legal hallucination question"
        )
        reference = str(
            row.get("example_correct_answer")
            or row.get("answer")
            or row.get("gold_answer")
            or row.get("correct_answer")
            or ""
        )
        hallucinated = str(
            row.get("llm_output")
            or row.get("hallucinated_answer")
            or row.get("incorrect_answer")
            or reference
        )
        use_hallucinated = i % 2 == 0 and bool(hallucinated)
        response = hallucinated if use_hallucinated else reference
        yield SeedEvent(
            prompt=prompt,
            response=response,
            model="gpt-4o",
            input_tokens=_token_estimate(prompt),
            output_tokens=_token_estimate(response),
            latency_ms=320 + ((i * 19) % 340),
            raw_json={
                "dataset": "legal_hallucinations",
                "is_hallucinated": use_hallucinated,
            },
        )


def _load_incidents_csv(path: Path | None) -> list[dict]:
    if path:
        if not path.exists():
            raise RuntimeError(f"Incident CSV file not found: {path}")
        text = path.read_text(encoding="utf-8")
    else:
        try:
            with urlopen(Request(INCIDENT_CSV_URL, headers=HTTP_HEADERS), timeout=30) as response:  # nosec B310
                text = response.read().decode("utf-8", errors="replace")
        except Exception:
            # Fallback: pull latest snapshot archive and extract incidents.csv.
            with urlopen(
                Request("https://incidentdatabase.ai/research/snapshots/", headers=HTTP_HEADERS),
                timeout=30,
            ) as response:  # nosec B310
                html = response.read().decode("utf-8", errors="replace")
            marker = ".tar.bz2"
            idx = html.find(marker)
            if idx == -1:
                raise RuntimeError("Could not locate snapshot archive URL from incidentdatabase.ai.")
            start = html.rfind("https://", 0, idx)
            if start == -1:
                raise RuntimeError("Snapshot archive link parsing failed.")
            archive_url = html[start : idx + len(marker)]
            with urlopen(Request(archive_url, headers=HTTP_HEADERS), timeout=60) as response:  # nosec B310
                blob = response.read()
            tmp_archive = Path(".incident_snapshot.tar.bz2")
            tmp_archive.write_bytes(blob)
            with tarfile.open(tmp_archive, "r:bz2") as tf:
                member = next((m for m in tf.getmembers() if m.name.endswith("incidents.csv")), None)
                if member is None:
                    raise RuntimeError("incidents.csv not found in snapshot archive.")
                extracted = tf.extractfile(member)
                if extracted is None:
                    raise RuntimeError("Failed to extract incidents.csv from archive.")
                text = extracted.read().decode("utf-8", errors="replace")
            tmp_archive.unlink(missing_ok=True)
    rows = list(csv.DictReader(text.splitlines()))
    if not rows:
        raise RuntimeError("No rows found in incident CSV.")
    return rows


def _events_from_incidents(rows: list[dict], limit: int) -> Iterator[SeedEvent]:
    for i, row in enumerate(rows[:limit]):
        title = str(row.get("title") or row.get("name") or "AI incident")
        description = str(row.get("description") or row.get("summary") or "No incident details")
        prompt = f"Summarize incident risk and safeguards for: {title}"
        response = description[:1200]
        yield SeedEvent(
            prompt=prompt,
            response=response,
            model="gpt-4o",
            input_tokens=_token_estimate(prompt),
            output_tokens=_token_estimate(response),
            latency_ms=420 + ((i * 11) % 260),
            raw_json={
                "dataset": "incident_database",
                "incident_id": row.get("id"),
                "severity": row.get("severity") or row.get("harm_level"),
                "is_hallucinated": False,
            },
        )


def _build_events(args: argparse.Namespace) -> Iterable[SeedEvent]:
    if args.dataset == "halueval":
        if not args.halueval_root:
            raise RuntimeError("--halueval-root is required for dataset=halueval")
        records = _load_halueval_records(Path(args.halueval_root))
        return _events_from_halueval(records, args.limit, args.hallucination_rate)
    if args.dataset == "truthfulqa":
        return _events_from_truthfulqa(args.limit)
    if args.dataset == "legal":
        return _events_from_legal(args.limit)
    if args.dataset == "incidents":
        rows = _load_incidents_csv(Path(args.incident_csv) if args.incident_csv else None)
        return _events_from_incidents(rows, args.limit)
    raise RuntimeError(f"Unsupported dataset: {args.dataset}")


def _create_session(client: httpx.Client, api_url: str, agent_name: str, model_name: str) -> str:
    res = client.post(
        f"{api_url}/sessions",
        json={"agent_name": agent_name, "model_used": model_name},
        timeout=15.0,
    )
    res.raise_for_status()
    payload = res.json()
    return str(payload["id"])


def _seed(args: argparse.Namespace) -> int:
    api_url = args.api_url.rstrip("/")
    events = list(_build_events(args))
    if not events:
        print("No events to seed.")
        return 1

    agent_name = args.agent_name or f"{args.dataset}-seed-agent"
    model_name = args.model or "gpt-4o"

    with httpx.Client() as client:
        session_id = _create_session(client, api_url, agent_name, model_name)
        print(f"Created session: {session_id[:8]}... ({agent_name})")

        for idx, event in enumerate(events, start=1):
            payload = {
                "sequence_num": idx,
                "prompt": event.prompt,
                "response": event.response,
                "model": event.model,
                "input_tokens": event.input_tokens,
                "output_tokens": event.output_tokens,
                "latency_ms": event.latency_ms,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "raw_json": event.raw_json,
            }
            res = client.post(
                f"{api_url}/sessions/{session_id}/events",
                json=payload,
                timeout=15.0,
            )
            res.raise_for_status()
            if args.verbose:
                marker = "hallucinated" if payload["raw_json"].get("is_hallucinated") else "clean"
                print(f"  Event {idx}/{len(events)}: {marker}")
            if args.sleep_ms > 0:
                time.sleep(args.sleep_ms / 1000.0)

        print(f"Seeded {len(events)} events into session {session_id}.")
        print(f"Live audit URL: {args.live_url}")
        print(f"Run audit for session: {session_id}")
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed backend with real benchmark datasets.")
    parser.add_argument(
        "--dataset",
        choices=["halueval", "truthfulqa", "legal", "incidents"],
        default="halueval",
        help="Dataset source to seed from.",
    )
    parser.add_argument("--api-url", default="http://127.0.0.1:8000", help="Sentinel API base URL.")
    parser.add_argument("--live-url", default="http://127.0.0.1:3000/live", help="Frontend live audit URL.")
    parser.add_argument("--limit", type=int, default=50, help="Maximum number of events to create.")
    parser.add_argument(
        "--halueval-root",
        default="",
        help="Path to HaluEval data directory containing *_data.json files.",
    )
    parser.add_argument(
        "--incident-csv",
        default="",
        help="Optional path to incidents CSV. If omitted, downloads from incidentdatabase.ai.",
    )
    parser.add_argument("--hallucination-rate", type=float, default=0.33, help="Rate for injecting hallucinated answers.")
    parser.add_argument("--agent-name", default="", help="Session agent_name override.")
    parser.add_argument("--model", default="", help="model_used/session event model override.")
    parser.add_argument("--sleep-ms", type=int, default=50, help="Sleep between event writes.")
    parser.add_argument("--verbose", action="store_true", help="Verbose per-event logging.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        return _seed(args)
    except Exception as exc:
        print(f"Seeding failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
