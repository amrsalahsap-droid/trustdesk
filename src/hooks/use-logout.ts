"use client";

import { useState } from "react";

/**
 * Hook to handle hardened logout functionality across the application.
 * Ensures that all client-side state is purged and history is handled safely.
 */
export function useLogout() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = async (redirectPath: string = "/login?reason=logout_success") => {
    if (isLoggingOut) return;
    
    setIsLoggingOut(true);
    console.log("[Auth] Logout sequence started: purging local state");

    try {
      // 1. Call the server-side logout to clear HttpOnly cookies
      const res = await fetch("/api/auth/logout", { 
        method: "POST",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });

      if (!res.ok) {
        throw new Error("Logout API failed");
      }

      // 2. Aggressively purge browser-side storage
      // This clears all tenant context, cached IDs, and UI preferences
      localStorage.clear();
      sessionStorage.clear();

      // 3. Clear any site-specific indexedDB if relevant (TrustDesk handles it via storage/db modules)
      // Note: We don't have a centralized Redux/Zustand store that needs manual reset here,
      // but if we did, we would reset it here.

      // 4. Force a hard navigation to the redirect path using 'replace'
      // This prevents the user from clicking 'Back' to return to the logout-triggering page
      console.info("[Auth] Logout complete. Redirecting to:", redirectPath);
      window.location.replace(redirectPath);

    } catch (error) {
      console.error("[Auth] Logout failed", error);
      // Even if the API fails, we should attempt to purge local state and redirect
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace("/login?reason=logout_partial_failure");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return { logout, isLoggingOut };
}
