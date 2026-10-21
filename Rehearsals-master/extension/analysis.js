// Ported directly from index.html's Speech Practice analysis engine — same
// filler-word list, same "all right" false-positive fix, same WPM/pause
// math. Kept as a plain, dependency-free script (not an ES module) so it can
// be loaded with a simple <script> tag in the side panel, no build step.

const FILLER_WORDS = ['um', 'umm', 'uh', 'uhh', 'erm', 'like', 'actually', 'basically', 'literally', 'you know', 'kind of', 'sort of', 'right', 'okay'];
const FILLER_PATTERN = new RegExp(`\\b(${FILLER_WORDS.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
const FILLER_CANONICAL = { umm: 'um', uhh: 'uh', erm: 'um' };

function isRealFiller(word, text, index) {
  if (word.toLowerCase() !== 'right') return true;
  const before = text.slice(Math.max(0, index - 5), index).toLowerCase();
  return !before.trimEnd().endsWith('all');
}

function detectFillers(text) {
  const counts = {};
  const pattern = new RegExp(FILLER_PATTERN.source, 'gi');
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (!isRealFiller(match[0], text, match.index)) continue;
    const key = FILLER_CANONICAL[match[0].toLowerCase()] || match[0].toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function renderHighlightedTranscript(container, text) {
  container.innerHTML = '';
  if (!text) return;
  const pattern = new RegExp(FILLER_PATTERN.source, 'gi');
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (!isRealFiller(match[0], text, match.index)) continue;
    if (match.index > lastIndex) container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    const mark = document.createElement('mark');
    mark.className = 'filler-highlight';
    mark.textContent = match[0];
    container.appendChild(mark);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) container.appendChild(document.createTextNode(text.slice(lastIndex)));
}

function computePauses(timestampsMs, thresholdMs = 1500) {
  if (timestampsMs.length < 2) return { count: 0, avgSec: 0, longestSec: 0 };
  const gaps = [];
  for (let i = 1; i < timestampsMs.length; i++) {
    const gap = timestampsMs[i] - timestampsMs[i - 1];
    if (gap >= thresholdMs) gaps.push(gap);
  }
  if (!gaps.length) return { count: 0, avgSec: 0, longestSec: 0 };
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return { count: gaps.length, avgSec: Math.round(avg / 100) / 10, longestSec: Math.round(Math.max(...gaps) / 100) / 10 };
}

function computeWPM(wordCount, elapsedSec) {
  if (elapsedSec < 3) return 0;
  return Math.round(wordCount / (elapsedSec / 60));
}
