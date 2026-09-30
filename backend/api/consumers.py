"""Single websocket for market data + private user events.

Client -> server (JSON):
  {"action":"subscribe","symbols":["1HZ100V"]}     {"action":"unsubscribe","symbols":[...]}
  {"action":"ping"}
Server -> client:
  {"msg":"tick","symbol","epoch","quote","digit"}
  {"msg":"contract", ...}   {"msg":"balance","account_id","balance","currency"}
Authenticate by connecting to  /ws/market/?token=<JWT access token>.
"""
import time
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .engine import engine
from .models import User


class MarketConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.subs = set()
        self.user = await self._auth()
        await self.accept()
        if self.user:
            await self.channel_layer.group_add(f"user.{self.user.id}", self.channel_name)
        await self.send_json({"msg": "hello", "authenticated": bool(self.user), "server_time": time.time()})

    @database_sync_to_async
    def _auth(self):
        token = parse_qs(self.scope["query_string"].decode()).get("token", [None])[0]
        if not token:
            return None
        try:
            return User.objects.get(pk=AccessToken(token)["user_id"], is_active=True)
        except (TokenError, User.DoesNotExist, KeyError):
            return None

    async def disconnect(self, code):
        for s in list(getattr(self, "subs", [])):
            await self.channel_layer.group_discard(f"ticks.{s}", self.channel_name)
        if getattr(self, "user", None):
            await self.channel_layer.group_discard(f"user.{self.user.id}", self.channel_name)

    async def receive_json(self, content, **kwargs):
        action = content.get("action")
        symbols = [s for s in content.get("symbols", [])][:10]
        if action == "subscribe":
            for s in symbols:
                if s not in self.subs:
                    self.subs.add(s)
                    await self.channel_layer.group_add(f"ticks.{s}", self.channel_name)
                st = engine.symbols.get(s)
                if st and st.buffer:                      # instant first paint
                    t, p = st.buffer[-1]
                    await self.send_json({"msg": "tick", "symbol": s, "epoch": t, "quote": p})
        elif action == "unsubscribe":
            for s in symbols:
                self.subs.discard(s)
                await self.channel_layer.group_discard(f"ticks.{s}", self.channel_name)
        elif action == "ping":
            await self.send_json({"msg": "pong", "server_time": time.time()})

    async def tick(self, event):
        await self.send_json(event["data"])

    async def user_event(self, event):
        await self.send_json(event["data"])
