const decks = [
  {
    id: "basics",
    name: "Základné výrazy",
    description: "Pozdravy a bežné slová",
    cards: [
      { id: "nihao", hanzi: "你好", pinyin: "nǐ hǎo", tones: "3-3", meaning: "ahoj", expected: ["你好", "ni hao", "nǐ hǎo"] },
      { id: "xiexie", hanzi: "谢谢", pinyin: "xiè xie", tones: "4-0", meaning: "ďakujem", expected: ["谢谢", "xie xie", "xiè xie"] },
      { id: "zaijian", hanzi: "再见", pinyin: "zài jiàn", tones: "4-4", meaning: "dovidenia", expected: ["再见", "zai jian", "zài jiàn"] },
      { id: "qing", hanzi: "请", pinyin: "qǐng", tones: "3", meaning: "prosím", expected: ["请", "qing", "qǐng"] }
    ]
  },
  {
    id: "numbers",
    name: "Čísla",
    description: "Jednoduché čísla s tónmi",
    cards: [
      { id: "yi", hanzi: "一", pinyin: "yī", tones: "1", meaning: "jeden", expected: ["一", "yi", "yī"] },
      { id: "er", hanzi: "二", pinyin: "èr", tones: "4", meaning: "dva", expected: ["二", "er", "èr"] },
      { id: "san", hanzi: "三", pinyin: "sān", tones: "1", meaning: "tri", expected: ["三", "san", "sān"] },
      { id: "si", hanzi: "四", pinyin: "sì", tones: "4", meaning: "štyri", expected: ["四", "si", "sì"] }
    ]
  }
];

const storageKey = "mandarin-flashcards-prototype";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const elements = {
  userName: document.querySelector("#userName"),
  saveUser: document.querySelector("#saveUser"),
  deckList: document.querySelector("#deckList"),
  activeDeck: document.querySelector("#activeDeck"),
  cardMeaning: document.querySelector("#cardMeaning"),
  cardHanzi: document.querySelector("#cardHanzi"),
  cardPinyin: document.querySelector("#cardPinyin"),
  cardTones: document.querySelector("#cardTones"),
  nextCard: document.querySelector("#nextCard"),
  recordButton: document.querySelector("#recordButton"),
  speechStatus: document.querySelector("#speechStatus"),
  manualAnswer: document.querySelector("#manualAnswer"),
  checkAnswer: document.querySelector("#checkAnswer"),
  feedback: document.querySelector("#feedback"),
  feedbackText: document.querySelector("#feedbackText"),
  cardList: document.querySelector("#cardList"),
  statAttempts: document.querySelector("#statAttempts"),
  statAccuracy: document.querySelector("#statAccuracy"),
  statStreak: document.querySelector("#statStreak"),
  resetProgress: document.querySelector("#resetProgress")
};

let state = loadState();
let activeDeckId = state.activeDeckId || decks[0].id;
let activeCardId = state.activeCardId || decks[0].cards[0].id;
let recognition = null;

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || { user: "student", progress: {} };
  } catch {
    return { user: "student", progress: {} };
  }
}

function saveState() {
  state.activeDeckId = activeDeckId;
  state.activeCardId = activeCardId;
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getDeck() {
  return decks.find((deck) => deck.id === activeDeckId) || decks[0];
}

function getCard() {
  const deck = getDeck();
  return deck.cards.find((card) => card.id === activeCardId) || deck.cards[0];
}

function userProgress() {
  const user = state.user || "student";
  state.progress[user] ||= {};
  return state.progress[user];
}

function cardProgress(cardId) {
  const progress = userProgress();
  progress[cardId] ||= { attempts: 0, correct: 0, streak: 0, lastScore: 0 };
  return progress[cardId];
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[。！？!?.,，、\s]/g, "");
}

function scoreAnswer(input, expectedValues) {
  const answer = normalize(input);
  if (!answer) return 0;

  const candidates = expectedValues.map(normalize);
  if (candidates.includes(answer)) return 1;
  if (candidates.some((candidate) => answer.includes(candidate) || candidate.includes(answer))) return 0.72;
  return 0;
}

function evaluateAnswer(value) {
  const card = getCard();
  const progress = cardProgress(card.id);
  const score = scoreAnswer(value, card.expected);
  const correct = score >= 0.95;

  progress.attempts += 1;
  progress.correct += correct ? 1 : 0;
  progress.streak = correct ? progress.streak + 1 : 0;
  progress.lastScore = score;
  progress.lastAnswer = value;
  progress.lastTriedAt = new Date().toISOString();

  saveState();
  renderFeedback(score, value, card);
  renderStats();
  renderCards();
}

function renderFeedback(score, answer, card) {
  elements.feedback.className = "feedback";

  if (score >= 0.95) {
    elements.feedback.classList.add("success");
    elements.feedback.querySelector("h3").textContent = "Odpoveď sedí.";
    elements.feedbackText.textContent = `Rozpoznané: ${answer}. Pokračuj ďalšou kartičkou, pinyin: ${card.pinyin}.`;
    return;
  }

  if (score > 0) {
    elements.feedback.classList.add("warning");
    elements.feedback.querySelector("h3").textContent = "Čiastočná zhoda.";
    elements.feedbackText.textContent = `Rozpoznané: ${answer}. Očakávané: ${card.hanzi} (${card.pinyin}). Skontroluj najmä tón ${card.tones}.`;
    return;
  }

  elements.feedback.classList.add("error");
  elements.feedback.querySelector("h3").textContent = "Odpoveď sa nezhoduje.";
  elements.feedbackText.textContent = `Rozpoznané: ${answer || "bez vstupu"}. Očakávané: ${card.hanzi} (${card.pinyin}). Skús položku zopakovať pomalšie.`;
}

function renderDecks() {
  elements.deckList.innerHTML = "";
  decks.forEach((deck) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `deck-button${deck.id === activeDeckId ? " active" : ""}`;
    button.innerHTML = `<strong>${deck.name}</strong><span>${deck.description}</span>`;
    button.addEventListener("click", () => {
      activeDeckId = deck.id;
      activeCardId = chooseNextCard(deck).id;
      elements.manualAnswer.value = "";
      saveState();
      render();
    });
    elements.deckList.appendChild(button);
  });
}

function chooseNextCard(deck = getDeck()) {
  return [...deck.cards].sort((a, b) => {
    const progressA = cardProgress(a.id);
    const progressB = cardProgress(b.id);
    return progressA.correct - progressB.correct || progressA.attempts - progressB.attempts;
  })[0];
}

function renderCard() {
  const deck = getDeck();
  const card = getCard();
  elements.activeDeck.textContent = deck.name;
  elements.cardMeaning.textContent = card.meaning;
  elements.cardHanzi.textContent = card.hanzi;
  elements.cardPinyin.textContent = card.pinyin;
  elements.cardTones.textContent = card.tones;
}

function renderCards() {
  elements.cardList.innerHTML = "";
  getDeck().cards.forEach((card) => {
    const progress = cardProgress(card.id);
    const mastery = progress.attempts ? Math.round((progress.correct / progress.attempts) * 100) : 0;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "card-item";
    item.style.setProperty("--progress", `${mastery}%`);
    item.innerHTML = `<strong>${card.hanzi} · ${card.pinyin}</strong><span>${progress.correct}/${progress.attempts} správne · ${mastery}%</span>`;
    item.addEventListener("click", () => {
      activeCardId = card.id;
      elements.manualAnswer.value = "";
      saveState();
      render();
    });
    elements.cardList.appendChild(item);
  });
}

function renderStats() {
  const progress = userProgress();
  const values = Object.values(progress);
  const attempts = values.reduce((sum, item) => sum + item.attempts, 0);
  const correct = values.reduce((sum, item) => sum + item.correct, 0);
  const streak = values.reduce((max, item) => Math.max(max, item.streak), 0);
  elements.statAttempts.textContent = attempts;
  elements.statAccuracy.textContent = attempts ? `${Math.round((correct / attempts) * 100)}%` : "0%";
  elements.statStreak.textContent = streak;
}

function setupSpeech() {
  if (!SpeechRecognition) {
    elements.recordButton.disabled = true;
    elements.speechStatus.textContent = "hlas nepodporovaný";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    elements.speechStatus.textContent = "počúvam";
    elements.recordButton.disabled = true;
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    elements.manualAnswer.value = transcript;
    elements.speechStatus.textContent = "rozpoznané";
    evaluateAnswer(transcript);
  });

  recognition.addEventListener("error", () => {
    elements.speechStatus.textContent = "použi textový vstup";
    elements.recordButton.disabled = false;
  });

  recognition.addEventListener("end", () => {
    elements.recordButton.disabled = false;
    if (elements.speechStatus.textContent === "počúvam") {
      elements.speechStatus.textContent = "bez rozpoznania";
    }
  });
}

function bindEvents() {
  elements.saveUser.addEventListener("click", () => {
    state.user = elements.userName.value.trim() || "student";
    saveState();
    render();
  });

  elements.userName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") elements.saveUser.click();
  });

  elements.nextCard.addEventListener("click", () => {
    activeCardId = chooseNextCard().id;
    elements.manualAnswer.value = "";
    saveState();
    render();
  });

  elements.checkAnswer.addEventListener("click", () => {
    evaluateAnswer(elements.manualAnswer.value.trim());
  });

  elements.manualAnswer.addEventListener("keydown", (event) => {
    if (event.key === "Enter") elements.checkAnswer.click();
  });

  elements.recordButton.addEventListener("click", () => {
    if (recognition) recognition.start();
  });

  elements.resetProgress.addEventListener("click", () => {
    const user = state.user || "student";
    state.progress[user] = {};
    saveState();
    render();
  });
}

function render() {
  elements.userName.value = state.user || "student";
  renderDecks();
  renderCard();
  renderCards();
  renderStats();
}

setupSpeech();
bindEvents();
render();
