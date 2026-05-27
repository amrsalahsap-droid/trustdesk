"use client";

import { Button } from "@/components/ui/button";
import { LogOutIcon } from "@/components/icons";
import { useLogout } from "@/hooks/use-logout";


export function SettingsLogoutButton() {
  const { logout, isLoggingOut } = useLogout();

  const handleLogout = async () => {
    await logout();
  };


  return (
    <Button
      variant="danger"
      onClick={handleLogout}
      isLoading={isLoggingOut}
      leftIcon={<LogOutIcon className="h-4 w-4" />}
    >
      Sign Out of TrustDesk
    </Button>
  );
}
