# BhashaSetu V3

A language learning and translation platform built with Python and Flask.

## ✨ Features

### Translator
- Real-time translation between 30+ languages
- Support for Indian languages (Hindi, Tamil, Telugu, etc.)
- Translation history tracking in `history_Pankaj.json`

### Text Analyzer
- Grammar checking and correction
- Supported languages: English, Spanish, French, German, Portuguese, Italian, Dutch, Russian

### Conversation Mode
- Lightweight conversational practice flow
- Multi-language responses
- Persistent conversation history

### Voice Translator
- Browser speech recognition when supported
- Text-to-speech playback with `gTTS`

### PDF Translator
- Upload and translate PDF documents
- Automatic text extraction
- Chunk-based processing for large files

### History and Analytics
- Dashboard counters for recent activity
- Translation and chat history loaded from local JSON storage

## 🚀 Installation

1. Clone or download the repository
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## 🎯 Usage

Run the application:
```bash
python app.py
```

Then open `http://127.0.0.1:5000` in your browser.

### Getting Started
1. Open the app in your browser.
2. Use the top tabs to switch between translation, grammar analysis, chat, voice, PDF, and history.
3. Recent activity is stored automatically in `history_Pankaj.json`.

## 📋 Requirements

- Python 3.10+
- Internet connection for translations and AI features
- Microphone access for browser voice features (optional)
- Modern web browser

### Dependencies
- `Flask` - Web framework
- `deep-translator` - Translation engine
- `gTTS` - Text-to-speech
- `PyPDF2` - PDF processing
- `language-tool-python` - Grammar checking

## 🔧 Configuration

### Voice Features
- Allow microphone access in your browser
- Use a Chromium-based browser for best speech-recognition support
- If browser speech recognition is unavailable, you can still paste text manually

### PDF Translation
- Supports text-based PDFs
- Image-based PDFs may not work (OCR not included)
- Large files are processed in chunks

## 🛠️ Troubleshooting

### Common Issues
- **"Module not found"**: Run `pip install -r requirements.txt`
- **Voice not working**: Check microphone permissions and browser settings
- **PDF upload fails**: Ensure the PDF contains extractable text
- **Translation errors**: Check internet connection

### Performance Tips
- Use shorter texts for faster processing
- Close unused browser tabs for better performance
- Clear chat history periodically to free memory

## 🤝 Contributing

This is an educational project demonstrating a multi-tool Flask application for language processing.

## 📄 License

Built for educational purposes.