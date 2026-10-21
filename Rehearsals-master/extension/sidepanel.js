// ── Auth gate ────────────────────────────────────────────────────────────────
// The Groq key stays server-side, same as the main app — this panel just
// calls rehearsals.pages.dev with the browser's existing session cookie
// rather than holding any credentials of its own.
const API_BASE = 'https://rehearsals.pages.dev';

async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function refreshAuthGate() {
  const authed = await checkAuth();
  document.getElementById('auth-gate').style.display = authed ? 'none' : 'block';
  document.getElementById('coach-main').style.display = authed ? 'block' : 'none';
  return authed;
}

document.getElementById('btn-recheck-auth').addEventListener('click', refreshAuthGate);
refreshAuthGate();

// ── Recording state ───────────────────────────────────────────────────────────
const VOICE_ERROR_MESSAGES = {
  'not-allowed': 'Microphone access was denied. Check this extension\'s site permissions and try again.',
  'service-not-allowed': 'Voice input isn\'t available in this context.',
  'network': 'Voice recognition needs a network connection — check your connection and try again.',
  'audio-capture': 'No microphone was found on this device.',
  'no-speech': null,
  'aborted': null
};

let recognition = null;
let recording = false;
let startTime = null;
let timerInterval = null;
let finalTranscript = '';
let resultTimestamps = [];
let coachingInterval = null;

const recordBtn = document.getElementById('btn-record');
const recordLabel = document.getElementById('record-btn-label');

function showError(text) {
  const el = document.getElementById('voice-error');
  el.textContent = text;
  el.style.display = 'block';
}
function hideError() {
  document.getElementById('voice-error').style.display = 'none';
}

function updateLiveStats() {
  const elapsedSec = (Date.now() - startTime) / 1000;
  const wordCount = (finalTranscript.match(/[a-zA-Z']+/g) || []).length;
  const wpm = computeWPM(wordCount, elapsedSec);
  const fillerTotal = Object.values(detectFillers(finalTranscript)).reduce((a, b) => a + b, 0);
  document.getElementById('stat-wpm').textContent = wpm || '—';
  document.getElementById('stat-fillers').textContent = fillerTotal;
  renderHighlightedTranscript(document.getElementById('transcript'), finalTranscript);
}

function updateTimer() {
  const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');
  document.getElementById('stat-timer').textContent = `${mm}:${ss}`;
  updateLiveStats();
}

function attachRecognitionHandlers(rec) {
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) {
        finalTranscript += (finalTranscript ? ' ' : '') + result[0].transcript.trim();
        resultTimestamps.push(Date.now() - startTime);
      }
    }
    updateLiveStats();
  };
  rec.onerror = (e) => {
    const message = VOICE_ERROR_MESSAGES[e.error];
    if (message === undefined) showError('Voice input stopped unexpectedly — try again.');
    else if (message) showError(message);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
      stopRecording();
    }
  };
  // Chrome silently ends "continuous" recognition after a stretch of
  // silence — auto-restart unless the user actually pressed stop.
  rec.onend = () => {
    if (recording) {
      try { rec.start(); } catch (e) { /* start/stop race — ignore */ }
    }
  };
}

async function startRecording() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showError('Voice input is not supported in this browser.');
    return;
  }
  hideError();
  finalTranscript = '';
  resultTimestamps = [];
  document.getElementById('transcript').innerHTML = '';
  document.getElementById('coaching-panel').style.display = 'none';

  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  attachRecognitionHandlers(recognition);

  recording = true;
  startTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);
  coachingInterval = setInterval(requestCoachingCue, 25000);

  try {
    recognition.start();
  } catch (e) {
    recording = false;
    clearInterval(timerInterval);
    clearInterval(coachingInterval);
    showError('Could not start voice input — try again.');
    return;
  }
  recordBtn.classList.add('recording');
  recordLabel.textContent = 'Stop listening';
}

function stopRecording() {
  recording = false;
  clearInterval(timerInterval);
  clearInterval(coachingInterval);
  if (recognition) { try { recognition.stop(); } catch (e) {} }
  recordBtn.classList.remove('recording');
  recordLabel.textContent = 'Start listening';
}

recordBtn.addEventListener('click', () => {
  if (recording) stopRecording();
  else startRecording();
});

// ── Live coaching cues ────────────────────────────────────────────────────────
// Only ever sends the recent rolling window of YOUR OWN transcribed words —
// never audio, never the other participant, since we can't capture their
// side at all with free, mic-only tools.
async function requestCoachingCue() {
  const recentWords = finalTranscript.split(/\s+/).slice(-150).join(' ');
  if (!recentWords.trim()) return;
  const elapsedSec = (Date.now() - startTime) / 1000;
  const wordCount = (finalTranscript.match(/[a-zA-Z']+/g) || []).length;
  const wpm = computeWPM(wordCount, elapsedSec);
  const fillerCounts = detectFillers(finalTranscript);

  try {
    const res = await fetch(`${API_BASE}/api/live-coach`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recentTranscript: recentWords, wpm, fillerCounts })
    });
    if (!res.ok) return; // best-effort — a missed cue shouldn't interrupt the call
    const data = await res.json();
    if (data.cue) {
      document.getElementById('coaching-panel').style.display = 'block';
      document.getElementById('coaching-cue').textContent = data.cue;
    }
  } catch (e) {
    // best-effort — network hiccups shouldn't interrupt a live call
  }
}
