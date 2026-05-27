import Script from "next/script";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app-shell/sidebar";
import { TopBar } from "@/components/app-shell/top-bar";
import { buildAuthContextRSC } from "@/lib/auth/build-context";
import { 
  NoWorkspaceAccessError, 
  WorkspaceSelectionRequiredError, 
  AuthenticationError,
  WorkspaceProfileIncompleteError 
} from "@/lib/auth/errors";
import { headers } from "next/headers";
import { validateRouteAccess } from "@/lib/navigation/guard";
import { Forbidden } from "@/components/app-shell/forbidden";
import { getLandingDestination } from "@/lib/navigation/landing-destinations";
import { trackNav } from "@/lib/instrumentation/nav-tracker";
import { randomUUID } from "node:crypto";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const correlationId = `corr-${randomUUID().slice(0, 8)}`;
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/app";
  console.log(`[AppLayout] CorrelationID: ${correlationId}, Pathname Header: ${headersList.get("x-pathname")}, Resolved Pathname: ${pathname}`);
  const startTime = Date.now();

  let ctx;
  try {
    trackNav("nav.workspace.resolve.start", { correlationId, route: pathname });
    // Authoritative Server-Side Context Verification
    ctx = await buildAuthContextRSC();
    trackNav("nav.workspace.resolve.done", { 
      correlationId, 
      route: pathname, 
      userId: ctx.userId, 
      workspaceId: ctx.workspaceId,
      duration: Date.now() - startTime
    });
  } catch (error) {
    trackNav("nav.render.error", { 
      correlationId, 
      route: pathname, 
      error: error instanceof Error ? error.message : String(error) 
    });
    if (error instanceof NoWorkspaceAccessError) return redirect("/onboarding");
    if (error instanceof WorkspaceProfileIncompleteError) return redirect(`/onboarding?workspaceId=${error.workspaceId}&resume=true`);
    if (error instanceof WorkspaceSelectionRequiredError) return redirect("/workspace-selection");
    if (error instanceof AuthenticationError) return redirect("/login");
    return redirect("/login");
  }

  // Route-Level Permission Enforcement
  const hasAccess = validateRouteAccess(pathname, ctx.role);

  // If they hit the generic /app route but don't have Dashboard access (e.g. Contributor),
  // automatically redirect them to their correct landing destination instead of showing an error.
  if (!hasAccess && (pathname === "/app" || pathname === "/app/")) {
    const landing = getLandingDestination(ctx.role);
    if (pathname !== landing) {
      redirect(landing);
    }
  }
  
  trackNav("nav.server.done", { 
    correlationId, 
    route: pathname, 
    userId: ctx.userId, 
    workspaceId: ctx.workspaceId,
    duration: Date.now() - startTime
  });

  return (
    <>
      <div 
        data-auth-id={ctx.userId}
        data-workspace-id={ctx.workspaceId}
        className="flex min-h-screen bg-surface-base selection:bg-accent-primary/10 selection:text-accent-primary"
      >
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out md:ml-16 lg:ml-56 group-has-[aside.w-16]:md:ml-16 group-has-[aside.w-16]:lg:ml-16">
          <TopBar />
          <main className="flex-1 animate-page-fade">
            <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {hasAccess ? children : <Forbidden role={ctx.role} />}
            </div>
          </main>
        </div>
      </div>

      {/* Identity Integrity Guard: Detects stale BF-Cache snapshots and ensures navigation reliability */}
      <Script id="identity-integrity-guard" dangerouslySetInnerHTML={{ __html: `
        (function() {
          var checkTimeout = null;
          var lastPathname = window.location.pathname;

          function logEvent(name, meta) {
            console.log('[NavInstrumentation] ' + name, meta || {});
            // In a real production app, we would fetch to a logging endpoint here
          }

          function checkIntegrity(isPersisted) {
            if (checkTimeout) clearTimeout(checkTimeout);
            
            checkTimeout = setTimeout(function() {
              var cookies = document.cookie.split('; ').reduce(function(acc, row) {
                var parts = row.split('=');
                if (parts[0]) acc[parts[0].trim()] = decodeURIComponent(parts[1] || '');
                return acc;
              }, {});

              var currentUid = cookies['td_active_uid'];
              var currentWorkspaceId = cookies['x-workspace-id'];
              
              var shell = document.querySelector('[data-auth-id]');
              var renderedUid = shell ? shell.getAttribute('data-auth-id') : null;
              var renderedWorkspaceId = shell ? shell.getAttribute('data-workspace-id') : null;
              
              if (!renderedUid) return;

              var mismatch = false;
              var reason = '';

              if (!currentUid) {
                reason = 'no_session';
                mismatch = true;
              } else if (renderedUid && currentUid !== renderedUid) {
                reason = 'identity_mismatch';
                mismatch = true;
              } else if (renderedWorkspaceId && currentWorkspaceId && currentWorkspaceId !== renderedWorkspaceId) {
                reason = 'workspace_mismatch';
                mismatch = true;
              }

              if (mismatch) {
                if (isPersisted) {
                  logEvent('nav.integrity.mismatch.bfcache', { reason: reason, rendered: renderedWorkspaceId, current: currentWorkspaceId });
                  
                  // For BF-Cache restores, we only redirect to login if the session (UID) is gone or changed.
                  // Workspace mismatches should be handled more gracefully.
                  if (reason === 'no_session' || reason === 'identity_mismatch') {
                    logEvent('nav.recovery.redirect', { to: '/login', reason: reason });
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.replace('/login?reason=stale_session&detail=' + reason);
                  } else if (reason === 'workspace_mismatch') {
                    // If we are on Workspace A but the cookie says Workspace B, 
                    // and we just came from BF-cache, we should probably just refresh
                    // to get the correct workspace context instead of nuking everything.
                    logEvent('nav.recovery.reload', { reason: reason, target: currentWorkspaceId });
                    window.location.reload();
                  }
                } else {
                  logEvent('nav.integrity.mismatch.background', { reason: reason });
                  
                  // AUTH-005: Background sync for workspace mismatches
                  if (reason === 'workspace_mismatch' && renderedWorkspaceId) {
                    document.cookie = 'x-workspace-id=' + renderedWorkspaceId + '; path=/; max-age=' + (7 * 24 * 60 * 60) + '; sameSite=lax';
                    logEvent('nav.cookie.sync', { workspaceId: renderedWorkspaceId });
                  }
                }
              }
            }, 100);
          }

          // Instrumentation for workspace switching and route changes
          document.addEventListener('click', function(e) {
            var link = e.target.closest('a');
            if (link && link.href) {
              var url = new URL(link.href);
              var isWorkspaceSwitch = url.searchParams.has('workspaceId');
              var targetWorkspaceId = url.searchParams.get('workspaceId');
              
              if (isWorkspaceSwitch) {
                logEvent('nav.workspace.switch.click', { 
                  from: document.querySelector('[data-workspace-id]').getAttribute('data-workspace-id'),
                  to: targetWorkspaceId,
                  url: link.href
                });
              } else if (url.origin === window.location.origin) {
                logEvent('nav.click', { url: link.href });
              }
            }
          }, true);

          // Track navigation starts/ends
          var observer = new MutationObserver(function() {
            if (window.location.pathname !== lastPathname) {
              logEvent('nav.route.change', { from: lastPathname, to: window.location.pathname });
              lastPathname = window.location.pathname;
              // Check integrity after a route change to ensure cookies are in sync
              checkIntegrity(false);
            }
          });
          observer.observe(document.head, { childList: true });

          window.onpageshow = function(event) {
            logEvent('nav.pageshow', { persisted: event.persisted });
            if (event.persisted) {
              checkIntegrity(true);
            }
          };
          
          document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
              logEvent('nav.visibility.visible');
              checkIntegrity(false);
            }
          });

          logEvent('nav.guard.initialized');
        })();
      ` }} />
    </>
  );
}

