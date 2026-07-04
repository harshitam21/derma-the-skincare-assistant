import os
import re
import sys
import time
from collections import defaultdict, deque
from pathlib import Path

import requests
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

load_dotenv(PROJECT_ROOT / ".env")


def env_value(name, default=None):
    value = os.getenv(name, default)
    if isinstance(value, str):
        return value.lstrip("\ufeff").strip()
    return value


MAX_MEMORY_TURNS = int(env_value("CHAT_MEMORY_TURNS", "6"))
DEFAULT_SESSION_ID = "default"

_chat_memories = defaultdict(lambda: deque(maxlen=MAX_MEMORY_TURNS * 2))

FOLLOW_UP_HINTS = {
    "budget",
    "cheap",
    "cheaper",
    "price",
    "cost",
    "under",
    "below",
    "within",
    "affordable",
    "expensive",
    "those",
    "these",
    "they",
    "their",
    "them",
    "that",
    "it",
    "same",
    "also",
    "then",
    "earlier",
    "previous",
    "previously",
    "mentioned",
    "told",
}

STANDALONE_TOPIC_HINTS = {
    "acne",
    "cleanser",
    "cleansers",
    "dry",
    "hyperpigmentation",
    "moisturiser",
    "moisturisers",
    "moisturizer",
    "moisturizers",
    "oily",
    "pigmentation",
    "product",
    "products",
    "serum",
    "serums",
    "skin",
    "skincare",
    "spf",
    "sunscreen",
    "sunscreens",
    "toner",
    "toners",
}


def _get_memory(session_id):
    return _chat_memories[session_id]


def clear_memory(session_id=DEFAULT_SESSION_ID):
    _chat_memories.pop(session_id, None)


def _is_follow_up(user_query):
    normalized_query = user_query.lower()
    words = set(normalized_query.replace("?", " ").replace(",", " ").split())
    follow_up_phrases = (
        "you told me",
        "you mentioned",
        "do they have",
        "does it have",
        "which ingredients",
        "what ingredients",
        "their ingredients",
    )

    if any(phrase in normalized_query for phrase in follow_up_phrases):
        return True

    if words & STANDALONE_TOPIC_HINTS and not (words & {"those", "these", "they", "their", "them", "that", "it", "same"}):
        return False

    if words & FOLLOW_UP_HINTS:
        return True

    currency_pattern = (
        r"[\u0024\u00a3\u20ac\u20b9]\s*\d|"
        r"\d+\s*(rs|rupees|inr|pounds|gbp|dollars|usd|bucks)"
    )
    if re.search(currency_pattern, normalized_query):
        return True

    if normalized_query.strip().isdigit():
        return True

    return normalized_query.startswith(("and ", "what about", "how about", "now "))


def _recent_conversation_context(memory, limit=4):
    messages = list(memory)[-limit:]
    return "\n".join(
        f"{message['role'].title()}: {message['content']}"
        for message in messages
    )


def build_retrieval_query(user_query, session_id=DEFAULT_SESSION_ID):
    memory = _get_memory(session_id)
    previous_context = _recent_conversation_context(memory)

    if not previous_context or not _is_follow_up(user_query):
        return user_query

    return (
        "Previous skincare request context:\n"
        f"{previous_context}\n\n"
        "Current follow-up question:\n"
        f"{user_query}"
    )


def _format_history(memory):
    return "\n".join(
        f"{message['role'].title()}: {message['content']}"
        for message in memory
    )


def _remember(session_id, role, content):
    _get_memory(session_id).append({"role": role, "content": content})


def get_gemini_config():
    base_url = env_value(
        "GEMINI_API_BASE_URL",
        "https://generativelanguage.googleapis.com/v1beta",
    ).rstrip("/")
    model = env_value("GEMINI_MODEL", "gemini-2.5-flash")
    fallback_model = env_value("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash-lite")
    api_key = env_value("GEMINI_API_KEY")

    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Create a project-root .env file from "
            ".env.example and add your real key there. Editing .env.example "
            "alone will not configure the app."
        )

    return base_url, model, fallback_model, api_key


def _message_text(messages, role):
    return "\n\n".join(
        message["content"]
        for message in messages
        if message.get("role") == role and message.get("content")
    )


def _extract_gemini_text(data):
    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text = "".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response.")
    return text


def _is_retryable_gemini_error(response):
    return response.status_code in {429, 500, 502, 503, 504}


def _gemini_error_detail(response):
    try:
        return response.json()
    except ValueError:
        return response.text


def ask_gemini(messages):
    base_url, model, fallback_model, api_key = get_gemini_config()
    system_text = _message_text(messages, "system")
    user_text = _message_text(messages, "user")
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_text}],
            }
        ],
        "generationConfig": {
            "temperature": 0.4,
            "topP": 0.9,
        },
    }

    if system_text:
        payload["systemInstruction"] = {
            "parts": [{"text": system_text}],
        }

    models_to_try = [model]
    if fallback_model and fallback_model != model:
        models_to_try.append(fallback_model)

    last_error = None
    for model_name in models_to_try:
        for attempt in range(3):
            try:
                response = requests.post(
                    f"{base_url}/models/{model_name}:generateContent",
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": api_key,
                    },
                    json=payload,
                    timeout=120,
                )

                if response.ok:
                    return _extract_gemini_text(response.json())

                last_error = _gemini_error_detail(response)
                if not _is_retryable_gemini_error(response):
                    response.raise_for_status()
            except requests.RequestException as exc:
                last_error = str(exc)
                if getattr(exc, "response", None) is not None:
                    last_error = _gemini_error_detail(exc.response)

            if attempt < 2:
                time.sleep(2 ** attempt)

    raise RuntimeError(
        "Could not get a response from Gemini after retries. "
        "The model may be overloaded or your quota/network may be unavailable. "
        f"Last Gemini error: {last_error}"
    )


def generate_response(user_query, session_id=DEFAULT_SESSION_ID, skin_type=None, concerns=None, preferences=None):
    from backend.retrieval.search import search

    memory = _get_memory(session_id)
    is_follow_up = _is_follow_up(user_query)
    retrieval_query = build_retrieval_query(user_query, session_id)
    history_text = _format_history(memory)
    history_section = (
        f"""
    Conversation History:
    {history_text}
    """
        if history_text
        else ""
    )

    # Retrieve documents
    results = search(retrieval_query, top_k=5)

    # Combine retrieved text
    context = "\n\n".join([
        result["document"]["text"]
        for result in results
    ])

    # Construct Profile Context
    profile_details = []
    if skin_type:
        profile_details.append(f"- Skin Type: {skin_type}")
    if concerns:
        profile_details.append(f"- Skin Concerns: {concerns}")
    if preferences:
        profile_details.append(f"- Preferences: {preferences}")

    profile_section = ""
    if profile_details:
        profile_section = "User Skin Profile:\n" + "\n".join(profile_details) + "\n\n"

    # Load hazardous combinations database instructions
    import json
    conflicts_text = ""
    json_path = Path(__file__).resolve().parents[2] / "data" / "processed" / "hazardous_combinations.json"
    if not json_path.exists():
        json_path = Path(__file__).resolve().parent / "data" / "processed" / "hazardous_combinations.json"
    try:
        if json_path.exists():
            with open(json_path, "r", encoding="utf-8") as f:
                conflicts_data = json.load(f)
                conflicts_text = "Hazardous Skincare Combinations database warning rules (DO NOT recommend using these together in the same AM or PM routine):\n"
                for conflict in conflicts_data:
                    conflicts_text += f"- { ' + '.join(conflict['actives']) }: {conflict['reason']}\n"
    except Exception:
        pass

    # Prompt
    prompt = f"""
    You are a friendly AI skincare assistant.

    Your job:
    - answer conversationally
    - explain skincare concepts clearly
    - use the retrieved information below
    - use conversation history only when it is provided below
    - focus recommendations on matching the user's skin profile (type, concerns, preferences) if provided
    - when the user adds a budget or price limit, apply it to the products or product type already being discussed
    - check the Hazardous Skincare Combinations rules below to make sure you never suggest conflicting actives together
    - avoid medical diagnosis
    - avoid making unsupported claims

    {conflicts_text}

    {profile_section}
    {history_section}

    Retrieved Information:
    {context}

    User Question:
    {user_query}
    """

    answer = ask_gemini(
        [
            {
                "role": "system",
                "content": "You are a helpful skincare assistant."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    _remember(session_id, "user", user_query)
    _remember(session_id, "assistant", answer)

    return answer


if __name__ == "__main__":

    while True:

        query = input("\nYou: ")

        if not query.strip():
            continue

        if query.lower() in ["exit", "quit"]:
            break

        if query.lower() in ["clear", "reset"]:
            clear_memory()
            print("\nAssistant:")
            print("Memory cleared. What would you like to look for next?")
            continue

        try:
            answer = generate_response(query)
        except RuntimeError as exc:
            print(f"\nError: {exc}")
            continue

        print("\nAssistant:")
        print(answer)
