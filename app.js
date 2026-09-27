/**
 * 6학년 국어 2단원 가상 면담 챗봇 메인 애플리케이션 로직 (app.js)
 */

let currentFigure = null;
let currentChatHistory = []; // [{role: 'user'|'model', text: '...'}]
let activeCategory = "전체";
let checklistState = {
  facts: false,
  feelings: false,
  advice: false
};

// DOM 로드 완료 후 초기화
document.addEventListener("DOMContentLoaded", () => {
  initApiStatus();
  renderCategories();
  renderFiguresGrid(FIGURES_DATA);
  setupEventListeners();
  checkUrlParamsForAutoStart();
});

// API 상태 배지 초기화
function initApiStatus() {
  const key = getApiKey();
  const source = getApiKeySource();
  const badge = document.getElementById("apiStatusBadge");
  const text = document.getElementById("apiStatusText");
  
  if (key) {
    badge.classList.add("connected");
    if (source === "file") {
      text.textContent = "API 키 연결됨 (config.js)";
    } else {
      text.textContent = "API 키 연결됨";
    }
  } else {
    badge.classList.remove("connected");
    text.textContent = "API 키 필요 (config.js 등록)";
  }
}

// 카테고리 칩 렌더링
function renderCategories() {
  const container = document.getElementById("categoryChips");
  container.innerHTML = "";

  CATEGORIES.forEach(cat => {
    const chip = document.createElement("button");
    chip.className = `category-chip ${cat === activeCategory ? 'active' : ''}`;
    chip.textContent = cat;
    chip.addEventListener("click", () => {
      activeCategory = cat;
      document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      filterFigures();
    });
    container.appendChild(chip);
  });
}

// 인물 카드 그리드 렌더링
function renderFiguresGrid(figures) {
  const grid = document.getElementById("figuresGrid");
  grid.innerHTML = "";

  if (figures.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--gray-500);">
        검색 결과에 맞는 인물이 없습니다. 상단의 <b>[원하는 직업 직접 입력]</b>을 이용해 보세요!
      </div>
    `;
    return;
  }

  figures.forEach(fig => {
    const card = document.createElement("div");
    card.className = "figure-card";
    
    // 대표 일화 2개 미리보기
    const anecdoteTags = fig.anecdotes.slice(0, 2).map(a => 
      `<div class="anecdote-tag">${a.title}</div>`
    ).join("");

    const avatarHtml = fig.photo ? 
      `<img src="${fig.photo}" alt="${fig.name}" class="avatar-img" onerror="this.outerHTML='<span style=\\'font-size:2rem\\'>${fig.avatar}</span>'">` : 
      fig.avatar;

    card.innerHTML = `
      ${fig.surveyRank ? `<div class="card-survey-tag">${fig.surveyRank}</div>` : ""}
      <div class="card-top">
        <div class="card-avatar">${avatarHtml}</div>
        <div class="card-meta">
          <div class="card-badge">${fig.badge}</div>
          <div class="card-name">${fig.name}</div>
          <div class="card-job">${fig.job}</div>
        </div>
      </div>
      <div class="card-tagline">"${fig.tagline}"</div>
      <div class="card-anecdotes-preview">
        <div class="preview-title">생생한 실제 일화</div>
        <div class="anecdote-tag-list">
          ${anecdoteTags}
        </div>
      </div>
      <button class="btn btn-primary card-btn" onclick="startInterview('${fig.id}')">
        🎤 면담 시작하기
      </button>
    `;
    grid.appendChild(card);
  });
}

// 필터 및 검색 처리
function filterFigures() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  
  const filtered = FIGURES_DATA.filter(fig => {
    const matchCat = activeCategory === "전체" || fig.category === activeCategory;
    const matchQuery = !query || 
      fig.name.toLowerCase().includes(query) || 
      fig.job.toLowerCase().includes(query) || 
      fig.tagline.toLowerCase().includes(query) ||
      fig.anecdotes.some(a => a.title.toLowerCase().includes(query) || a.content.toLowerCase().includes(query));
    return matchCat && matchQuery;
  });

  renderFiguresGrid(filtered);
}

// 면담 시작
function startInterview(figureId) {
  let figure = FIGURES_DATA.find(f => f.id === figureId);
  if (!figure && window.customFigure && window.customFigure.id === figureId) {
    figure = window.customFigure;
  }
  if (!figure) return;

  currentFigure = figure;
  currentChatHistory = [];
  checklistState = { facts: false, feelings: false, advice: false };
  updateChecklistView();

  // 화면 전환
  document.getElementById("selectionView").style.display = "none";
  document.getElementById("interviewView").style.display = "block";
  document.getElementById("btnBackToSelect").style.display = "inline-flex";

  // 헤더 및 사이드바 정보 채우기
  const avatarContainer = document.getElementById("interviewAvatar");
  if (figure.photo) {
    avatarContainer.innerHTML = `<img src="${figure.photo}" alt="${figure.name}" class="avatar-img" onerror="this.outerHTML='<span style=\\'font-size:1.6rem\\'>${figure.avatar}</span>'">`;
  } else {
    avatarContainer.textContent = figure.avatar;
  }
  document.getElementById("interviewName").textContent = figure.name;
  document.getElementById("interviewSub").textContent = `${figure.job} • ${figure.badge}`;

  // 사이드바 인물 일화 아코디언 채우기
  renderSidebarAnecdotes(figure);

  // 추천 질문 칩 채우기
  renderSuggestedChips(figure);

  // 대화 영역 초기화 및 첫 인사말 출력
  const messagesContainer = document.getElementById("chatMessages");
  messagesContainer.innerHTML = "";

  // 인물의 첫인사
  appendMessage("figure", figure.intro);
  currentChatHistory.push({ role: "model", text: figure.intro });

  // 포커스
  document.getElementById("chatInput").focus();
}

// 사이드바 일화 아코디언 렌더링
function renderSidebarAnecdotes(figure) {
  const container = document.getElementById("anecdotesAccordion");
  container.innerHTML = "";

  figure.anecdotes.forEach((anec, idx) => {
    const item = document.createElement("div");
    item.className = `anecdote-item ${idx === 0 ? 'open' : ''}`;
    item.innerHTML = `
      <div class="anecdote-header" onclick="this.parentElement.classList.toggle('open')">
        <span>📖 ${anec.title}</span>
        <span style="font-size: 0.75rem; color: var(--gray-400);">▼</span>
      </div>
      <div class="anecdote-body">${anec.content}</div>
    `;
    container.appendChild(item);
  });
}

// 추천 질문 칩 렌더링
function renderSuggestedChips(figure) {
  const container = document.getElementById("questionChipsScroll");
  container.innerHTML = "";

  const qData = figure.recommendedQuestions;
  const list = [
    { type: "사실", text: qData.facts[0] },
    { type: "사실", text: qData.facts[1] },
    { type: "느낌", text: qData.feelings[0] },
    { type: "느낌", text: qData.feelings[1] },
    { type: "당부", text: qData.advice[0] },
    { type: "당부", text: qData.advice[1] }
  ];

  list.forEach(q => {
    const chip = document.createElement("button");
    chip.className = "q-chip";
    chip.innerHTML = `<span class="type-badge">${q.type}</span>${q.text}`;
    chip.addEventListener("click", () => {
      document.getElementById("chatInput").value = q.text;
      handleSendMessage();
    });
    container.appendChild(chip);
  });
}

// 메시지 DOM 추가
function appendMessage(sender, text) {
  const container = document.getElementById("chatMessages");
  const msgItem = document.createElement("div");
  msgItem.className = `message-item ${sender === 'student' ? 'student' : 'figure'}`;

  let avatarHtml;
  if (sender === 'student') {
    avatarHtml = '🎒';
  } else if (currentFigure && currentFigure.photo) {
    avatarHtml = `<img src="${currentFigure.photo}" alt="${currentFigure.name}" class="avatar-img" onerror="this.outerHTML='<span style=\\'font-size:1.3rem\\'>${currentFigure.avatar}</span>'">`;
  } else {
    avatarHtml = currentFigure ? currentFigure.avatar : '🤖';
  }
  const senderName = sender === 'student' ? '나(면담 기자)' : currentFigure.name;

  msgItem.innerHTML = `
    <div class="msg-avatar">${avatarHtml}</div>
    <div class="msg-body">
      <div class="msg-sender">${senderName}</div>
      <div class="msg-bubble">${escapeHtml(text)}</div>
    </div>
  `;

  container.appendChild(msgItem);
  container.scrollTop = container.scrollHeight;
}

// 타이핑 인디케이터 토글
function setTyping(isTyping) {
  const indicator = document.getElementById("typingIndicator");
  const nameSpan = document.getElementById("typingFigureName");
  if (isTyping) {
    nameSpan.textContent = currentFigure.name;
    indicator.style.display = "flex";
    document.getElementById("chatMessages").scrollTop = document.getElementById("chatMessages").scrollHeight;
  } else {
    indicator.style.display = "none";
  }
}

// 메시지 전송 처리
async function handleSendMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    openModal("apiKeyModal");
    return;
  }

  // 1. 학생 메시지 표시
  appendMessage("student", text);
  input.value = "";
  input.style.height = "auto";

  // 2. 질문 3요소 자동 판별 및 체크
  detectQuestionType(text);

  // 3. 타이핑 표시 및 API 호출
  setTyping(true);
  document.getElementById("sendBtn").disabled = true;

  try {
    const responseText = await sendInterviewMessage(currentFigure, currentChatHistory, text);
    
    // 기록 저장
    currentChatHistory.push({ role: "user", text: text });
    currentChatHistory.push({ role: "model", text: responseText });

    setTyping(false);
    appendMessage("figure", responseText);
  } catch (error) {
    setTyping(false);
    console.error(error);
    if (error.message === "API_KEY_MISSING") {
      openModal("apiKeyModal");
    } else {
      appendMessage("figure", `죄송해요, 잠시 통신에 문제가 생겼어요: ${error.message}\n선생님께 API 키가 올바른지 확인을 부탁드려 보세요.`);
    }
  } finally {
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("chatInput").focus();
  }
}

// 질문 유형(사실, 느낌, 당부) 자동 감지
function detectQuestionType(text) {
  const factsKeywords = ["하루", "일과", "어떤 일", "몇 시", "방법", "자격", "준비", "훈련", "과정", "도구", "장비", "수입", "얼마나", "어디서"];
  const feelingsKeywords = ["기분", "느낌", "보람", "힘든", "어려운", "슬펐", "두려", "포기", "행복", "뿌듯", "감정", "마음"];
  const adviceKeywords = ["조언", "당부", "꿈", "초등학생", "어린이", "앞으로", "계획", "목표", "습관", "준비해야", "어떻게 해야"];

  if (factsKeywords.some(k => text.includes(k))) checklistState.facts = true;
  if (feelingsKeywords.some(k => text.includes(k))) checklistState.feelings = true;
  if (adviceKeywords.some(k => text.includes(k))) checklistState.advice = true;

  updateChecklistView();
}

// 체크리스트 화면 갱신
function updateChecklistView() {
  const fItem = document.getElementById("checkFacts");
  const flItem = document.getElementById("checkFeelings");
  const aItem = document.getElementById("checkAdvice");

  fItem.classList.toggle("checked", checklistState.facts);
  flItem.classList.toggle("checked", checklistState.feelings);
  aItem.classList.toggle("checked", checklistState.advice);
}

// 체크리스트 수동 토글
function toggleCheck(type) {
  checklistState[type] = !checklistState[type];
  updateChecklistView();
}

// 인물 다시 선택 화면으로 돌아가기
function backToSelection() {
  if (currentChatHistory.length > 1) {
    if (!confirm("면담을 종료하고 다른 인물을 선택하시겠습니까? 현재 나눈 대화는 초기화됩니다.")) {
      return;
    }
  }
  document.getElementById("interviewView").style.display = "none";
  document.getElementById("selectionView").style.display = "block";
  document.getElementById("btnBackToSelect").style.display = "none";
  currentFigure = null;
}

// 면담 완료 및 보고서 생성
async function handleFinishReport() {
  if (currentChatHistory.length <= 2) {
    alert("면담 질문을 최소 2~3개 이상 진행한 후에 보고서를 생성할 수 있습니다.");
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    openModal("apiKeyModal");
    return;
  }

  const btn = document.getElementById("btnFinishReport");
  const originalText = btn.innerHTML;
  btn.innerHTML = "⏳ 보고서 작성 중...";
  btn.disabled = true;

  try {
    const reportData = await generateInterviewReport(currentFigure, currentChatHistory);
    renderReportModal(reportData);
    openModal("reportModal");
  } catch (err) {
    console.error(err);
    alert(`보고서 생성 중 오류가 발생했습니다: ${err.message}`);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// 보고서 모달 렌더링
function renderReportModal(data) {
  document.getElementById("rptTarget").textContent = data.targetPerson || `${currentFigure.name} (${currentFigure.job})`;
  document.getElementById("rptPurpose").textContent = data.interviewPurpose || "";
  document.getElementById("rptFact").textContent = data.factSummary || "";
  document.getElementById("rptFeeling").textContent = data.feelingSummary || "";
  document.getElementById("rptAdvice").textContent = data.adviceSummary || "";
  document.getElementById("rptLearned").textContent = data.learnedPoints || "";
  document.getElementById("rptImpressions").textContent = data.impressions || "";
}

// 보고서 인쇄
function printReport() {
  window.print();
}

// 보고서 복사
function copyReportText() {
  const target = document.getElementById("rptTarget").textContent;
  const purpose = document.getElementById("rptPurpose").textContent;
  const fact = document.getElementById("rptFact").textContent;
  const feel = document.getElementById("rptFeeling").textContent;
  const adv = document.getElementById("rptAdvice").textContent;
  const learn = document.getElementById("rptLearned").textContent;
  const imp = document.getElementById("rptImpressions").textContent;

  const text = `
[국어 6-2 2단원 궁금한 점을 해결해요 - 면담 정리 보고서]

1. 면담 대상자: ${target}
2. 면담 목적: ${purpose}

3. 면담 내용 요약:
  ① 구체적인 사실에 대한 질문과 답변:
  ${fact}

  ② 생각이나 느낌에 대한 질문과 답변:
  ${feel}

  ③ 앞으로의 계획이나 당부에 대한 질문과 답변:
  ${adv}

4. 면담을 통해 새롭게 알게 된 점:
  ${learn}

5. 면담 후 느낀 점 및 다짐:
  ${imp}
`.trim();

  navigator.clipboard.writeText(text).then(() => {
    alert("면담 보고서 내용이 클립보드에 복사되었습니다! 공책이나 패들렛에 붙여넣기(Ctrl+V) 하세요.");
  });
}

// 면담 후 활동지(A4)로 데이터 전달 및 새 창 열기
function openWorksheetWithData() {
  const target = document.getElementById("rptTarget").textContent;
  const purpose = document.getElementById("rptPurpose").textContent;
  const fact = document.getElementById("rptFact").textContent;
  const feel = document.getElementById("rptFeeling").textContent;
  const adv = document.getElementById("rptAdvice").textContent;
  const learn = document.getElementById("rptLearned").textContent;
  const imp = document.getElementById("rptImpressions").textContent;

  let job = "";
  let name = "";
  if (currentFigure) {
    job = currentFigure.job;
    name = currentFigure.name;
  } else {
    name = target;
  }

  // 사용자 질문 추출
  let qFact = "";
  let qFeel = "";
  let qPlan = "";
  if (currentChatHistory && currentChatHistory.length > 0) {
    const userMsgs = currentChatHistory.filter(m => m.role === 'user').map(m => m.text);
    if (userMsgs.length > 0) qFact = userMsgs[0] || "";
    if (userMsgs.length > 1) qFeel = userMsgs[1] || "";
    if (userMsgs.length > 2) qPlan = userMsgs[userMsgs.length - 1] || "";
  }

  // 인상 깊었던 명언 추출 (첫 번째 따옴표나 대표 어록)
  let quote = "";
  if (currentFigure && currentFigure.tagline) {
    quote = currentFigure.tagline;
  }

  const worksheetData = {
    job: job,
    name: name,
    purpose: purpose,
    qFact: qFact,
    aFact: fact,
    qFeel: qFeel,
    aFeel: feel,
    qPlan: qPlan,
    aPlan: adv,
    learned: learn,
    quote: quote ? `❝ ${quote} ❞` : "",
    quoteReason: "",
    roleModel: imp,
    pledge: ""
  };

  sessionStorage.setItem("currentInterviewWorksheet", JSON.stringify(worksheetData));
  window.open("면담_후_학습지.html", "_blank");
}

// 모달 제어
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "flex";
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "none";
}

// 직접 인물 생성 처리
function handleCreateCustomFigure() {
  const job = document.getElementById("customJobInput").value.trim();
  const person = document.getElementById("customPersonInput").value.trim();

  if (!job) {
    alert("희망하는 직업명을 입력해 주세요.");
    return;
  }

  const customFig = createCustomFigure(job, person);
  window.customFigure = customFig;
  closeModal("customFigureModal");
  startInterview(customFig.id);
}

// 이벤트 리스너 등록
function setupEventListeners() {
  // 검색창 입력 이벤트
  document.getElementById("searchInput").addEventListener("input", filterFigures);

  // 채팅 텍스트에어리어 자동 크기 조절 및 엔터 전송
  const chatInput = document.getElementById("chatInput");
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`;
  });

  // API 키 저장 모달
  document.getElementById("btnSaveApiKey").addEventListener("click", () => {
    const key = document.getElementById("apiKeyInput").value.trim();
    if (!key) {
      alert("API 키를 입력해 주세요.");
      return;
    }
    saveApiKey(key);
    initApiStatus();
    closeModal("apiKeyModal");
    alert("API 키가 성공적으로 저장되었습니다!");
  });
}

// URL 파라미터 확인 (?key=...)
function checkUrlParamsForAutoStart() {
  const key = getApiKey();
  if (key) {
    document.getElementById("apiKeyInput").value = key;
  }
}

// HTML 이스케이프 헬퍼
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
