// Development cache clearing utility
// Run this in browser console to clear all caches that might cause stale UI

(function clearAllCaches() {
  console.log('🧹 Clearing all development caches...');
  
  // 1. Clear localStorage (except auth tokens)
  const authKeys = ['auth-token', 'workspace-id', 'user-session'];
  const keysToKeep = {};
  authKeys.forEach(key => {
    const value = localStorage.getItem(key);
    if (value) keysToKeep[key] = value;
  });
  
  localStorage.clear();
  Object.keys(keysToKeep).forEach(key => {
    localStorage.setItem(key, keysToKeep[key]);
  });
  
  // 2. Clear sessionStorage completely
  sessionStorage.clear();
  
  // 3. Clear service worker caches
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
    });
  }
  
  // 4. Clear any workspace-specific UI state
  const uiStateKeys = [
    'documents-view-mode',
    'library-hero-dismissed',
    'workspace-setup-dismissed',
    'questionnaire-parse-explainer',
    'last-selected-topic'
  ];
  
  uiStateKeys.forEach(key => {
    localStorage.removeItem(key);
  });
  
  console.log('🔄 Cache clearing complete. Reloading page...');
  
  // 5. Force reload without cache
  setTimeout(() => {
    window.location.reload(true);
  }, 500);
  
})();
