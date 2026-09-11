import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getFirestore, collection, doc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDrLvy4rHNrdxRFgvvjCGte1HmTikxSRhM',
  authDomain: 'se-portia.firebaseapp.com',
  projectId: 'se-portia',
  storageBucket: 'se-portia.firebasestorage.app',
  messagingSenderId: '99800059372',
  appId: '1:99800059372:web:41020651d89938ddcdc4c9',
};

const db = getFirestore(initializeApp(firebaseConfig));
const NAME_KEY = 'portia-secret-shooter-name';
const PLAYER_KEY = 'portia-secret-shooter-player-id';

function cleanName(value) {
  return String(value || '').replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().slice(0, 16);
}

function playerId() {
  let id = localStorage.getItem(PLAYER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_KEY, id);
  }
  return id;
}

async function saveScore(nickname, score) {
  if (!Number.isSafeInteger(score) || score < 0) return;
  const reference = doc(db, 'portiaScores', playerId());
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(reference);
    const previousScore = existing.exists() ? Number(existing.data().score || 0) : 0;
    transaction.set(reference, {
      nickname: cleanName(nickname),
      score: Math.max(score, previousScore),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

async function getTopScores() {
  const scores = await getDocs(query(collection(db, 'portiaScores'), orderBy('score', 'desc'), limit(10)));
  return scores.docs.map((entry) => ({
    nickname: cleanName(entry.data().nickname) || 'Неизвестный',
    score: Number(entry.data().score || 0),
  }));
}

window.PortiaRanking = {
  getName: () => cleanName(localStorage.getItem(NAME_KEY)),
  setName: (value) => localStorage.setItem(NAME_KEY, cleanName(value)),
  saveScore,
  getTopScores,
};
