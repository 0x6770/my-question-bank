#!/usr/bin/env python3
"""Create Supabase auth users, reading URL/key from a provided env file.

Usage:
  python scripts/add_user.py --env ../.env.development
"""

from __future__ import annotations

import argparse
from enum import Enum
from pathlib import Path

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from supabase import Client, create_client


class UserRole(str, Enum):
    """User roles matching public.user_role enum in Supabase."""

    USER = "user"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"

# Fallback accounts matching scripts/add_user.sh
# Format: (email, password, role)
DEFAULT_USERS: list[tuple[str, str, UserRole]] = [
    ("yujie@wang.icu", "towgux-zirda4-Ruvhyd", UserRole.SUPER_ADMIN),
    ("yujie@duck.com", "123456", UserRole.USER),
    ("wycslb@gmail.com", "zirda4", UserRole.SUPER_ADMIN),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create Supabase auth users.")
    parser.add_argument(
        "--env",
        required=True,
        type=Path,
        help="Path to env file containing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY",
    )
    return parser.parse_args()


class SupabaseSettings(BaseSettings):
    supabase_url: str = Field(alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_secret_key: str = Field(alias="SUPABASE_SECRET_KEY")

    model_config = SettingsConfigDict(extra="ignore")


def load_env(env_path: Path) -> tuple[str, str]:
    if not env_path.exists():
        raise SystemExit(f"Env file not found: {env_path}")

    try:
        settings = SupabaseSettings(_env_file=env_path)
    except ValidationError as exc:
        raise SystemExit(f"Invalid Supabase env config: {exc}") from exc

    url = settings.supabase_url
    secret_key = settings.supabase_secret_key

    assert url is not None
    assert secret_key is not None
    return url, secret_key


def create_user(
    client: Client, email: str, password: str, role: UserRole = UserRole.USER
) -> None:
    """Create a user and assign them a role in the public.profiles table."""
    resp = client.auth.admin.create_user(
        {
            "email": email,
            "password": password,
            "email_confirm": True,
        }
    )
    user = getattr(resp, "user", None)
    user_id = getattr(user, "id", None)
    if user_id:
        # Update the role in public.profiles
        # The trigger handle_new_user() will create the profile with default role 'user'
        # We need to update it if a different role is specified
        if role != UserRole.USER:
            client.table("profiles").update({"role": role.value}).eq("id", user_id).execute()
        print(f"[ok] Created {email} (id={user_id}, role={role.value})")
    else:
        print(f"[warn] Sign-up attempted for {email}; check server to confirm status.")


def main():
    args = parse_args()
    supabase_url, supabase_key = load_env(args.env)
    client = create_client(supabase_url, supabase_key)

    for email, password, role in DEFAULT_USERS:
        try:
            create_user(client, email, password, role)
        except Exception as exc:  # pragma: no cover - best-effort CLI output
            print(f"[error] Failed to create {email}: {exc}")


if __name__ == "__main__":
    main()
