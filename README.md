# BhashaSetu V3

BhashaSetu V3 is a Flask-based language platform that combines translation, grammar correction, conversation practice, voice support, and PDF translation in one web application.

## Project Objective

The goal of this project is to provide a single learning and communication tool where users can:
- Translate text between many global and Indian languages.
- Improve grammar quality of written text.
- Practice simple conversational exchanges.
- Convert speech to text and text back to speech.
- Translate complete PDF documents.

## Core Features

### 1. User Authentication and Account Management
- User sign up with full name, username, password, security question, and security answer.
- Secure sign in and sign out.
- Forgot-password flow using security-question verification.
- Session-based access control for all major APIs.

### 2. Multilingual Text Translation
- Real-time translation using Google translation engine via deep-translator.
- Supports 30+ languages including Hindi, Tamil, Telugu, Marathi, Bengali, Punjabi, Urdu, and more.
- Source and target language selection from UI dropdowns.
- Translation records stored in user history.

### 3. Grammar Analysis and Correction
- Grammar checking with language-tool-python.
- Supported grammar languages: English, French, German, Italian, Dutch, Portuguese, Russian, Spanish.
- Issue list with rule id, message, and suggestions.
- English-specific heuristic corrections for common sentence errors.

### 4. Conversation Practice Mode
- Chat-like interface for language practice.
- Rule-based assistant response generation.
- Assistant reply translation to user-selected response language.
- Conversation history persistence per user.

### 5. Voice Translation
- Browser Speech Recognition (Web Speech API) to capture spoken input.
- Converts recognized speech to translated text.
- Audio playback of translated output using gTTS-generated MP3.

### 6. Real-Time Two-Way Live Interpreter
- Two-speaker live mode (Speaker A and Speaker B).
- Auto-turn switching and manual speaker switch support.
- Live transcript with source and translated utterances.
- Audio playback for each translated turn.

### 7. PDF Translation
- Upload text-based PDF files.
- Extract text using PyPDF2.
- Chunk-based translation for large documents.
- Display both extracted and translated content.
- Download translated PDF output as text file.

### 8. History, Analytics, and Export
- Per-user history files in JSON format.
- Dashboard statistics:
   - Translations today
   - Total translations
   - Chat messages
   - Languages used
- Download full history as JSON from the app.

## Technology Stack

### Backend
- Python 3
- Flask (web framework and API routing)
- Werkzeug security helpers for password hashing and verification
- bcrypt support for compatibility with bcrypt-style stored hashes

### NLP / Language Processing
- deep-translator (GoogleTranslator)
- language-tool-python (grammar analysis)

### Speech and Audio
- Browser Web Speech API (SpeechRecognition / webkitSpeechRecognition) for speech-to-text
- gTTS for text-to-speech MP3 generation

### Document Processing
- PyPDF2 for PDF text extraction

### Frontend
- HTML5 (templates)
- CSS3 (custom styling)
- Vanilla JavaScript (client-side logic, fetch APIs, dynamic UI state)

### Data Storage
- JSON file-based local persistence:
   - user_data.json for user credentials and profile/security metadata
   - history_<username>.json for user-specific translation and chat history

### Runtime and Deployment Context
- Runs as a local Flask web server (default: http://127.0.0.1:5000)
- Generated audio files stored under static/generated

## Project Structure

- app.py: Main Flask application, APIs, authentication, and business logic.
- templates/index.html: Main UI layout.
- static/script.js: Frontend interaction and API integration.
- static/style.css: Application styling.
- user_data.json: Registered user data storage.
- history_*.json: Per-user activity history.

## Installation

1. Clone or download the project.
2. Create and activate a virtual environment (recommended).
```bash
venv\Scripts\activate
```   
4. Install dependencies:

```bash
pip install -r requirements.txt
```

## Run the Application

```bash
python app.py
```

Open: http://127.0.0.1:5000

## Functional Modules for Report Writing

You can describe the system in your report with these major modules:
- Authentication Module
- Translation Module
- Grammar Analysis Module
- Conversation Module
- Voice Translation Module
- Live Interpreter Module
- PDF Translation Module
- History and Analytics Module

## Limitations

- Internet connection is required for translation and text-to-speech services.
- Voice recognition depends on browser support and microphone permissions.
- PDF feature works best with text-based PDFs (not scanned-image PDFs without OCR).

## Future Enhancements

- Add OCR support for scanned PDFs.
- Add database storage (SQLite/MySQL/PostgreSQL) instead of JSON files.
- Add role-based admin dashboard and usage insights.
- Add model-based conversational AI for richer chat practice.

## License

This project is currently intended for educational and academic demonstration use.
