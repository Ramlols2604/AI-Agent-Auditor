export default function About() {
  return (
    <div className="about-page">
      <section className="about-section hero">
        <h1 className="about-hero-title">AI Agent Auditor</h1>
        <p className="about-hero-subtitle">
          Production-grade behavioral monitoring for LLM-powered agents
        </p>
        <div className="about-pill-row">
          <span className="pill pill-primary">Open Source</span>
          <span className="pill pill-primary">EU AI Act Ready</span>
        </div>
        <hr className="about-rule" />
      </section>

      <section className="about-section two-col">
        <div className="surface-card">
          <h2 className="about-title">The Problem</h2>
          <p className="about-body">
            AI agents are being deployed into production with no visibility into what they are actually
            doing. A customer support bot can hallucinate facts, violate safety policies, or quietly exceed
            cost budgets — and the engineering team has no record it happened. The EU AI Act (Article 9)
            requires documented risk management for high-risk AI systems by August 2026. Most companies
            have no audit trail at all.
          </p>
        </div>
        <div className="about-stat-stack">
          <article className="surface-card about-stat-card">
            <p className="about-stat-value">125,000</p>
            <p className="about-body">Americans harmed annually by AI errors (MIT, 2024)</p>
          </article>
          <article className="surface-card about-stat-card">
            <p className="about-stat-value">73%</p>
            <p className="about-body">of AI deployments have no behavioral monitoring</p>
          </article>
          <article className="surface-card about-stat-card">
            <p className="about-stat-value">Aug 2026</p>
            <p className="about-body">EU AI Act compliance deadline</p>
          </article>
        </div>
      </section>

      <section className="about-section">
        <h2 className="about-title">How It Works</h2>
        <div className="how-row">
          <article className="surface-card how-card">
            <p className="how-number">1</p>
            <h3>INSTRUMENT</h3>
            <p className="about-body">
              Wrap your existing LLM client with 3 lines of Python. Zero changes to your agent logic required.
            </p>
            <pre className="about-code">
{`from agent_auditor import AuditWrapper
client = AuditWrapper(openai.OpenAI(), session_name="my-agent")`}
            </pre>
          </article>
          <span className="how-arrow">→</span>
          <article className="surface-card how-card">
            <p className="how-number">2</p>
            <h3>CAPTURE</h3>
            <p className="about-body">
              Every LLM call — prompt, response, tokens, latency — is intercepted and streamed to the auditor in
              real time.
            </p>
          </article>
          <span className="how-arrow">→</span>
          <article className="surface-card how-card">
            <p className="how-number">3</p>
            <h3>ANALYZE</h3>
            <p className="about-body">
              Four specialized AI agents run in parallel on every captured event using asyncio.gather(). Each
              agent scores from its lens.
            </p>
          </article>
          <span className="how-arrow">→</span>
          <article className="surface-card how-card">
            <p className="how-number">4</p>
            <h3>FLAG</h3>
            <p className="about-body">
              Anomalies surface immediately as flags with severity levels. The Judge agent synthesizes all four
              verdicts into one score.
            </p>
          </article>
          <span className="how-arrow">→</span>
          <article className="surface-card how-card">
            <p className="how-number">5</p>
            <h3>REPORT</h3>
            <p className="about-body">
              One-click EU AI Act compliance report. Full audit trail. Exportable PDF with all agent verdicts and
              flag history.
            </p>
          </article>
        </div>
      </section>

      <section className="about-section">
        <h2 className="about-title">The Audit Committee</h2>
        <p className="about-body">Four specialized agents analyze every LLM interaction simultaneously</p>
        <div className="committee-grid">
          <article className="surface-card committee-card">
            <h3>⚠ Hallucination Agent</h3>
            <p className="about-body">
              Cross-references every factual claim in the agent response against the provided context and known
              constraints. Flags when the model confidently states information that contradicts the source material
              or cannot be verified.
            </p>
            <p className="meta-label">Scores: Factual accuracy 0-100</p>
          </article>
          <article className="surface-card committee-card">
            <h3>✕ Safety Agent</h3>
            <p className="about-body">
              Checks every response against a configurable safety policy. Detects harmful content, prompt injection
              attempts, jailbreak patterns, and policy violations. Flags severity from low to critical.
            </p>
            <p className="meta-label">Scores: Policy adherence 0-100</p>
          </article>
          <article className="surface-card committee-card">
            <h3>$ Cost Agent</h3>
            <p className="about-body">
              Monitors token usage, latency, and API spend per call and per session. Flags when usage deviates
              significantly from the session baseline — catching runaway agent loops and inefficient prompts.
            </p>
            <p className="meta-label">Scores: Efficiency 0-100</p>
          </article>
          <article className="surface-card committee-card">
            <h3>⊘ Compliance Agent</h3>
            <p className="about-body">
              Evaluates agent behavior against EU AI Act Article 9 requirements: transparency, human oversight
              capability, accuracy, and data governance. Generates the evidence trail for conformity assessment.
            </p>
            <p className="meta-label">Scores: Regulatory alignment 0-100</p>
          </article>
        </div>
      </section>

      <section className="about-section two-col">
        <div className="surface-card">
          <h2 className="about-title">Technical Architecture</h2>
          <h3 className="section-title">Backend</h3>
          <div className="tech-rows">
            <p><span className="mono muted">Language</span><span>Python 3.11</span></p>
            <p><span className="mono muted">Framework</span><span>FastAPI with uvicorn</span></p>
            <p><span className="mono muted">Async</span><span>asyncio with asyncio.gather()</span></p>
            <p><span className="mono muted">Streaming</span><span>Server-Sent Events via sse-starlette</span></p>
            <p><span className="mono muted">AI Layer</span><span>Gemini 2.5 Flash + OpenRouter fallback</span></p>
            <p><span className="mono muted">Database</span><span>SQLite to Snowflake</span></p>
            <p><span className="mono muted">Cache</span><span>Redis with in-memory fallback</span></p>
            <p><span className="mono muted">SDK</span><span>Python wrapper + FastAPI middleware</span></p>
            <p><span className="mono muted">Testing</span><span>pytest quality tests</span></p>
          </div>
        </div>
        <div className="surface-card">
          <h2 className="about-title">Frontend</h2>
          <div className="tech-rows">
            <p><span className="mono muted">Language</span><span>JavaScript (React 18)</span></p>
            <p><span className="mono muted">Build tool</span><span>Vite</span></p>
            <p><span className="mono muted">Styling</span><span>Inline styles + CSS variables</span></p>
            <p><span className="mono muted">Charts</span><span>Vanilla JS canvas</span></p>
            <p><span className="mono muted">Real-time</span><span>Native EventSource API</span></p>
            <p><span className="mono muted">State</span><span>useState + useEffect</span></p>
            <p><span className="mono muted">Fonts</span><span>Inter + JetBrains Mono</span></p>
            <p><span className="mono muted">Export</span><span>html2canvas for PDF export</span></p>
          </div>
        </div>
      </section>

      <section className="about-section">
        <h2 className="about-title">Built for EU AI Act Compliance</h2>
        <p className="about-body">Article 9 requires documented risk management for high-risk AI systems</p>
        <div className="compliance-grid">
          <article className="surface-card">
            <h3>✓ Audit Trail</h3>
            <p className="about-body">Every LLM call logged with full prompt, response, tokens, and timestamp. Immutable record in Snowflake.</p>
          </article>
          <article className="surface-card">
            <h3>✓ Risk Assessment</h3>
            <p className="about-body">Four-agent behavioral analysis produces a documented risk score for every agent session.</p>
          </article>
          <article className="surface-card">
            <h3>✓ Human Oversight</h3>
            <p className="about-body">Flag system surfaces anomalies for human review. Resolve workflow creates documented human decision record.</p>
          </article>
          <article className="surface-card">
            <h3>✓ Transparency</h3>
            <p className="about-body">Full agent verdict JSON exportable. Every score has an explanation. No black box outputs.</p>
          </article>
        </div>
      </section>

      <section className="about-section">
        <h2 className="about-title">Add to Your Agent in 3 Lines</h2>
        <pre className="about-code">
{`# Install
pip install agent-auditor

# Wrap your existing client (works with OpenAI, Anthropic, Gemini)
from agent_auditor import AuditWrapper

client = AuditWrapper(
    wrapped_client=openai.OpenAI(),
    session_name="production-support-bot",
    auditor_url="https://your-auditor.railway.app"
)

# All existing code works unchanged — every call is now audited
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": user_message}]
)`}
        </pre>
        <div className="actions">
          <button
            className="btn-outline"
            onClick={() => window.open('https://github.com/ramchandrachawla/AI-Agent-Auditor', '_blank', 'noopener,noreferrer')}
          >
            View on GitHub →
          </button>
          <button
            className="btn-outline"
            onClick={() => window.open('https://github.com/ramchandrachawla/AI-Agent-Auditor#readme', '_blank', 'noopener,noreferrer')}
          >
            Read the Docs →
          </button>
        </div>
      </section>

      <footer className="about-footer">
        <span>AI Agent Auditor · Built for the EU AI Act era</span>
        <span>GitHub · MIT License</span>
      </footer>
    </div>
  )
}
