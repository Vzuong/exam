/**
 * FastExam AI - Mobile-First SEB Exam Solver
 * Optimized for mobile phone screens & Safe Exam Browser (SEB) exams
 * Format:
 * Câu 1: [Nội dung câu hỏi]
 * A. [Nội dung câu trả lời]
 * (Hoặc không có số câu: [Câu hỏi] \n A. [Câu trả lời])
 */

// Application State
const state = {
  questions: [],
  apiKey: '',
  model: 'gemini-3.8-flash',
  thinkingLevel: 'high',
  doubleCheck: true,
  requestStats: { run: 0, firstPass: 0, secondPass: 0, arbitration: 0, retries: 0, batches: 0, lastStatus: '' },
  maxImagesPerRequest: 15,
  maxInlineRequestBytes: 18_500_000,
  promptPreset: 'multiple_choice_only',
  timer: {
    totalSeconds: 15 * 60,
    remainingSeconds: 15 * 60,
    intervalId: null,
    isRunning: false
  }
};

// DOM Elements
const elements = {
  // Timer
  timerWidget: document.getElementById('timerWidget'),
  timerDisplay: document.getElementById('timerDisplay'),
  btnStartTimer: document.getElementById('btnStartTimer'),
  btnResetTimer: document.getElementById('btnResetTimer'),
  iconTimerPlay: document.getElementById('iconTimerPlay'),
  iconTimerPause: document.getElementById('iconTimerPause'),

  // Matrix
  matrixGrid: document.getElementById('matrixGrid'),
  matrixStats: document.getElementById('matrixStats'),
  matrixProgressFill: document.getElementById('matrixProgressFill'),
  btnCopyAnswers: document.getElementById('btnCopyAnswers'),
  activeModeDisplay: document.getElementById('activeModeDisplay'),

  // Upload & Actions
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  btnSolveAll: document.getElementById('btnSolveAll'),
  btnSortQuestions: document.getElementById('btnSortQuestions'),
  btnLoadDemo: document.getElementById('btnLoadDemo'),
  btnExportReport: document.getElementById('btnExportReport'),
  btnRetryFailed: document.getElementById('btnRetryFailed'),
  btnClearAll: document.getElementById('btnClearAll'),
  totalQuestionsCount: document.getElementById('totalQuestionsCount'),
  questionsGrid: document.getElementById('questionsGrid'),

  // Mobile Bottom Bar
  mobileBottomBar: document.getElementById('mobileBottomBar'),
  btnMobileSolve: document.getElementById('btnMobileSolve'),
  btnMobileCopyAll: document.getElementById('btnMobileCopyAll'),
  btnMobileDemo: document.getElementById('btnMobileDemo'),
  mobileQuestionCount: document.getElementById('mobileQuestionCount'),

  // Settings Modal
  btnOpenSettings: document.getElementById('btnOpenSettings'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  settingsModal: document.getElementById('settingsModal'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  apiKeyStatusBadge: document.getElementById('apiKeyStatusBadge'),
  modelSelect: document.getElementById('modelSelect'),
  customModelInput: document.getElementById('customModelInput'),
  thinkingLevelSelect: document.getElementById('thinkingLevelSelect'),
  requestStatsDisplay: document.getElementById('requestStatsDisplay'),
  activeModelBadge: document.getElementById('activeModelBadge'),
  promptPresetSelect: document.getElementById('promptPresetSelect'),
  btnSaveSettings: document.getElementById('btnSaveSettings'),

  // Zoom Modal
  imageZoomModal: document.getElementById('imageZoomModal'),
  zoomModalImage: document.getElementById('zoomModalImage'),
  zoomModalTitle: document.getElementById('zoomModalTitle'),
  btnCloseZoom: document.getElementById('btnCloseZoom'),

  // Export Modal
  exportModal: document.getElementById('exportModal'),
  btnCloseExport: document.getElementById('btnCloseExport'),
  btnCopyInline: document.getElementById('btnCopyInline'),
  btnCopyLettersOnly: document.getElementById('btnCopyLettersOnly'),
  btnCopyDetailed: document.getElementById('btnCopyDetailed'),
  exportPreviewText: document.getElementById('exportPreviewText'),
  btnPrintPdf: document.getElementById('btnPrintPdf'),
  btnDownloadTxt: document.getElementById('btnDownloadTxt'),

  // Toast
  toast: document.getElementById('toast')
};

// ==========================================
// 1. Initialization & Local Storage
// ==========================================
function init() {
  loadSettings();
  setupEventListeners();
  updateTimerDisplay();
  renderQuestions();
  renderMatrix();
  updateRequestStatsDisplay();
}

async function loadSettings() {
  try {
    const savedKey = localStorage.getItem('fastexam_api_key') || '';
    const savedModel = localStorage.getItem('fastexam_model') || 'gemini-3.8-flash';
    const savedThinking = localStorage.getItem('fastexam_thinking_level') || 'high';

    state.apiKey = savedKey.trim();
    state.model = savedModel.trim() || 'gemini-3.8-flash';
    state.thinkingLevel = ['low', 'medium', 'high'].includes(savedThinking) ? savedThinking : 'high';

    elements.apiKeyInput.value = state.apiKey;
    if (elements.thinkingLevelSelect) elements.thinkingLevelSelect.value = state.thinkingLevel;

    const exists = Array.from(elements.modelSelect.options).some(opt => opt.value === state.model);
    if (exists) {
      elements.modelSelect.value = state.model;
    } else {
      elements.modelSelect.value = 'custom';
      if (elements.customModelInput) {
        elements.customModelInput.value = state.model;
        elements.customModelInput.classList.remove('hidden');
      }
    }

    const savedPreset = localStorage.getItem('fastexam_preset');
    if (savedPreset) {
      state.promptPreset = savedPreset;
      if (elements.promptPresetSelect) elements.promptPresetSelect.value = savedPreset;
    }

    updateApiKeyStatus();
    updateModeDisplay();
  } catch (err) {
    console.warn('Lỗi đọc settings:', err);
  }
}

function saveSettings() {
  const key = (elements.apiKeyInput.value || '').trim();
  const model = elements.modelSelect.value === 'custom'
    ? (elements.customModelInput.value || '').trim()
    : elements.modelSelect.value;
  const thinkingLevel = elements.thinkingLevelSelect?.value || 'high';

  if (!key) {
    updateApiKeyStatus();
    showToast('Vui lòng nhập Gemini API Key của bạn.', 'error');
    return;
  }

  state.apiKey = key;
  state.model = model || 'gemini-3.8-flash';
  state.thinkingLevel = ['low', 'medium', 'high'].includes(thinkingLevel) ? thinkingLevel : 'high';

  localStorage.setItem('fastexam_api_key', state.apiKey);
  localStorage.setItem('fastexam_model', state.model);
  localStorage.setItem('fastexam_thinking_level', state.thinkingLevel);
  if (elements.promptPresetSelect) {
    state.promptPreset = elements.promptPresetSelect.value;
    localStorage.setItem('fastexam_preset', state.promptPreset);
  }

  updateApiKeyStatus();
  updateModeDisplay();
  showToast(`Đã lưu cấu hình. Model: ${state.model}`, 'success');
  elements.settingsModal.classList.add('hidden');
}

function updateApiKeyStatus() {
  const hasKey = Boolean(state.apiKey && state.apiKey.trim());
  elements.apiKeyStatusBadge.textContent = hasKey ? '1 Key cá nhân' : 'Chưa có Key';
  elements.apiKeyStatusBadge.style.background = hasKey ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)';
  elements.apiKeyStatusBadge.style.color = hasKey ? '#34d399' : '#f87171';
}

function updateModeDisplay() {
  const levelText = state.thinkingLevel === 'high' ? 'cao' : state.thinkingLevel === 'medium' ? 'vừa' : 'thấp';
  elements.activeModeDisplay.textContent = state.doubleCheck
    ? `📸 tối đa 15 ảnh/request • 🧠 suy luận ${levelText} • 🔎 đối soát + phân xử khi lệch`
    : `📸 tối đa 15 ảnh/request • 🧠 suy luận ${levelText}`;

  if (elements.activeModelBadge) {
    const shortName = state.model.replace(/^gemini-/, '');
    elements.activeModelBadge.textContent = shortName;
  }
  updateRequestStatsDisplay();
}

// ==========================================
// 2. Event Listeners
// ==========================================
function setupEventListeners() {
  // Timer
  elements.btnStartTimer.addEventListener('click', toggleTimer);
  elements.btnResetTimer.addEventListener('click', resetTimer);

  // Settings Modal
  elements.btnOpenSettings.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
  elements.btnCloseSettings.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
  elements.btnSaveSettings.addEventListener('click', saveSettings);
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) elements.settingsModal.classList.add('hidden');
  });

  if (elements.thinkingLevelSelect) {
    elements.thinkingLevelSelect.addEventListener('change', () => {
      state.thinkingLevel = elements.thinkingLevelSelect.value;
      updateModeDisplay();
    });
  }

  if (elements.modelSelect) {
    elements.modelSelect.addEventListener('change', () => {
      if (elements.modelSelect.value === 'custom') {
        elements.customModelInput.classList.remove('hidden');
        elements.customModelInput.focus();
      } else {
        elements.customModelInput.classList.add('hidden');
      }
    });
  }

  // Zoom Modal
  elements.btnCloseZoom.addEventListener('click', () => elements.imageZoomModal.classList.add('hidden'));
  elements.imageZoomModal.addEventListener('click', (e) => {
    if (e.target === elements.imageZoomModal) elements.imageZoomModal.classList.add('hidden');
  });

  // Export Modal
  if (elements.btnExportReport) {
    elements.btnExportReport.addEventListener('click', openExportModal);
  }
  if (elements.btnCloseExport) {
    elements.btnCloseExport.addEventListener('click', () => elements.exportModal.classList.add('hidden'));
  }
  if (elements.exportModal) {
    elements.exportModal.addEventListener('click', (e) => {
      if (e.target === elements.exportModal) elements.exportModal.classList.add('hidden');
    });
  }
  if (elements.btnCopyInline) elements.btnCopyInline.addEventListener('click', copyInlineFormat);
  if (elements.btnCopyLettersOnly) elements.btnCopyLettersOnly.addEventListener('click', copyLettersOnly);
  if (elements.btnCopyDetailed) elements.btnCopyDetailed.addEventListener('click', copyAllAnswers);
  if (elements.btnPrintPdf) elements.btnPrintPdf.addEventListener('click', () => window.print());
  if (elements.btnDownloadTxt) elements.btnDownloadTxt.addEventListener('click', downloadTxtFile);

  // Drag and Drop Upload
  elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('dragover');
  });
  elements.dropZone.addEventListener('dragleave', () => elements.dropZone.classList.remove('dragover'));
  elements.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  });

  elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      elements.fileInput.value = ''; // Reset for re-selection
    }
  });

  // Paste from clipboard (Ctrl + V)
  document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const pastedFiles = [];
    for (let item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      handleFiles(pastedFiles, true);
      showToast(`Đã dán ${pastedFiles.length} ảnh từ Clipboard!`, 'success');
    }
  });

  // Toolbar Actions
  elements.btnSolveAll.addEventListener('click', solveAllQuestions);
  elements.btnSortQuestions.addEventListener('click', sortQuestionsNatural);
  elements.btnRetryFailed.addEventListener('click', retryFailedQuestions);
  elements.btnClearAll.addEventListener('click', clearAllQuestions);
  elements.btnCopyAnswers.addEventListener('click', copyAllAnswers);
  if (elements.btnLoadDemo) elements.btnLoadDemo.addEventListener('click', loadDemoQuestions);

  // Mobile Bottom Bar Actions
  if (elements.btnMobileSolve) elements.btnMobileSolve.addEventListener('click', solveAllQuestions);
  if (elements.btnMobileCopyAll) elements.btnMobileCopyAll.addEventListener('click', copyAllAnswers);
  if (elements.btnMobileDemo) elements.btnMobileDemo.addEventListener('click', loadDemoQuestions);

  // Esc key to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      elements.settingsModal.classList.add('hidden');
      elements.imageZoomModal.classList.add('hidden');
      if (elements.exportModal) elements.exportModal.classList.add('hidden');
    }
  });
}

// ==========================================
// 3. File Processing & Upload Handling
// ==========================================
async function handleFiles(files, isPasted = false) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (imageFiles.length === 0) {
    showToast('Vui lòng chỉ tải lên tệp định dạng hình ảnh (PNG, JPG, JPEG, WEBP)!', 'error');
    return;
  }

  const remainingSlots = state.maxImagesPerRequest - state.questions.length;
  if (remainingSlots <= 0) {
    showToast(`Đã đủ ${state.maxImagesPerRequest} ảnh cho một lượt. Hãy giải hoặc xóa bớt ảnh trước.`, 'error');
    return;
  }

  const acceptedFiles = imageFiles.slice(0, remainingSlots);
  if (imageFiles.length > acceptedFiles.length) {
    showToast(`Mỗi lượt tối đa ${state.maxImagesPerRequest} ảnh. Chỉ thêm ${acceptedFiles.length} ảnh.`, 'error');
  } else {
    showToast(`Đang tải lên và xử lý ${acceptedFiles.length} ảnh...`);
  }

  for (let file of acceptedFiles) {
    try {
      const prepared = await prepareImageForGemini(file);
      const newQuestion = {
        id: 'q_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: isPasted ? `Ảnh dán ${state.questions.length + 1}.jpg` : file.name,
        base64: prepared.base64,
        mimeType: prepared.mimeType,
        dataUrl: prepared.dataUrl,
        originalDataUrl: prepared.originalDataUrl || prepared.dataUrl,
        status: 'idle', // 'idle' | 'loading' | 'done' | 'warning' | 'error'
        questionLine: '',
        answerLine: '',
        letter: '?',
        answer: null,
        explanation: '',
        confidence: 'high',
        check1: null,
        check2: null,
        isImageOpen: false // Collapsible image preview for mobile compact view
      };

      state.questions.push(newQuestion);
    } catch (err) {
      console.error('Lỗi khi đọc file ảnh:', err);
    }
  }

  updateQuestionCounters();
  renderQuestions();
  renderMatrix();
  showToast(`Đã thêm thành công! Tổng cộng: ${state.questions.length} câu hỏi.`);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function prepareImageForGemini(file) {
  const originalUrl = await readFileAsDataURL(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = originalUrl;
  });

  // Giữ đủ chi tiết để đọc chữ nhưng giảm mạnh kích thước ảnh camera.
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(image, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  return {
    dataUrl,
    originalDataUrl: dataUrl,
    base64: dataUrl.split(',')[1],
    mimeType: 'image/jpeg'
  };
}

function sortQuestionsNatural() {
  if (state.questions.length <= 1) return;

  state.questions.sort((a, b) => {
    const numA = extractNumber(a.name);
    const numB = extractNumber(b.name);
    if (numA !== null && numB !== null) {
      return numA - numB;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  renderQuestions();
  renderMatrix();
  showToast('Đã sắp xếp câu hỏi theo thứ tự số tự nhiên (1 ➔ 15)!', 'success');
}

function extractNumber(str) {
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function clearAllQuestions() {
  if (state.questions.length === 0) return;
  if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ câu hỏi hiện tại không?')) return;
  state.questions = [];
  updateQuestionCounters();
  renderQuestions();
  renderMatrix();
  showToast('Đã dọn sạch toàn bộ câu hỏi.');
}

function updateQuestionCounters() {
  const total = state.questions.length;
  elements.totalQuestionsCount.textContent = total;
  elements.btnSolveAll.disabled = total === 0;

  if (elements.mobileQuestionCount) {
    elements.mobileQuestionCount.textContent = total;
  }
  if (elements.btnMobileSolve) {
    elements.btnMobileSolve.disabled = total === 0;
  }
  if (elements.btnExportReport) {
    elements.btnExportReport.disabled = total === 0;
  }

  const failedCount = state.questions.filter(q => q.status === 'error' || !q.answerLine).length;
  elements.btnRetryFailed.disabled = total === 0 || failedCount === 0;
}

// ==========================================
// 4. API Engine, Structured Output & Prompts
// ==========================================
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    questions: {
      type: 'array',
      description: 'Danh sách câu hỏi theo đúng thứ tự các ảnh được gửi.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string', description: 'Toàn bộ nội dung câu hỏi, không thêm nhãn Câu N:.' },
          answer_letter: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], description: 'Chữ cái của phương án đúng.' },
          answer_text: { type: 'string', description: 'Toàn bộ nội dung của phương án đúng.' }
        },
        required: ['question', 'answer_letter', 'answer_text']
      }
    }
  },
  required: ['questions']
};

function supportsThinkingLevel(model) {
  return /^gemini-3(?:\.1|\.5|\.6|\.7|\.8)?-.+/i.test(model || '') && /flash/i.test(model || '');
}

function updateRequestStatsDisplay() {
  if (!elements.requestStatsDisplay) return;
  const r = state.requestStats;
  const last = r.lastStatus ? ` • ${r.lastStatus}` : '';
  elements.requestStatsDisplay.textContent = `Request lượt này: ${r.run} • Giải: ${r.firstPass} • Đối soát: ${r.secondPass} • Phân xử: ${r.arbitration} • Retry: ${r.retries}${last}`;
}

function resetRequestStats() {
  state.requestStats = { run: 0, firstPass: 0, secondPass: 0, arbitration: 0, retries: 0, batches: 0, lastStatus: '' };
  updateRequestStatsDisplay();
}

function registerRequest(kind, statusText = '') {
  state.requestStats.run += 1;
  if (kind === 'first') state.requestStats.firstPass += 1;
  if (kind === 'second') state.requestStats.secondPass += 1;
  if (kind === 'arbitration') state.requestStats.arbitration += 1;
  state.requestStats.lastStatus = statusText;
  updateRequestStatsDisplay();
}

function getSystemPrompt() {
  return `Bạn là chuyên gia giải trắc nghiệm dựa trên hình ảnh, ưu tiên độ chính xác.

Có nhiều hình ảnh, mỗi hình ảnh thường tương ứng với một câu hỏi. Hãy đọc kỹ toàn bộ câu hỏi và tất cả phương án A-H trong từng ảnh.
Tự giải bằng kiến thức chuyên môn trước khi kết luận. Không suy diễn khi ảnh không đủ rõ.

BẮT BUỘC trả JSON theo schema được cung cấp. Số phần tử questions phải đúng bằng số ảnh được gửi.
Mỗi phần tử tương ứng đúng theo THỨ TỰ ẢNH.
- question: chép lại toàn bộ nội dung câu hỏi, không thêm nhãn “Câu 1:” ở đầu.
- answer_letter: chỉ một chữ cái A-H là phương án đúng.
- answer_text: chép đầy đủ nội dung của phương án đúng, không chỉ chữ cái.

Hãy tự kiểm tra lại từng câu trước khi trả JSON. Không trả markdown, không trả lời ngoài JSON.`;
}

function getIndependentCheckPrompt(count) {
  return `Bạn là người kiểm tra ĐỘC LẬP cho ${count} câu trắc nghiệm từ hình ảnh.

Hãy đọc toàn bộ ảnh và TỰ GIẢI LẠI từ đầu. Không có đáp án lượt trước để tham khảo và tuyệt đối không được dựa vào suy đoán.
Đối với từng ảnh, xác định chính xác câu hỏi, các phương án và phương án đúng.

BẮT BUỘC trả JSON theo schema được cung cấp, đúng ${count} phần tử và đúng thứ tự ảnh:
- question: toàn bộ nội dung câu hỏi, không thêm “Câu N:” ở đầu.
- answer_letter: một chữ cái A-H.
- answer_text: toàn bộ nội dung phương án đúng.

Không trả markdown hay lời giải thích ngoài JSON.`;
}

function getArbitrationPrompt(conflicts) {
  const candidates = conflicts.map((c, i) => {
    return `Câu ${i + 1}:
Lượt 1: ${c.first.answer_letter}. ${c.first.answer_text}
Lượt 2: ${c.second.answer_letter}. ${c.second.answer_text}
Câu hỏi lượt 1: ${c.first.question || '(không rõ)'}
Câu hỏi lượt 2: ${c.second.question || '(không rõ)'}`;
  }).join('\n\n');

  return `Bạn là người PHÂN XỬ cuối cùng cho các câu trắc nghiệm mà hai lượt giải độc lập không thống nhất.

Hãy xem lại trực tiếp hình ảnh của từng câu bên dưới, đọc lại toàn bộ đề và các phương án, sau đó tự suy luận bằng kiến thức chuyên môn.
Không được chọn theo đa số một cách máy móc. Phải dựa vào nội dung trong ảnh và kiến thức đúng.

${candidates}

BẮT BUỘC trả JSON theo schema được cung cấp, đúng ${conflicts.length} phần tử và đúng thứ tự ảnh được gửi.
Mỗi phần tử:
- question: toàn bộ câu hỏi.
- answer_letter: chữ cái A-H của đáp án cuối cùng.
- answer_text: toàn bộ nội dung đáp án cuối cùng.

Không trả markdown hay giải thích ngoài JSON.`;
}

function buildParts(images, prompt) {
  const parts = [{ text: `${prompt}\n\n` }];
  images.forEach((q, idx) => {
    parts.push({ text: `=== ẢNH ${idx + 1} / ${images.length} ===\nTên file: ${q.name || `cau-${idx + 1}.jpg`}\n` });
    parts.push({
      inline_data: {
        mime_type: q.mimeType || 'image/jpeg',
        data: q.base64
      }
    });
  });
  return parts;
}

function getGenerationConfig(prompt, imageCount) {
  const schema = {
    ...RESPONSE_SCHEMA,
    properties: {
      questions: {
        ...RESPONSE_SCHEMA.properties.questions,
        minItems: imageCount,
        maxItems: imageCount
      }
    }
  };

  const config = {
    responseFormat: {
      text: {
        mimeType: 'application/json',
        schema
      }
    },
    maxOutputTokens: Math.min(14000, Math.max(2500, 650 + imageCount * 800))
  };

  if (supportsThinkingLevel(state.model)) {
    config.thinkingConfig = { thinkingLevel: state.thinkingLevel || 'high' };
  }

  return config;
}

async function callGeminiBatchApi(images, prompt, kind, retryCount = 0) {
  if (!state.apiKey) {
    throw new Error('Chưa có Gemini API Key. Vào Cấu hình API để nhập key cá nhân.');
  }

  const model = state.model || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const payload = {
    contents: [{ role: 'user', parts: buildParts(images, prompt) }],
    generationConfig: getGenerationConfig(prompt, images.length)
  };

  registerRequest(kind, `đang gửi ${kind}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': state.apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error?.message || response.statusText || 'Unknown API error';

      // 429 = quota/rate limit: KHÔNG retry tự động.
      if (response.status === 429) {
        state.requestStats.lastStatus = '429 - quota/rate limit';
        updateRequestStatsDisplay();
        throw new Error(`API đã chạm giới hạn quota/rate limit (429). ${message}`);
      }

      // Retry có kiểm soát chỉ cho lỗi tạm thời phía dịch vụ.
      if ([500, 502, 503, 504].includes(response.status) && retryCount < 2) {
        state.requestStats.retries += 1;
        updateRequestStatsDisplay();
        const waitMs = 1400 * Math.pow(2, retryCount) + Math.floor(Math.random() * 500);
        await delay(waitMs);
        return callGeminiBatchApi(images, prompt, kind, retryCount + 1);
      }

      if (response.status === 400) {
        throw new Error(`Yêu cầu không hợp lệ (400): ${message}`);
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`API Key không hợp lệ hoặc không có quyền dùng model này (${response.status}).`);
      }
      throw new Error(`Google API lỗi (${response.status}): ${message}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text.trim()) {
      throw new Error('Gemini không trả về nội dung hợp lệ.');
    }
    state.requestStats.lastStatus = '200 - OK';
    updateRequestStatsDisplay();
    return text.trim();
  } catch (err) {
    const msg = err?.message || '';
    const retryableNetwork = /Failed to fetch|NetworkError|network|timed out|Load failed/i.test(msg);
    const alreadyGoogleError = /^Google API lỗi|^Yêu cầu không hợp lệ|^API Key|^API đã chạm/i.test(msg);

    if (retryableNetwork && !alreadyGoogleError && retryCount < 2) {
      state.requestStats.retries += 1;
      updateRequestStatsDisplay();
      const waitMs = 1000 * Math.pow(2, retryCount);
      await delay(waitMs);
      return callGeminiBatchApi(images, prompt, kind, retryCount + 1);
    }
    throw err;
  }
}

function normalizeStructuredItems(raw, count) {
  let parsed;
  try {
    const cleaned = String(raw || '').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (_) {
    return parseBatchResponse(raw, count);
  }

  const items = Array.isArray(parsed) ? parsed : parsed?.questions;
  if (!Array.isArray(items)) return parseBatchResponse(raw, count);

  return Array.from({ length: count }, (_, i) => {
    const item = items[i] || {};
    const letter = String(item.answer_letter || '').trim().toUpperCase();
    const questionText = String(item.question || '').trim();
    const answerText = String(item.answer_text || '').trim();
    return {
      questionLine: `Câu ${i + 1}: ${questionText || 'Không đọc được câu hỏi'}`,
      answerLine: `${letter || '?'}${answerText ? `. ${answerText}` : ''}`,
      letter: /^[A-H]$/.test(letter) ? letter : '?',
      fullText: `${questionText}\n${letter || '?'}${answerText ? `. ${answerText}` : ''}`.trim()
    };
  });
}

function parseAnswerResponse(rawText) {
  const cleanText = String(rawText || '').replace(/```[a-z]*|```/gi, '').trim();
  const lines = cleanText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  let questionLine = '';
  let answerLine = '';
  const questionIndex = lines.findIndex(line => /^Câu\s*(?:hỏi\s*)?\d+\s*:/i.test(line));
  if (questionIndex >= 0) {
    questionLine = lines[questionIndex];
    const answerCandidate = lines.slice(questionIndex + 1).find(line => /^[A-H]\s*[\.):]/i.test(line));
    answerLine = answerCandidate || lines[questionIndex + 1] || '';
  } else if (lines.length >= 2) {
    questionLine = lines[0];
    answerLine = lines.find(line => /^[A-H]\s*[\.):]/i.test(line)) || lines[1];
  } else if (lines.length === 1) {
    if (/^[A-H]\s*[\.):]/i.test(lines[0])) answerLine = lines[0];
    else questionLine = lines[0];
  }

  questionLine = questionLine.replace(/^Câu hỏi\s+(\d+)\s*:/i, 'Câu $1:');
  const letterMatch = answerLine.match(/^\s*([A-H])\s*[\.):]/i) || answerLine.match(/\b([A-H])\s*[\.):]/i);
  const letter = letterMatch ? letterMatch[1].toUpperCase() : '?';
  return {
    questionLine: questionLine || 'Không đọc được câu hỏi',
    answerLine: answerLine || 'Chưa xác định được đáp án',
    letter,
    fullText: `${questionLine}\n${answerLine}`.trim()
  };
}

function parseBatchResponse(rawText, count) {
  const text = String(rawText || '').replace(/```[a-z]*|```/gi, '').trim();
  const matches = [...text.matchAll(/(?=Câu\s*(?:hỏi\s*)?\d+\s*:)/gi)];
  const chunks = [];

  if (matches.length >= count) {
    for (let i = 0; i < count; i++) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      chunks.push(text.slice(start, end).trim());
    }
  } else {
    const sections = text.split(/(?:^|\n)\s*===?\s*ẢNH\s*\d+[^\n]*\n?/i).map(s => s.trim()).filter(Boolean);
    if (sections.length >= count) {
      chunks.push(...sections.slice(0, count));
    } else {
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let current = [];
      for (const line of lines) {
        if (/^Câu\s*(?:hỏi\s*)?\d+\s*:/i.test(line) && current.length) {
          chunks.push(current.join('\n'));
          current = [line];
        } else {
          current.push(line);
        }
      }
      if (current.length) chunks.push(current.join('\n'));
    }
  }

  return Array.from({ length: count }, (_, i) => parseAnswerResponse(chunks[i] || ''));
}

function normalizeParsedBatch(parsed, expectedCount, globalStart = 0) {
  return Array.from({ length: expectedCount }, (_, i) => {
    const item = parsed[i] || {};
    const rawQ = String(item.questionLine || '').replace(/^Câu\s*(?:hỏi\s*)?\d+\s*:/i, '').trim();
    return {
      questionLine: `Câu ${globalStart + i + 1}: ${rawQ || 'Không đọc được câu hỏi'}`,
      answerLine: item.answerLine || 'Chưa xác định được đáp án',
      letter: /^[A-H]$/.test(item.letter || '') ? item.letter : '?',
      fullText: item.fullText || `${rawQ}\n${item.answerLine || ''}`.trim()
    };
  });
}

function getArbitrationInput(first, second) {
  return first.map((f, i) => ({
    index: i,
    first: {
      question: f.questionLine,
      answer_letter: f.letter,
      answer_text: f.answerLine
    },
    second: {
      question: second[i]?.questionLine || '',
      answer_letter: second[i]?.letter || '?',
      answer_text: second[i]?.answerLine || ''
    }
  }));
}

function applyParsedResults(batch, parsed) {
  batch.forEach((q, idx) => {
    const item = parsed[idx] || {};
    q.questionLine = item.questionLine || q.questionLine;
    q.answerLine = item.answerLine || q.answerLine;
    q.letter = item.letter || '?';
    q.answer = item.letter || '?';
    q.check1 = item.letter || '?';
    q.status = q.letter !== '?' ? 'loading' : 'warning';
    q.confidence = q.letter !== '?' ? 'pending-check' : 'warning';
    q.explanation = item.fullText || `${q.questionLine}\n${q.answerLine}`;
  });
}

function applyFinalPass(batch, firstPass, secondPass, arbitrationByIndex = new Map()) {
  batch.forEach((q, idx) => {
    const first = firstPass[idx] || {};
    const second = secondPass[idx] || {};
    const arbitration = arbitrationByIndex.get(idx);

    if (arbitration) {
      q.check2 = second.letter || '?';
      q.check3 = arbitration.letter || '?';
      q.questionLine = arbitration.questionLine || second.questionLine || first.questionLine || q.questionLine;
      q.answerLine = arbitration.answerLine || second.answerLine || first.answerLine || q.answerLine;
      q.letter = arbitration.letter || second.letter || first.letter || '?';
      q.answer = q.letter;
      q.status = q.letter !== '?' ? 'done' : 'warning';
      q.confidence = 'arbitrated';
      q.explanation = `${arbitration.fullText || q.answerLine}\n\n✓ Lượt 1: ${first.letter || '?'} • Lượt 2: ${second.letter || '?'} • Phân xử: ${q.letter}`;
      return;
    }

    q.check2 = second.letter || '?';
    const agree = first.letter !== '?' && first.letter === second.letter;

    if (agree) {
      q.questionLine = second.questionLine || first.questionLine || q.questionLine;
      q.answerLine = second.answerLine || first.answerLine || q.answerLine;
      q.letter = second.letter;
      q.answer = q.letter;
      q.status = 'done';
      q.confidence = 'high';
      q.explanation = `${second.fullText || q.answerLine}\n\n✓ Hai lượt giải độc lập khớp đáp án ${q.letter}.`;
    } else if (second.letter !== '?' || first.letter !== '?') {
      // Hai lượt không thống nhất mà không phân xử được: không tự đoán một đáp án.
      q.questionLine = second.questionLine || first.questionLine || q.questionLine;
      q.answerLine = '⚠ Chưa thể chốt đáp án — hai lượt giải không thống nhất.';
      q.letter = '?';
      q.answer = '?';
      q.status = 'warning';
      q.confidence = 'unresolved-conflict';
      q.explanation = `${first.fullText || first.answerLine || ''}\n\n⚠ Lượt 1: ${first.letter || '?'} • Lượt 2: ${second.letter || '?'} — cần phân xử lại.`.trim();
    } else {
      q.status = 'warning';
      q.confidence = 'warning';
      q.explanation = `${first.fullText || q.answerLine}\n\n⚠ Lượt 2 không xác định được đáp án.`;
    }
  });
}

function getRequestProbePrompt(count) {
  return [
    getSystemPrompt(),
    getIndependentCheckPrompt(count),
    buildArbitrationProbePrompt(Math.min(count, 2))
  ].join('\n\n');
}

async function fitBatchToRequestBudget(images) {
  const targetBytes = state.maxInlineRequestBytes || 18_500_000;
  if (estimateInlineRequestBytes(images, getRequestProbePrompt(images.length)) <= targetBytes) {
    return true;
  }

  const levels = [
    { maxDimension: 1700, quality: 0.82 },
    { maxDimension: 1550, quality: 0.76 },
    { maxDimension: 1400, quality: 0.70 },
    { maxDimension: 1280, quality: 0.64 },
    { maxDimension: 1120, quality: 0.58 },
    { maxDimension: 960, quality: 0.52 }
  ];

  for (const level of levels) {
    for (const q of images) {
      await recompressQuestionImage(q, level.maxDimension, level.quality);
    }
    if (estimateInlineRequestBytes(images, getRequestProbePrompt(images.length)) <= targetBytes) {
      showToast(`Đã tự tối ưu ${images.length} ảnh để giữ request dưới ngưỡng an toàn.`, 'info');
      return true;
    }
  }

  return false;
}

function recompressQuestionImage(q, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const sourceDataUrl = q.originalDataUrl || q.dataUrl;
        const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        q.originalDataUrl = q.originalDataUrl || sourceDataUrl;
        q.dataUrl = dataUrl;
        q.base64 = dataUrl.split(',')[1];
        q.mimeType = 'image/jpeg';
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = q.originalDataUrl || q.dataUrl;
  });
}

function estimateInlineRequestBytes(images, prompt = '') {
  const base64Bytes = images.reduce((sum, q) => sum + String(q.base64 || '').length, 0);
  const metadataBytes = images.reduce((sum, q, idx) => {
    const label = `\n\n=== ẢNH ${idx + 1} / ${images.length} ===\nTên file: ${q.name || `cau-${idx + 1}.jpg`}\n`;
    return sum + label.length + 180;
  }, 0);
  return base64Bytes + String(prompt).length + metadataBytes + 8000;
}

function buildArbitrationProbePrompt(count) {
  const fake = Array.from({ length: count }, (_, i) => ({
    first: { question: `Câu hỏi ${i + 1}`, answer_letter: 'A', answer_text: 'Đáp án mẫu' },
    second: { question: `Câu hỏi ${i + 1}`, answer_letter: 'B', answer_text: 'Đáp án mẫu' }
  }));
  return getArbitrationPrompt(fake);
}

async function splitImagesForRequest(images) {
  const maxImages = state.maxImagesPerRequest || 15;
  const batches = [];
  let current = [];

  for (const image of images) {
    if (current.length >= maxImages) {
      await fitBatchToRequestBudget(current);
      batches.push(current);
      current = [];
    }

    const currentSnapshot = current.map(q => ({
      q,
      dataUrl: q.dataUrl,
      base64: q.base64,
      mimeType: q.mimeType
    }));
    const candidate = [...current, image];
    const fits = await fitBatchToRequestBudget(candidate);

    if (fits && candidate.length <= maxImages) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      // Candidate did not fit; restore current batch so we do not unnecessarily
      // keep a heavily compressed version just because a later image was too large.
      currentSnapshot.forEach(s => {
        s.q.dataUrl = s.dataUrl;
        s.q.base64 = s.base64;
        s.q.mimeType = s.mimeType;
      });
      await fitBatchToRequestBudget(current);
      batches.push(current);
      current = [image];
      await fitBatchToRequestBudget(current);
    } else {
      current = [image];
      await fitBatchToRequestBudget(current);
      batches.push(current);
      current = [];
    }
  }

  if (current.length) {
    await fitBatchToRequestBudget(current);
    batches.push(current);
  }

  return batches;
}

// ==========================================
// 5. Solver: multi-pass verification
// ==========================================
async function solveAllQuestions() {
  if (state.questions.length === 0) return;
  if (!state.apiKey) {
    elements.settingsModal.classList.remove('hidden');
    showToast('Vui lòng nhập API key cá nhân trước khi giải.', 'error');
    return;
  }

  const pendingQuestions = state.questions.filter(q => q.status !== 'done');
  if (pendingQuestions.length === 0) {
    showToast('Tất cả câu hỏi đã có kết quả.', 'success');
    return;
  }

  if (!state.timer.isRunning) toggleTimer();
  elements.btnSolveAll.disabled = true;
  if (elements.btnMobileSolve) elements.btnMobileSolve.disabled = true;
  pendingQuestions.forEach(q => { q.status = 'loading'; renderQuestionCard(q); });
  resetRequestStats();
  renderMatrix();

  try {
    const batches = await splitImagesForRequest(pendingQuestions);
    state.requestStats.batches = batches.length;
    updateRequestStatsDisplay();

    showToast(
      batches.length === 1
        ? `Đang xử lý ${pendingQuestions.length} ảnh bằng ${state.model} (Thinking ${state.thinkingLevel})...`
        : `Đã tự chia ${pendingQuestions.length} ảnh thành ${batches.length} batch để giữ request an toàn.`,
      'info'
    );

    let globalStart = 0;
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchLabel = batches.length > 1 ? ` (${batchIndex + 1}/${batches.length})` : '';
      showToast(`Lượt 1: giải ${batch.length} ảnh${batchLabel}...`, 'info');

      const rawFirst = await callGeminiBatchApi(batch, getSystemPrompt(), 'first');
      const firstPass = normalizeParsedBatch(normalizeStructuredItems(rawFirst, batch.length), batch.length, globalStart);
      applyParsedResults(batch, firstPass);
      renderQuestions();
      renderMatrix();

      if (!state.doubleCheck) {
        batch.forEach((q, idx) => {
          const f = firstPass[idx];
          q.status = f.letter !== '?' ? 'done' : 'warning';
          q.confidence = f.letter !== '?' ? 'single-pass' : 'warning';
        });
        renderQuestions();
        renderMatrix();
        globalStart += batch.length;
        continue;
      }

      // Lượt 2: giải độc lập, KHÔNG nhìn kết quả lượt 1.
      showToast(`Lượt 2: giải độc lập để đối soát${batchLabel}...`, 'info');
      let secondPass;
      try {
        const rawSecond = await callGeminiBatchApi(batch, getIndependentCheckPrompt(batch.length), 'second');
        secondPass = normalizeParsedBatch(normalizeStructuredItems(rawSecond, batch.length), batch.length, globalStart);
      } catch (secondErr) {
        console.error('Lỗi lượt 2:', secondErr);
        batch.forEach((q, idx) => {
          const first = firstPass[idx];
          q.status = first.letter !== '?' ? 'warning' : 'error';
          q.confidence = 'verification-failed';
          q.explanation = `${first.fullText || q.answerLine}\n\n⚠ Lượt đối soát lỗi: ${secondErr.message}`.trim();
        });
        renderQuestions();
        renderMatrix();
        globalStart += batch.length;
        continue;
      }

      const arbitrationCandidates = [];
      for (let i = 0; i < batch.length; i++) {
        const f = firstPass[i];
        const s2 = secondPass[i];
        if (f.letter !== '?' && s2.letter !== '?' && f.letter !== s2.letter) {
          arbitrationCandidates.push({ localIndex: i, first: f, second: s2, question: batch[i] });
        }
      }

      let arbitrationByIndex = new Map();
      if (arbitrationCandidates.length > 0) {
        showToast(`⚠ ${arbitrationCandidates.length} câu lệch đáp án → phân xử lượt 3${batchLabel}...`, 'info');
        try {
          const arbitrationImages = arbitrationCandidates.map(c => c.question);
          const arbitrationInput = arbitrationCandidates.map(c => ({
            first: { question: c.first.questionLine, answer_letter: c.first.letter, answer_text: c.first.answerLine },
            second: { question: c.second.questionLine, answer_letter: c.second.letter, answer_text: c.second.answerLine }
          }));
          const rawThird = await callGeminiBatchApi(arbitrationImages, getArbitrationPrompt(arbitrationInput), 'arbitration');
          const thirdPass = normalizeParsedBatch(
            normalizeStructuredItems(rawThird, arbitrationImages.length),
            arbitrationImages.length,
            0
          );
          arbitrationCandidates.forEach((c, i) => arbitrationByIndex.set(c.localIndex, thirdPass[i]));
        } catch (thirdErr) {
          console.error('Lỗi phân xử:', thirdErr);
          showToast(`Không hoàn tất được lượt phân xử${batchLabel}: ${thirdErr.message}`, 'error');
        }
      }

      applyFinalPass(batch, firstPass, secondPass, arbitrationByIndex);
      renderQuestions();
      renderMatrix();
      globalStart += batch.length;
    }

    const done = pendingQuestions.filter(q => q.status === 'done').length;
    const warn = pendingQuestions.filter(q => q.status === 'warning').length;
    showToast(`Hoàn tất ${done}/${pendingQuestions.length} câu${warn ? ` • ${warn} câu cần xem lại` : ''}.`, warn ? 'info' : 'success');
  } catch (err) {
    console.error('Lỗi giải batch:', err);
    pendingQuestions.forEach(q => {
      if (q.status === 'loading') {
        q.status = 'error';
        q.questionLine = 'Lỗi phân tích';
        q.answerLine = err.message || 'Lỗi gọi API';
        q.letter = '!';
        q.answer = '!';
      }
    });
    renderQuestions();
    renderMatrix();
    showToast(`Không thể hoàn tất: ${err.message}`, 'error');
  } finally {
    elements.btnSolveAll.disabled = false;
    if (elements.btnMobileSolve) elements.btnMobileSolve.disabled = false;
    updateQuestionCounters();
    updateRequestStatsDisplay();
    playCompletionSound();
  }
}

async function solveSingleQuestion(q) {
  if (!q) return;
  const original = state.questions;
  state.questions = [q];
  try {
    await solveAllQuestions();
  } finally {
    state.questions = original;
    renderQuestions();
    renderMatrix();
    updateQuestionCounters();
  }
}

async function retryFailedQuestions() {
  const failed = state.questions.filter(q => q.status === 'error' || q.status === 'warning' || !q.answerLine || q.letter === '?' || q.letter === '!');
  if (failed.length === 0) {
    showToast('Không có câu lỗi cần giải lại.', 'success');
    return;
  }

  const oldQuestions = state.questions;
  state.questions = failed;
  await solveAllQuestions();
  state.questions = oldQuestions;
  renderQuestions();
  renderMatrix();
  updateQuestionCounters();
}

// ==========================================
// 6. UI Rendering & Matrix Bar (Mobile-Optimized)
// ==========================================

function renderMatrix() {
  const container = elements.matrixGrid;
  container.innerHTML = '';

  if (state.questions.length === 0) {
    container.innerHTML = '<div class="matrix-empty">Chưa có ảnh câu hỏi nào. Chạm nút "CHỤP ẢNH / TẢI ẢNH" bên dưới!</div>';
    elements.matrixStats.textContent = '(0/0 câu)';
    elements.matrixProgressFill.style.width = '0%';
    return;
  }

  const doneCount = state.questions.filter(q => q.status === 'done' || q.status === 'warning').length;
  elements.matrixStats.textContent = `(${doneCount}/${state.questions.length} câu xong)`;
  elements.matrixProgressFill.style.width = `${(doneCount / state.questions.length) * 100}%`;

  state.questions.forEach((q, index) => {
    const item = document.createElement('div');
    item.className = `matrix-item ${q.status}`;
    item.id = `matrix-badge-${q.id}`;
    item.title = `Chạm để nhảy tới Câu ${index + 1}`;

    const numSpan = document.createElement('span');
    numSpan.className = 'matrix-item-num';
    numSpan.textContent = `${index + 1}`;

    const valSpan = document.createElement('span');
    valSpan.className = 'matrix-item-val';
    valSpan.textContent = q.letter || (q.status === 'loading' ? '⌛' : '?');

    item.appendChild(numSpan);
    item.appendChild(valSpan);

    item.addEventListener('click', () => {
      const card = document.getElementById(`card-${q.id}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.outline = '2px solid #06b6d4';
        setTimeout(() => card.style.outline = 'none', 1500);
      }
    });

    container.appendChild(item);
  });
}

function renderQuestions() {
  const grid = elements.questionsGrid;
  grid.innerHTML = '';

  state.questions.forEach((q, index) => {
    const card = createQuestionCardElement(q, index);
    grid.appendChild(card);
  });
}

function renderQuestionCard(q) {
  const index = state.questions.findIndex(item => item.id === q.id);
  if (index === -1) return;

  const existingCard = document.getElementById(`card-${q.id}`);
  const newCard = createQuestionCardElement(q, index);

  if (existingCard) {
    existingCard.replaceWith(newCard);
  } else {
    elements.questionsGrid.appendChild(newCard);
  }
}

// Generate Question Card with Gemini Response Card Layout
function createQuestionCardElement(q, index) {
  const card = document.createElement('div');
  card.className = `gemini-response-card status-${q.status}`;
  card.id = `card-${q.id}`;

  const statusLabels = {
    idle: 'Chờ giải',
    loading: 'Gemini đang giải...',
    done: 'Hoàn tất',
    warning: 'Đối soát lệch',
    error: 'Lỗi'
  };

  // Determine display question text
  const displayQ = q.questionLine || `Câu hỏi ${index + 1}`;
  const displayA = q.answerLine || (q.status === 'loading' ? '' : 'Chưa có đáp án. Bấm GIẢI để xem.');

  card.innerHTML = `
    <div class="card-top-bar">
      <div class="card-left-info">
        <span class="card-sparkle">✦</span>
        <span class="card-q-badge">CÂU ${index + 1}</span>
        <button class="btn-toggle-img" id="toggle-img-${q.id}">
          ${q.isImageOpen ? 'Ẩn ảnh' : '📸 Xem ảnh'}
        </button>
      </div>
      <div class="card-right-actions">
        <span class="card-status-pill status-pill-${q.status}">${statusLabels[q.status] || q.status}</span>
        <button class="btn-card-copy btn-quick-copy" title="Copy câu này">
          📋
        </button>
      </div>
    </div>

    <!-- Collapsible Image Section -->
    <div class="card-collapsible-img ${q.isImageOpen ? '' : 'collapsed'}" id="img-box-${q.id}">
      <img src="${q.dataUrl}" alt="Câu hỏi ${index + 1}">
      <div class="card-zoom-badge">Phóng to</div>
    </div>

    <!-- Gemini Response Bubble Content -->
    <div class="card-bubble-content">
      <div class="question-bubble">
        <div class="bubble-tag-q">❓ CÂU HỎI:</div>
        <div class="bubble-text-q">${escapeHtml(displayQ)}</div>
      </div>
      
      <div class="answer-bubble ${q.status === 'done' ? 'ready' : ''}">
        <div class="bubble-tag-a">
          <span>✨ ĐÁP ÁN ĐÚNG:</span>
        </div>
        ${q.status === 'loading' 
          ? '<div class="gemini-loading-wave"></div>' 
          : `<div class="bubble-text-a">${escapeHtml(displayA)}</div>`
        }
      </div>
    </div>

    <div class="card-bottom-bar">
      <button class="card-btn-action btn-re-solve" title="Giải lại riêng câu này">
        🔄 Giải lại
      </button>
      <button class="card-btn-action card-btn-delete btn-del-q" title="Xóa câu này">
        Xóa
      </button>
    </div>
  `;

  // Toggle image preview
  const toggleBtn = card.querySelector(`#toggle-img-${q.id}`);
  const imgBox = card.querySelector(`#img-box-${q.id}`);
  toggleBtn.addEventListener('click', () => {
    q.isImageOpen = !q.isImageOpen;
    if (q.isImageOpen) {
      imgBox.classList.remove('collapsed');
      toggleBtn.textContent = 'Ẩn ảnh';
    } else {
      imgBox.classList.add('collapsed');
      toggleBtn.textContent = '📸 Xem ảnh';
    }
  });

  // Zoom image
  imgBox.addEventListener('click', () => {
    elements.zoomModalImage.src = q.dataUrl;
    elements.zoomModalTitle.textContent = `Câu ${index + 1}: ${q.name}`;
    elements.imageZoomModal.classList.remove('hidden');
  });

  // Quick Copy Single Question (Exact 2-line format)
  const btnQuickCopy = card.querySelector('.btn-quick-copy');
  btnQuickCopy.addEventListener('click', () => {
    const singleText = `${displayQ}\n${displayA}`;
    navigator.clipboard.writeText(singleText).then(() => {
      showToast(`📋 Đã copy Câu ${index + 1}!`, 'success');
    });
  });

  // Re-solve single question
  const btnReSolve = card.querySelector('.btn-re-solve');
  btnReSolve.addEventListener('click', () => solveSingleQuestion(q));

  // Delete question
  const btnDel = card.querySelector('.btn-del-q');
  btnDel.addEventListener('click', () => {
    state.questions = state.questions.filter(item => item.id !== q.id);
    updateQuestionCounters();
    renderQuestions();
    renderMatrix();
  });

  return card;
}

// ==========================================
// 7. Copy & Export Helpers (Exact SEB Format)
// ==========================================

function getFormattedSebText() {
  if (state.questions.length === 0) return '';
  return state.questions.map((q, idx) => {
    const qText = q.questionLine || `Câu hỏi ${idx + 1}`;
    const aText = q.answerLine || 'Chưa có đáp án';
    return `${qText}\n${aText}`;
  }).join('\n\n');
}

function copyAllAnswers() {
  if (state.questions.length === 0) {
    showToast('Chưa có câu hỏi nào để copy!', 'error');
    return;
  }

  const fullText = getFormattedSebText();
  navigator.clipboard.writeText(fullText).then(() => {
    showToast(`📋 Đã copy toàn bộ ${state.questions.length} câu theo chuẩn SEB!`, 'success');
  }).catch(() => {
    showToast('Không thể truy cập Clipboard!', 'error');
  });
}

function copyInlineFormat() {
  if (state.questions.length === 0) return;
  const inline = state.questions.map((q, idx) => `${idx + 1}.${q.letter || '?'}`).join('  |  ');
  navigator.clipboard.writeText(inline).then(() => {
    showToast('📋 Đã copy dạng chuỗi ngang!', 'success');
  });
}

function copyLettersOnly() {
  if (state.questions.length === 0) return;
  const letters = state.questions.map(q => q.letter || '?').join(' ');
  navigator.clipboard.writeText(letters).then(() => {
    showToast('🔤 Đã copy danh sách chữ cái đáp án!', 'success');
  });
}

function openExportModal() {
  if (elements.exportPreviewText) {
    elements.exportPreviewText.value = getFormattedSebText();
  }
  elements.exportModal.classList.remove('hidden');
}

function downloadTxtFile() {
  const text = getFormattedSebText();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FastExam_SEB_DapAn_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Đã tải xuống file đáp án!', 'success');
}

// ==========================================
// 8. Demo Generator (15 Sample SEB Questions)
// ==========================================
function loadDemoQuestions() {
  showToast('Đang tạo 15 câu hỏi mẫu chuẩn đề thi SEB...');

  const sampleData = [
    {
      q: 'Câu hỏi 1: Đạo hàm của hàm số y = x^3 - 3x^2 + 2 là?',
      a: 'A. y\' = 3x^2 - 6x',
      opts: ['A. y\' = 3x^2 - 6x', 'B. y\' = 3x^2 - 3x', 'C. y\' = x^2 - 6x', 'D. y\' = 3x^2 + 6x']
    },
    {
      q: 'Câu hỏi 2: Chu kỳ dao động điều hòa của con lắc đơn được tính theo công thức?',
      a: 'B. T = 2π√(l/g)',
      opts: ['A. T = 2π√(g/l)', 'B. T = 2π√(l/g)', 'C. T = 2π√(m/k)', 'D. T = 2π√(k/m)']
    },
    {
      q: 'Câu hỏi 3: Thủy phân este Etyl axetat trong môi trường kiềm (NaOH) sinh ra muối nào?',
      a: 'C. CH3COONa',
      opts: ['A. HCOONa', 'B. C2H5COONa', 'C. CH3COONa', 'D. CH3COOH']
    },
    {
      q: 'Câu hỏi 4: She ____ in Hanoi for 10 years before moving to Da Nang.',
      a: 'D. had lived',
      opts: ['A. lives', 'B. has lived', 'C. is living', 'D. had lived']
    },
    {
      q: 'Câu hỏi 5: Năm 1945, sự kiện lịch sử trọng đại nào diễn ra tại Quảng trường Ba Đình?',
      a: 'A. Bác Hồ đọc Tuyên ngôn Độc lập',
      opts: ['A. Bác Hồ đọc Tuyên ngôn Độc lập', 'B. Chiến thắng Điện Biên Phủ', 'C. Khởi nghĩa Nam Kỳ', 'D. Thành lập Đảng']
    },
    {
      q: 'Câu hỏi 6: Đỉnh núi Fansipan có độ cao chính xác là bao nhiêu mét?',
      a: 'B. 3.143 m',
      opts: ['A. 3.114 m', 'B. 3.143 m', 'C. 3.200 m', 'D. 2.980 m']
    },
    {
      q: 'Kim loại nào sau đây có độ dẫn điện tốt nhất ở điều kiện thường?',
      a: 'A. Bạc (Ag)',
      opts: ['A. Bạc (Ag)', 'B. Đồng (Cu)', 'C. Vàng (Au)', 'D. Nhôm (Al)']
    },
    {
      q: 'Câu hỏi 8: Đơn vị đo cường độ dòng điện trong hệ đo lường quốc tế SI là gì?',
      a: 'C. Ampe (A)',
      opts: ['A. Vôn (V)', 'B. Ôm (Ω)', 'C. Ampe (A)', 'D. Oát (W)']
    },
    {
      q: 'Câu hỏi 9: Giá trị của tích phân I = ∫ (0 đến 1) 2x dx bằng bao nhiêu?',
      a: 'A. 1',
      opts: ['A. 1', 'B. 2', 'C. 0', 'D. 0.5']
    },
    {
      q: 'Trong mạng máy tính, 1 Byte tương đương với bao nhiêu Bit?',
      a: 'B. 8 bit',
      opts: ['A. 4 bit', 'B. 8 bit', 'C. 16 bit', 'D. 32 bit']
    },
    {
      q: 'Câu hỏi 11: Cho tam giác vuông có hai cạnh góc vuông là 3cm và 4cm. Độ dài cạnh huyền là?',
      a: 'D. 5 cm',
      opts: ['A. 6 cm', 'B. 7 cm', 'C. 4.5 cm', 'D. 5 cm']
    },
    {
      q: 'Câu hỏi 12: Tế bào quang điện hoạt động dựa trên hiện tượng vật lý nào?',
      a: 'C. Hiện tượng quang điện trong',
      opts: ['A. Tán sắc ánh sáng', 'B. Giao thoa ánh sáng', 'C. Hiện tượng quang điện trong', 'D. Phản xạ ánh sáng']
    },
    {
      q: 'Câu hỏi 13: Thành phần chính của khí thiên nhiên là khí nào?',
      a: 'A. Metan (CH4)',
      opts: ['A. Metan (CH4)', 'B. Etan (C2H6)', 'C. Propan (C3H8)', 'D. Butan (C4H10)']
    },
    {
      q: 'Vận tốc ánh sáng truyền trong chân không xấp xỉ bằng bao nhiêu?',
      a: 'B. 3 x 10^8 m/s',
      opts: ['A. 3 x 10^6 m/s', 'B. 3 x 10^8 m/s', 'C. 3 x 10^5 km/h', 'D. 340 m/s']
    },
    {
      q: 'Câu hỏi 15: Từ nào sau đây đồng nghĩa với "Crucial"?',
      a: 'C. Essential',
      opts: ['A. Minor', 'B. Optional', 'C. Essential', 'D. Temporary']
    }
  ];

  state.questions = sampleData.map((item, idx) => {
    // Generate clean Canvas mock image
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // Header badge
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(20, 20, 130, 32);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`ĐỀ THI SEB #${idx + 1}`, 30, 42);

    // Question Text
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(item.q.length > 50 ? item.q.substring(0, 48) + '...' : item.q, 20, 85);

    // Options
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(item.opts[0] + '          ' + item.opts[1], 30, 135);
    ctx.fillText(item.opts[2] + '          ' + item.opts[3], 30, 180);

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    const parsed = parseAnswerResponse(`${item.q}\n${item.a}`);

    return {
      id: 'demo_' + (idx + 1),
      name: `cau_${idx + 1}.png`,
      base64: base64,
      mimeType: 'image/png',
      dataUrl: dataUrl,
      status: 'done',
      questionLine: parsed.questionLine,
      answerLine: parsed.answerLine,
      letter: parsed.letter,
      answer: parsed.letter,
      explanation: parsed.fullText,
      confidence: 'high',
      check1: parsed.letter,
      check2: parsed.letter,
      isImageOpen: false
    };
  });

  updateQuestionCounters();
  renderQuestions();
  renderMatrix();
  showToast('Đã tải thành công 15 câu hỏi mẫu chuẩn SEB!', 'success');
}

// ==========================================
// 9. Exam Timer Logic (15 Mins)
// ==========================================
function toggleTimer() {
  if (state.timer.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  state.timer.isRunning = true;
  elements.iconTimerPlay.classList.add('hidden');
  elements.iconTimerPause.classList.remove('hidden');

  state.timer.intervalId = setInterval(() => {
    if (state.timer.remainingSeconds > 0) {
      state.timer.remainingSeconds--;
      updateTimerDisplay();
    } else {
      pauseTimer();
      playCompletionSound();
      showToast('⏰ HẾT GIỜ LÀM BÀI 15 PHÚT!', 'error');
    }
  }, 1000);
}

function pauseTimer() {
  state.timer.isRunning = false;
  elements.iconTimerPlay.classList.remove('hidden');
  elements.iconTimerPause.classList.add('hidden');
  if (state.timer.intervalId) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
}

function resetTimer() {
  pauseTimer();
  state.timer.remainingSeconds = state.timer.totalSeconds;
  updateTimerDisplay();
  elements.timerWidget.classList.remove('warning');
}

function updateTimerDisplay() {
  const m = Math.floor(state.timer.remainingSeconds / 60);
  const s = state.timer.remainingSeconds % 60;
  elements.timerDisplay.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

  // Warning when < 3 minutes
  if (state.timer.remainingSeconds <= 3 * 60 && state.timer.remainingSeconds > 0) {
    elements.timerWidget.classList.add('warning');
  } else {
    elements.timerWidget.classList.remove('warning');
  }
}

// ==========================================
// 10. Audio Synthesizer & Utility Helpers
// ==========================================
function playCompletionSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (err) {
    // Ignore audio autoplay restrictions
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let toastTimeout = null;
function showToast(message, type = 'info') {
  clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.className = `toast toast-${type}`;
  elements.toast.classList.remove('hidden');

  toastTimeout = setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3000);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start application
window.addEventListener('DOMContentLoaded', init);
