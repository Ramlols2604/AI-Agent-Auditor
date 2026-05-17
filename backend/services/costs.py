"""Shared token pricing helpers."""

TOKEN_COSTS = {
    "gpt-4o": {"input": 0.000005, "output": 0.000015},
    "gpt-4o-mini": {"input": 0.00000015, "output": 0.0000006},
    "gpt-3.5-turbo": {"input": 0.0000005, "output": 0.0000015},
    "gpt-4": {"input": 0.00003, "output": 0.00006},
    "claude-3-5-sonnet": {"input": 0.000003, "output": 0.000015},
    "gemini-2.5-flash": {"input": 0.000000075, "output": 0.0000003},
    "vicuna-13b": {"input": 0.0000003, "output": 0.0000009},
    "alpaca-7b": {"input": 0.0000002, "output": 0.0000006},
    "http-request": {"input": 0.000002, "output": 0.000008},
    "default": {"input": 0.000002, "output": 0.000008},
}

# Legacy / alias model names mapped to pricing keys
_MODEL_ALIASES = {
    "http-middleware": "http-request",
}


def estimate_tokens(text: str) -> int:
    """Rough token estimate from word count (for captures without usage metadata)."""
    words = len(str(text or "").split())
    return max(1, int(words * 1.3)) if words else 0


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    model_key = _MODEL_ALIASES.get(
        str(model or "").lower().strip(),
        str(model or "").lower().strip(),
    )
    rates = TOKEN_COSTS.get(model_key, TOKEN_COSTS["default"])
    return round(
        (int(input_tokens or 0) * rates["input"])
        + (int(output_tokens or 0) * rates["output"]),
        8,
    )
