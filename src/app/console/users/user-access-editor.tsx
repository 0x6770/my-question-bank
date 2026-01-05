"use client";

import Link from "next/link";
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

type Props = {
  user: UserRow;
  topicalSubjects: Subject[];
  pastPaperSubjects: Subject[];
  examPaperSubjects: Subject[];
  accessGrants: number[];
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

export function UserAccessEditor({
  user,
  topicalSubjects,
  pastPaperSubjects,
  examPaperSubjects,
  accessGrants,
  adminRole,
  currentUserId,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [accessSet, setAccessSet] = useState(() => new Set(accessGrants));
  const [busySubjectId, setBusySubjectId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [modalPassword, setModalPassword] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const canManageCredentials =
    adminRole === "super_admin" && user.role !== "super_admin";
  const canDelete = canManageCredentials && user.id !== currentUserId;

  const handleToggle = async (subjectId: number, nextValue: boolean) => {
    setBusySubjectId(subjectId);
    setErrorMsg(null);

    const nextSet = new Set(accessSet);

    try {
      if (nextValue) {
        const { error } = await supabase
          .from("user_subject_access")
          .upsert(
            { user_id: user.id, subject_id: subjectId },
            { onConflict: "user_id,subject_id" },
          );
        if (error) throw error;
        nextSet.add(subjectId);
      } else {
        const { error } = await supabase
          .from("user_subject_access")
          .delete()
          .match({ user_id: user.id, subject_id: subjectId });
        if (error) throw error;
        nextSet.delete(subjectId);
      }
      setAccessSet(nextSet);
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : "Failed to update permissions. Please try again later.",
      );
    } finally {
      setBusySubjectId(null);
    }
  };

  const openPasswordModal = () => {
    setModalState({ type: "password", user });
    setModalPassword("");
    setModalError(null);
  };

  const openDeleteModal = () => {
    setModalState({ type: "delete", user });
    setModalError(null);
  };

  const closeModal = () => {
    setModalState(null);
    setModalPassword("");
    setModalError(null);
  };

  const handleModalConfirm = async (event?: FormEvent) => {
    event?.preventDefault();
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
        const response = await fetch(`/api/console/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: modalPassword }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to update password.");
        }
        setMessage({ type: "success", text: "Password updated successfully." });
        closeModal();
      } else {
        const response = await fetch(`/api/console/users/${user.id}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to delete user.");
        }
        setMessage({ type: "success", text: "User deleted successfully." });
        closeModal();
      }
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setModalBusy(false);
    }
  };

  const renderSubjectSection = (
    title: string,
    description: string,
    subjects: Subject[],
  ) => {
    const authorizedCount = subjects.reduce(
      (total, subject) => (accessSet.has(subject.id) ? total + 1 : total),
      0,
    );
    const boardMap = new Map<string, Subject[]>();
    for (const subject of subjects) {
      const boardName = subject.exam_board?.name?.trim() || "Other";
      if (!boardMap.has(boardName)) {
        boardMap.set(boardName, []);
      }
      boardMap.get(boardName)?.push(subject);
    }

    const boardEntries = Array.from(boardMap.entries()).sort(([a], [b]) =>
      a.localeCompare(b, "zh-CN"),
    );
    for (const [, list] of boardEntries) {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }

    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        {isAdmin ? (
          <div className="px-6 py-6">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
              Admins have full access
              {subjects.length ? ` (total ${subjects.length})` : ""}
            </span>
          </div>
        ) : (
          <div className="space-y-3 px-6 py-6">
            <p className="text-xs text-slate-500">
              Select subjects to grant access:
            </p>
            {subjects.length === 0 ? (
              <div className="text-sm text-slate-500">
                No subjects available.
              </div>
            ) : (
              <div className="space-y-4">
                {boardEntries.map(([boardName, boardSubjects]) => (
                  <div key={boardName} className="space-y-2">
                    <p className="text-sm font-semibold text-slate-700">
                      {boardName}
                    </p>
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/40">
                      {boardSubjects.map((subject) => {
                        const checked = accessSet.has(subject.id);
                        const loading = busySubjectId === subject.id;
                        return (
                          <li
                            key={subject.id}
                            className={`flex items-center gap-3 px-4 py-2 text-sm ${loading ? "opacity-60" : ""}`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={checked}
                              disabled={loading}
                              onChange={(e) =>
                                void handleToggle(subject.id, e.target.checked)
                              }
                            />
                            <span className="text-slate-800">
                              {subject.name}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-slate-500">
              {authorizedCount === 0
                ? "No subjects authorized"
                : `Authorized for ${authorizedCount} subjects`}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">
            {user.email || user.id}
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={openPasswordModal}
            disabled={!canManageCredentials}
          >
            Reset password
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={openDeleteModal}
            disabled={!canDelete}
          >
            Delete user
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/console/users">Back to list</Link>
          </Button>
        </div>
        {!canManageCredentials ? (
          <p className="text-xs text-slate-400">
            Only super admins can reset passwords or delete accounts.
          </p>
        ) : null}
        {user.role === "super_admin" ? (
          <p className="text-xs text-slate-400">
            Super admin accounts are protected.
          </p>
        ) : null}
      </div>

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      ) : null}

      {errorMsg ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      ) : null}

      {renderSubjectSection(
        "Topical Questions Access",
        "Manage topical question subjects for this user.",
        topicalSubjects,
      )}
      {renderSubjectSection(
        "Past Paper Questions Access",
        "Manage past paper question subjects for this user.",
        pastPaperSubjects,
      )}
      {renderSubjectSection(
        "Exam Paper Access",
        "Manage exam paper subjects for this user.",
        examPaperSubjects,
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
          <form className="space-y-3" onSubmit={handleModalConfirm}>
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
          </form>
        ) : (
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              Delete{" "}
              <span className="font-semibold text-slate-900">
                {user.email || user.id}
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
