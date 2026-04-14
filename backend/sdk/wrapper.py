import json
import time
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any


@dataclass
class _AuditConfig:
    auditor_url: str
    session_name: str
    model_name: str


class AuditWrapper:
    """
    Lightweight SDK wrapper that:
    1) creates an audit session
    2) wraps chat.completions.create(...)
    3) posts captured events to backend

    Wrapper failures are swallowed by design so host app behavior is not broken.
    """

    def __init__(
        self,
        wrapped_client: Any,
        session_name: str,
        auditor_url: str = "http://127.0.0.1:8000",
        model_name: str = "unknown-model",
    ) -> None:
        self._wrapped = wrapped_client
        self._cfg = _AuditConfig(
            auditor_url=auditor_url.rstrip("/"),
            session_name=session_name,
            model_name=model_name,
        )
        self._session_id: str | None = self._create_session()
        self._sequence_num = 0
        self._sequence_lock = threading.Lock()

        # expose nested compatibility path: client.chat.completions.create(...)
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=self._create_completion)
        )

    def _post_json(self, path: str, payload: dict) -> dict | None:
        url = f"{self._cfg.auditor_url}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url=url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
            return None

    def _create_session(self) -> str | None:
        payload = {
            "agent_name": self._cfg.session_name,
            "model_used": self._cfg.model_name,
        }
        result = self._post_json("/sessions", payload)
        if not result:
            return None
        return result.get("id")

    def _extract_prompt(self, kwargs: dict) -> str:
        messages = kwargs.get("messages")
        if isinstance(messages, list) and messages:
            last = messages[-1]
            if isinstance(last, dict):
                content = last.get("content")
                if isinstance(content, str):
                    return content
        prompt = kwargs.get("prompt")
        return prompt if isinstance(prompt, str) else ""

    def _extract_response_text(self, response: Any) -> str:
        # Support common shapes without hard dependency on SDK classes.
        try:
            choices = getattr(response, "choices", None)
            if isinstance(choices, list) and choices:
                msg = getattr(choices[0], "message", None)
                if msg is not None:
                    content = getattr(msg, "content", None)
                    if isinstance(content, str):
                        return content
        except Exception:
            pass

        try:
            # fallback for dict-like responses
            if isinstance(response, dict):
                choices = response.get("choices", [])
                if choices and isinstance(choices[0], dict):
                    message = choices[0].get("message", {})
                    content = message.get("content", "")
                    if isinstance(content, str):
                        return content
        except Exception:
            pass

        return str(response)

    def _extract_tokens(self, response: Any) -> tuple[int, int]:
        # best-effort extraction
        try:
            usage = getattr(response, "usage", None)
            if usage is not None:
                prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
                completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
                return prompt_tokens, completion_tokens
        except Exception:
            pass

        try:
            if isinstance(response, dict):
                usage = response.get("usage", {})
                return int(usage.get("prompt_tokens", 0)), int(usage.get("completion_tokens", 0))
        except Exception:
            pass

        return 0, 0

    def _post_event(self, event_payload: dict) -> None:
        if not self._session_id:
            return
        _ = self._post_json(f"/sessions/{self._session_id}/events", event_payload)

    def _next_sequence(self) -> int:
        with self._sequence_lock:
            self._sequence_num += 1
            return self._sequence_num

    def _create_completion(self, *args: Any, **kwargs: Any) -> Any:
        start = time.perf_counter()

        # call wrapped client first; never block host behavior on auditor failures
        response = self._wrapped.chat.completions.create(*args, **kwargs)

        latency_ms = int((time.perf_counter() - start) * 1000)
        prompt_text = self._extract_prompt(kwargs)
        response_text = self._extract_response_text(response)
        input_tokens, output_tokens = self._extract_tokens(response)

        event_payload = {
            "sequence_num": self._next_sequence(),
            "prompt": prompt_text,
            "response": response_text,
            "model": kwargs.get("model", self._cfg.model_name),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": latency_ms,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "raw_json": {
                "sdk": "audit-wrapper-mvp",
            },
        }

        try:
            self._post_event(event_payload)
        except Exception:
            # Must never break wrapped client flow
            pass

        return response