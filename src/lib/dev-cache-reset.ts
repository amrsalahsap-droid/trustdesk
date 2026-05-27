/**
 * Development cache reset utilities
 * Use these to clear stale state that causes different UI between browsers
 */

export function clearStaleUIState() {
  if (typeof window === 'undefined') return;
  
  console.log('🧹 Clearing stale UI state...');
  
  // Clear localStorage UI state keys that might cause version differences
  const uiStateKeys = [
    'documents-view-mode',
    'library-hero-dismissed', 
    'workspace-setup-dismissed',
    'questionnaire-parse-explainer',
    'last-selected-topic',
    'onboarding-step',
    'workspace-setup-context'
  ];
  
  uiStateKeys.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove localStorage key ${key}:`, error);
    }
  });
  
  // Clear sessionStorage completely (used for temporary UI state)
  try {
    sessionStorage.clear();
  } catch (error) {
    console.warn('Failed to clear sessionStorage:', error);
  }
  
  // Clear service worker caches if available
  if ('caches' in window) {
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          console.log(`🗑️ Clearing cache: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('✅ All caches cleared');
    }).catch(error => {
      console.warn('Failed to clear caches:', error);
    });
  }
  
  console.log('🔄 UI state cleared. Reloading...');
  
  // Force reload without cache
  setTimeout(() => {
    window.location.reload(true);
  }, 500);
}

export function clearWorkspaceState() {
  if (typeof window === 'undefined') return;
  
  console.log('🏢 Clearing workspace state...');
  
  // Clear workspace-specific cookies that might cause different states
  document.cookie.split(';').forEach(cookie => {
    const eqPos = cookie.indexOf('=');
    const name = eqPos > -1 ? cookie.trim() : cookie.substring(0, eqPos).trim();
    
    // Keep auth-related cookies, clear workspace state
    if (name && !name.includes('auth') && !name.includes('session') && !name.includes('token')) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
    }
  });
  
  // Clear workspace-related localStorage
  const workspaceKeys = [
    'active-workspace-id',
    'workspace-context',
    'last-workspace-id'
  ];
  
  workspaceKeys.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove workspace key ${key}:`, error);
    }
  });
  
  console.log('🔄 Workspace state cleared');
}

// Development helper - expose globally for console access
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).clearStaleUIState = clearStaleUIState;
  (window as any).clearWorkspaceState = clearWorkspaceState;
  
  console.log('🛠️ Dev cache helpers available:');
  console.log('  clearStaleUIState() - Clears UI state and reloads');
  console.log('  clearWorkspaceState() - Clears workspace state only');
  console.log('  Run in console if Chrome/Safari show different UI');
}
