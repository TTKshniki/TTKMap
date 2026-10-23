from __future__ import annotations

from pathlib import Path


class AssetStore:
    """Small storage seam shared by media and capture agents.

    The media feature owns validation and derivative generation. This class only
    provides a stable path boundary for atomic writes on one local volume.
    """

    def __init__(self, root: Path) -> None:
        self.root = root

    def asset_dir(self, asset_id: str) -> Path:
        path = self.root / asset_id
        path.mkdir(parents=True, exist_ok=True)
        return path
