import asyncio

from django.core.management.base import BaseCommand

from api.engine import engine


class Command(BaseCommand):
    help = "Run the market engine as a standalone process (use with REDIS_URL and ENGINE_EMBEDDED=0)."

    def handle(self, *a, **o):
        async def main():
            engine.start()
            await asyncio.Event().wait()
        asyncio.run(main())
