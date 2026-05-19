from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.chat.chatbot import clear_memory, generate_response


app = FastAPI(title="Skincare Assistant API")
FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: str = Field(default="default", min_length=1)


class ChatResponse(BaseModel):
    answer: str
    session_id: str


class ResetRequest(BaseModel):
    session_id: str = Field(default="default", min_length=1)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    try:
        answer = generate_response(
            request.message.strip(),
            session_id=request.session_id.strip(),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return ChatResponse(answer=answer, session_id=request.session_id)


@app.post("/api/reset")
def reset(request: ResetRequest):
    clear_memory(request.session_id.strip())
    return {"status": "cleared", "session_id": request.session_id}


if FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="frontend-assets",
    )


@app.get("/")
def frontend():
    index_file = FRONTEND_DIST / "index.html"
    if not index_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Frontend has not been built. Run `npm run build` in frontend.",
        )
    return FileResponse(index_file)


@app.get("/{path:path}")
def frontend_fallback(path: str):
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    return frontend()
