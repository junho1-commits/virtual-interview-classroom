/**
 * Google Gemini API 통신 및 초등 6학년 국어 2단원 맞춤형 프롬프트 제어 모듈
 * (Google AI Studio 최신 AQ... 인증키 및 모델 자동 탐색 지원)
 */

const GEMINI_CONFIG = {
  storageKey: "modeok_gemini_api_key",
  cachedModelKey: "modeok_working_model"
};

let workingModelCache = null;

// API 키 가져오기 (1순위: config.js 파일, 2순위: URL 파라미터, 3순위: localStorage)
function getApiKey() {
  // 1순위: config.js 파일에 저장된 키
  if (typeof CONFIG !== "undefined" && CONFIG && CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY.trim()) {
    return CONFIG.GEMINI_API_KEY.trim();
  }
  // 2순위: URL 파라미터 (?key=... 또는 ?apiKey=...)
  const urlParams = new URLSearchParams(window.location.search);
  const paramKey = urlParams.get("key") || urlParams.get("apiKey");
  if (paramKey) {
    saveApiKey(paramKey);
    return paramKey;
  }
  // 3순위: 브라우저 localStorage 저장값
  return localStorage.getItem(GEMINI_CONFIG.storageKey) || "";
}

// API 키 출처 확인
function getApiKeySource() {
  if (typeof CONFIG !== "undefined" && CONFIG && CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY.trim()) {
    return "file"; // config.js 파일에서 로드됨
  }
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("key") || urlParams.get("apiKey")) {
    return "url";
  }
  if (localStorage.getItem(GEMINI_CONFIG.storageKey)) {
    return "storage";
  }
  return "none";
}

// API 키 저장하기 (브라우저 직접 입력 시)
function saveApiKey(key) {
  if (key && key.trim()) {
    localStorage.setItem(GEMINI_CONFIG.storageKey, key.trim());
    workingModelCache = null; // 새 키 저장 시 모델 캐시 초기화
    localStorage.removeItem(GEMINI_CONFIG.cachedModelKey);
  }
}

// API 키 삭제하기
function clearApiKey() {
  localStorage.removeItem(GEMINI_CONFIG.storageKey);
  localStorage.removeItem(GEMINI_CONFIG.cachedModelKey);
  workingModelCache = null;
}

/**
 * 인물별 맞춤형 시스템 프롬프트 생성
 * 실제 일화(Anecdotes)를 생생하게 녹여내어 답변하도록 강력하게 지시
 */
function buildSystemInstruction(figure) {
  const anecdotesText = figure.anecdotes.map((a, i) => `[실제 일화 ${i + 1}: ${a.title}]\n${a.content}`).join("\n\n");

  return `
당신은 지금 초등학교 6학년 학생과 1:1 진로 면담을 진행하고 있는 실제 인물 '${figure.name}'(${figure.job})입니다.

[인물 기본 정보]
- 이름/호칭: ${figure.name}
- 직업 및 분야: ${figure.job} (${figure.category})
- 주요 경력 및 소개: ${figure.background}
- 대표 슬로건: "${figure.tagline}"

[당신의 실제 인생 일화 (반드시 답변에 적극 인용하세요)]
${anecdotesText}

[면담 답변 절대 원칙 - 초등 6학년 국어 2단원 <궁금한 점을 해결해요> 연계]
1. **1인칭 실제 인물로 완벽 빙의**:
   - 절대로 "저는 AI입니다"라거나 인공지능 티를 내지 마세요.
   - 1인칭("나", "저", "제가")으로 말하며, 6학년 학생을 대하는 따뜻하고 다정한 선배이자 멘토로서 말하세요.
   - 친절하고 따뜻한 어조("~했단다", "~해요", "~한 적이 있어")를 사용하세요.

2. **실제 일화(True Anecdotes) 중심 답변**:
   - 학생의 질문에 단순히 교과서적이고 뻔한 이론을 늘어놓지 마세요.
   - "내가 예전에 ~했을 때 일인데...", "당시 이런 위기가 찾아왔을 때..."처럼 위에 제시된 당신의 실제 일화를 생생하게 이야기해 주세요.

3. **국어 2단원 질문 3요소 적극 수용**:
   - ① 구체적 사실 질문: 실제 겪었던 하루 일과, 훈련 과정, 작업 환경을 사실 그대로 구체적으로 묘사하세요.
   - ② 생각이나 느낌 질문: 위기의 순간에 느꼈던 솔직한 두려움과 이를 극복했을 때의 벅찬 감동을 생생히 털어놓으세요.
   - ③ 앞으로의 계획이나 당부 질문: 학생의 눈높이에서 실천할 수 있는 현실적인 조언과 따뜻한 격려를 건네세요.

4. **면담 예절 지도**:
   - 학생이 처음 인사("안녕하세요!")를 건네면 반갑게 맞이하며 면담에 응해준 것에 대해 기뻐하세요.
   - 학생이 혹시 반말이나 거친 말을 쓰면 상처 주지 않고 부드럽게 면담 예절을 일깨워 주세요. ("면담할 때는 서로를 존중하는 고운 말을 쓰면 더 멋진 기자가 될 수 있단다~")
   - 답변은 초등학생이 한 번에 읽기 편하도록 3~5문장 정도로 알기 쉽게, 핵심 일화 위주로 명확하게 끊어서 답하세요. 너무 길거나 어렵게 쓰지 마세요.
`.trim();
}

/**
 * 구글 API로부터 현재 사용자의 키로 사용 가능한 모델 목록을 자동 조회 (ModelService.ListModels)
 */
async function discoverAvailableModels(apiKey) {
  // 1. 브라우저 캐시 확인
  if (workingModelCache) return [workingModelCache];
  const savedModel = localStorage.getItem(GEMINI_CONFIG.cachedModelKey);
  if (savedModel) {
    workingModelCache = savedModel;
    return [savedModel];
  }

  // 2. Google ListModels API 호출
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(listUrl, {
      method: "GET",
      headers: { 
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey 
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        // generateContent 지원 모델만 추출
        const valid = data.models
          .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
          .map(m => m.name.replace(/^models\//, ""));

        if (valid.length > 0) {
          console.log("[Gemini API] 현재 키로 사용 가능한 모델 목록:", valid);
          
          // 초등학생 실습용 최적의 모델 우선순위 정렬
          const preference = [
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash-002",
            "gemini-1.5-flash-001",
            "gemini-2.0-flash-exp",
            "gemini-2.5-flash",
            "gemini-1.5-pro",
            "gemini-1.5-pro-latest"
          ];

          const sorted = [];
          for (const pref of preference) {
            if (valid.includes(pref)) sorted.push(pref);
          }
          // 그 외 flash 모델 추가
          valid.filter(m => m.includes("flash") && !sorted.includes(m)).forEach(m => sorted.push(m));
          // 나머지 모델 추가
          valid.filter(m => !sorted.includes(m)).forEach(m => sorted.push(m));

          return sorted;
        }
      }
    } else {
      console.warn("[Gemini API] ListModels 실패 (HTTP " + res.status + ")");
    }
  } catch (err) {
    console.warn("[Gemini API] ListModels 조회 중 오류:", err);
  }

  // ListModels 조회 불가 시 기본 후보 목록
  return [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash-002",
    "gemini-2.5-flash",
    "gemini-1.5-pro"
  ];
}

/**
 * Gemini API 호출 메인 함수 (자동 모델 탐색 및 다중 폴백)
 */
async function callGeminiApi(systemPrompt, contents) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  // 사용 가능한 모델 목록 가져오기
  const candidateModels = await discoverAvailableModels(apiKey);
  let lastError = null;

  for (const model of candidateModels) {
    // 1차 시도: v1beta (system_instruction 지원)
    // 2차 시도: v1 (system prompt를 첫 번째 메시지로 병합)
    const attempts = [
      {
        version: "v1beta",
        useSystemInstruction: true,
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      },
      {
        version: "v1",
        useSystemInstruction: false,
        endpoint: `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`
      }
    ];

    for (const attempt of attempts) {
      let payload;
      if (attempt.useSystemInstruction) {
        payload = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: contents,
          generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 2048 }
        };
      } else {
        const mergedContents = [
          { role: "user", parts: [{ text: `[시스템 면담 지침]\n${systemPrompt}\n\n위 지침에 따라 다음 질문에 인물의 실제 일화를 담아 답변하세요.` }] },
          { role: "model", parts: [{ text: "네, 이해했습니다. 해당 인물의 페르소나와 실제 일화를 바탕으로 성실하고 친절하게 면담에 임하겠습니다." }] },
          ...contents
        ];
        payload = {
          contents: mergedContents,
          generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 2048 }
        };
      }

      try {
        const response = await fetch(attempt.endpoint, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
          console.warn(`[Gemini API] ${model} (${attempt.version}) 실패:`, errorMessage);
          lastError = new Error(errorMessage);
          continue; // 다음 시도
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        if (candidate?.content?.parts?.[0]?.text) {
          // 성공한 모델을 캐시에 저장하여 다음 호출부터 즉시 사용!
          workingModelCache = model;
          localStorage.setItem(GEMINI_CONFIG.cachedModelKey, model);
          console.log(`[Gemini API] 연결 성공: ${model} (${attempt.version})`);
          return candidate.content.parts[0].text.trim();
        } else {
          throw new Error("응답 내용이 비어 있습니다.");
        }
      } catch (err) {
        console.warn(`[Gemini API] 호출 네트워크 오류 (${model}):`, err);
        lastError = err;
      }
    }
  }

  throw lastError || new Error("Gemini API 통신에 실패했습니다.");
}

/**
 * 대화 전송 함수
 * @param {Object} figure - 인물 객체
 * @param {Array} chatHistory - [{role: 'user'|'model', text: '...'}]
 * @param {string} studentMessage - 학생의 최신 메시지
 */
async function sendInterviewMessage(figure, chatHistory, studentMessage) {
  const systemPrompt = buildSystemInstruction(figure);

  // Gemini API 형식으로 변환
  const contents = [];

  for (const msg of chatHistory) {
    contents.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.text }]
    });
  }

  // 최신 질문 추가
  contents.push({
    role: "user",
    parts: [{ text: studentMessage }]
  });

  return await callGeminiApi(systemPrompt, contents);
}

/**
 * 6학년 국어 2단원 교과서 양식 면담 보고서 자동 요약 생성
 */
async function generateInterviewReport(figure, chatHistory) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  const dialogText = chatHistory.map(m => `${m.role === 'user' ? '학생(면담자)' : figure.name + '(대상자)'}: ${m.text}`).join("\n");

  const reportPrompt = `
당신은 초등학교 6학년 국어과 교사입니다. 학생이 '${figure.name}'(${figure.job})님과 나눈 가상 면담 기록을 바탕으로 교과서 [면담 정리 보고서]를 완성해 주세요.

[면담 대화 내용]
${dialogText}

[보고서 작성 지침]
반드시 다음 JSON 형식으로만 응답하세요. 다른 설명이나 마크다운 코드블록(\`\`\`json) 없이 순수 JSON 객체만 반환하세요:
{
  "targetPerson": "${figure.name} (${figure.job})",
  "interviewPurpose": "${figure.job}의 실제 일과와 보람, 어려움을 극복한 경험을 알아보고 나의 진로 계획에 도움을 받기 위함",
  "factSummary": "① 구체적인 사실 질문에 대한 답변 핵심 요약 (2~3문장)",
  "feelingSummary": "② 생각이나 느낌 질문에 대한 답변 핵심 요약 (위기 극복, 보람, 감정 등 2~3문장)",
  "adviceSummary": "③ 앞으로의 계획이나 당부 질문에 대한 답변 핵심 요약 (학생들을 향한 조언 2~3문장)",
  "learnedPoints": "면담을 통해 새롭게 알게 된 점 2가지",
  "impressions": "면담을 마치고 느낀 점 및 앞으로의 다짐 (초등학교 6학년 학생의 시각으로 2문장)"
}
`.trim();

  const responseText = await callGeminiApi(
    "초등학교 6학년 국어과 교사로서 정확한 JSON 포맷으로 면담 보고서를 요약 정리합니다.",
    [{ role: "user", parts: [{ text: reportPrompt }] }]
  );

  const cleanedText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleanedText);
  } catch (e) {
    console.error("JSON parse error:", responseText);
    throw new Error("보고서 데이터를 변환하는 중 오류가 발생했습니다.");
  }
}
