import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Btn } from '../design/AppShell.jsx'
import { getApiBase } from '../api/client'
import { requestNotificationPermission } from '../utils/notifications'
import { markOnboardingComplete } from '../utils/onboarding'

const SDK_COMMAND = `cd AI-Agent-Auditor
pip install -r requirements.txt
python sdk-demo/demo_agent.py`

const DEMO_COMMAND = 'python sdk-demo/demo_agent.py'

export default function OnboardingWizard({ open, onComplete, sessionsCount = 0 }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [healthStatus, setHealthStatus] = useState('idle')
  const [healthError, setHealthError] = useState('')
  const [copied, setCopied] = useState('')
  const [demoStatus, setDemoStatus] = useState('idle')

  const testConnection = useCallback(async () => {
    setHealthStatus('loading')
    setHealthError('')
    try {
      const res = await fetch(`${getApiBase()}/health`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setHealthStatus('ok')
    } catch (err) {
      setHealthStatus('error')
      setHealthError(err.message || 'Could not reach backend')
    }
  }, [])

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      setCopied('')
    }
  }

  const finish = async () => {
    await requestNotificationPermission()
    markOnboardingComplete()
    onComplete?.()
    navigate(sessionsCount > 0 ? '/sessions' : '/live')
  }

  const skip = () => {
    markOnboardingComplete()
    onComplete?.()
  }

  if (!open) return null

  const steps = [
    {
      title: 'Connect to Sentinel',
      body: 'Make sure the FastAPI backend is running on port 8000.',
    },
    {
      title: 'Install the SDK',
      body: 'Wrap your LLM client so every call is captured automatically.',
    },
    {
      title: 'Run the demo agent',
      body: 'Generate your first session and events in under a minute.',
    },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(0,0,0,0.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: 'var(--s-6)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        <p className="aaa-label-tiny" style={{ color: 'var(--primary)', marginBottom: 8 }}>
          WELCOME TO SENTINEL
        </p>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--text)' }}>{steps[step].title}</h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>{steps[step].body}</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i <= step ? 'var(--primary)' : 'var(--border)',
              }}
            />
          ))}
        </div>

        {step === 0 ? (
          <div>
            <Btn kind="primary" onClick={testConnection} disabled={healthStatus === 'loading'}>
              {healthStatus === 'loading' ? 'Testing…' : 'Test connection'}
            </Btn>
            {healthStatus === 'ok' ? (
              <p style={{ color: 'var(--success)', fontSize: 13, marginTop: 12 }}>✓ Backend reachable at {getApiBase()}</p>
            ) : null}
            {healthStatus === 'error' ? (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>
                ✕ {healthError}. Start with: <code style={{ fontSize: 12 }}>cd backend && uvicorn main:app --reload</code>
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <pre
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 12,
                fontSize: 11,
                overflow: 'auto',
                color: 'var(--text-soft)',
                marginBottom: 12,
              }}
            >
              {SDK_COMMAND}
            </pre>
            <Btn kind="ghost" onClick={() => copyText(SDK_COMMAND, 'sdk')}>
              {copied === 'sdk' ? 'Copied!' : 'Copy install command'}
            </Btn>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
              Then wrap your client: <code>AuditWrapper(client, session_name=&quot;my-agent&quot;)</code>
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <pre
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 12,
                fontSize: 11,
                color: 'var(--text-soft)',
                marginBottom: 12,
              }}
            >
              {DEMO_COMMAND}
            </pre>
            <Btn kind="ghost" onClick={() => copyText(DEMO_COMMAND, 'demo')}>
              {copied === 'demo' ? 'Copied!' : 'Copy demo command'}
            </Btn>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
              Run from the project root with the API up. Refresh Sessions to see <strong>sdk-demo-agent</strong>.
            </p>
            {demoStatus === 'hint' ? (
              <p style={{ color: 'var(--success)', fontSize: 13, marginTop: 8 }}>After running, open Sessions or Live Audit.</p>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, gap: 12 }}>
          <button type="button" onClick={skip} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>
            Skip setup
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 ? (
              <Btn kind="ghost" onClick={() => setStep((s) => s - 1)}>
                Back
              </Btn>
            ) : null}
            {step < 2 ? (
              <Btn
                kind="primary"
                onClick={async () => {
                  if (step === 0) {
                    if (healthStatus !== 'ok') {
                      await testConnection()
                      return
                    }
                    setStep(1)
                    return
                  }
                  setStep((s) => s + 1)
                }}
              >
                {step === 0 && healthStatus !== 'ok' ? 'Test & continue' : 'Next'}
              </Btn>
            ) : (
              <Btn
                kind="primary"
                onClick={() => {
                  setDemoStatus('hint')
                  finish()
                }}
              >
                Finish setup
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
