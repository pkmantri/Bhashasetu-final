function loadBootstrapData() {
    const node = document.getElementById('bootstrap-data');
    if (!node || !node.textContent) {
        return { history: { translations: [], conversations: [] }, stats: {}, speech_locales: {} };
    }
    try {
        return JSON.parse(node.textContent);
    } catch (_error) {
        return { history: { translations: [], conversations: [] }, stats: {}, speech_locales: {} };
    }
}

const bootstrap = loadBootstrapData();

const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

const statsMap = {
    'stat-translations-today': 'translations_today',
    'stat-total-translations': 'total_translations',
    'stat-chat-messages': 'chat_messages',
    'stat-languages-used': 'languages_used',
};

let authState = bootstrap.auth || { logged_in: false, username: '', full_name: '' };

let lastPdfTranslatedText = '';
let currentVoiceRecognition = null;
const speechState = {
    text: '',
    language: 'English',
    audioElementId: '',
    source: '',
};

const liveState = {
    active: false,
    processing: false,
    currentSpeaker: 'A',
    switchRequested: false,
};

const authPanel = document.getElementById('auth-panel');
const appShell = document.getElementById('app-shell');
const logoutButton = document.getElementById('logout-btn');
const authUserLabel = document.getElementById('auth-user-label');

function setAuthState(nextAuthState) {
    authState = {
        logged_in: Boolean(nextAuthState && nextAuthState.logged_in),
        username: (nextAuthState && nextAuthState.username) || '',
        full_name: (nextAuthState && nextAuthState.full_name) || '',
    };

    if (authState.logged_in) {
        authPanel.classList.add('hidden');
        appShell.classList.remove('hidden');
        logoutButton.classList.remove('hidden');
        const labelName = authState.full_name || authState.username;
        authUserLabel.textContent = `Signed in as ${labelName}`;
        showStatus('auth-status', '', 'info');
    } else {
        if (liveState.active) {
            stopLiveInterpreter();
        }
        appShell.classList.add('hidden');
        authPanel.classList.remove('hidden');
        logoutButton.classList.add('hidden');
        authUserLabel.textContent = 'Not signed in';
        updateStats({
            translations_today: 0,
            total_translations: 0,
            chat_messages: 0,
            languages_used: 0,
        });
        renderHistory({ translations: [], conversations: [] });
    }
}

function setAuthTab(tabName) {
    document.querySelectorAll('.auth-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.authTab === tabName);
    });

    document.querySelectorAll('.auth-form').forEach((form) => {
        form.classList.toggle('active', form.id === `auth-form-${tabName}`);
    });
}

function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function setActiveTab(tabName) {
    tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tabName);
    });
    tabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
}

tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

document.querySelectorAll('.auth-tab').forEach((button) => {
    button.addEventListener('click', () => {
        setAuthTab(button.dataset.authTab);
        showStatus('auth-status', '', 'info');
    });
});

function showStatus(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    element.textContent = message || '';
    element.className = `status ${type}`;
}

function updateStats(stats) {
    Object.entries(statsMap).forEach(([elementId, statKey]) => {
        const node = document.getElementById(elementId);
        if (node && Object.prototype.hasOwnProperty.call(stats, statKey)) {
            node.textContent = stats[statKey];
        }
    });
}

function escapeHtml(text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function renderHistory(history) {
    const translationsRoot = document.getElementById('history-translations');
    const conversationsRoot = document.getElementById('history-conversations');

    const translations = history.translations || [];
    const conversations = history.conversations || [];

    if (!translations.length) {
        translationsRoot.innerHTML = '<p class="empty-state">No translations yet.</p>';
    } else {
        translationsRoot.innerHTML = translations.map((item) => `
            <article class="history-item">
                <p class="history-meta">${escapeHtml(item.timestamp || '')} | ${escapeHtml(item.source_lang || '')} -> ${escapeHtml(item.target_lang || '')} | ${escapeHtml(item.type || 'text')}</p>
                <p><strong>Source</strong></p>
                <p>${escapeHtml(item.source_text || '')}</p>
                <p><strong>Result</strong></p>
                <p>${escapeHtml(item.translated_text || '')}</p>
            </article>
        `).join('');
    }

    if (!conversations.length) {
        conversationsRoot.innerHTML = '<p class="empty-state">No chat messages yet.</p>';
    } else {
        conversationsRoot.innerHTML = conversations.map((item) => `
            <article class="history-item ${item.role === 'assistant' ? 'assistant' : 'user'}">
                <p class="history-meta">${escapeHtml(item.timestamp || '')} | ${escapeHtml(item.role || '')}</p>
                <p>${escapeHtml(item.content || '')}</p>
            </article>
        `).join('');
    }

    renderChatThread(conversations);
}

function renderChatThread(conversations) {
    const thread = document.getElementById('chat-thread');
    if (!conversations.length) {
        thread.innerHTML = '<p class="empty-state">Start a conversation to see messages here.</p>';
        return;
    }

    thread.innerHTML = conversations.map((item) => `
        <article class="chat-bubble ${item.role === 'assistant' ? 'assistant' : 'user'}">
            <span class="bubble-role">${escapeHtml(item.role || '')}</span>
            <p>${escapeHtml(item.content || '')}</p>
        </article>
    `).join('');
    thread.scrollTop = thread.scrollHeight;
}

function getSpeechLocale(languageName) {
    return (bootstrap.speech_locales || {})[languageName] || 'en-US';
}

function rememberSpeechOutput({ text, language, audioElementId = '', source = '' }) {
    speechState.text = (text || '').trim();
    speechState.language = language || 'English';
    speechState.audioElementId = audioElementId || '';
    speechState.source = source || '';

    const voiceReplayButton = document.getElementById('voice-replay');
    const liveReplayButton = document.getElementById('live-replay');
    if (voiceReplayButton && source === 'voice') {
        voiceReplayButton.disabled = !speechState.text;
    }
    if (liveReplayButton && source === 'live') {
        liveReplayButton.disabled = !speechState.text;
    }
}

function resetSpeechOutput(source) {
    if (speechState.source === source) {
        speechState.text = '';
        speechState.language = 'English';
        speechState.audioElementId = '';
        speechState.source = '';
    }

    if (source === 'voice') {
        document.getElementById('voice-replay').disabled = true;
    }
    if (source === 'live') {
        document.getElementById('live-replay').disabled = true;
    }
}

function speakWithBrowser(text, languageName) {
    return new Promise((resolve, reject) => {
        if (!('speechSynthesis' in window)) {
            reject(new Error('Browser speech synthesis is unavailable.'));
            return;
        }

        const message = (text || '').trim();
        if (!message) {
            reject(new Error('No text available for speech output.'));
            return;
        }

        const utterance = new SpeechSynthesisUtterance(message);
        const locale = getSpeechLocale(languageName);
        utterance.lang = locale;

        const attachVoiceAndSpeak = () => {
            const voices = window.speechSynthesis.getVoices();
            const localePrefix = locale.split('-')[0].toLowerCase();
            const matchedVoice = voices.find((voice) =>
                (voice.lang || '').toLowerCase().startsWith(localePrefix)
            );
            if (matchedVoice) {
                utterance.voice = matchedVoice;
            }

            utterance.onend = () => resolve();
            utterance.onerror = (event) => {
                const reason = event && event.error ? String(event.error) : 'unknown';
                reject(new Error(`Browser speech playback failed: ${reason}.`));
            };

            try {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
            } catch (_error) {
                reject(new Error('Could not start browser speech playback.'));
            }
        };

        if (!window.speechSynthesis.getVoices().length) {
            const handleVoicesChanged = () => {
                window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
                attachVoiceAndSpeak();
            };
            window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged, { once: true });
            setTimeout(() => {
                window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
                attachVoiceAndSpeak();
            }, 250);
            return;
        }

        attachVoiceAndSpeak();
    });
}

async function speakWithServer(text, language, audioElementId) {
    const payload = await requestJson('/api/speak', {
        method: 'POST',
        body: JSON.stringify({ text, language }),
    });

    if (!audioElementId) {
        return;
    }

    const audio = document.getElementById(audioElementId);
    audio.src = payload.audio_url;
    audio.classList.remove('hidden');
    await audio.play();

    await new Promise((resolve) => {
        const onEnded = () => {
            audio.removeEventListener('ended', onEnded);
            resolve();
        };
        audio.addEventListener('ended', onEnded);
    });
}

async function playSpeechWithFallback(text, language, audioElementId, options = {}) {
    const { allowServerFallback = true } = options;
    try {
        await speakWithBrowser(text, language);
        return 'browser';
    } catch (browserError) {
        if (!allowServerFallback) {
            throw browserError;
        }
        await speakWithServer(text, language, audioElementId);
        return 'server';
    }
}

function appendLiveTurn({ speaker, sourceLanguage, targetLanguage, sourceText, translatedText }) {
    const root = document.getElementById('live-voice-thread');
    if (!root) {
        return;
    }

    if (root.querySelector('.empty-state')) {
        root.innerHTML = '';
    }

    const article = document.createElement('article');
    article.className = `live-turn ${speaker === 'A' ? 'turn-a' : 'turn-b'}`;
    article.innerHTML = `
        <div class="turn-meta">Speaker ${speaker} | ${escapeHtml(sourceLanguage)} -> ${escapeHtml(targetLanguage)}</div>
        <p class="turn-row"><strong>Heard:</strong> ${escapeHtml(sourceText)}</p>
        <p class="turn-row"><strong>Translated:</strong> ${escapeHtml(translatedText)}</p>
    `;
    root.appendChild(article);
    root.scrollTop = root.scrollHeight;
}

function clearLiveTranscript() {
    const root = document.getElementById('live-voice-thread');
    if (root) {
        root.innerHTML = '<p class="empty-state">Start interpreter mode to see live conversation turns.</p>';
    }
}

function updateLiveControlState() {
    const startButton = document.getElementById('live-start');
    const stopButton = document.getElementById('live-stop');
    const switchButton = document.getElementById('live-switch');
    startButton.disabled = liveState.active;
    stopButton.disabled = !liveState.active;
    switchButton.disabled = !liveState.active;
}

function getLiveTurnConfig() {
    const langA = document.getElementById('live-lang-a').value;
    const langB = document.getElementById('live-lang-b').value;
    if (liveState.currentSpeaker === 'A') {
        return {
            speaker: 'A',
            sourceLanguage: langA,
            targetLanguage: langB,
        };
    }
    return {
        speaker: 'B',
        sourceLanguage: langB,
        targetLanguage: langA,
    };
}

function captureSpeechOnce(languageName) {
    return new Promise((resolve, reject) => {
        const SpeechApi = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechApi) {
            reject(new Error('Speech recognition is unavailable in this browser.'));
            return;
        }

        const recognition = new SpeechApi();
        currentVoiceRecognition = recognition;
        recognition.lang = getSpeechLocale(languageName);
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        let hasResolved = false;
        const cleanup = () => {
            if (currentVoiceRecognition === recognition) {
                currentVoiceRecognition = null;
            }
        };

        const timeoutId = setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                try {
                    recognition.abort();
                } catch (_error) {
                    // Ignore abort errors.
                }
                cleanup();
                reject(new Error('No speech detected. Try speaking again.'));
            }
        }, 12000);

        recognition.onresult = (event) => {
            if (hasResolved) {
                return;
            }
            hasResolved = true;
            clearTimeout(timeoutId);
            const transcript = event.results[0][0].transcript;
            cleanup();
            resolve(transcript);
        };

        recognition.onerror = (event) => {
            if (hasResolved) {
                return;
            }
            hasResolved = true;
            clearTimeout(timeoutId);
            cleanup();
            reject(new Error(`Speech recognition error: ${event.error}`));
        };

        recognition.onend = () => {
            if (!hasResolved) {
                hasResolved = true;
                clearTimeout(timeoutId);
                cleanup();
                reject(new Error('Listening ended before speech was captured.'));
            }
        };

        try {
            recognition.start();
        } catch (_error) {
            clearTimeout(timeoutId);
            cleanup();
            reject(new Error('Could not start speech recognition.'));
        }
    });
}

async function playLiveAudio(text, language) {
    rememberSpeechOutput({ text, language, audioElementId: 'live-voice-audio', source: 'live' });
    await playSpeechWithFallback(text, language, 'live-voice-audio', { allowServerFallback: false });
}

async function runLiveInterpreterTurn() {
    if (!liveState.active || liveState.processing) {
        return;
    }

    liveState.processing = true;
    const turnConfig = getLiveTurnConfig();
    showStatus('live-current-turn', `Current speaker: ${turnConfig.speaker} (${turnConfig.sourceLanguage})`, 'info');
    showStatus('live-voice-status', `Listening to Speaker ${turnConfig.speaker}...`, 'info');

    try {
        const spokenText = await captureSpeechOnce(turnConfig.sourceLanguage);
        const translatePayload = await requestJson('/api/translate', {
            method: 'POST',
            body: JSON.stringify({
                text: spokenText,
                source_lang: turnConfig.sourceLanguage,
                target_lang: turnConfig.targetLanguage,
            }),
        });

        const translatedText = translatePayload.translated_text || '';
        updateStats(translatePayload.stats || {});
        appendLiveTurn({
            speaker: turnConfig.speaker,
            sourceLanguage: turnConfig.sourceLanguage,
            targetLanguage: turnConfig.targetLanguage,
            sourceText: spokenText,
            translatedText,
        });

        showStatus('live-voice-status', `Speaking translation for Speaker ${turnConfig.speaker === 'A' ? 'B' : 'A'}...`, 'success');
        try {
            await playLiveAudio(translatedText, turnConfig.targetLanguage);
            showStatus('live-voice-status', 'Translation spoken successfully.', 'success');
        } catch (speechError) {
            showStatus('live-voice-status', `${speechError.message} Use Replay translation.`, 'error');
        }
        await refreshHistory();

        if (liveState.switchRequested) {
            liveState.currentSpeaker = liveState.currentSpeaker === 'A' ? 'B' : 'A';
            liveState.switchRequested = false;
        } else {
            liveState.currentSpeaker = liveState.currentSpeaker === 'A' ? 'B' : 'A';
        }
    } catch (error) {
        showStatus('live-voice-status', error.message, 'error');
    } finally {
        liveState.processing = false;
    }

    if (liveState.active) {
        setTimeout(() => {
            runLiveInterpreterTurn();
        }, 300);
    }
}

function stopLiveInterpreter() {
    liveState.active = false;
    liveState.processing = false;
    liveState.switchRequested = false;
    if (currentVoiceRecognition) {
        try {
            currentVoiceRecognition.abort();
        } catch (_error) {
            // Ignore abort failures.
        }
        currentVoiceRecognition = null;
    }
    updateLiveControlState();
    resetSpeechOutput('live');
    showStatus('live-current-turn', '', 'info');
    showStatus('live-voice-status', 'Live interpreter stopped.', 'info');
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });

    const payload = await response.json();
    if (!response.ok) {
        if (response.status === 401) {
            setAuthState({ logged_in: false });
            showStatus('auth-status', payload.error || 'Please sign in first.', 'error');
        }
        throw new Error(payload.error || 'Request failed.');
    }
    return payload;
}

async function refreshAuthStatus() {
    const status = await requestJson('/api/auth/status', { method: 'GET' });
    setAuthState(status);
    return status;
}

document.getElementById('auth-form-login').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    showStatus('auth-status', 'Signing in...', 'info');
    try {
        await requestJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        await refreshAuthStatus();
        await refreshHistory();
        showStatus('auth-status', 'Signed in successfully.', 'success');
    } catch (error) {
        showStatus('auth-status', error.message, 'error');
    }
});

document.getElementById('auth-form-signup').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
        full_name: document.getElementById('signup-full-name').value.trim(),
        username: document.getElementById('signup-username').value.trim(),
        password: document.getElementById('signup-password').value,
        confirm_password: document.getElementById('signup-confirm-password').value,
        security_question: document.getElementById('signup-security-question').value.trim(),
        security_answer: document.getElementById('signup-security-answer').value.trim(),
    };

    showStatus('auth-status', 'Creating account...', 'info');
    try {
        await requestJson('/api/auth/signup', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        await refreshAuthStatus();
        await refreshHistory();
        showStatus('auth-status', 'Account created and signed in.', 'success');
    } catch (error) {
        showStatus('auth-status', error.message, 'error');
    }
});

document.getElementById('forgot-get-question').addEventListener('click', async () => {
    const username = document.getElementById('forgot-username').value.trim();
    if (!username) {
        showStatus('auth-status', 'Enter username first.', 'error');
        return;
    }

    showStatus('auth-status', 'Getting verification question...', 'info');
    try {
        const payload = await requestJson('/api/auth/forgot-password/question', {
            method: 'POST',
            body: JSON.stringify({ username }),
        });
        document.getElementById('forgot-question').value = payload.security_question || '';
        showStatus('auth-status', 'Verification question loaded.', 'success');
    } catch (error) {
        showStatus('auth-status', error.message, 'error');
    }
});

document.getElementById('auth-form-forgot').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
        username: document.getElementById('forgot-username').value.trim(),
        security_answer: document.getElementById('forgot-answer').value.trim(),
        new_password: document.getElementById('forgot-new-password').value,
        confirm_password: document.getElementById('forgot-confirm-password').value,
    };

    showStatus('auth-status', 'Verifying answer and resetting password...', 'info');
    try {
        await requestJson('/api/auth/forgot-password/reset', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        showStatus('auth-status', 'Password reset successful. Please sign in.', 'success');
        setAuthTab('login');
        document.getElementById('login-username').value = payload.username;
    } catch (error) {
        showStatus('auth-status', error.message, 'error');
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        await requestJson('/api/auth/logout', { method: 'POST' });
    } catch (_error) {
        // No-op: status will be refreshed below.
    }
    await refreshAuthStatus();
    setAuthTab('login');
});

document.getElementById('translate-submit').addEventListener('click', async () => {
    const text = document.getElementById('translate-input').value;
    const sourceLang = document.getElementById('translate-source').value;
    const targetLang = document.getElementById('translate-target').value;

    showStatus('translate-status', 'Translating...', 'info');
    try {
        const payload = await requestJson('/api/translate', {
            method: 'POST',
            body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
        });
        document.getElementById('translate-output').value = payload.translated_text;
        updateStats(payload.stats);
        showStatus('translate-status', 'Translation complete.', 'success');
        await refreshHistory();
    } catch (error) {
        showStatus('translate-status', error.message, 'error');
    }
});

document.getElementById('translate-speak').addEventListener('click', async () => {
    const text = document.getElementById('translate-output').value;
    const language = document.getElementById('translate-target').value;
    if (!text.trim()) {
        showStatus('translate-status', 'Translate some text before audio playback.', 'error');
        return;
    }

    showStatus('translate-status', 'Playing audio...', 'info');
    try {
        const mode = await playSpeechWithFallback(text, language, 'translate-audio');
        const modeText = mode === 'browser' ? 'browser voice' : 'server audio';
        showStatus('translate-status', `Audio played using ${modeText}.`, 'success');
    } catch (error) {
        showStatus('translate-status', error.message, 'error');
    }
});

document.getElementById('analyze-submit').addEventListener('click', async () => {
    const text = document.getElementById('analyze-input').value;
    const language = document.getElementById('analyze-language').value;
    const issuesRoot = document.getElementById('analysis-issues');

    showStatus('analyze-status', 'Analyzing...', 'info');
    issuesRoot.innerHTML = '';
    try {
        const payload = await requestJson('/api/analyze', {
            method: 'POST',
            body: JSON.stringify({ text, language }),
        });
        document.getElementById('analyze-output').value = payload.corrected_text;
        if (!payload.issues.length) {
            issuesRoot.innerHTML = '<p class="empty-state">No grammar issues found.</p>';
        } else {
            issuesRoot.innerHTML = payload.issues.map((issue) => `
                <article class="issue-item">
                    <p><strong>${escapeHtml(issue.rule_id || 'Rule')}</strong></p>
                    <p>${escapeHtml(issue.message || '')}</p>
                    <p>${escapeHtml((issue.suggestions || []).join(', ') || 'No suggestions available')}</p>
                </article>
            `).join('');
        }
        showStatus('analyze-status', `${payload.issue_count} issue(s) found.`, 'success');
    } catch (error) {
        showStatus('analyze-status', error.message, 'error');
    }
});

document.getElementById('chat-submit').addEventListener('click', async () => {
    const message = document.getElementById('chat-input').value;
    const responseLanguage = document.getElementById('chat-language').value;

    showStatus('chat-status', 'Sending...', 'info');
    try {
        const payload = await requestJson('/api/chat', {
            method: 'POST',
            body: JSON.stringify({ message, response_language: responseLanguage }),
        });
        document.getElementById('chat-input').value = '';
        updateStats(payload.stats);
        showStatus('chat-status', 'Reply received.', 'success');
        await refreshHistory();
    } catch (error) {
        showStatus('chat-status', error.message, 'error');
    }
});

let recognition;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('voice-input').value = transcript;
        showStatus('voice-status', 'Speech captured.', 'success');
    };
    recognition.onerror = (event) => {
        showStatus('voice-status', `Speech recognition error: ${event.error}`, 'error');
    };
} else {
    showStatus('voice-status', 'Browser speech recognition is not available here. You can still paste text manually.', 'error');
}

document.getElementById('voice-start').addEventListener('click', () => {
    if (!recognition) {
        showStatus('voice-status', 'Speech recognition is unavailable in this browser.', 'error');
        return;
    }
    const selectedLanguage = document.getElementById('voice-source').value;
    recognition.lang = (bootstrap.speech_locales || {})[selectedLanguage] || 'en-US';
    recognition.start();
    showStatus('voice-status', 'Listening...', 'info');
});

document.getElementById('live-start').addEventListener('click', () => {
    const langA = document.getElementById('live-lang-a').value;
    const langB = document.getElementById('live-lang-b').value;
    if (langA === langB) {
        showStatus('live-voice-status', 'Choose different languages for Speaker A and Speaker B.', 'error');
        return;
    }

    liveState.active = true;
    liveState.processing = false;
    liveState.currentSpeaker = 'A';
    liveState.switchRequested = false;
    updateLiveControlState();
    showStatus('live-voice-status', 'Live interpreter started.', 'success');
    runLiveInterpreterTurn();
});

document.getElementById('live-stop').addEventListener('click', () => {
    stopLiveInterpreter();
});

document.getElementById('live-switch').addEventListener('click', () => {
    if (!liveState.active) {
        return;
    }
    liveState.switchRequested = true;
    showStatus('live-voice-status', 'Speaker switch queued for next turn.', 'info');
});

document.getElementById('live-clear').addEventListener('click', () => {
    clearLiveTranscript();
    showStatus('live-voice-status', 'Transcript cleared.', 'info');
});

document.getElementById('voice-translate').addEventListener('click', async () => {
    const text = document.getElementById('voice-input').value;
    const sourceLang = document.getElementById('voice-source').value;
    const targetLang = document.getElementById('voice-target').value;

    showStatus('voice-status', 'Translating captured speech...', 'info');
    try {
        const payload = await requestJson('/api/translate', {
            method: 'POST',
            body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
        });
        document.getElementById('voice-output').value = payload.translated_text;
        updateStats(payload.stats);
        rememberSpeechOutput({ text: payload.translated_text, language: targetLang, audioElementId: 'voice-audio', source: 'voice' });
        const mode = await playSpeechWithFallback(payload.translated_text, targetLang, 'voice-audio');
        const modeText = mode === 'browser' ? 'browser voice' : 'server audio';
        showStatus('voice-status', `Voice translation complete using ${modeText}.`, 'success');
        await refreshHistory();
    } catch (error) {
        showStatus('voice-status', error.message, 'error');
    }
});

document.getElementById('voice-replay').addEventListener('click', async () => {
    if (!speechState.text || speechState.source !== 'voice') {
        showStatus('voice-status', 'No translated voice output is available to replay.', 'error');
        return;
    }

    showStatus('voice-status', 'Replaying translated voice...', 'info');
    try {
        const mode = await playSpeechWithFallback(speechState.text, speechState.language, speechState.audioElementId || 'voice-audio');
        const modeText = mode === 'browser' ? 'browser voice' : 'server audio';
        showStatus('voice-status', `Replay completed using ${modeText}.`, 'success');
    } catch (error) {
        showStatus('voice-status', error.message, 'error');
    }
});

document.getElementById('live-replay').addEventListener('click', async () => {
    if (!speechState.text || speechState.source !== 'live') {
        showStatus('live-voice-status', 'No live translation is available to replay.', 'error');
        return;
    }

    showStatus('live-voice-status', 'Replaying last live translation...', 'info');
    try {
        const mode = await playSpeechWithFallback(speechState.text, speechState.language, speechState.audioElementId || 'live-voice-audio');
        const modeText = mode === 'browser' ? 'browser voice' : 'server audio';
        showStatus('live-voice-status', `Replay completed using ${modeText}.`, 'success');
    } catch (error) {
        showStatus('live-voice-status', error.message, 'error');
    }
});

document.getElementById('pdf-submit').addEventListener('click', async () => {
    const file = document.getElementById('pdf-file').files[0];
    const sourceLang = document.getElementById('pdf-source').value;
    const targetLang = document.getElementById('pdf-target').value;
    if (!file) {
        showStatus('pdf-status', 'Choose a PDF file first.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('source_lang', sourceLang);
    formData.append('target_lang', targetLang);

    showStatus('pdf-status', 'Processing PDF...', 'info');
    try {
        const response = await fetch('/api/pdf-translate', { method: 'POST', body: formData });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.error || 'PDF translation failed.');
        }
        document.getElementById('pdf-extracted').value = payload.extracted_text;
        document.getElementById('pdf-output').value = payload.translated_text;
        lastPdfTranslatedText = payload.translated_text || '';
        document.getElementById('pdf-download').disabled = !lastPdfTranslatedText.trim();
        updateStats(payload.stats);
        showStatus('pdf-status', 'PDF translation complete.', 'success');
        await refreshHistory();
    } catch (error) {
        showStatus('pdf-status', error.message, 'error');
    }
});

document.getElementById('pdf-download').addEventListener('click', () => {
    if (!lastPdfTranslatedText.trim()) {
        showStatus('pdf-status', 'Translate a PDF first, then download the output.', 'error');
        return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadTextFile(`translated-pdf-${stamp}.txt`, lastPdfTranslatedText);
    showStatus('pdf-status', 'Translated output downloaded.', 'success');
});

async function refreshHistory() {
    const payload = await requestJson('/api/history', { method: 'GET' });
    updateStats(payload.stats);
    renderHistory(payload.history);
}

document.getElementById('refresh-history').addEventListener('click', async () => {
    await refreshHistory();
});

document.getElementById('download-history').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/history/download');
        if (!response.ok) {
            throw new Error('Could not download history.');
        }
        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';
        const nameMatch = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
        const filename = decodeURIComponent((nameMatch && (nameMatch[1] || nameMatch[2])) || 'bhashasetu-history.json');
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        showStatus('history-status', 'History downloaded.', 'success');
    } catch (_error) {
        showStatus('history-status', 'History download failed. Try again.', 'error');
    }
});

async function initApplication() {
    setAuthTab('login');
    setAuthState(authState);
    updateLiveControlState();
    clearLiveTranscript();
    try {
        const status = await refreshAuthStatus();
        if (status.logged_in) {
            updateStats(bootstrap.stats || {});
            renderHistory(bootstrap.history || { translations: [], conversations: [] });
            await refreshHistory();
        }
    } catch (_error) {
        setAuthState({ logged_in: false });
        showStatus('auth-status', 'Could not load authentication status. Refresh and try again.', 'error');
    }
}

initApplication();