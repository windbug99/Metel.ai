import asyncio
from types import SimpleNamespace

from fastapi import HTTPException
from starlette.requests import Request

from app.core.authz import AuthzContext, Role
from app.routes.agents import AgentCreateRequest, AgentUpdateRequest, create_agent, list_agents, update_agent


def _request(path: str, method: str = "GET") -> Request:
    scope = {"type": "http", "method": method, "path": path, "headers": []}
    return Request(scope)


class _Query:
    def __init__(self, table_name: str):
        self.table_name = table_name
        self.mode = "select"
        self.payload = None

    def select(self, *_args, **_kwargs):
        self.mode = "select"
        return self

    def insert(self, payload: dict):
        self.mode = "insert"
        self.payload = payload
        return self

    def update(self, payload: dict):
        self.mode = "update"
        self.payload = payload
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.table_name == "agents" and self.mode == "select":
            return SimpleNamespace(data=[{"id": 1, "organization_id": 1, "team_id": 1, "name": "A", "status": "active"}])
        if self.table_name == "teams" and self.mode == "select":
            return SimpleNamespace(data=[{"id": 1, "organization_id": 1, "is_active": True}])
        if self.table_name == "team_memberships" and self.mode == "select":
            return SimpleNamespace(data=[{"id": 10}])
        if self.mode in {"insert", "update"}:
            payload = dict(self.payload or {})
            payload.setdefault("id", 1)
            payload.setdefault("organization_id", 1)
            payload.setdefault("team_id", 1)
            return SimpleNamespace(data=[payload])
        return SimpleNamespace(data=[])


class _Client:
    def table(self, name: str):
        return _Query(name)


def _patch(monkeypatch, role: Role, org_ids: set[int], team_ids: set[int]):
    async def _fake_user(_request: Request) -> str:
        return "user-1"

    async def _fake_authz(_request: Request, **_kwargs) -> AuthzContext:
        return AuthzContext(user_id="user-1", role=role, org_ids=org_ids, team_ids=team_ids)

    monkeypatch.setattr("app.routes.agents.get_authenticated_user_id", _fake_user)
    monkeypatch.setattr("app.routes.agents.get_authz_context", _fake_authz)
    monkeypatch.setattr("app.routes.agents.create_client", lambda *_args, **_kwargs: _Client())
    monkeypatch.setattr("app.routes.agents.get_settings", lambda: SimpleNamespace(supabase_url="x", supabase_service_role_key="y"))


def test_list_agents_member_ok(monkeypatch):
    _patch(monkeypatch, Role.MEMBER, {1}, {1})
    out = asyncio.run(list_agents(_request("/api/agents"), organization_id=None, team_id=None, status=""))
    assert out["count"] == 1


def test_create_agent_scope_mismatch(monkeypatch):
    _patch(monkeypatch, Role.ADMIN, {2}, {1})
    try:
        asyncio.run(create_agent(_request("/api/agents", "POST"), AgentCreateRequest(team_id=1, name="A")))
    except HTTPException as exc:
        assert exc.status_code == 403
    else:
        assert False, "expected HTTPException"


def test_update_agent_admin_ok(monkeypatch):
    _patch(monkeypatch, Role.ADMIN, {1}, {1})
    out = asyncio.run(update_agent(_request("/api/agents/1", "PATCH"), 1, AgentUpdateRequest(name="B")))
    assert out["ok"] is True
    assert out["updated"] is True
