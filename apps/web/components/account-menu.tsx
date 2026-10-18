"use client";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
export function AccountMenu() {
  return (
    <>
      <Link href="/settings" className="btn btn-ghost">
        Settings
      </Link>
      <UserButton afterSwitchSessionUrl="/home" />
    </>
  );
}
