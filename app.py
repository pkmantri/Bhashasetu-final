from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any

import bcrypt
from flask import Flask, has_request_context, jsonify, render_template, request, send_file, send_from_directory, session
from deep_translator import GoogleTranslator
from gtts import gTTS
import PyPDF2
import language_tool_python
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = Path(__file__).resolve().parent
HISTORY_FILE = BASE_DIR / "history_Pankaj.json"
USER_DATA_FILE = BASE_DIR / "user_data.json"
GENERATED_AUDIO_DIR = BASE_DIR / "static" / "generated"

LANGUAGES = {
    "Arabic": "ar",
    "Bengali": "bn",
    "Chinese (Simplified)": "zh-CN",
    "Danish": "da",
    "Dutch": "nl",
    "English": "en",
    "Finnish": "fi",
    "French": "fr",
    "German": "de",
    "Greek": "el",
    "Gujarati": "gu",
    "Hebrew": "he",
    "Hindi": "hi",
    "Indonesian": "id",
    "Italian": "it",
    "Japanese": "ja",
    "Kannada": "kn",
    "Korean": "ko",
    "Malay": "ms",
    "Malayalam": "ml",
    "Marathi": "mr",
    "Norwegian": "no",
    "Odia": "or",
    "Portuguese": "pt",
    "Punjabi": "pa",
    "Russian": "ru",
    "Spanish": "es",
    "Swedish": "sv",
    "Tamil": "ta",
    "Telugu": "te",
    "Thai": "th",
    "Turkish": "tr",
    "Urdu": "ur",
    "Vietnamese": "vi",
}

GRAMMAR_LANGUAGES = {
    "English": "en-US",
    "French": "fr",
    "German": "de",
    "Italian": "it",
    "Dutch": "nl",
    "Portuguese": "pt",
    "Russian": "ru",
    "Spanish": "es",
}

SPEECH_RECOGNITION_LOCALES = {
    "Arabic": "ar-SA",
    "Bengali": "bn-BD",
    "Chinese (Simplified)": "zh-CN",
    "Danish": "da-DK",
    "Dutch": "nl-NL",
    "English": "en-US",
    "Finnish": "fi-FI",
    "French": "fr-FR",
    "German": "de-DE",
    "Greek": "el-GR",
    "Gujarati": "gu-IN",
    "Hebrew": "he-IL",
    "Hindi": "hi-IN",
    "Indonesian": "id-ID",
    "Italian": "it-IT",
    "Japanese": "ja-JP",
    "Kannada": "kn-IN",
    "Korean": "ko-KR",
    "Malay": "ms-MY",
    "Malayalam": "ml-IN",
    "Marathi": "mr-IN",
    "Norwegian": "no-NO",
    "Odia": "or-IN",
    "Portuguese": "pt-PT",
    "Punjabi": "pa-IN",
    "Russian": "ru-RU",
    "Spanish": "es-ES",
    "Swedish": "sv-SE",
    "Tamil": "ta-IN",
    "Telugu": "te-IN",
    "Thai": "th-TH",
    "Turkish": "tr-TR",
    "Urdu": "ur-PK",
    "Vietnamese": "vi-VN",
}

GTTS_LANGUAGE_OVERRIDES = {
    "zh-CN": "zh-CN",
}

COMMON_SINGULAR_ROLE_NOUNS = {
    "student",
    "teacher",
    "doctor",
    "engineer",
    "programmer",
    "developer",
    "manager",
    "designer",
    "lawyer",
    "nurse",
    "artist",
    "writer",
    "player",
    "researcher",
    "scientist",
    "driver",
    "farmer",
    "leader",
    "boy",
    "girl",
    "child",
    "member",
    "friend",
    "person",
}

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("BHASHASETU_SECRET_KEY", "bhashasetu-dev-secret-change-me")


def normalize_username(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "", (value or "").strip())


def normalize_answer(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def history_file_for_username(username: str) -> Path:
    safe = normalize_username(username)
    if not safe:
        return HISTORY_FILE
    return BASE_DIR / f"history_{safe}.json"


def current_username() -> str:
    if not has_request_context():
        return ""
    return str(session.get("username", "")).strip()


def current_history_file() -> Path:
    username = current_username()
    if username:
        return history_file_for_username(username)
    return HISTORY_FILE


def ensure_user_store() -> None:
    if USER_DATA_FILE.exists():
        return
    USER_DATA_FILE.write_text(json.dumps({"users": {}}, indent=2), encoding="utf-8")


def migrate_legacy_users(data: dict[str, Any]) -> dict[str, Any]:
    if isinstance(data.get("users"), dict):
        return data

    users: dict[str, Any] = {}
    usernames = data.get("usernames", {})
    names = data.get("names", {})
    passwords = data.get("passwords", {})

    if isinstance(usernames, dict) and isinstance(passwords, dict):
        for key, username_value in usernames.items():
            username = normalize_username(str(username_value or key))
            if not username:
                continue
            full_name = str(names.get(key, username)).strip() or username
            password_hash = str(passwords.get(key, "")).strip()
            if not password_hash:
                continue
            users[username] = {
                "full_name": full_name,
                "password_hash": password_hash,
                "security_question": "What is your registered full name?",
                "security_answer_hash": generate_password_hash(normalize_answer(full_name)),
                "created_at": datetime.now().isoformat(),
            }

    return {"users": users}


def load_users() -> dict[str, Any]:
    ensure_user_store()
    try:
        payload = USER_DATA_FILE.read_text(encoding="utf-8").strip()
        raw = json.loads(payload) if payload else {"users": {}}
        normalized = migrate_legacy_users(raw)
        if normalized != raw:
            save_users(normalized)
        return normalized
    except (OSError, json.JSONDecodeError):
        return {"users": {}}


def save_users(data: dict[str, Any]) -> None:
    USER_DATA_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def verify_password(stored_hash: str, password: str) -> bool:
    if not stored_hash or not password:
        return False
    if stored_hash.startswith("$2"):
        try:
            return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
        except Exception:
            return False
    try:
        return check_password_hash(stored_hash, password)
    except Exception:
        return False


def login_user(username: str, full_name: str) -> None:
    session["username"] = username
    session["full_name"] = full_name


def require_login_api() -> Any:
    if not current_username():
        return jsonify({"error": "Please sign in to continue."}), 401
    return None


def ensure_runtime_paths() -> None:
    GENERATED_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    history_file = current_history_file()
    if not history_file.exists():
        history_file.write_text(
            json.dumps({"translations": [], "conversations": []}, indent=2),
            encoding="utf-8",
        )


def load_history() -> dict[str, list[dict[str, Any]]]:
    ensure_runtime_paths()
    history_file = current_history_file()
    try:
        raw_text = history_file.read_text(encoding="utf-8").strip()
        if not raw_text:
            return {"translations": [], "conversations": []}
        data = json.loads(raw_text)
    except (json.JSONDecodeError, OSError):
        return {"translations": [], "conversations": []}

    translations = data.get("translations")
    conversations = data.get("conversations")
    return {
        "translations": translations if isinstance(translations, list) else [],
        "conversations": conversations if isinstance(conversations, list) else [],
    }


def save_history(history: dict[str, list[dict[str, Any]]]) -> None:
    history_file = current_history_file()
    history_file.write_text(json.dumps(history, indent=2), encoding="utf-8")


def append_translation(entry: dict[str, Any]) -> None:
    history = load_history()
    history["translations"].insert(0, entry)
    save_history(history)


def append_conversation(entry: dict[str, Any]) -> None:
    history = load_history()
    history["conversations"].append(entry)
    save_history(history)


def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    if not text.strip():
        raise ValueError("Text is required.")

    source_code = LANGUAGES.get(source_lang)
    target_code = LANGUAGES.get(target_lang)
    if not source_code or not target_code:
        raise ValueError("Unsupported language selection.")

    if source_code == target_code:
        return text.strip()

    translator = GoogleTranslator(source=source_code, target=target_code)
    return translator.translate(text.strip())


def summarize_text(text: str, limit: int = 180) -> str:
    compact = re.sub(r"\s+", " ", text.strip())
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 3].rstrip()}..."


def build_chat_response(message: str) -> str:
    normalized = message.lower().strip()

    if any(word in normalized for word in ["hello", "hi", "hey", "good morning", "good evening"]):
        return "Hello. We can practice, translate, or refine your writing. What do you want to work on next?"

    if any(phrase in normalized for phrase in ["how are you", "how's it going", "what's up"]):
        return "I am ready to help. Tell me what you want to say and I can translate it or help you practice it."

    if any(word in normalized for word in ["learn", "practice", "speak", "conversation", "language"]):
        return "A good next step is to send one short sentence in the language you are learning. I will respond naturally and keep the conversation going."

    if any(word in normalized for word in ["translate", "meaning", "say", "word", "phrase"]):
        return "Send the exact text and select the target language. I can help with both literal translation and natural phrasing."

    if normalized.endswith("?") or any(word in normalized.split() for word in ["what", "why", "when", "where", "who", "how"]):
        return "That is a useful question. Give me a little more context and I will answer in simpler language if you want."

    if any(word in normalized for word in ["thank", "thanks"]):
        return "You are welcome. If you want, send another sentence and we can keep practicing."

    if any(word in normalized for word in ["bye", "goodbye", "see you"]):
        return "Goodbye. Come back with another sentence whenever you want more practice."

    return "I understand. Expand on that idea in one or two more sentences and I will respond in a natural conversational style."


def get_grammar_tool(language_code: str) -> Any:
    try:
        return language_tool_python.LanguageTool(language_code)
    except Exception:
        return language_tool_python.LanguageToolPublicAPI(language_code)


def detect_common_english_issues(text: str) -> list[dict[str, Any]]:
    checks: list[tuple[str, str, list[str], str]] = [
        (r"\bthis\s+are\b", "Use 'this is' or 'these are' depending on number.", ["this is", "these are"], "ENG_DET_VERB_AGREEMENT"),
        (r"\bthese\s+is\b", "Use 'these are' for plural nouns.", ["these are"], "ENG_DET_VERB_AGREEMENT"),
        (r"\bi\s+is\b", "Use 'I am' for first-person singular.", ["I am"], "ENG_SUBJECT_VERB_AGREEMENT"),
        (r"\bhe\s+have\b|\bshe\s+have\b|\bit\s+have\b", "Use 'has' with singular third-person subjects.", ["has"], "ENG_SUBJECT_VERB_AGREEMENT"),
        (r"\bthey\s+has\b|\bwe\s+has\b|\byou\s+has\b", "Use 'have' with plural subjects.", ["have"], "ENG_SUBJECT_VERB_AGREEMENT"),
        (r"\ba\s+[aeiouAEIOU]\w*", "Use 'an' before words that start with a vowel sound.", ["an"], "ENG_ARTICLE_A_AN"),
        (r"\ban\s+[^aeiouAEIOU\W]\w*", "Use 'a' before words that start with a consonant sound.", ["a"], "ENG_ARTICLE_A_AN"),
    ]

    issues: list[dict[str, Any]] = []
    for pattern, message, suggestions, rule_id in checks:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            issues.append(
                {
                    "message": message,
                    "offset": match.start(),
                    "length": match.end() - match.start(),
                    "suggestions": suggestions,
                    "rule_id": rule_id,
                }
            )

    for match in re.finditer(r"(?<![A-Za-z])i(?![A-Za-z])", text):
        issues.append(
            {
                "message": "The pronoun 'I' should be uppercase.",
                "offset": match.start(),
                "length": 1,
                "suggestions": ["I"],
                "rule_id": "ENG_PRONOUN_I_CAPITALIZATION",
            }
        )

    greeting_match = re.match(r"^\s*(hello|hi|hey)\s+[A-Za-z]", text, flags=re.IGNORECASE)
    if greeting_match:
        greeting = greeting_match.group(1)
        issues.append(
            {
                "message": "Add a comma after the greeting for natural punctuation.",
                "offset": text.lower().find(greeting.lower()),
                "length": len(greeting),
                "suggestions": [f"{greeting.capitalize()},"],
                "rule_id": "ENG_GREETING_COMMA",
            }
        )

    article_pattern = re.compile(
        r"\b(i am|i'm|he is|she is|it is|this is|that is)\s+([a-z]+)\b",
        flags=re.IGNORECASE,
    )
    for match in article_pattern.finditer(text):
        noun = match.group(2).lower()
        if noun in COMMON_SINGULAR_ROLE_NOUNS:
            issues.append(
                {
                    "message": f"Add an article before the singular noun '{noun}'.",
                    "offset": match.start(2),
                    "length": len(match.group(2)),
                    "suggestions": [f"a {noun}", f"an {noun}"],
                    "rule_id": "ENG_MISSING_ARTICLE_ROLE_NOUN",
                }
            )

    if text.strip() and text.strip()[-1] not in ".!?":
        issues.append(
            {
                "message": "Add ending punctuation to complete the sentence.",
                "offset": len(text.rstrip()) - 1,
                "length": 1,
                "suggestions": [text.rstrip() + "."],
                "rule_id": "ENG_END_PUNCTUATION",
            }
        )

    return issues


def apply_english_quick_fixes(text: str) -> str:
    replacements: list[tuple[str, str]] = [
        (r"\bthis\s+are\b", "this is"),
        (r"\bthese\s+is\b", "these are"),
        (r"\bi\s+is\b", "I am"),
        (r"\bhe\s+have\b", "he has"),
        (r"\bshe\s+have\b", "she has"),
        (r"\bit\s+have\b", "it has"),
        (r"\bthey\s+has\b", "they have"),
        (r"\bwe\s+has\b", "we have"),
        (r"\byou\s+has\b", "you have"),
    ]

    corrected = text
    for pattern, replacement in replacements:
        corrected = re.sub(pattern, replacement, corrected, flags=re.IGNORECASE)

    corrected = re.sub(r"(?<![A-Za-z])i(?![A-Za-z])", "I", corrected)
    corrected = re.sub(r"\ba\s+([aeiouAEIOU]\w*)", r"an \1", corrected)

    def add_article(match: re.Match[str]) -> str:
        phrase = match.group(1)
        noun = match.group(2)
        article = "an" if noun[:1].lower() in "aeiou" else "a"
        return f"{phrase} {article} {noun}"

    corrected = re.sub(
        r"\b(I am|I'm|He is|She is|It is|This is|That is|i am|i'm|he is|she is|it is|this is|that is)\s+([A-Za-z]+)\b",
        lambda match: add_article(match) if match.group(2).lower() in COMMON_SINGULAR_ROLE_NOUNS else match.group(0),
        corrected,
    )

    corrected = re.sub(
        r"^\s*(hello|hi|hey)\b(?!,)",
        lambda match: match.group(1).capitalize() + ",",
        corrected,
        flags=re.IGNORECASE,
    )

    corrected = re.sub(r"(^|[.!?]\s+)([a-z])", lambda match: match.group(1) + match.group(2).upper(), corrected)

    corrected = corrected.strip()
    if corrected and corrected[-1] not in ".!?":
        corrected += "."

    return corrected


def analyze_text(text: str, language_name: str) -> dict[str, Any]:
    if not text.strip():
        raise ValueError("Text is required.")

    grammar_code = GRAMMAR_LANGUAGES.get(language_name)
    if not grammar_code:
        raise ValueError("Grammar analysis is not available for the selected language.")

    matches = []
    try:
        tool = get_grammar_tool(grammar_code)
        matches = tool.check(text)
        corrected_text = language_tool_python.utils.correct(text, matches)
    except Exception:
        corrected_text = text

    issues = []
    for match in matches[:15]:
        issues.append(
            {
                "message": match.message,
                "offset": match.offset,
                "length": getattr(match, "errorLength", None) or getattr(match, "error_length", None),
                "suggestions": match.replacements[:3],
                "rule_id": getattr(match, "ruleId", None) or getattr(match, "rule_id", None),
            }
        )

    # English fallback checks improve detection when external grammar rules miss context.
    if language_name == "English":
        heuristic_issues = detect_common_english_issues(text)
        seen = {(item.get("offset"), item.get("rule_id"), item.get("message")) for item in issues}
        for issue in heuristic_issues:
            key = (issue.get("offset"), issue.get("rule_id"), issue.get("message"))
            if key not in seen:
                issues.append(issue)
                seen.add(key)

        if corrected_text.strip() == text.strip() and heuristic_issues:
            corrected_text = apply_english_quick_fixes(text)
        else:
            corrected_text = apply_english_quick_fixes(corrected_text)

    issues = sorted(issues, key=lambda item: item.get("offset", 0))[:20]

    return {
        "corrected_text": corrected_text,
        "issues": issues,
        "issue_count": len(issues),
    }


def extract_pdf_text(file_storage: Any) -> str:
    reader = PyPDF2.PdfReader(file_storage)
    pages = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages.append(page_text)
    return "\n\n".join(pages).strip()


def translate_large_text(text: str, source_lang: str, target_lang: str, chunk_size: int = 1400) -> str:
    if not text.strip():
        raise ValueError("No text could be extracted from the PDF.")

    source_code = LANGUAGES[source_lang]
    target_code = LANGUAGES[target_lang]
    if source_code == target_code:
        return text

    translator = GoogleTranslator(source=source_code, target=target_code)
    chunks = [text[index:index + chunk_size] for index in range(0, len(text), chunk_size)]
    translated_chunks = [translator.translate(chunk) for chunk in chunks if chunk.strip()]
    return "\n\n".join(translated_chunks)


def create_audio_file(text: str, language_name: str) -> str:
    if not text.strip():
        raise ValueError("Text is required to generate speech.")

    ensure_runtime_paths()
    language_code = LANGUAGES.get(language_name)
    if not language_code:
        raise ValueError("Unsupported language selection.")

    tts_code = GTTS_LANGUAGE_OVERRIDES.get(language_code, language_code.split("-")[0])
    filename = f"tts-{uuid.uuid4().hex}.mp3"
    output_path = GENERATED_AUDIO_DIR / filename
    gTTS(text=text.strip(), lang=tts_code, slow=False).save(output_path)
    return f"/static/generated/{filename}"


def build_dashboard_data() -> dict[str, Any]:
    logged_in = bool(current_username())
    history = load_history()
    if not logged_in:
        history = {"translations": [], "conversations": []}

    translations = history["translations"]
    conversations = history["conversations"]
    today = datetime.now().date().isoformat()

    used_languages = sorted(
        {
            item.get("target_lang")
            for item in translations
            if item.get("target_lang")
        }
    )

    return {
        "languages": sorted(LANGUAGES.keys()),
        "grammar_languages": sorted(GRAMMAR_LANGUAGES.keys()),
        "speech_locales": SPEECH_RECOGNITION_LOCALES,
        "auth": {
            "logged_in": logged_in,
            "username": current_username() if logged_in else "",
            "full_name": str(session.get("full_name", "")) if logged_in else "",
        },
        "stats": {
            "translations_today": sum(1 for item in translations if str(item.get("timestamp", "")).startswith(today)),
            "total_translations": len(translations),
            "chat_messages": len(conversations),
            "languages_used": len(used_languages),
        },
        "history": history,
    }


@app.route("/")
def index() -> str:
    return render_template("index.html", app_data=build_dashboard_data())


@app.route("/api/translate", methods=["POST"])
def api_translate() -> Any:
    auth_error = require_login_api()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or request.form
    text = str(payload.get("text", ""))
    source_lang = str(payload.get("source_lang", "English"))
    target_lang = str(payload.get("target_lang", "Hindi"))

    try:
        translated_text = translate_text(text, source_lang, target_lang)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    history_entry = {
        "timestamp": datetime.now().isoformat(),
        "source_lang": source_lang,
        "target_lang": target_lang,
        "source_text": text.strip(),
        "translated_text": translated_text,
        "type": "text",
    }
    append_translation(history_entry)

    return jsonify({
        "translated_text": translated_text,
        "history_entry": history_entry,
        "stats": build_dashboard_data()["stats"],
    })


@app.route("/process", methods=["POST"])
def process_form_legacy() -> Any:
    text = str(request.form.get("inputText", "")).strip()
    if not text:
        return render_template("index.html", app_data=build_dashboard_data(), result="Please enter text.")

    try:
        translated_text = translate_text(text, "English", "Hindi")
    except Exception as exc:
        translated_text = f"Error: {exc}"

    return render_template("index.html", app_data=build_dashboard_data(), result=translated_text)


@app.route("/api/process", methods=["POST"])
def process_api_legacy() -> Any:
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text", "")).strip()
    if not text:
        return jsonify({"error": "Text is required."}), 400

    try:
        translated = translate_text(text, "English", "Hindi")
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    history_entry = {
        "timestamp": datetime.now().isoformat(),
        "source_lang": "English",
        "target_lang": "Hindi",
        "source_text": text,
        "translated_text": translated,
        "type": "text",
    }
    append_translation(history_entry)
    return jsonify({"result": translated, "history_entry": history_entry})


@app.route("/api/analyze", methods=["POST"])
def api_analyze() -> Any:
    auth_error = require_login_api()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text", ""))
    language_name = str(payload.get("language", "English"))

    try:
        analysis = analyze_text(text, language_name)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(analysis)


@app.route("/api/chat", methods=["POST"])
def api_chat() -> Any:
    auth_error = require_login_api()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", ""))
    response_language = str(payload.get("response_language", "English"))

    if not message.strip():
        return jsonify({"error": "Message is required."}), 400

    base_response = build_chat_response(message)
    try:
        translated_response = translate_text(base_response, "English", response_language)
    except Exception:
        translated_response = base_response

    timestamp = datetime.now().isoformat()
    user_entry = {"role": "user", "content": message.strip(), "timestamp": timestamp}
    assistant_entry = {"role": "assistant", "content": translated_response, "timestamp": timestamp}
    append_conversation(user_entry)
    append_conversation(assistant_entry)

    return jsonify({
        "reply": translated_response,
        "entries": [user_entry, assistant_entry],
        "stats": build_dashboard_data()["stats"],
    })


@app.route("/api/pdf-translate", methods=["POST"])
def api_pdf_translate() -> Any:
    auth_error = require_login_api()
    if auth_error:
        return auth_error

    uploaded_file = request.files.get("pdf")
    source_lang = request.form.get("source_lang", "English")
    target_lang = request.form.get("target_lang", "Hindi")

    if uploaded_file is None or uploaded_file.filename == "":
        return jsonify({"error": "A PDF file is required."}), 400

    try:
        extracted_text = extract_pdf_text(uploaded_file)
        translated_text = translate_large_text(extracted_text, source_lang, target_lang)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    history_entry = {
        "timestamp": datetime.now().isoformat(),
        "source_lang": source_lang,
        "target_lang": target_lang,
        "source_text": summarize_text(extracted_text, 500),
        "translated_text": summarize_text(translated_text, 500),
        "type": "pdf",
    }
    append_translation(history_entry)

    return jsonify({
        "extracted_text": extracted_text,
        "translated_text": translated_text,
        "history_entry": history_entry,
        "stats": build_dashboard_data()["stats"],
    })


@app.route("/api/speak", methods=["POST"])
def api_speak() -> Any:
    auth_error = require_login_api()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text", ""))
    language_name = str(payload.get("language", "English"))

    try:
        audio_url = create_audio_file(text, language_name)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"audio_url": audio_url})


@app.route("/api/history", methods=["GET"])
def api_history() -> Any:
    auth_error = require_login_api()
    if auth_error:
        return auth_error

    dashboard_data = build_dashboard_data()
    return jsonify({
        "history": dashboard_data["history"],
        "stats": dashboard_data["stats"],
    })


@app.route("/api/history/download", methods=["GET"])
def api_history_download() -> Any:
    auth_error = require_login_api()
    if auth_error:
        return auth_error

    history = load_history()
    payload = json.dumps(history, indent=2, ensure_ascii=False)
    file_data = BytesIO(payload.encode("utf-8"))
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    return send_file(
        file_data,
        as_attachment=True,
        download_name=f"bhashasetu-history-{timestamp}.json",
        mimetype="application/json",
    )


@app.route("/static/generated/<path:filename>")
def generated_audio(filename: str) -> Any:
    ensure_runtime_paths()
    return send_from_directory(GENERATED_AUDIO_DIR, filename)


@app.route("/api/auth/status", methods=["GET"])
def auth_status() -> Any:
    username = current_username()
    return jsonify(
        {
            "logged_in": bool(username),
            "username": username,
            "full_name": str(session.get("full_name", "")) if username else "",
        }
    )


@app.route("/api/auth/signup", methods=["POST"])
def auth_signup() -> Any:
    payload = request.get_json(silent=True) or {}
    username = normalize_username(str(payload.get("username", "")))
    full_name = str(payload.get("full_name", "")).strip()
    password = str(payload.get("password", ""))
    confirm_password = str(payload.get("confirm_password", ""))
    security_question = str(payload.get("security_question", "")).strip()
    security_answer = str(payload.get("security_answer", "")).strip()

    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if len(full_name) < 2:
        return jsonify({"error": "Full name is required."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400
    if password != confirm_password:
        return jsonify({"error": "Passwords do not match."}), 400
    if len(security_question) < 6:
        return jsonify({"error": "Security question is required."}), 400
    if len(security_answer) < 2:
        return jsonify({"error": "Security answer is required."}), 400

    users_data = load_users()
    users = users_data.setdefault("users", {})
    if username in users:
        return jsonify({"error": "Username already exists."}), 400

    users[username] = {
        "full_name": full_name,
        "password_hash": generate_password_hash(password),
        "security_question": security_question,
        "security_answer_hash": generate_password_hash(normalize_answer(security_answer)),
        "created_at": datetime.now().isoformat(),
    }
    save_users(users_data)

    history_file_for_username(username).write_text(
        json.dumps({"translations": [], "conversations": []}, indent=2),
        encoding="utf-8",
    )

    login_user(username, full_name)
    return jsonify({"message": "Account created.", "username": username, "full_name": full_name})


@app.route("/api/auth/login", methods=["POST"])
def auth_login() -> Any:
    payload = request.get_json(silent=True) or {}
    username = normalize_username(str(payload.get("username", "")))
    password = str(payload.get("password", ""))

    users = load_users().get("users", {})
    user_record = users.get(username)
    if not user_record:
        return jsonify({"error": "Invalid username or password."}), 401

    stored_hash = str(user_record.get("password_hash", ""))
    if not verify_password(stored_hash, password):
        return jsonify({"error": "Invalid username or password."}), 401

    full_name = str(user_record.get("full_name", username))
    login_user(username, full_name)
    return jsonify({"message": "Signed in successfully.", "username": username, "full_name": full_name})


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout() -> Any:
    session.clear()
    return jsonify({"message": "Signed out."})


@app.route("/api/auth/forgot-password/question", methods=["POST"])
def forgot_password_question() -> Any:
    payload = request.get_json(silent=True) or {}
    username = normalize_username(str(payload.get("username", "")))
    user_record = load_users().get("users", {}).get(username)
    if not user_record:
        return jsonify({"error": "User not found."}), 404

    question = str(user_record.get("security_question", "")).strip()
    if not question:
        return jsonify({"error": "No verification question is set for this account."}), 400
    return jsonify({"security_question": question})


@app.route("/api/auth/forgot-password/reset", methods=["POST"])
def forgot_password_reset() -> Any:
    payload = request.get_json(silent=True) or {}
    username = normalize_username(str(payload.get("username", "")))
    security_answer = normalize_answer(str(payload.get("security_answer", "")))
    new_password = str(payload.get("new_password", ""))
    confirm_password = str(payload.get("confirm_password", ""))

    users_data = load_users()
    users = users_data.get("users", {})
    user_record = users.get(username)
    if not user_record:
        return jsonify({"error": "User not found."}), 404

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters."}), 400
    if new_password != confirm_password:
        return jsonify({"error": "New passwords do not match."}), 400

    answer_hash = str(user_record.get("security_answer_hash", ""))
    if not check_password_hash(answer_hash, security_answer):
        return jsonify({"error": "Verification answer is incorrect."}), 401

    user_record["password_hash"] = generate_password_hash(new_password)
    users[username] = user_record
    users_data["users"] = users
    save_users(users_data)

    return jsonify({"message": "Password reset successful. You can sign in now."})


if __name__ == "__main__":
    ensure_runtime_paths()
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
