from pathlib import Path
import sys
from types import SimpleNamespace

# Make backend modules importable when running this script directly.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sdk import AuditWrapper


class FakeBaseClient:
    def __init__(self) -> None:
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=self._create)
        )

    def _create(self, **kwargs):
        user_text = ""
        msgs = kwargs.get("messages", [])
        if msgs and isinstance(msgs[-1], dict):
            user_text = msgs[-1].get("content", "")

        message = SimpleNamespace(content=f"Echo: {user_text}")
        choice = SimpleNamespace(message=message)
        usage = SimpleNamespace(prompt_tokens=8, completion_tokens=6)
        return SimpleNamespace(choices=[choice], usage=usage)


def main() -> None:
    wrapped = AuditWrapper(
        wrapped_client=FakeBaseClient(),
        session_name="sdk-demo-agent",
        auditor_url="http://127.0.0.1:8000",
        model_name="fake-model-v1",
    )

    response = wrapped.chat.completions.create(
        model="fake-model-v1",
        messages=[{"role": "user", "content": "Hello from demo"}],
    )

    print(response.choices[0].message.content)


if __name__ == "__main__":
    main()