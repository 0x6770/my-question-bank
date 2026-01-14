"use client";

import { Crown, Edit } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UserRow = {
  id: string;
  email: string | null;
  role: string;
  created_at?: string;
  membership_tier?: string;
  membership_expires_at?: string | null;
  is_whitelisted?: boolean;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");

  // Membership management state
  const [membershipDialogOpen, setMembershipDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [membershipTier, setMembershipTier] = useState<string>("basic");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [membershipBusy, setMembershipBusy] = useState(false);

  const fetchUsers = async (query: string) => {
    setSearchBusy(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams();
      const trimmed = query.trim();
      if (trimmed) {
        params.set("q", trimmed);
      }
      const response = await fetch(
        `/api/console/users${params.toString() ? `?${params}` : ""}`,
      );
      const data = (await response.json()) as {
        error?: string;
        users?: UserRow[];
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load users.");
      }

      setUserList(data.users ?? []);
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : "Failed to load users.",
      );
    } finally {
      setSearchBusy(false);
    }
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    await fetchUsers(searchQuery);
  };

  const handleClearSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchQuery("");
    await fetchUsers("");
  };

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
      if (searchQuery.trim()) {
        await fetchUsers(searchQuery);
      } else {
        setUserList((prev) => [createdUser, ...prev]);
      }
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

  const openMembershipDialog = (user: UserRow) => {
    setSelectedUser(user);
    setMembershipTier(user.membership_tier || "basic");
    setExpiresAt(
      user.membership_expires_at
        ? new Date(user.membership_expires_at).toISOString().slice(0, 16)
        : "",
    );
    setIsWhitelisted(user.is_whitelisted || false);
    setMembershipDialogOpen(true);
  };

  const handleMembershipUpdate = async () => {
    if (!selectedUser) return;

    setMembershipBusy(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/users/${selectedUser.id}/membership`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            membership_tier: membershipTier,
            membership_expires_at: expiresAt || null,
            is_whitelisted: isWhitelisted,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update membership");
      }

      // Update user in the list
      setUserList((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? {
                ...u,
                membership_tier: membershipTier,
                membership_expires_at: expiresAt || null,
                is_whitelisted: isWhitelisted,
              }
            : u,
        ),
      );

      setMessage({ type: "success", text: "Membership updated successfully" });
      setMembershipDialogOpen(false);
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to update membership",
      });
    } finally {
      setMembershipBusy(false);
    }
  };

  const getMembershipBadge = (user: UserRow) => {
    // Don't show membership badge for admin users
    if (user.role === "admin" || user.role === "super_admin") {
      return null;
    }

    if (user.is_whitelisted) {
      return (
        <Badge className="bg-purple-500 hover:bg-purple-600">
          <Crown className="mr-1 h-3 w-3" />
          WHITELIST
        </Badge>
      );
    }

    const tierColors = {
      basic: "bg-blue-500 hover:bg-blue-600",
      premium: "bg-amber-500 hover:bg-amber-600",
    };

    const tier = user.membership_tier || "basic";
    const tierColor =
      tierColors[tier as keyof typeof tierColors] || "bg-blue-500";

    return <Badge className={tierColor}>{tier.toUpperCase()}</Badge>;
  };

  const isMembershipActive = (user: UserRow) => {
    return (
      user.membership_expires_at &&
      new Date(user.membership_expires_at) > new Date()
    );
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

      <div className="border-t border-slate-100 px-6 py-4">
        <form className="space-y-2" onSubmit={handleSearch}>
          <Label htmlFor="user-search">Search users</Label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              id="user-search"
              type="search"
              placeholder="Search by email"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="sm:flex-1"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={searchBusy}>
                {searchBusy ? "Searching..." : "Search"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClearSearch}
                disabled={searchBusy || !searchQuery.trim()}
              >
                Clear
              </Button>
            </div>
          </div>
        </form>
        {searchError ? (
          <p className="mt-2 text-xs text-red-600">{searchError}</p>
        ) : null}
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
          <p>
            {searchQuery.trim()
              ? "No users match your search."
              : "No user data."}
          </p>
          <p className="text-xs text-slate-400">
            Invite a user to get started.
          </p>
        </div>
      ) : (
        userList.map((user) => {
          const userLabel = user.email || user.id;
          const membershipActive = isMembershipActive(user);
          return (
            <div
              key={user.id}
              className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">
                  {userLabel}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 uppercase tracking-wide text-slate-600">
                    {user.role}
                  </span>
                  {getMembershipBadge(user)}
                  {user.created_at ? (
                    <span>
                      Created {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                {user.membership_expires_at && (
                  <div
                    className={`text-xs ${membershipActive ? "text-green-600" : "text-red-600"}`}
                  >
                    {membershipActive ? "Expires" : "Expired"}:{" "}
                    {new Date(user.membership_expires_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Don't show Membership button for admin users */}
                {user.role !== "admin" && user.role !== "super_admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openMembershipDialog(user)}
                  >
                    <Edit className="mr-1 h-3 w-3" />
                    Membership
                  </Button>
                )}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/console/users/${user.id}`}>Manage</Link>
                </Button>
              </div>
            </div>
          );
        })
      )}

      {/* Membership Edit Dialog */}
      <Dialog
        open={membershipDialogOpen}
        onOpenChange={setMembershipDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Membership</DialogTitle>
            <DialogDescription>
              Update membership tier and settings for{" "}
              {selectedUser?.email || selectedUser?.id}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="membership-tier">Membership Tier</Label>
              <Select value={membershipTier} onValueChange={setMembershipTier}>
                <SelectTrigger id="membership-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expires-at">Expires At</Label>
              <Input
                id="expires-at"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for no expiration
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="whitelist"
                checked={isWhitelisted}
                onCheckedChange={(checked) =>
                  setIsWhitelisted(checked === true)
                }
              />
              <label
                htmlFor="whitelist"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Add to whitelist (unlimited access)
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMembershipDialogOpen(false)}
              disabled={membershipBusy}
            >
              Cancel
            </Button>
            <Button onClick={handleMembershipUpdate} disabled={membershipBusy}>
              {membershipBusy ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
