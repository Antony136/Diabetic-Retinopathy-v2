from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

from fastapi.staticfiles import StaticFiles
from starlette.responses import Response


def _legacy_sanitize_filename(name: str) -> str:
    # Older desktop builds replaced spaces and many chars with underscores.
    return re.sub(r"[^A-Za-z0-9_.()\-]", "_", name).strip("_ ")


class UploadsStaticFiles(StaticFiles):
    """
    Static file server with backward-compatible filename fallbacks.

    Fixes cases where DB/URLs contain spaces (e.g. `images (1).jpg`) but the file
    on disk was previously saved as `images_(1).jpg` (or vice-versa).
    """

    def _candidate_paths(self, requested_path: str) -> Iterable[str]:
        yield requested_path

        # Common mismatch: spaces <-> underscores
        yield requested_path.replace(" ", "_")

        p = Path(requested_path)
        yield str(p.with_name(_legacy_sanitize_filename(p.name)))

    async def get_response(self, path: str, scope) -> Response:
        # Try normal lookup first.
        resp = await super().get_response(path, scope)
        if resp.status_code != 404:
            return resp

        for candidate in self._candidate_paths(path):
            if candidate == path:
                continue
            resp2 = await super().get_response(candidate, scope)
            if resp2.status_code != 404:
                return resp2

        return resp

