"use client";

import { useRouter } from "next/navigation";
import type { MouseEventHandler } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type LogoutButtonProps = React.ComponentProps<typeof Button>;

export function LogoutButton({
  children = "Logout",
  onClick,
  ...props
}: LogoutButtonProps) {
  const router = useRouter();

  const handleClick: MouseEventHandler<HTMLButtonElement> = async (event) => {
    if (onClick) {
      await Promise.resolve(onClick(event));
    }
    if (event.defaultPrevented) {
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <Button onClick={handleClick} {...props}>
      {children}
    </Button>
  );
}
