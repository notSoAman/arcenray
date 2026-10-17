"use client";
import { UserButton } from "@clerk/nextjs";
export function AccountMenu() {
  return <UserButton afterSwitchSessionUrl="/home" />;
}
