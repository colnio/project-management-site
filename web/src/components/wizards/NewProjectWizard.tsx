/**
 * NewProjectWizard — 4-step modal wizard for creating a new project.
 *
 * Step 1  Basics          name + description
 * Step 2  AI Risk Assess  run project_risk_v1 workflow, show RiskRegister
 * Step 3  Team            list workspace members (read-only, informational)
 * Step 4  First iteration optional title + dates → useCreateIteration
 *
 * Props: { workspaceId, onClose }
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useCreateProject,
  useWorkspaceMembers,
  useCreateIteration,
} from '@/hooks/useQueries';
import { useRunWorkflow, useAIRun } from '@/hooks/useAIQueries';
import { LoadingState } from '@/components/LoadingState';
import { RiskRegister } from '@/components/RiskRegister';
import { ApiError } from '@/api/client';

// ─── Primitives (shared with WorkspacesPage style) ────────────────────────────

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
          maxWidth: 560,
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

function InfoBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        background: 'var(--paper-2)',
        border: '1px solid var(--line)',
        borderRadius: 6,
        padding: '8px 12px',
        fontFamily: 'var(--mono)',
        fontSize: 11.5,
        color: 'var(--muted)',
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
            {nextLoading ? 'Finishing…' : 'Finish & open project'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: AI Risk Assessment ───────────────────────────────────────────────

function AIRiskStep({
  projectId,
  onNext,
}: {
  projectId: string;
  onNext: () => void;
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
      <StepHeader step={2} total={4} title="AI Risk Assessment" />
      <InfoBanner message="Run the AI risk assessment to draft a risk register for this project. You can skip and add risks manually later." />

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
        <div style={{ marginTop: 8 }}>
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
          <RiskRegister projectId={projectId} />
        </div>
      )}

      <WizardFooter
        step={2}
        total={4}
        onBack={() => {}}
        onSkip={onNext}
        onNext={onNext}
        nextLabel="Next →"
        nextDisabled={false}
      />
    </>
  );
}

// ─── Step 3: Team ─────────────────────────────────────────────────────────────

function TeamStep({
  workspaceId,
  onBack,
  onNext,
}: {
  workspaceId: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data: members = [], isLoading } = useWorkspaceMembers(workspaceId);

  return (
    <>
      <StepHeader step={3} total={4} title="Team" />
      <InfoBanner message="Current workspace members will have access to this project. You can manage collaborators from the project settings later." />

      {isLoading ? (
        <LoadingState message="Loading members…" />
      ) : members.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>No workspace members found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {members.map(m => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                background: 'var(--paper-2)',
                border: '1px solid var(--line)',
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--ember-tint)',
                  color: 'var(--ember)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'var(--serif)',
                  flexShrink: 0,
                }}
              >
                {m.user_id[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>
                  {m.user_id.slice(0, 16)}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--muted-2)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {m.role}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <WizardFooter
        step={3}
        total={4}
        onBack={onBack}
        onSkip={onNext}
        onNext={onNext}
        nextLabel="Next →"
      />
    </>
  );
}

// ─── Step 4: First Iteration ──────────────────────────────────────────────────

function FirstIterationStep({
  projectId,
  onBack,
  onFinish,
}: {
  projectId: string;
  onBack: () => void;
  onFinish: () => void;
}) {
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createIter = useCreateIteration(projectId);

  const handleFinish = async () => {
    setError(null);
    if (title.trim()) {
      try {
        await createIter.mutateAsync({
          title: title.trim(),
          start_at: startAt ? new Date(startAt).toISOString() : undefined,
          end_at: endAt ? new Date(endAt).toISOString() : undefined,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create iteration.');
        return;
      }
    }
    onFinish();
  };

  return (
    <>
      <StepHeader step={4} total={4} title="First Iteration" />
      <InfoBanner message="Optionally create the first iteration for this project. Leave blank to skip." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <FieldLabel>Iteration title (optional)</FieldLabel>
        <FieldInput
          value={title}
          onChange={setTitle}
          placeholder="e.g. Formation cycle batch 1"
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

      {error && <FormError message={error} />}

      <WizardFooter
        step={4}
        total={4}
        onBack={onBack}
        onFinish={() => void handleFinish()}
        nextLoading={createIter.isPending}
      />
    </>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

interface NewProjectWizardProps {
  workspaceId: string;
  onClose: () => void;
}

export function NewProjectWizard({ workspaceId, onClose }: NewProjectWizardProps) {
  const navigate = useNavigate();
  const createProject = useCreateProject(workspaceId);

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('workspace');
  const [error, setError] = useState<string | null>(null);

  // projectId is set after step 1 creates the project
  const [projectId, setProjectId] = useState<string | null>(null);

  const handleStep1Next = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      const project = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
      });
      setProjectId(project.id);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project.');
    }
  };

  const handleFinish = async () => {
    if (!projectId) return;
    onClose();
    await navigate({ to: '/projects/$projectId', params: { projectId } });
  };

  return (
    <Backdrop onClose={onClose}>
      <WizardCard>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 400, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            New Project
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
              <FieldLabel>Project name</FieldLabel>
              <FieldInput
                value={name}
                onChange={setName}
                placeholder="e.g. NMC 4.30V cycling"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel>Description (optional)</FieldLabel>
              <FieldTextarea
                value={description}
                onChange={setDescription}
                placeholder="Brief description of project goals"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel>Visibility</FieldLabel>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value)}
                style={{
                  border: '1px solid var(--line-2)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  font: '13px/1.5 var(--sans)',
                  color: 'var(--ink)',
                  background: 'var(--paper)',
                  outline: 'none',
                }}
              >
                <option value="workspace">Workspace (all members)</option>
                <option value="private">Private (collaborators only)</option>
              </select>
            </div>

            {error && <FormError message={error} />}

            <WizardFooter
              step={1}
              total={4}
              onNext={() => void handleStep1Next()}
              nextLabel="Create & continue →"
              nextDisabled={!name.trim()}
              nextLoading={createProject.isPending}
            />
          </>
        )}

        {/* Step 2: AI Risk Assessment */}
        {step === 2 && projectId && (
          <AIRiskStep
            projectId={projectId}
            onNext={() => setStep(3)}
          />
        )}

        {/* Step 3: Team */}
        {step === 3 && (
          <TeamStep
            workspaceId={workspaceId}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}

        {/* Step 4: First Iteration */}
        {step === 4 && projectId && (
          <FirstIterationStep
            projectId={projectId}
            onBack={() => setStep(3)}
            onFinish={() => void handleFinish()}
          />
        )}
      </WizardCard>
    </Backdrop>
  );
}
