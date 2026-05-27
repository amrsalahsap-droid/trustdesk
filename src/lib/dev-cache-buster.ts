/**
 * Development cache-busting mechanism
 * Prevents Chrome from serving stale assets by adding version query param
 */

export function addCacheBuster(url: string): string {
  if (typeof window === 'undefined') return url;
  
  // Add timestamp to bust browser cache for static assets
  const timestamp = Date.now();
  const separator = url.includes('?') ? '&' : '?';
  
  return `${url}${separator}_v=${timestamp}`;
}

export function getCacheBustVersion(): string {
  return Date.now().toString();
}

// Development-only cache busting for critical assets
export function bustCriticalAssets() {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return;
  
  console.log('🔄 Busting critical asset caches...');
  
  // Force reload of CSS and JS by manipulating link tags
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  links.forEach(link => {
    const href = (link as HTMLLinkElement).href;
    if (href.includes('/_next/static/')) {
      (link as HTMLLinkElement).href = addCacheBuster(href);
    }
  });
  
  // Force reload of script tags
  const scripts = document.querySelectorAll('script[src*="/_next/static/"]');
  scripts.forEach(script => {
    const src = (script as HTMLScriptElement).src;
    if (src) {
      (script as HTMLScriptElement).src = addCacheBuster(src);
    }
  });
  
  console.log('✅ Asset cache busting applied');
}
