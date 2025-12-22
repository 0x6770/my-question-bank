import { createClient } from "@/lib/supabase/server";
import { UserListManager } from "./user-list-manager";

export default async function ConsoleUsersPage() {
  const supabase = await createClient();
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: false });

  const loadError = profilesError
    ? "Failed to load users. Please try again later."
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          User Management
        </h1>
        <p className="text-sm text-slate-500">
          Create users and jump into per-user access settings.
        </p>
      </header>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">User List</h2>
          <p className="text-sm text-slate-500">
            Select a user to manage access and credentials.
          </p>
        </div>
        <UserListManager users={profiles ?? []} />
      </div>
    </div>
  );
}
