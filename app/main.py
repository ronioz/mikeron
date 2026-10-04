from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.db import DbSession
from app.deps import reject_cross_site_writes, require_login
from app.routers import portfolio, trades

# The built React app. Absent in development, where the Vite dev server serves it.
FRONTEND = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = FastAPI(title="Mikeronn")
protected = [Depends(reject_cross_site_writes), Depends(require_login)]

app.include_router(trades.router, prefix="/api", dependencies=protected)
app.include_router(portfolio.router, prefix="/api", dependencies=protected)


@app.get("/healthz", include_in_schema=False)
def healthz(db: DbSession) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


if FRONTEND.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False, dependencies=[Depends(require_login)])
    def frontend(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        file = (FRONTEND / path).resolve()
        if file.is_file() and file.is_relative_to(FRONTEND):
            return FileResponse(file)
        # Every page URL gets the same HTML; the React router picks the page from the URL.
        return FileResponse(FRONTEND / "index.html")
