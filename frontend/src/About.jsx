export default function About() {
  return (
    <div className="about-page">
      <div
        style={{
          textAlign: 'center',
          padding: '64px 32px 48px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'inline-flex', gap: '8px', marginBottom: '20px' }}>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              border: '1px solid rgba(99,102,241,0.3)',
              color: '#6366f1',
            }}
          >
            Open Source
          </span>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              border: '1px solid rgba(16,185,129,0.3)',
              color: '#10b981',
            }}
          >
            EU AI Act Ready
          </span>
        </div>
        <h1
          style={{
            fontSize: '48px',
            fontWeight: 600,
            color: '#f1f5f9',
            margin: '0 0 12px',
            letterSpacing: '-1px',
          }}
        >
          Sentinel
        </h1>
        <p
          style={{
            fontSize: '18px',
            color: '#6366f1',
            margin: '0 0 16px',
            fontWeight: 500,
          }}
        >
          LLM Behavioral Intelligence Platform
        </p>
        <p
          style={{
            fontSize: '15px',
            color: '#64748b',
            maxWidth: '600px',
            margin: '0 auto',
            lineHeight: 1.7,
          }}
        >
          Real-time behavioral monitoring for LLM agents. Catches hallucinations, safety violations, cost overruns, and
          EU AI Act compliance gaps — before they reach users.
        </p>
      </div>

      <section className="about-section two-col" style={{ paddingTop: '48px', paddingBottom: '48px' }}>
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
        <h2 className="about-title">Using the Dashboard</h2>
        <p className="about-body">
          The web UI is your control room for captured agent sessions. Start on Sessions to browse traffic, open Live
          Audit to run the four-agent committee on a session, review Flags for anomalies, and export Reports when you
          need a compliance snapshot.
        </p>
        <div className="committee-grid">
          <article className="surface-card committee-card">
            <h3>Sessions</h3>
            <p className="about-body">
              Lists every instrumented agent run. Click a row to open session detail — prompts, responses, token counts,
              and per-event cost. The Events column shows how many LLM calls were captured. Search filters by agent name
              or session ID.
            </p>
          </article>
          <article className="surface-card committee-card">
            <h3>Live Audit</h3>
            <p className="about-body">
              Pick a session, click Run Audit, and watch four specialist agents score the session in real time over SSE.
              The bar chart summarizes agent scores (0–100). Use Run Again on the same session without losing your
              selection. Clear results resets the panel but keeps the session.
            </p>
          </article>
          <article className="surface-card committee-card">
            <h3>Flags</h3>
            <p className="about-body">
              Anomalies raised during audits or heuristics. Severity (low → critical), flag type, and description explain
              what triggered review. Resolve when a human has triaged the issue — resolution is recorded for the audit
              trail.
            </p>
          </article>
          <article className="surface-card committee-card">
            <h3>Reports &amp; Settings</h3>
            <p className="about-body">
              Fetch Full Report on Live Audit exports the committee JSON for a session. Settings configures API base URL,
              score thresholds, and connection health. Rate limits protect list endpoints — if you see a 429, wait for
              Retry-After seconds (Redis-backed when available).
            </p>
          </article>
        </div>
      </section>

      <section className="about-section">
        <h2 className="about-title">What the Numbers Mean</h2>
        <div className="surface-card">
          <table className="sessions-table">
            <thead>
              <tr>
                <th>Term</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Agent score (0–100)</td>
                <td>Higher is better. Each committee agent scores from its lens (accuracy, safety, cost efficiency, compliance).</td>
              </tr>
              <tr>
                <td>Overall score</td>
                <td>Weighted synthesis of the four agents. Shown beside the committee verdict badge.</td>
              </tr>
              <tr>
                <td>Verdict: SAFE</td>
                <td>No agent flagged critical issues; overall score meets the safe band.</td>
              </tr>
              <tr>
                <td>Verdict: FLAGGED</td>
                <td>At least one agent or heuristic raised a concern worth human review.</td>
              </tr>
              <tr>
                <td>Verdict: CRITICAL</td>
                <td>Severe safety, compliance, or hallucination risk — treat as incident-grade.</td>
              </tr>
              <tr>
                <td>Verdict: CONTESTED</td>
                <td>Agents disagree materially (high dissent). Inspect individual scores before trusting the headline verdict.</td>
              </tr>
              <tr>
                <td>Dissent (pts)</td>
                <td>Spread between highest and lowest agent score. Under 15 = aligned; 30+ = committee disagreement.</td>
              </tr>
              <tr>
                <td>⚑ Flagged (agent card)</td>
                <td>That agent scored below the review threshold (~70) or raised an explicit flag.</td>
              </tr>
              <tr>
                <td>Event log</td>
                <td>Streaming audit milestones: connect, per-agent results, flags, final verdict.</td>
              </tr>
              <tr>
                <td>Cost (USD)</td>
                <td>Estimated API spend from published per-1K token rates for the model on each event.</td>
              </tr>
            </tbody>
          </table>
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
{`from sentinel import AuditWrapper
client = AuditWrapper(openai.OpenAI(), session_name="my-agent")`}
            </pre>
          </article>
          <span className="how-arrow">→</span>
          <article className="surface-card how-card">
            <p className="how-number">2</p>
            <h3>CAPTURE</h3>
            <p className="about-body">
              Every LLM call — prompt, response, tokens, latency — is intercepted and streamed to Sentinel in
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
            <p><span className="mono muted">Export</span><span>JSON reports + browser print on Reports</span></p>
          </div>
        </div>
      </section>

      <section className="about-section">
        <h2 className="about-title">Real Cost Tracking</h2>
        <p className="about-body">
          Every LLM call is priced in real time using published API rates. GPT-4o costs $0.005 per 1K input tokens.
          Sentinel tracks spend per event, per session, and projects monthly cost at current usage rates. You always
          know exactly what your agent is costing you.
        </p>
        <div className="surface-card">
          <table className="sessions-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Input (per 1K tokens)</th>
                <th>Output (per 1K tokens)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>gpt-4o</td><td>$0.005</td><td>$0.015</td></tr>
              <tr><td>gpt-4o-mini</td><td>$0.00015</td><td>$0.0006</td></tr>
              <tr><td>gpt-3.5-turbo</td><td>$0.0005</td><td>$0.0015</td></tr>
              <tr><td>gemini-2.5-flash</td><td>$0.000075</td><td>$0.0003</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="about-section">
        <h2 className="about-title">EU AI Act Article Coverage</h2>
        <div className="surface-card">
          <table className="sessions-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Name</th>
                <th>Agent Coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Article 9</td><td>Risk Management</td><td>Compliance Agent</td><td>✓</td></tr>
              <tr><td>Article 10</td><td>Data Governance</td><td>Hallucination Agent</td><td>✓</td></tr>
              <tr><td>Article 13</td><td>Transparency</td><td>Safety Agent</td><td>✓</td></tr>
              <tr><td>Article 14</td><td>Human Oversight</td><td>All agents (flag for review)</td><td>✓</td></tr>
              <tr><td>Article 15</td><td>Accuracy</td><td>Hallucination + Cost agents</td><td>✓</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="about-section">
        <h2 className="about-title">Deploy in 5 Minutes</h2>
        <div className="committee-grid">
          <article className="surface-card committee-card">
            <h3>Local</h3>
            <p className="about-body">git clone + pip install + uvicorn main:app</p>
          </article>
          <article className="surface-card committee-card">
            <h3>Railway</h3>
            <p className="about-body">Connect GitHub repo → Deploy → Add env vars</p>
          </article>
          <article className="surface-card committee-card">
            <h3>Docker</h3>
            <p className="about-body">docker-compose up (coming soon)</p>
          </article>
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
pip install sentinel-sdk

# Wrap your existing client (works with OpenAI, Anthropic, Gemini)
from sentinel import AuditWrapper

client = AuditWrapper(
    wrapped_client=openai.OpenAI(),
    session_name="production-support-bot",
    sentinel_url="https://your-sentinel.railway.app"
)

# All existing code works unchanged — every call is now monitored by Sentinel
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
            Sentinel on GitHub →
          </button>
          <button
            className="btn-outline"
            onClick={() => window.open('https://github.com/ramchandrachawla/AI-Agent-Auditor#readme', '_blank', 'noopener,noreferrer')}
          >
            Sentinel Docs →
          </button>
        </div>
      </section>

      <footer className="about-footer">
        <span>Sentinel · Built for the EU AI Act era</span>
        <span>GitHub · MIT License</span>
      </footer>
    </div>
  )
}
