/**
 * NewIterationWizard — 4-step modal wizard for creating a new iteration.
 *
 * Step 1  Basics            title, description, start/end dates
 * Step 2  Cycling protocol  freeform notes/params textarea (appended to description)
 * Step 3  Samples picker    multi-select from project samples → link via POST /iterations/{id}/samples
 * Step 4  AI risk register  run project_risk_v1, show drafted risks + PI-gate warning
 *
 * Props: { projectId, onClose }
 *
 * Deviation: "Cycling protocol" (Step 2) is stored by appending to the
 * iteration description, since no dedicated field exists on the model.
 */
import { useState } from 'react';
import {
  useCreateIteration,
  useProjectSamples,
  useLinkIterationSample,
} from '@/hooks/useQueries';
import { useRunWorkflow, useAIRun } from '@/hooks/useAIQueries';
import { LoadingState } from '@/components/LoadingState';
import { RiskRegister } from '@/components/RiskRegister';
import { ApiError } from '@/api/client';
import type { Sample } from '@/api/types';

// ─── Primitives ───────────────────────────────────────────────────────────────

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.30)',
          zIndex: 200,
          backdropFilter: 'blur(3px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          width: '100%',
          maxWidth: 580,
          padding: '0 16px',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </>
  );
}

function WizardCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-2)',
        borderRadius: 12,
        padding: '24px 28px 22px',
        boxShadow: '0 24px 72px rgba(20,18,14,0.22)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {children}
    </div>
  );
}

function StepHeader({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--muted-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          flexShrink: 0,
        }}
      >
        Step {step} / {total}
      </div>
      <div
        style={{
          flex: 1,
          height: 3,
          background: 'var(--line)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${(step / total) * 100}%`,
            background: 'var(--ember)',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14.5,
          color: 'var(--ink)',
          flexShrink: 0,
          marginLeft: 4,
        }}
      >
        {title}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        color: 'var(--muted-2)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
      }}
    >
      {children}
    </span>
  );
}

function FieldInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      style={{
        border: '1px solid var(--line-2)',
        borderRadius: 6,
        padding: '8px 10px',
        font: '13px/1.5 var(--sans)',
        color: 'var(--ink)',
        background: 'var(--paper)',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
      }}
    />
  );
}

function FieldTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        border: '1px solid var(--line-2)',
        borderRadius: 6,
        padding: '8px 10px',
        font: '13px/1.5 var(--sans)',
        color: 'var(--ink)',
        background: 'var(--paper)',
        outline: 'none',
        width: '100%',
        resize: 'vertical',
        boxSizing: 'border-box',
      }}
    />
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div
      style={{
        background: 'var(--pill-blocked-bg)',
        border: '1px solid var(--pill-blocked-bd)',
        borderRadius: 6,
        padding: '8px 12px',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        color: 'var(--pill-blocked-fg)',
      }}
    >
      {message}
    </div>
  );
}

function InfoBanner({ message, warn }: { message: string; warn?: boolean }) {
  return (
    <div
      style={{
        background: warn ? 'color-mix(in srgb, var(--bad) 8%, transparent)' : 'var(--paper-2)',
        border: `1px solid ${warn ? 'color-mix(in srgb, var(--bad) 30%, transparent)' : 'var(--line)'}`,
        borderRadius: 6,
        padding: '8px 12px',
        fontFamily: 'var(--mono)',
        fontSize: 11.5,
        color: warn ? 'var(--bad)' : 'var(--muted)',
        lineHeight: 1.55,
      }}
    >
      {message}
    </div>
  );
}

function WizardFooter({
  onBack,
  onNext,
  onFinish,
  onSkip,
  nextLabel,
  nextDisabled,
  nextLoading,
  step,
  total,
}: {
  onBack?: () => void;
  onNext?: () => void;
  onFinish?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  step: number;
  total: number;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {onBack && (
          <button className="top-btn" onClick={onBack} style={{ border: '1px solid var(--line-2)' }}>
            ← Back
          </button>
        )}
        {onSkip && (
          <button
            className="top-btn"
            onClick={onSkip}
            style={{ border: '1px solid var(--line-2)', color: 'var(--muted)' }}
          >
            Skip
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {step < total && onNext && (
          <button
            className="top-btn primary"
            onClick={onNext}
            disabled={nextDisabled || nextLoading}
            style={{ opacity: nextDisabled || nextLoading ? 0.7 : 1 }}
          >
            {nextLoading ? 'Working…' : (nextLabel ?? 'Next →')}
          </button>
        )}
        {step === total && onFinish && (
          <button
            className="top-btn primary"
            onClick={onFinish}
            disabled={nextLoading}
            style={{ opacity: nextLoading ? 0.7 : 1 }}
          >
            {nextLoading ? 'Finishing…' : 'Finish'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Samples Picker ───────────────────────────────────────────────────

function SamplesPickerStep({
  projectId,
  iterationId,
  onBack,
  onNext,
}: {
  projectId: string;
  iterationId: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data: samples = [], isLoading } = useProjectSamples(projectId);
  const linkSample = useLinkIterationSample(iterationId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNext = async () => {
    if (selected.size === 0) {
      onNext();
      return;
    }
    setError(null);
    setLinking(true);
    try {
      for (const sampleId of selected) {
        await linkSample.mutateAsync({ sample_id: sampleId });
      }
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link samples.');
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      <StepHeader step={3} total={4} title="Samples" />
      <InfoBanner message="Select samples to link to this iteration. You can add or remove samples later from the iteration detail page." />

      {isLoading ? (
        <LoadingState message="Loading samples…" />
      ) : samples.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>No samples in this project yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto' }}>
          {samples.map((s: Sample) => {
            const sel = selected.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 10px',
                  background: sel ? 'var(--ember-tint)' : 'var(--paper-2)',
                  border: `1px solid ${sel ? 'var(--ember-soft)' : 'var(--line)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `2px solid ${sel ? 'var(--ember)' : 'var(--line-2)'}`,
                    background: sel ? 'var(--ember)' : 'transparent',
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {sel && (
                    <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontWeight: 700 }}>✓</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 11.5,
                      color: 'var(--ink)',
                      fontWeight: 600,
                    }}
                  >
                    {s.identifier}
                  </span>
                  {s.name && (
                    <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>
                      {s.name}
                    </span>
                  )}
                </div>
                <span className={`pill k-${s.kind}`} style={{ flexShrink: 0 }}>{s.kind}</span>
              </button>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginTop: -8 }}>
          {selected.size} sample{selected.size !== 1 ? 's' : ''} selected
        </div>
      )}

      {error && <FormError message={error} />}

      <WizardFooter
        step={3}
        total={4}
        onBack={onBack}
        onSkip={onNext}
        onNext={() => void handleNext()}
        nextLabel={selected.size > 0 ? `Link ${selected.size} & continue →` : 'Next →'}
        nextLoading={linking}
      />
    </>
  );
}

// ─── Step 4: AI Risk Register ─────────────────────────────────────────────────

function AIRiskStep({
  projectId,
  iterationId,
  onBack,
  onFinish,
}: {
  projectId: string;
  iterationId: string;
  onBack: () => void;
  onFinish: () => void;
}) {
  const runWorkflow = useRunWorkflow();
  const [runId, setRunId] = useState<string | undefined>();
  const [runError, setRunError] = useState<string | null>(null);
  const { data: run, isLoading: runLoading } = useAIRun(runId);

  const handleRun = async () => {
    setRunError(null);
    try {
      const result = await runWorkflow.mutateAsync({ key: 'project_risk_v1', project_id: projectId });
      setRunId(result.id);
    } catch (e) {
      const msg = e instanceof ApiError
        ? (e.status === 503 ? 'AI service unavailable — you can skip this step.' : e.message)
        : 'AI service unavailable — you can skip this step.';
      setRunError(msg);
    }
  };

  const isRunning = runWorkflow.isPending || (run?.status === 'running' && runLoading);
  const isDone = run?.status === 'completed' || run?.status === 'failed';

  return (
    <>
      <StepHeader step={4} total={4} title="AI Risk Register" />

      <InfoBanner
        warn
        message="A HIGH-likelihood risk flagged for PI review will block activating this iteration until a PI signs off and the risk is resolved."
      />

      <InfoBanner message="Run the AI risk assessment to draft risks for this iteration. You can skip and add risks manually later." />

      {runError && <FormError message={runError} />}

      {!runId && (
        <button
          className="top-btn primary"
          onClick={() => void handleRun()}
          disabled={isRunning}
          style={{ alignSelf: 'flex-start', opacity: isRunning ? 0.7 : 1 }}
        >
          {isRunning ? 'Running…' : 'Run risk assessment'}
        </button>
      )}

      {runId && !isDone && (
        <LoadingState message="AI is drafting risks…" />
      )}

      {runId && isDone && (
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: 'var(--muted-2)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginBottom: 10,
            }}
          >
            Drafted risks
          </div>
          <RiskRegister projectId={projectId} iterationId={iterationId} />
        </div>
      )}

      <WizardFooter
        step={4}
        total={4}
        onBack={onBack}
        onFinish={onFinish}
        onSkip={onFinish}
      />
    </>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

interface NewIterationWizardProps {
  projectId: string;
  onClose: () => void;
}

export function NewIterationWizard({ projectId, onClose }: NewIterationWizardProps) {
  const createIteration = useCreateIteration(projectId);

  const [step, setStep] = useState(1);

  // Step 1 fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

  // Step 2 field (cycling protocol — appended to description)
  const [protocol, setProtocol] = useState('');

  // Created iteration id (set after step 1/2 creates the record)
  const [iterationId, setIterationId] = useState<string | null>(null);

  const [createError, setCreateError] = useState<string | null>(null);

  // Create the iteration when advancing from Step 2 (Basics + Protocol combined)
  const handleCreateIteration = async () => {
    if (!title.trim()) return;
    setCreateError(null);
    try {
      const combinedDescription = protocol.trim()
        ? `${description.trim()}\n\n--- Cycling Protocol ---\n${protocol.trim()}`.trim()
        : description.trim();
      const it = await createIteration.mutateAsync({
        title: title.trim(),
        description: combinedDescription || undefined,
        start_at: startAt || undefined,
        end_at: endAt || undefined,
      });
      setIterationId(it.id);
      setStep(3);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create iteration.');
    }
  };

  return (
    <Backdrop onClose={onClose}>
      <WizardCard>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 400, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            New Iteration
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            style={{ fontSize: 14, color: 'var(--muted)', marginLeft: 8 }}
          >
            ✕
          </button>
        </div>

        {/* Step 1: Basics */}
        {step === 1 && (
          <>
            <StepHeader step={1} total={4} title="Basics" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel>Title</FieldLabel>
              <FieldInput
                value={title}
                onChange={setTitle}
                placeholder="e.g. Formation cycle batch 1"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel>Description (optional)</FieldLabel>
              <FieldTextarea
                value={description}
                onChange={setDescription}
                placeholder="What does this iteration cover?"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <FieldLabel>Start date</FieldLabel>
                <input
                  type="date"
                  value={startAt}
                  onChange={e => setStartAt(e.target.value)}
                  style={{
                    border: '1px solid var(--line-2)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    font: '13px/1.5 var(--sans)',
                    color: 'var(--ink)',
                    background: 'var(--paper)',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <FieldLabel>End date</FieldLabel>
                <input
                  type="date"
                  value={endAt}
                  onChange={e => setEndAt(e.target.value)}
                  style={{
                    border: '1px solid var(--line-2)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    font: '13px/1.5 var(--sans)',
                    color: 'var(--ink)',
                    background: 'var(--paper)',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <WizardFooter
              step={1}
              total={4}
              onNext={() => setStep(2)}
              nextDisabled={!title.trim()}
              nextLabel="Next →"
            />
          </>
        )}

        {/* Step 2: Cycling Protocol */}
        {step === 2 && (
          <>
            <StepHeader step={2} total={4} title="Cycling Protocol" />

            <InfoBanner message="Add cycling parameters, protocol notes, or experimental conditions. These will be appended to the iteration description." />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel>Protocol notes / parameters</FieldLabel>
              <FieldTextarea
                value={protocol}
                onChange={setProtocol}
                placeholder="e.g. C/10 formation, 3 cycles at C/5, then 1C cycling..."
                rows={6}
              />
            </div>

            {createError && <FormError message={createError} />}

            <WizardFooter
              step={2}
              total={4}
              onBack={() => setStep(1)}
              onSkip={() => void handleCreateIteration()}
              onNext={() => void handleCreateIteration()}
              nextLabel="Create & continue →"
              nextLoading={createIteration.isPending}
            />
          </>
        )}

        {/* Step 3: Samples */}
        {step === 3 && iterationId && (
          <SamplesPickerStep
            projectId={projectId}
            iterationId={iterationId}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}

        {/* Step 4: AI Risk Register */}
        {step === 4 && iterationId && (
          <AIRiskStep
            projectId={projectId}
            iterationId={iterationId}
            onBack={() => setStep(3)}
            onFinish={onClose}
          />
        )}
      </WizardCard>
    </Backdrop>
  );
}
