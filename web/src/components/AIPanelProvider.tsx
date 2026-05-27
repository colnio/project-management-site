/**
 * AIPanelProvider — context that controls the AI chat panel's open state and
 * an optional "seed" (skill + kickoff message) for the "Review with AI" flow.
 *
 * Usage:
 *   // Wrap a page:
 *   <AIPanelProvider><PageContent /></AIPanelProvider>
 *
 *   // Open for generic chat (existing behaviour):
 *   const { toggle } = useAIPanel();
 *   <button onClick={toggle}>Ask AI</button>
 *
 *   // Open for a skill-seeded conversation (new behaviour):
 *   const { reviewWithAI } = useAIPanel();
 *   <button onClick={() => reviewWithAI('risk_assesment_skill', 'Begin risk assessment…')}>
 *     Review with AI
 *   </button>
 *
 *   // Render the panel (in the same provider subtree):
 *   const { open, seed, close } = useAIPanel();
 *   {open && <AIChatPanel ... seed={seed} onClose={close} />}
 */
import { createContext, useContext, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIPanelSeed {
  skill?: string;
  message?: string;
}

interface AIPanelContextValue {
  open: boolean;
  seed: AIPanelSeed | undefined;
  toggle: () => void;
  openPanel: () => void;
  close: () => void;
  reviewWithAI: (skill: string, message: string) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AIPanelContext = createContext<AIPanelContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AIPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<AIPanelSeed | undefined>(undefined);

  const toggle = useCallback(() => {
    setOpen(prev => {
      if (prev) {
        // Closing: clear seed so next plain open is unseedeed
        setSeed(undefined);
      }
      return !prev;
    });
  }, []);

  const openPanel = useCallback(() => {
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setSeed(undefined);
  }, []);

  const reviewWithAI = useCallback((skill: string, message: string) => {
    setSeed({ skill, message });
    setOpen(true);
  }, []);

  return (
    <AIPanelContext.Provider value={{ open, seed, toggle, openPanel, close, reviewWithAI }}>
      {children}
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
    // Graceful degradation: return no-op stubs so the component doesn't crash.
    return {
      open: false,
      seed: undefined,
      toggle: () => undefined,
      openPanel: () => undefined,
      close: () => undefined,
      reviewWithAI: () => undefined,
    };
  }
  return ctx;
}
