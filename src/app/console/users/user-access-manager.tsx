"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Subject = {
  id: number;
  name: string;
  exam_board?: { name: string | null } | null;
};

type UserRow = {
  id: string;
  email: string | null;
  role: string;
};

type AccessGrant = { userId: string; subjectId: number };

type Props = {
  users: UserRow[];
  subjects: Subject[];
  accessGrants: AccessGrant[];
};

export function UserAccessManager({ users, subjects, accessGrants }: Props) {
  const supabase = useMemo(() => createClient(), []);

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
        error instanceof Error ? error.message : "更新权限失败，请稍后重试。",
      );
    } finally {
      setBusyKey(null);
    }
  };

  if (users.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-slate-500">
        暂无用户数据。
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {errorMsg ? (
        <div className="px-6 py-3 text-sm text-red-600">{errorMsg}</div>
      ) : null}

      {users.map((user) => {
        const isAdmin = user.role === "admin" || user.role === "super_admin";
        const userLabel = user.email || user.id;
        const userAccess = accessMap.get(user.id) ?? new Set<number>();

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
                  管理员拥有全部访问权限
                </p>
              ) : null}
            </div>

            {isAdmin ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                  拥有全部学科访问权限
                  {subjects.length ? `（共 ${subjects.length} 个）` : ""}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">勾选允许访问的学科：</p>
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
                    ? "未被授权任何学科"
                    : `已授权 ${userAccess.size} 个学科`}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
