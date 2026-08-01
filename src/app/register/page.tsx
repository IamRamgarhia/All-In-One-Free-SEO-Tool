import { redirect } from "next/navigation";
import { accountsEnabled } from "@/lib/auth";
import { AccountForm } from "./account-form";

/**
 * First-run account setup. Closes itself permanently the moment an owner
 * exists — after that, people arrive by invitation, and this page would
 * otherwise be an open registration form on a deployed instance.
 */
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  if (accountsEnabled()) redirect("/login");

  return (
    <AccountForm
      heading="Set up your team"
      subheading="You'll be the owner. Everyone else joins by invitation."
      cta="Create owner account"
    />
  );
}
