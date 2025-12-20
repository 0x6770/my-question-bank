"use client";

import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { AdminRole } from "../types";

type Subject = {
  id: number;
  name: string;
  exam_board?: { name: string | null } | null;
};

type UserRow = {
  id: string;
  email: string | null;
  role: string;
  created_at?: string;
};

type AccessGrant = { userId: string; subjectId: number };

type Props = {
  users: UserRow[];
  subjects: Subject[];
  accessGrants: AccessGrant[];
  adminRole: AdminRole | null;
  currentUserId: string | null;
};

type ModalState =
  | { type: "password"; user: UserRow }
  | { type: "delete"; user: UserRow };

function Modal({
  open,
  title,
  description,
  children,
  onClose,
  busy,
  onConfirm,
  confirmLabel = "Save",
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {description ? (
              <p className="text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            X
          </Button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function UserAccessManager({
  users,
  subjects,
  accessGrants,
  adminRole,
  currentUserId,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [userList, setUserList] = useState<UserRow[]>(users);

  const [accessMap, setAccessMap] = useState(() => {
    const map = new Map<string, Set<number>>();
    accessGrants.forEach(({ userId, subjectId }) => {
      if (!map.has(userId)) map.set(userId, new Set());
      map.get(userId)?.add(subjectId);
    });
    return map;
  });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [modalPassword, setModalPassword] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const isSuperAdmin = adminRole === "super_admin";

  const handleToggle = async (
    userId: string,
    subjectId: number,
    nextValue: boolean,
  ) => {
    const key = `${userId}:${subjectId}`;
    setBusyKey(key);
    setErrorMsg(null);

    const currentSet = new Set(accessMap.get(userId) ?? []);

    try {
      if (nextValue) {
        // grant
        const { error } = await supabase
          .from("user_subject_access")
          .upsert(
            { user_id: userId, subject_id: subjectId },
            { onConflict: "user_id,subject_id" },
          );
        if (error) throw error;
        currentSet.add(subjectId);
      } else {
        const { error } = await supabase
          .from("user_subject_access")
          .delete()
          .match({ user_id: userId, subject_id: subjectId });
        if (error) throw error;
        currentSet.delete(subjectId);
      }
      setAccessMap((prev) => {
        const next = new Map(prev);
        next.set(userId, currentSet);
        return next;
      });
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : "Failed to update permissions. Please try again later.",
      );
    } finally {
      setBusyKey(null);
    }
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

      setUserList((prev) => [data.user, ...prev]);
      setAccessMap((prev) => {
        const next = new Map(prev);
        if (!next.has(data.user.id)) {
          next.set(data.user.id, new Set());
        }
        return next;
      });
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

  const openPasswordModal = (user: UserRow) => {
    setModalState({ type: "password", user });
    setModalPassword("");
    setModalError(null);
  };

  const openDeleteModal = (user: UserRow) => {
    setModalState({ type: "delete", user });
    setModalError(null);
  };

  const closeModal = () => {
    setModalState(null);
    setModalPassword("");
    setModalError(null);
  };

  const handleModalConfirm = async () => {
    if (!modalState) return;
    setModalBusy(true);
    setModalError(null);
    setMessage(null);

    try {
      if (modalState.type === "password") {
        if (modalPassword.length < 6) {
          setModalError("Password must be at least 6 characters.");
          setModalBusy(false);
          return;
        }
        const response = await fetch(
          `/api/console/users/${modalState.user.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: modalPassword }),
          },
        );
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to update password.");
        }
        setMessage({ type: "success", text: "Password updated successfully." });
        closeModal();
      } else {
        const response = await fetch(
          `/api/console/users/${modalState.user.id}`,
          { method: "DELETE" },
        );
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to delete user.");
        }
        setUserList((prev) =>
          prev.filter((item) => item.id !== modalState.user.id),
        );
        setAccessMap((prev) => {
          const next = new Map(prev);
          next.delete(modalState.user.id);
          return next;
        });
        setMessage({ type: "success", text: "User deleted successfully." });
        closeModal();
      }
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <div className="divide-y divide-slate-100">
      <div className="px-6 py-5">
        <h3 className="text-base font-semibold text-slate-800">Add User</h3>
        <p className="text-sm text-slate-500">
          Create a login and grant subjects below.
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
      {errorMsg ? (
        <div className="px-6 py-3 text-sm text-red-600">{errorMsg}</div>
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
          const isAdmin = user.role === "admin" || user.role === "super_admin";
          const userLabel = user.email || user.id;
          const userAccess = accessMap.get(user.id) ?? new Set<number>();
          const isSuperAccount = user.role === "super_admin";
          const canManage = isSuperAdmin && !isSuperAccount;
          const canDelete = canManage && user.id !== currentUserId;

          return (
            <div
              key={user.id}
              className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_2fr]"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  {userLabel}
                </p>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {user.role}
                </p>
                {isAdmin ? (
                  <p className="text-xs text-emerald-600">
                    Admins have full access
                  </p>
                ) : null}
              </div>

              {isAdmin ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                      All subjects accessible
                      {subjects.length ? ` (total ${subjects.length})` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPasswordModal(user)}
                      disabled={!canManage}
                    >
                      Reset password
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openDeleteModal(user)}
                      disabled={!canDelete}
                    >
                      Delete user
                    </Button>
                    {!isSuperAdmin ? (
                      <span className="text-xs text-slate-400">
                        Super admin only
                      </span>
                    ) : null}
                    {isSuperAccount ? (
                      <span className="text-xs text-slate-400">
                        Super admin accounts are protected
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      Select subjects to grant access:
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPasswordModal(user)}
                        disabled={!canManage}
                      >
                        Reset password
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteModal(user)}
                        disabled={!canDelete}
                      >
                        Delete user
                      </Button>
                    </div>
                  </div>
                  {!isSuperAdmin ? (
                    <p className="text-xs text-slate-400">
                      Super admins can reset passwords and delete accounts.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((subject) => {
                      const checked = userAccess.has(subject.id);
                      const loading = busyKey === `${user.id}:${subject.id}`;
                      return (
                        <label
                          key={subject.id}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${checked ? "border-sky-200 bg-sky-50 text-slate-800" : "border-slate-200 bg-white text-slate-700"} ${loading ? "opacity-60" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={checked}
                            disabled={loading}
                            onChange={(e) =>
                              void handleToggle(
                                user.id,
                                subject.id,
                                e.target.checked,
                              )
                            }
                          />
                          <span>
                            {subject.name}
                            {subject.exam_board?.name
                              ? ` · ${subject.exam_board.name}`
                              : ""}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="text-xs text-slate-500">
                    {userAccess.size === 0
                      ? "No subjects authorized"
                      : `Authorized for ${userAccess.size} subjects`}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      <Modal
        open={!!modalState}
        title={
          modalState?.type === "delete" ? "Delete user" : "Reset user password"
        }
        description={
          modalState?.type === "delete"
            ? "This action removes the user and all related access grants."
            : "Set a new password for this account."
        }
        onClose={closeModal}
        busy={modalBusy}
        onConfirm={handleModalConfirm}
        confirmLabel={modalState?.type === "delete" ? "Delete" : "Update"}
      >
        {modalState?.type === "password" ? (
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="reset-password">New password</Label>
              <Input
                id="reset-password"
                type="password"
                value={modalPassword}
                onChange={(event) => setModalPassword(event.target.value)}
              />
            </div>
            {modalError ? (
              <p className="text-sm text-red-600">{modalError}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              Delete{" "}
              <span className="font-semibold text-slate-900">
                {modalState?.user.email ?? modalState?.user.id}
              </span>{" "}
              and revoke access?
            </p>
            {modalError ? (
              <p className="text-sm text-red-600">{modalError}</p>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
