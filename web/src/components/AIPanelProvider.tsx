/**
 * AIPanelProvider — global context that owns the AI chat panel's open state, an
 * optional "seed" (skill + kickoff message) for the "Review with AI" flow, and
 * the project/workspace the panel is bound to. The provider renders the
 * AIChatPanel itself, so it can be mounted once at the app root and opened from
 * anywhere (dashboards, the project-creation wizard modal, etc.).
 *
 * Usage:
 *   // Open for generic chat on a project:
 *   const { toggle } = useAIPanel();
 *   <button onClick={() => toggle({ projectId, workspaceId })}>Ask AI</button>
 *
 *   // Open a skill-seeded conversation (risk assessment):
 *   const { reviewWithAI } = useAIPanel();
 *   <button onClick={() => reviewWithAI('risk_assessment_skill', 'Begin…', { projectId, workspaceId })}>
 *     Run risk assessment
 *   </button>
 */
import { createContext, useContext, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AIChatPanel } from '@/components/AIChatPanel';
import { api } from '@/api/client';
import { aiKeys, type AIConversation } from '@/hooks/useAIQueries';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIPanelSeed {
  skill?: string;
  message?: string;
  /**
   * When set, the panel selects this freshly-created conversation directly
   * instead of creating one itself. The provider creates it once per
   * reviewWithAI() call, which avoids the double-creation race that an
   * effect-based create suffers under React StrictMode.
   */
  convId?: string;
}

/** Where the panel should be bound: which project (and optionally workspace). */
export interface AIPanelTarget {
  projectId: string;
  workspaceId?: string;
}

interface AIPanelContextValue {
  open: boolean;
  toggle: (target?: AIPanelTarget) => void;
  openPanel: (target: AIPanelTarget) => void;
  close: () => void;
  reviewWithAI: (skill: string, message: string, target: AIPanelTarget) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AIPanelContext = createContext<AIPanelContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AIPanelProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<AIPanelSeed | undefined>(undefined);
  const [target, setTarget] = useState<AIPanelTarget | undefined>(undefined);

  const close = useCallback(() => {
    setOpen(false);
    setSeed(undefined);
  }, []);

  const toggle = useCallback((next?: AIPanelTarget) => {
    setOpen(prev => {
      if (prev) {
        setSeed(undefined);
        return false;
      }
      if (next) setTarget(next);
      return true;
    });
  }, []);

  const openPanel = useCallback((next: AIPanelTarget) => {
    setTarget(next);
    setOpen(true);
  }, []);

  const reviewWithAI = useCallback((skill: string, message: string, next: AIPanelTarget) => {
    // Create the skill-scoped conversation up front (once per click) so the
    // procedure always starts fresh at Phase 1 and there is no mount-time race.
    setTarget(next);
    setSeed({ skill, message });
    setOpen(true);
    void api
      .post<AIConversation>(`/v1/projects/${next.projectId}/ai/conversations`, {
        title: 'Risk Assessment',
        skill,
      })
      .then(conv => {
        void qc.invalidateQueries({ queryKey: aiKeys.conversations(next.projectId) });
        setSeed({ skill, message, convId: conv.id });
      })
      .catch(() => {
        // Leave the skill-only seed in place; the panel falls back to creating
        // the conversation itself.
      });
  }, [qc]);

  return (
    <AIPanelContext.Provider value={{ open, toggle, openPanel, close, reviewWithAI }}>
      {children}
      {open && target?.projectId && (
        <AIChatPanel
          projectId={target.projectId}
          workspaceId={target.workspaceId}
          onClose={close}
          seed={seed}
        />
      )}
    </AIPanelContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the AI panel context. Degrades gracefully (returns a no-op stub)
 * when called outside an AIPanelProvider so components like RiskRegister
 * don't crash in tests or isolated renders.
 */
export function useAIPanel(): AIPanelContextValue {
  const ctx = useContext(AIPanelContext);
  if (!ctx) {
    return {
      open: false,
      toggle: () => undefined,
      openPanel: () => undefined,
      close: () => undefined,
      reviewWithAI: () => undefined,
    };
  }
  return ctx;
}
