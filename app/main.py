from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.db import DbSession
from app.deps import get_current_user, reject_cross_site_writes
from app.routers import account, auth, portfolio, reports, trades

# The built React app. Absent in development, where the Vite dev server serves it.
FRONTEND = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = FastAPI(title="Mikeronn")
# Signing in and out only needs the cross-site check; everything else also
# needs someone signed in, and only ever shows them their own data.
signed_in = [Depends(reject_cross_site_writes), Depends(get_current_user)]

app.include_router(auth.router, prefix="/api", dependencies=[Depends(reject_cross_site_writes)])
app.include_router(account.router, prefix="/api", dependencies=signed_in)
app.include_router(trades.router, prefix="/api", dependencies=signed_in)
app.include_router(portfolio.router, prefix="/api", dependencies=signed_in)
app.include_router(reports.router, prefix="/api", dependencies=signed_in)


@app.get("/healthz", include_in_schema=False)
def healthz(db: DbSession) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


if FRONTEND.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")

    # The pages themselves hold no data, so they load for anyone; the sign-in
    # page is one of them, and the data behind every other page needs a session.
    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        file = (FRONTEND / path).resolve()
        if file.is_file() and file.is_relative_to(FRONTEND):
            return FileResponse(file)
        # Every page URL gets the same HTML; the React router picks the page from the URL.
        return FileResponse(FRONTEND / "index.html")
