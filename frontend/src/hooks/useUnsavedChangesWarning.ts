import { useEffect } from 'react';

// Browser-controlled confirmation for reload/close/navigation away from this page.
// This does not save drafts or replay an interrupted mutation.
export function useUnsavedChangesWarning(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [enabled]);
}
