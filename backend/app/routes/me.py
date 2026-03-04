from __future__ import annotations

from fastapi import APIRouter, Request
from supabase import create_client

from app.core.auth import get_authenticated_user_id
from app.core.authz import Role, get_authz_context
from app.core.config import get_settings

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/permissions")
async def get_my_permissions(request: Request):
    user_id = await get_authenticated_user_id(request)
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    authz_ctx = await get_authz_context(request, user_id=user_id, supabase=supabase)

    role = authz_ctx.role.value
    is_admin_plus = authz_ctx.role in {Role.ADMIN, Role.OWNER}
    is_owner = authz_ctx.role == Role.OWNER

    return {
        "user_id": user_id,
        "role": role,
        "org_ids": sorted(authz_ctx.org_ids),
        "team_ids": sorted(authz_ctx.team_ids),
        "feature_flags": {
            "read_guard_enabled": bool(settings.rbac_read_guard_enabled),
            "write_guard_enabled": bool(settings.rbac_write_guard_enabled),
            "ui_strict_enabled": bool(settings.ui_rbac_strict_enabled),
        },
        "permissions": {
            "can_read_audit_settings": is_admin_plus,
            "can_update_audit_settings": is_owner,
            "can_read_admin_ops": is_admin_plus,
            "can_manage_incident_banner": is_owner,
            "can_manage_organizations": is_admin_plus,
            "can_manage_teams": is_admin_plus,
            "can_manage_integrations": is_admin_plus,
            "can_manage_api_keys": True,
        },
    }
