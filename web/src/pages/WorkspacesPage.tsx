import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, EmptyState, ErrorState } from '@/components/LoadingState';
import {
  useWorkspaces,
  useProjects,
  useCreateWorkspace,
} from '@/hooks/useQueries';
import { NewProjectWizard } from '@/components/wizards/NewProjectWizard';
import type { Workspace } from '@/api/types';

// ─── Dialogs ─────────────────────────────────────────────────────────────────

interface DialogProps {
  onClose: () => void;
}

function NewWorkspaceDialog({ onClose }: DialogProps) {
  const [name, setName] = useState('');
  const mutation = useCreateWorkspace();

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await mutation.mutateAsync(name.trim());
    onClose();
  };

  return (
    <Backdrop onClose={onClose}>
      <Dialog title="New Workspace">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <FieldLabel>Workspace name</FieldLabel>
          <TextInput
            value={name}
            onChange={setName}
            placeholder="e.g. Graphene Lab"
            autoFocus
          />
        </label>
        {mutation.error && <FormError message={String(mutation.error)} />}
        <DialogFooter>
          <CancelButton onClick={onClose} />
          <SubmitButton
            onClick={() => void handleSubmit()}
            loading={mutation.isPending}
            disabled={!name.trim()}
          >
            Create workspace
          </SubmitButton>
        </DialogFooter>
      </Dialog>
    </Backdrop>
  );
}

// ─── Workspace Projects List ─────────────────────────────────────────────────

function WorkspaceSection({
  workspace,
}: {
  workspace: Workspace;
}) {
  const { data: projects = [], isLoading } = useProjects(workspace.id);
  const [showNewProject, setShowNewProject] = useState(false);
  const navigate = useNavigate();

  return (
    <section style={{ marginBottom: 48 }}>
      <div className="section-h">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: 'var(--ink)',
              color: 'var(--paper)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'Libre Baskerville, serif',
            }}
          >
            {workspace.name[0]?.toUpperCase()}
          </span>
          {workspace.name}
        </h2>
        <span className="meta">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
        <span className="right">
          <button
            className="top-btn primary"
            onClick={() => setShowNewProject(true)}
          >
            + New project
          </button>
        </span>
      </div>

      {isLoading ? (
        <LoadingState message="Loading projects…" />
      ) : projects.length === 0 ? (
        <EmptyState message="No projects yet. Create one to get started." />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 14,
          }}
        >
          {projects.map(p => (
            <button
              key={p.id}
              className="rec"
              onClick={() =>
                void navigate({ to: '/projects/$projectId', params: { projectId: p.id } })
              }
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: 'var(--ember-tint)',
                    color: 'var(--ember)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 20,
                    fontFamily: 'Libre Baskerville, serif',
                    fontWeight: 700,
                    flexShrink: 0,
                    border: '1px solid var(--ember-soft)',
                  }}
                >
                  {p.name[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: 'var(--ink)',
                      marginBottom: 2,
                    }}
                  >
                    {p.name}
                  </div>
                  {p.description && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--muted)',
                        lineHeight: 1.45,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {p.description}
                    </div>
                  )}
                </div>
              </div>
              <div className="foot" style={{ marginTop: 10 }}>
                {p.visibility === 'private' ? (
                  <span className="pill">private</span>
                ) : (
                  <span className="pill">workspace</span>
                )}
                <span
                  style={{
                    marginLeft: 'auto',
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--muted-2)',
                  }}
                >
                  {new Date(p.updated_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}

          {/* Create new project card */}
          <button
            className="rec"
            onClick={() => setShowNewProject(true)}
            style={{
              borderStyle: 'dashed',
              color: 'var(--muted)',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 100,
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 26, lineHeight: 1, fontFamily: 'var(--serif)' }}>＋</span>
            <span style={{ fontSize: 12.5 }}>New project</span>
          </button>
        </div>
      )}

      {showNewProject && (
        <NewProjectWizard
          workspaceId={workspace.id}
          onClose={() => setShowNewProject(false)}
        />
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function WorkspacesPage() {
  const { data: workspaces = [], isLoading, isError } = useWorkspaces();
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);

  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Workspaces' }];

  return (
    <AppShell topBarCrumbs={crumbs}>
      <div className="page-wrap wide">
        <div className="section-h" style={{ marginTop: 8 }}>
          <h2>Workspaces</h2>
          <span className="meta">{workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}</span>
          <span className="right">
            <button
              className="top-btn primary"
              onClick={() => setShowNewWorkspace(true)}
            >
              + New workspace
            </button>
          </span>
        </div>

        {isLoading && <LoadingState message="Loading workspaces…" />}
        {isError && <ErrorState message="Failed to load workspaces." />}
        {!isLoading && !isError && workspaces.length === 0 && (
          <EmptyState message="No workspaces yet. Create one to get started." />
        )}

        {workspaces.map(ws => (
          <WorkspaceSection key={ws.id} workspace={ws} />
        ))}
      </div>

      {showNewWorkspace && (
        <NewWorkspaceDialog onClose={() => setShowNewWorkspace(false)} />
      )}
    </AppShell>
  );
}

// ─── Dialog Primitives ────────────────────────────────────────────────────────

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.25)',
          zIndex: 200,
          backdropFilter: 'blur(2px)',
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
          maxWidth: 440,
          padding: '0 16px',
        }}
      >
        {children}
      </div>
    </>
  );
}

function Dialog({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-2)',
        borderRadius: 10,
        padding: '22px 24px 20px',
        boxShadow: '0 20px 60px rgba(20,18,14,0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 15,
          color: 'var(--ink)',
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--muted-2)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </span>
  );
}

function TextInput({
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
        padding: '7px 10px',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        color: 'var(--pill-blocked-fg)',
      }}
    >
      {message}
    </div>
  );
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
      {children}
    </div>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="top-btn"
      onClick={onClick}
      style={{ border: '1px solid var(--line-2)' }}
    >
      Cancel
    </button>
  );
}

function SubmitButton({
  onClick,
  loading,
  disabled,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className="top-btn primary"
      onClick={onClick}
      disabled={loading || disabled}
      style={{ opacity: loading || disabled ? 0.7 : 1 }}
    >
      {loading ? 'Creating…' : children}
    </button>
  );
}
