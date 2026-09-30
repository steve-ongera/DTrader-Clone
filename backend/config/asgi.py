import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.asgi import get_asgi_application  # noqa: E402

django_asgi = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from api.engine import engine  # noqa: E402
from api.routing import websocket_urlpatterns  # noqa: E402

router = ProtocolTypeRouter({
    "http": django_asgi,
    "websocket": URLRouter(websocket_urlpatterns),
})


class EngineBootstrap:
    """Starts the embedded market engine on the first connection.
    Set ENGINE_EMBEDDED=0 and run `python manage.py run_engine` instead when
    scaling out (requires REDIS_URL)."""

    def __init__(self, app):
        self.app = app
        self.started = False

    async def __call__(self, scope, receive, send):
        if not self.started and os.environ.get("ENGINE_EMBEDDED", "1") == "1":
            self.started = True
            engine.start()
        return await self.app(scope, receive, send)


application = EngineBootstrap(router)
