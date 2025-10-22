import type { Tables } from "../../../database.types";

type ProfileRow = Pick<Tables<"profiles">, "role">;

export type ProfileRole = ProfileRow["role"];
export type AdminRole = Extract<ProfileRole, "admin" | "super_admin">;

export function isAdminRole(
  role: ProfileRole | null | undefined,
): role is AdminRole {
  return role === "admin" || role === "super_admin";
}
