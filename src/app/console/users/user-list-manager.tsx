"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type UserRow = {
  id: string;
  email: string | null;
  role: string;
  created_at?: string;
};

type Props = {
  users: UserRow[];
};

export function UserListManager({ users }: Props) {
  const [userList, setUserList] = useState<UserRow[]>(users);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");

  const handleCreateUser = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setCreateBusy(true);

    const email = createEmail.trim();
    if (!email || !createPassword) {
      setMessage({ type: "error", text: "Email and password are required." });
      setCreateBusy(false);
      return;
    }

    if (createPassword.length < 6) {
      setMessage({
        type: "error",
        text: "Password must be at least 6 characters.",
      });
      setCreateBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/console/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: createPassword,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        user?: UserRow;
      };

      if (!response.ok || !data.user) {
        throw new Error(data.error ?? "Failed to create user.");
      }

      const createdUser = data.user;
      setUserList((prev) => [createdUser, ...prev]);
      setCreateEmail("");
      setCreatePassword("");
      setMessage({ type: "success", text: "User created successfully." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to create user.",
      });
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <div className="divide-y divide-slate-100">
      <div className="px-6 py-5">
        <h3 className="text-base font-semibold text-slate-800">Add User</h3>
        <p className="text-sm text-slate-500">
          Create a login, then manage access per user.
        </p>
        <form
          className="mt-4 grid gap-4 md:grid-cols-[2fr_2fr_auto]"
          onSubmit={handleCreateUser}
        >
          <div className="grid gap-2">
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              placeholder="user@example.com"
              value={createEmail}
              onChange={(event) => setCreateEmail(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-user-password">Password</Label>
            <Input
              id="new-user-password"
              type="password"
              value={createPassword}
              onChange={(event) => setCreatePassword(event.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={createBusy}>
              {createBusy ? "Creating..." : "Create user"}
            </Button>
          </div>
        </form>
      </div>

      {message ? (
        <div
          className={`px-6 py-3 text-sm ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}
        >
          {message.text}
        </div>
      ) : null}

      {userList.length === 0 ? (
        <div className="space-y-4 px-6 py-10 text-center text-sm text-slate-500">
          <p>No user data.</p>
          <p className="text-xs text-slate-400">
            Invite a user to get started.
          </p>
        </div>
      ) : (
        userList.map((user) => {
          const userLabel = user.email || user.id;
          return (
            <div
              key={user.id}
              className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  {userLabel}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 uppercase tracking-wide text-slate-600">
                    {user.role}
                  </span>
                  {user.created_at ? (
                    <span>
                      Created {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/console/users/${user.id}`}>Manage</Link>
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
