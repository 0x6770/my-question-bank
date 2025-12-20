import {
  firstOrNull,
  type SubjectWithBoard,
  type UserAccessRow,
} from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "../types";
import { UserAccessManager } from "./user-access-manager";

export default async function ConsoleUsersPage() {
  const supabase = await createClient();
  const { data: currentUserResult } = await supabase.auth.getUser();
  const currentUserId = currentUserResult.user?.id ?? null;
  const { data: currentProfile } = currentUserId
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentUserId)
        .maybeSingle()
    : { data: null };
  const adminRole = isAdminRole(currentProfile?.role)
    ? currentProfile.role
    : null;

  const [
    { data: profiles, error: profilesError },
    { data: accessRows, error: accessError },
    { data: subjects, error: subjectsError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, role, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("user_subject_access")
      .select(
        "user_id, subject:subjects(id, name, exam_board:exam_boards(name, question_bank))",
      )
      .order("created_at", { ascending: false })
      .returns<UserAccessRow[]>(),
    supabase
      .from("subjects")
      .select("id, name, exam_board:exam_boards(name, question_bank)")
      .order("name", { ascending: true })
      .returns<SubjectWithBoard[]>(),
  ]);

  const loadError =
    profilesError || accessError || subjectsError
      ? "Failed to load users or permissions. Please try again later."
      : null;

  const normalizedSubjects = (subjects ?? []).map((subject) => ({
    ...subject,
    exam_board: firstOrNull(subject.exam_board),
  }));

  const filteredSubjects = normalizedSubjects.filter(
    (subject) => subject.exam_board?.question_bank === 0,
  );
  const allowedSubjectIds = new Set(
    filteredSubjects.map((subject) => subject.id),
  );

  const normalizedAccessRows = (accessRows ?? []).map((row) => {
    const subject = firstOrNull(row.subject);
    return {
      user_id: row.user_id,
      subject: subject
        ? {
            ...subject,
            exam_board: firstOrNull(subject.exam_board),
          }
        : null,
    };
  });

  const accessGrants = normalizedAccessRows
    .filter(
      (
        row,
      ): row is {
        user_id: string;
        subject: SubjectWithBoard;
      } =>
        !!row.subject &&
        row.subject.exam_board?.question_bank === 0 &&
        allowedSubjectIds.has(row.subject.id),
    )
    .map((row) => ({ userId: row.user_id, subjectId: row.subject.id }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          User Management
        </h1>
        <p className="text-sm text-slate-500">
          Create users, manage passwords, and adjust subject access.
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
            Control access and credentials.
          </p>
        </div>
        <UserAccessManager
          users={profiles ?? []}
          subjects={filteredSubjects}
          accessGrants={accessGrants}
          adminRole={adminRole}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}
