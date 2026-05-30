import { useParams } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { LoadingState, ErrorState } from '@/components/LoadingState';
import { ArtifactThumbnail } from '@/components/ArtifactViewer';
import { useArtifact } from '@/hooks/useArtifactQueries';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactDetailPage() {
  const { artifactId } = useParams({ strict: false }) as { artifactId: string };
  const { data: artifact, isLoading, isError } = useArtifact(artifactId);

  const crumbs = [
    { label: 'Project', href: artifact ? `/projects/${artifact.project_id}?tab=artifacts` : '/workspaces' },
    { label: artifact?.filename ?? 'Artifact' },
  ];

  if (isLoading) return <AppShell topBarCrumbs={crumbs}><LoadingState /></AppShell>;
  if (isError || !artifact) return <AppShell topBarCrumbs={crumbs}><ErrorState message="Artifact not found." /></AppShell>;

  const meta = [
    { label: 'Type', value: artifact.type },
    { label: 'Content-Type', value: artifact.content_type },
    { label: 'Size', value: formatBytes(artifact.size_bytes) },
    { label: 'Status', value: artifact.processing_status },
    { label: 'Uploaded', value: new Date(artifact.uploaded_at).toLocaleString() },
    { label: 'ID', value: artifact.id },
  ];

  return (
    <AppShell activeProjectId={artifact.project_id} topBarCrumbs={crumbs}>
      <div className="page-wrap wide" style={{ paddingTop: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="pill" style={{ fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>
                {artifact.type}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>
                {formatBytes(artifact.size_bytes)}
              </span>
            </div>
            <h1 style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', margin: 0, wordBreak: 'break-all' }}>
              {artifact.filename}
            </h1>
          </div>
          {artifact.original_url && (
            <a
              href={artifact.original_url}
              download={artifact.filename}
              className="top-btn"
              style={{ textDecoration: 'none', flexShrink: 0, marginTop: 4 }}
            >
              Download
            </a>
          )}
        </div>

        {/* Viewer */}
        <div style={{ marginBottom: 28, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
          <ArtifactThumbnail artifact={artifact} expand />
        </div>

        {/* Metadata */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '6px 32px' }}>
          {meta.map(r => (
            <div key={r.label} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 90, flexShrink: 0 }}>
                {r.label}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
