import os

from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.chat.chatbot import clear_memory, generate_response


app = FastAPI(title="Skincare Assistant API")
FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"

_FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip().rstrip("/")

_explicit_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
if _FRONTEND_URL:
    _explicit_origins.append(_FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_explicit_origins,
    # Allow all local dev ports + any Vercel preview/production URL
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):\d+|https://[a-z0-9\-]+(\.vercel\.app|\.now\.sh)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: str = Field(default="default", min_length=1)
    skin_type: str | None = None
    concerns: str | None = None
    preferences: str | None = None


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
            skin_type=request.skin_type,
            concerns=request.concerns,
            preferences=request.preferences,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Assistant backend error: {type(exc).__name__}: {exc}",
        ) from exc

    return ChatResponse(answer=answer, session_id=request.session_id)


@app.post("/api/reset")
def reset(request: ResetRequest):
    clear_memory(request.session_id.strip())
    return {"status": "cleared", "session_id": request.session_id}


class SuggestRequest(BaseModel):
    skin_type: str
    concern: str
    age_group: str


@app.post("/api/suggest-routine")
def suggest_routine(request: SuggestRequest):
    import csv
    
    # Map age boundaries to dataset categories
    age_map = {
        "Under 20": "14-18",
        "20-35": "19-24",
        "36-50": "25-36",
        "50+": "45+"
    }
    target_age = age_map.get(request.age_group, "25-36")
    target_type = request.skin_type
    target_concern = request.concern

    # Fallback default values
    if target_type == "Sensitive":
        target_type = "Normal" # Sensitive is handled by sensitivity flag but mapped to normal/dry base
    if target_concern == "None":
        target_concern = "Acne" # fallback default concern for treatment database lookup

    csv_path = Path(__file__).resolve().parents[1] / "data" / "raw" / "Skincare Treatment Dataset.csv"
    if not csv_path.exists():
        # Fallback if Vercel serverless has different path layout
        csv_path = Path(__file__).resolve().parent / "data" / "raw" / "Skincare Treatment Dataset.csv"

    suggestions = []
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if (row.get("Age_Group") == target_age and 
                    row.get("Skin_Type") == target_type and 
                    row.get("Concern").lower() == target_concern.lower()):
                    suggestions.append({
                        "ingredients": row.get("Ingredients", ""),
                        "concentrations": row.get("Concentrations", ""),
                        "effects": row.get("Effects", "")
                    })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database read error: {e}")

    # Fallback suggestions if no row matches exactly
    if not suggestions:
        suggestions.append({
            "ingredients": "Hyaluronic Acid + Niacinamide",
            "concentrations": "2% + 5%",
            "effects": "Hydrates, calms skin, balances sebum"
        })

    return {"suggestions": suggestions}


@app.get("/api/conflicts")
def get_conflicts():
    import json
    json_path = Path(__file__).resolve().parents[1] / "data" / "processed" / "hazardous_combinations.json"
    if not json_path.exists():
        json_path = Path(__file__).resolve().parent / "data" / "processed" / "hazardous_combinations.json"
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {"conflicts": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database read error: {e}")


@app.get("/api/unsafe-ingredients")
def get_unsafe_ingredients():
    import json
    json_path = Path(__file__).resolve().parents[1] / "data" / "processed" / "unsafe_ingredients.json"
    if not json_path.exists():
        json_path = Path(__file__).resolve().parent / "data" / "processed" / "unsafe_ingredients.json"
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {"unsafe_ingredients": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database read error: {e}")




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
