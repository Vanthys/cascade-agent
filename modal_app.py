"""
Modal deployment entrypoint for the Gene Agent app.
"""

from __future__ import annotations

from pathlib import Path

import modal

APP_NAME = "gene-agent"
DATA_MOUNT_PATH = "/data"
FRONTEND_DIST_DIR = Path("web/dist")

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install_from_pyproject("pyproject.toml")
    .add_local_python_source("app")
    .add_local_file("main.py", "/root/main.py")
)

if FRONTEND_DIST_DIR.exists():
    image = image.add_local_dir("web/dist", "/root/web/dist")

app = modal.App(APP_NAME, image=image)
data_volume = modal.Volume.from_name(f"{APP_NAME}-data", create_if_missing=True)


@app.function(
    volumes={DATA_MOUNT_PATH: data_volume},
    secrets=[modal.Secret.from_name(APP_NAME)],
    timeout=60 * 20,
    scaledown_window=60,
    min_containers=1,
    max_containers=1,
)
@modal.asgi_app()
def fastapi_app():
    import os

    os.environ["DATABASE_URL"] = f"sqlite:///{DATA_MOUNT_PATH}/gene_agent.db"
    os.environ["RESEARCH_CACHE_PATH"] = f"{DATA_MOUNT_PATH}/.research_cache.json"
    os.environ["DATA_DIR"] = DATA_MOUNT_PATH
    os.environ["FRONTEND_DIST_DIR"] = "/root/web/dist"

    from app.main import app

    app.state.data_volume = data_volume

    return app
