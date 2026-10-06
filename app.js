/**
 * FastExam AI v2.0 - Mobile-First SEB Exam Solver
 * - Multi-API Profile Management (BYOK per account/project)
 * - 2 Modes: [ Chỉ Tra ] (Siêu tốc 1 lượt) & [ Kiểm Tra Chéo ] (Song song 2 lượt độc lập)
 * - Tối ưu tốc độ: Chạy SONG SONG Lượt 1 và Lượt 2 bằng Promise.allSettled (Nhanh gấp đôi)
 * - Chuyên môn cao: Prompt chuẩn xác, Schema ép enum A-H bắt buộc giải chi tiết
 * - Phân xử Lượt 3 cho câu lệch (Arbitration) hoặc Kiểm tra lại từng câu
 * - Tự động nén thích ứng & chia batch cho tối đa 15 ảnh
 * - Định dạng chuẩn SEB:
 *     Câu 1: [Nội dung câu hỏi]
 *     B. [Nội dung đáp án đúng]
 */

// ==========================================
// 1. Application State & Storage
// ==========================================
const DEFAULT_MODELS = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Khuyên dùng)' },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
];

const state = {
  questions: [],

  // Multi API Profiles
  profiles: [],

  // Active Mode: 'lookup' (Chỉ tra) | 'cross_check' (Kiểm tra chéo)
  mode: 'cross_check',

  // Profile assignments by ID
  lookupProfileId: '',
  solverProfileId: '',
  verifierProfileId: '',
  arbitratorProfileId: '', // '' = Không có (người dùng tự bấm kiểm tra lại)

  // Realtime Execution State
  currentProcessStage: 'Sẵn sàng',

  // Request Statistics
  requestStats: {
    run: 0,
    lookupPass: 0,
    firstPass: 0,
    secondPass: 0,
    arbitration: 0,
    singleRechecks: 0,
    retries: 0,
    batches: 0,
    lastStatus: ''
  },

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

// DOM Elements Cache
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
  btnCopyAnswers: document.getElementById('btnCopyAnswers'),

  // Mode Bar & Profile Pickers
  btnModeLookup: document.getElementById('btnModeLookup'),
  btnModeCrossCheck: document.getElementById('btnModeCrossCheck'),
  panelLookupProfiles: document.getElementById('panelLookupProfiles'),
  panelCrossProfiles: document.getElementById('panelCrossProfiles'),
  selectLookupProfile: document.getElementById('selectLookupProfile'),
  badgeLookupModel: document.getElementById('badgeLookupModel'),
  selectCrossSolver: document.getElementById('selectCrossSolver'),
  selectCrossVerifier: document.getElementById('selectCrossVerifier'),
  selectCrossArbitrator: document.getElementById('selectCrossArbitrator'),

  // Result Status Banner
  resultStatusBanner: document.getElementById('resultStatusBanner'),
  bannerModeText: document.getElementById('bannerModeText'),
  bannerRequestStats: document.getElementById('bannerRequestStats'),
  bannerProfilesRow: document.getElementById('bannerProfilesRow'),
  bannerProgressText: document.getElementById('bannerProgressText'),

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

  // Settings Modal & Profiles Manager
  btnOpenSettings: document.getElementById('btnOpenSettings'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  btnCloseSettingsModal: document.getElementById('btnCloseSettingsModal'),
  settingsModal: document.getElementById('settingsModal'),
  apiKeyStatusBadge: document.getElementById('apiKeyStatusBadge'),
  activeModelBadge: document.getElementById('activeModelBadge'),
  profilesListContainer: document.getElementById('profilesListContainer'),
  btnAddNewProfile: document.getElementById('btnAddNewProfile'),
  profileFormBox: document.getElementById('profileFormBox'),
  profileFormTitle: document.getElementById('profileFormTitle'),
  editProfileId: document.getElementById('editProfileId'),
  inputProfileName: document.getElementById('inputProfileName'),
  inputProfileKey: document.getElementById('inputProfileKey'),
  btnToggleKeyVisibility: document.getElementById('btnToggleKeyVisibility'),
  inputProfileModel: document.getElementById('inputProfileModel'),
  inputCustomModel: document.getElementById('inputCustomModel'),
  inputProfileThinking: document.getElementById('inputProfileThinking'),
  btnTestThisKey: document.getElementById('btnTestThisKey'),
  btnCancelProfile: document.getElementById('btnCancelProfile'),
  btnCancelProfileForm: document.getElementById('btnCancelProfileForm'),
  btnSaveProfileItem: document.getElementById('btnSaveProfileItem'),
  testKeyFeedback: document.getElementById('testKeyFeedback'),

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
  toast: document.getElementById('toast'),
  activeModeDisplay: document.getElementById('activeModeDisplay')
};

// ==========================================
// 2. Initialization & Profile Persistence
// ==========================================
function init() {
  loadProfilesAndSettings();
  setupEventListeners();
  updateTimerDisplay();
  renderQuestions();
  renderMatrix();
  updateRequestStatsDisplay();
  updateModeUI();
}

function createDefaultProfiles() {
  return [
    {
      id: 'prof_' + Date.now() + '_1',
      name: 'Tài khoản chính',
      apiKey: '',
      model: 'gemini-3.8-flash',
      thinkingLevel: 'medium',
      status: 'untested',
      lastChecked: null,
      lastError: null,
      availableModels: []
    },
    {
      id: 'prof_' + (Date.now() + 1) + '_2',
      name: 'Tài khoản phụ 1',
      apiKey: '',
      model: 'gemini-3.8-flash',
      thinkingLevel: 'medium',
      status: 'untested',
      lastChecked: null,
      lastError: null,
      availableModels: []
    }
  ];
}

function loadProfilesAndSettings() {
  try {
    const savedProfiles = localStorage.getItem('fastexam_profiles');
    if (savedProfiles) {
      try {
        state.profiles = JSON.parse(savedProfiles);
      } catch (_) {
        state.profiles = [];
      }
    }

    if (!state.profiles || state.profiles.length === 0) {
      const legacyKey = (localStorage.getItem('fastexam_api_key') || '').trim();
      const legacyModel = (localStorage.getItem('fastexam_model') || 'gemini-3.8-flash').trim();
      const legacyThinking = localStorage.getItem('fastexam_thinking_level') || 'medium';

      const defaults = createDefaultProfiles();
      if (legacyKey) {
        defaults[0].apiKey = legacyKey;
        defaults[0].model = legacyModel;
        defaults[0].thinkingLevel = ['low', 'medium', 'high'].includes(legacyThinking) ? legacyThinking : 'medium';
      }
      state.profiles = defaults;
      saveProfiles();
    }

    const savedMode = localStorage.getItem('fastexam_mode');
    state.mode = (savedMode === 'lookup' || savedMode === 'cross_check') ? savedMode : 'cross_check';

    const savedLookup = localStorage.getItem('fastexam_lookup_profile');
    const savedSolver = localStorage.getItem('fastexam_solver_profile');
    const savedVerifier = localStorage.getItem('fastexam_verifier_profile');
    const savedArbitrator = localStorage.getItem('fastexam_arbitrator_profile');

    const profileIds = state.profiles.map(p => p.id);
    state.lookupProfileId = profileIds.includes(savedLookup) ? savedLookup : (profileIds[0] || '');
    state.solverProfileId = profileIds.includes(savedSolver) ? savedSolver : (profileIds[0] || '');
    state.verifierProfileId = profileIds.includes(savedVerifier) ? savedVerifier : (profileIds[1] || profileIds[0] || '');
    state.arbitratorProfileId = profileIds.includes(savedArbitrator) ? savedArbitrator : '';

    renderProfilesList();
    renderProfilePickers();
    updateHeaderBadges();
  } catch (err) {
    console.warn('Lỗi đọc cấu hình từ localStorage:', err);
  }
}

function saveProfiles() {
  localStorage.setItem('fastexam_profiles', JSON.stringify(state.profiles));
  updateHeaderBadges();
  renderProfilesList();
  renderProfilePickers();
}

function saveModeAndAssignments() {
  localStorage.setItem('fastexam_mode', state.mode);
  localStorage.setItem('fastexam_lookup_profile', state.lookupProfileId);
  localStorage.setItem('fastexam_solver_profile', state.solverProfileId);
  localStorage.setItem('fastexam_verifier_profile', state.verifierProfileId);
  localStorage.setItem('fastexam_arbitrator_profile', state.arbitratorProfileId);
  updateHeaderBadges();
  updateResultBanner();
}

function getProfileById(id) {
  return state.profiles.find(p => p.id === id) || null;
}

function maskApiKey(key) {
  if (!key) return '(Chưa nhập key)';
  if (key.length <= 8) return '••••••••';
  return '••••' + key.slice(-4);
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}`;
}

// ==========================================
// 3. Profiles UI & Picker Rendering
// ==========================================
function updateHeaderBadges() {
  const activeProfilesCount = state.profiles.filter(p => Boolean(p.apiKey && p.apiKey.trim())).length;
  if (elements.apiKeyStatusBadge) {
    elements.apiKeyStatusBadge.textContent = `${activeProfilesCount}`;
    elements.apiKeyStatusBadge.title = `${activeProfilesCount} API Profile đã có key`;
  }

  if (elements.activeModelBadge) {
    if (state.mode === 'lookup') {
      const prof = getProfileById(state.lookupProfileId);
      elements.activeModelBadge.textContent = prof ? `${prof.model.replace(/^gemini-/, '')}` : 'Chỉ tra';
    } else {
      const p1 = getProfileById(state.solverProfileId);
      elements.activeModelBadge.textContent = p1 ? `Chéo • ${p1.model.replace(/^gemini-/, '')}` : 'Kiểm tra chéo';
    }
  }
}

function updateModeUI() {
  if (state.mode === 'lookup') {
    elements.btnModeLookup.classList.add('active');
    elements.btnModeCrossCheck.classList.remove('active');
    elements.panelLookupProfiles.style.display = 'block';
    elements.panelCrossProfiles.style.display = 'none';
  } else {
    elements.btnModeLookup.classList.remove('active');
    elements.btnModeCrossCheck.classList.add('active');
    elements.panelLookupProfiles.style.display = 'none';
    elements.panelCrossProfiles.style.display = 'block';
  }
  updateHeaderBadges();
  updateResultBanner();
}

function renderProfilePickers() {
  const optionsHtml = state.profiles.map(p => {
    const statusDot = p.status === 'ready' ? '🟢' : p.status === 'rate_limited' ? '🟡' : p.status === 'error' ? '🔴' : '⚪';
    const keyHint = p.apiKey ? maskApiKey(p.apiKey) : 'Chưa có key';
    return `<option value="${p.id}">${statusDot} ${escapeHtml(p.name)} (${p.model.replace(/^gemini-/, '')} • ${keyHint})</option>`;
  }).join('');

  if (elements.selectLookupProfile) {
    elements.selectLookupProfile.innerHTML = optionsHtml || '<option value="">(Chưa có profile)</option>';
    if (state.lookupProfileId) elements.selectLookupProfile.value = state.lookupProfileId;
    const current = getProfileById(elements.selectLookupProfile.value);
    if (elements.badgeLookupModel && current) {
      elements.badgeLookupModel.textContent = `${current.model} • ${current.thinkingLevel.toUpperCase()}`;
    }
  }

  if (elements.selectCrossSolver) {
    elements.selectCrossSolver.innerHTML = optionsHtml || '<option value="">(Chưa có profile)</option>';
    if (state.solverProfileId) elements.selectCrossSolver.value = state.solverProfileId;
  }

  if (elements.selectCrossVerifier) {
    elements.selectCrossVerifier.innerHTML = optionsHtml || '<option value="">(Chưa có profile)</option>';
    if (state.verifierProfileId) elements.selectCrossVerifier.value = state.verifierProfileId;
  }

  if (elements.selectCrossArbitrator) {
    const arbitratorOptions = '<option value="">-- Không dùng (Báo lệch & cho bấm kiểm tra lại) --</option>' + optionsHtml;
    elements.selectCrossArbitrator.innerHTML = arbitratorOptions;
    elements.selectCrossArbitrator.value = state.arbitratorProfileId || '';
  }
}

function renderProfilesList() {
  const container = elements.profilesListContainer;
  if (!container) return;

  if (state.profiles.length === 0) {
    container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-dim); font-size: 0.85rem;">Chưa có API Profile nào. Hãy bấm "+ Thêm Profile" để tạo mới!</div>';
    return;
  }

  container.innerHTML = state.profiles.map((p) => {
    const statusMap = {
      ready: { label: '● Khả dụng (200 OK)', cls: 'status-ready' },
      rate_limited: { label: '● Chạm hạn mức (429)', cls: 'status-rate_limited' },
      error: { label: '● Lỗi xác thực / Quyền', cls: 'status-error' },
      untested: { label: '● Chưa kiểm tra', cls: 'status-untested' }
    };
    const s = statusMap[p.status] || statusMap.untested;
    const lastCheckedText = p.lastChecked ? `Kiểm tra: ${formatTimestamp(p.lastChecked)}` : 'Chưa kiểm tra';

    return `
      <div class="profile-item-card" id="profile-card-${p.id}">
        <div class="profile-card-top">
          <div class="profile-name-tag">
            <span>👤 ${escapeHtml(p.name)}</span>
          </div>
          <span class="profile-status-badge ${s.cls}">${s.label}</span>
        </div>

        <div class="profile-card-details">
          <span>Key: ${maskApiKey(p.apiKey)}</span>
          <span>•</span>
          <span>Model: ${escapeHtml(p.model)}</span>
          <span>•</span>
          <span>Thinking: ${p.thinkingLevel.toUpperCase()}</span>
        </div>

        ${p.lastError ? `<div class="profile-card-error">⚠ ${escapeHtml(p.lastError)}</div>` : ''}

        <div class="profile-card-actions">
          <span style="margin-right: auto; font-size: 0.72rem; color: var(--text-dim);">${lastCheckedText}</span>
          <button type="button" class="btn-action-sm btn-test-profile" data-id="${p.id}" title="Gửi request test key">
            🔍 Test API
          </button>
          <button type="button" class="btn-action-sm btn-edit-profile" data-id="${p.id}" title="Chỉnh sửa profile">
            ✏ Sửa
          </button>
          <button type="button" class="btn-action-sm btn-action-danger btn-del-profile" data-id="${p.id}" title="Xóa profile">
            🗑 Xóa
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-test-profile').forEach(btn => {
    btn.addEventListener('click', () => runProfileTest(btn.dataset.id));
  });
  container.querySelectorAll('.btn-edit-profile').forEach(btn => {
    btn.addEventListener('click', () => openEditProfileForm(btn.dataset.id));
  });
  container.querySelectorAll('.btn-del-profile').forEach(btn => {
    btn.addEventListener('click', () => deleteProfile(btn.dataset.id));
  });
}

function openAddProfileForm() {
  elements.editProfileId.value = '';
  elements.profileFormTitle.textContent = 'Thêm API Profile Mới';
  elements.inputProfileName.value = `Tài khoản phụ ${state.profiles.length}`;
  elements.inputProfileKey.value = '';
  elements.inputProfileModel.value = 'gemini-3.8-flash';
  elements.inputCustomModel.value = '';
  elements.inputCustomModel.classList.add('hidden');
  elements.inputProfileThinking.value = 'medium';
  elements.testKeyFeedback.className = 'test-feedback hidden';
  elements.testKeyFeedback.textContent = '';
  elements.profileFormBox.classList.remove('hidden');
  elements.inputProfileKey.focus();
}

function openEditProfileForm(profileId) {
  const p = getProfileById(profileId);
  if (!p) return;

  elements.editProfileId.value = p.id;
  elements.profileFormTitle.textContent = `Chỉnh Sửa: ${p.name}`;
  elements.inputProfileName.value = p.name;
  elements.inputProfileKey.value = p.apiKey;

  const modelExists = Array.from(elements.inputProfileModel.options).some(opt => opt.value === p.model);
  if (modelExists) {
    elements.inputProfileModel.value = p.model;
    elements.inputCustomModel.classList.add('hidden');
  } else {
    elements.inputProfileModel.value = 'custom';
    elements.inputCustomModel.value = p.model;
    elements.inputCustomModel.classList.remove('hidden');
  }

  elements.inputProfileThinking.value = p.thinkingLevel || 'medium';
  elements.testKeyFeedback.className = 'test-feedback hidden';
  elements.testKeyFeedback.textContent = '';
  elements.profileFormBox.classList.remove('hidden');
}

function closeProfileForm() {
  elements.profileFormBox.classList.add('hidden');
}

function saveProfileFormData() {
  const name = (elements.inputProfileName.value || '').trim() || 'API Profile';
  const apiKey = (elements.inputProfileKey.value || '').trim();
  const selectedModel = elements.inputProfileModel.value === 'custom'
    ? (elements.inputCustomModel.value || '').trim() || 'gemini-3.8-flash'
    : elements.inputProfileModel.value;
  const thinking = elements.inputProfileThinking.value || 'medium';
  const editId = elements.editProfileId.value;

  if (editId) {
    const p = getProfileById(editId);
    if (p) {
      p.name = name;
      p.apiKey = apiKey;
      p.model = selectedModel;
      p.thinkingLevel = thinking;
      p.status = 'untested';
      p.lastError = null;
    }
  } else {
    const newProfile = {
      id: 'prof_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name,
      apiKey,
      model: selectedModel,
      thinkingLevel: thinking,
      status: 'untested',
      lastChecked: null,
      lastError: null,
      availableModels: []
    };
    state.profiles.push(newProfile);
  }

  saveProfiles();
  closeProfileForm();
  showToast(`Đã lưu profile "${name}"!`, 'success');
}

function deleteProfile(id) {
  if (state.profiles.length <= 1) {
    showToast('Phải giữ lại ít nhất 1 API Profile.', 'error');
    return;
  }
  const p = getProfileById(id);
  if (!confirm(`Bạn có chắc chắn muốn xóa profile "${p?.name || id}" không?`)) return;

  state.profiles = state.profiles.filter(item => item.id !== id);
  if (state.lookupProfileId === id) state.lookupProfileId = state.profiles[0].id;
  if (state.solverProfileId === id) state.solverProfileId = state.profiles[0].id;
  if (state.verifierProfileId === id) state.verifierProfileId = state.profiles[1]?.id || state.profiles[0].id;
  if (state.arbitratorProfileId === id) state.arbitratorProfileId = '';

  saveProfiles();
  saveModeAndAssignments();
  showToast('Đã xóa profile.', 'info');
}

// ==========================================
// 4. Test API Key & Fetch Live Models
// ==========================================
async function testApiKeyCall(apiKey) {
  if (!apiKey) {
    throw new Error('Vui lòng nhập API key trước khi kiểm tra.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url).catch(() => {
    throw new Error('Không thể kết nối tới Google Generative Language API. Kiểm tra mạng.');
  });

  if (resp.status === 429) {
    throw new Error('API này đang chạm giới hạn sử dụng (429).');
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('API key này không hoạt động hoặc không có quyền truy cập model đã chọn (401/403).');
  }
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Lỗi API (${resp.status}): ${resp.statusText}`);
  }

  const data = await resp.json();
  const models = (data.models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .filter(name => /gemini/i.test(name));

  return models;
}

async function runProfileTest(profileId) {
  const p = getProfileById(profileId);
  if (!p) return;
  if (!p.apiKey) {
    showToast(`Profile "${p.name}" chưa có API key để kiểm tra.`, 'error');
    openEditProfileForm(profileId);
    return;
  }

  showToast(`Đang kiểm tra kết nối cho "${p.name}"...`, 'info');
  try {
    const models = await testApiKeyCall(p.apiKey);
    p.status = 'ready';
    p.lastChecked = new Date().toISOString();
    p.lastError = null;
    p.availableModels = models;
    saveProfiles();
    showToast(`✓ API "${p.name}" hoạt động tốt! Tìm thấy ${models.length} model.`, 'success');
  } catch (err) {
    if (/429|chạm giới hạn/i.test(err.message)) {
      p.status = 'rate_limited';
      p.lastError = 'API này đang chạm giới hạn sử dụng.';
    } else {
      p.status = 'error';
      p.lastError = err.message || 'API key không hoạt động.';
    }
    p.lastChecked = new Date().toISOString();
    saveProfiles();
    showToast(`✕ Lỗi: ${err.message}`, 'error');
  }
}

async function testFormKey() {
  const apiKey = (elements.inputProfileKey.value || '').trim();
  const feedback = elements.testKeyFeedback;
  feedback.className = 'test-feedback';
  feedback.textContent = 'Đang kiểm tra kết nối API...';
  feedback.classList.remove('hidden');

  try {
    const models = await testApiKeyCall(apiKey);
    feedback.className = 'test-feedback success';
    feedback.textContent = `✓ API Key hợp lệ! Tìm thấy ${models.length} models khả dụng từ Google.`;

    if (models.length > 0) {
      const currentSelected = elements.inputProfileModel.value;
      const combined = Array.from(new Set([...DEFAULT_MODELS.map(m => m.id), ...models]));
      elements.inputProfileModel.innerHTML = combined.map(mId => {
        return `<option value="${mId}">${mId}</option>`;
      }).join('') + '<option value="custom">Tự nhập model khác...</option>';

      if (combined.includes(currentSelected)) {
        elements.inputProfileModel.value = currentSelected;
      } else if (models.includes('gemini-3.8-flash')) {
        elements.inputProfileModel.value = 'gemini-3.8-flash';
      }
    }
  } catch (err) {
    feedback.className = 'test-feedback error';
    feedback.textContent = `✕ ${err.message}`;
  }
}

// ==========================================
// 5. Result Banner & Stats UI
// ==========================================
function updateResultBanner() {
  if (!elements.resultStatusBanner) return;

  if (state.questions.length === 0) {
    elements.resultStatusBanner.classList.add('hidden');
    return;
  }
  elements.resultStatusBanner.classList.remove('hidden');

  if (state.mode === 'lookup') {
    elements.bannerModeText.textContent = 'Chế độ: ✓ Chỉ tra (Siêu tốc 1 lượt)';
    const p = getProfileById(state.lookupProfileId);
    elements.bannerProfilesRow.innerHTML = `
      <span class="banner-profile-chip">API Giải: <b>${escapeHtml(p?.name || 'Chưa chọn')}</b> (${p?.model || '3.8 Flash'})</span>
    `;
  } else {
    elements.bannerModeText.textContent = 'Chế độ: ✓ Kiểm tra chéo (Song song 2 lượt độc lập)';
    const p1 = getProfileById(state.solverProfileId);
    const p2 = getProfileById(state.verifierProfileId);
    const p3 = getProfileById(state.arbitratorProfileId);

    let html = `
      <span class="banner-profile-chip">1. Giải: <b>${escapeHtml(p1?.name || 'Tài khoản 1')}</b> (${p1?.model || '3.8 Flash'})</span>
      <span class="banner-profile-chip">2. Kiểm tra: <b>${escapeHtml(p2?.name || 'Tài khoản 2')}</b> (${p2?.model || '3.8 Flash'})</span>
    `;
    if (p3) {
      html += `<span class="banner-profile-chip">3. Phân xử: <b>${escapeHtml(p3.name)}</b> (${p3.model})</span>`;
    } else {
      html += `<span class="banner-profile-chip" style="opacity: 0.7;">3. Phân xử: Tự kiểm tra câu lệch</span>`;
    }
    elements.bannerProfilesRow.innerHTML = html;
  }

  elements.bannerProgressText.textContent = state.currentProcessStage;
  elements.bannerRequestStats.textContent = `Request đã dùng: ${state.requestStats.run}`;
}

function updateRequestStatsDisplay() {
  updateResultBanner();
  const r = state.requestStats;
  let breakdown = '';
  if (state.mode === 'lookup') {
    breakdown = `Chỉ tra: ${r.lookupPass}`;
  } else {
    breakdown = `Lượt 1: ${r.firstPass} • Lượt 2: ${r.secondPass}${r.arbitration ? ` • Phân xử: ${r.arbitration}` : ''}`;
  }
  if (r.singleRechecks) breakdown += ` • Câu lẻ: ${r.singleRechecks}`;
  if (r.retries) breakdown += ` • Retry: ${r.retries}`;

  const summary = `Request đã dùng: ${r.run} (${breakdown})`;
  if (elements.bannerRequestStats) elements.bannerRequestStats.textContent = summary;
}

function resetRequestStats() {
  state.requestStats = {
    run: 0,
    lookupPass: 0,
    firstPass: 0,
    secondPass: 0,
    arbitration: 0,
    singleRechecks: 0,
    retries: 0,
    batches: 0,
    lastStatus: ''
  };
  updateRequestStatsDisplay();
}

function registerRequest(kind) {
  state.requestStats.run += 1;
  if (kind === 'lookup') state.requestStats.lookupPass += 1;
  if (kind === 'first') state.requestStats.firstPass += 1;
  if (kind === 'second') state.requestStats.secondPass += 1;
  if (kind === 'arbitration') state.requestStats.arbitration += 1;
  if (kind === 'single') state.requestStats.singleRechecks += 1;
  updateRequestStatsDisplay();
}

// ==========================================
// 6. Prompts & Structured JSON Schema (Độ chính xác cao)
// ==========================================
function supportsThinkingLevel(model) {
  return /^gemini-3(?:\.1|\.5|\.6|\.7|\.8)?-.+/i.test(model || '') && /flash/i.test(model || '');
}

const RESPONSE_SCHEMA_TEMPLATE = {
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
          number: { type: 'integer', description: 'Số thứ tự câu hỏi' },
          question: { type: 'string', description: 'Toàn bộ nội dung câu hỏi, không thêm nhãn Câu N:.' },
          answer_letter: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], description: 'Chữ cái của phương án đúng duy nhất.' },
          answer_text: { type: 'string', description: 'Toàn bộ nội dung của phương án đúng.' }
        },
        required: ['question', 'answer_letter', 'answer_text']
      }
    }
  },
  required: ['questions']
};

function getSystemPrompt() {
  return `Bạn là chuyên gia giải trắc nghiệm dựa trên hình ảnh, ưu tiên độ chính xác tuyệt đối.

Có nhiều hình ảnh, mỗi hình ảnh tương ứng với một câu hỏi. Hãy đọc kỹ toàn bộ câu hỏi và tất cả phương án A, B, C, D (hoặc A-H) trong từng ảnh.
Tự giải bằng kiến thức chuyên môn chuẩn xác trước khi kết luận. Không suy diễn khi ảnh không đủ rõ.

BẮT BUỘC trả JSON theo schema được cung cấp. Số phần tử questions phải đúng bằng số ảnh được gửi.
Mỗi phần tử tương ứng đúng theo THỨ TỰ ẢNH:
- question: chép lại toàn bộ nội dung câu hỏi, không thêm nhãn “Câu 1:” ở đầu.
- answer_letter: chỉ một chữ cái duy nhất (A, B, C, D...) là phương án đúng.
- answer_text: chép đầy đủ nội dung của phương án đúng, không chỉ chữ cái.

Hãy tự kiểm tra lại từng câu trước khi trả JSON. Không trả markdown, không trả lời ngoài JSON.`;
}

function getIndependentCheckPrompt(count) {
  return `Bạn là người kiểm tra ĐỘC LẬP cho ${count} câu trắc nghiệm từ hình ảnh (LƯỢT 2).

Hãy đọc toàn bộ ảnh và TỰ GIẢI LẠI từ đầu. Không có đáp án lượt trước để tham khảo và tuyệt đối không được dựa vào suy đoán.
Đối với từng ảnh, xác định chính xác câu hỏi, các phương án và phương án đúng.

BẮT BUỘC trả JSON theo schema được cung cấp, đúng ${count} phần tử và đúng thứ tự ảnh:
- question: toàn bộ nội dung câu hỏi, không thêm “Câu N:” ở đầu.
- answer_letter: một chữ cái phương án đúng (A, B, C, D...).
- answer_text: toàn bộ nội dung phương án đúng.

Không trả markdown hay lời giải thích ngoài JSON.`;
}

function getArbitrationPrompt(conflicts) {
  const candidates = conflicts.map((c, i) => {
    return `Câu ${i + 1}:
Lượt 1: ${c.first.answer_letter}. ${c.first.answer_text}
Lượt 2: ${c.second.answer_letter}. ${c.second.answer_text}
Câu hỏi ghi nhận: ${c.first.question || c.second.question || '(xem ảnh)'}`;
  }).join('\n\n');

  return `Bạn là người PHÂN XỬ cuối cùng cho các câu trắc nghiệm mà hai lượt giải độc lập không thống nhất.

Hãy xem lại trực tiếp hình ảnh của từng câu bên dưới, đọc lại toàn bộ đề và các phương án, sau đó tự suy luận bằng kiến thức chuyên môn.
Không được chọn theo đa số một cách máy móc. Phải dựa vào nội dung trong ảnh và kiến thức đúng.

${candidates}

BẮT BUỘC trả JSON theo schema được cung cấp, đúng ${conflicts.length} phần tử và đúng thứ tự ảnh được gửi:
- question: toàn bộ câu hỏi.
- answer_letter: chữ cái đáp án cuối cùng (A, B, C, D...).
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

// ==========================================
// 7. Robust Gemini API Transport (High Speed & Smart Output)
// ==========================================
function getGenerationConfig(imageCount, profile) {
  const schema = {
    ...RESPONSE_SCHEMA_TEMPLATE,
    properties: {
      questions: {
        ...RESPONSE_SCHEMA_TEMPLATE.properties.questions,
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
    // Tokens vừa đủ để không bị delay streaming
    maxOutputTokens: Math.min(14000, Math.max(2500, 650 + imageCount * 800))
  };

  const model = profile?.model || 'gemini-3.8-flash';
  if (supportsThinkingLevel(model)) {
    // Tôn trọng thiết lập Thinking Level của profile để tăng tốc
    const thinkingLevel = (state.mode === 'cross_check' && (!profile.thinkingLevel || profile.thinkingLevel === 'high'))
      ? 'high'
      : (profile.thinkingLevel || 'medium');
    config.thinkingConfig = { thinkingLevel };
  }

  return config;
}

async function callGeminiApiForProfile(profile, images, prompt, kind, retryCount = 0) {
  if (!profile || !profile.apiKey) {
    const pName = profile?.name || 'Tài khoản';
    throw new Error(`Profile "${pName}" chưa có API key. Vui lòng vào Cài đặt để nhập key.`);
  }

  const model = profile.model || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const payload = {
    contents: [{ role: 'user', parts: buildParts(images, prompt) }],
    generationConfig: getGenerationConfig(images.length, profile)
  };

  registerRequest(kind);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': profile.apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const apiMsg = data.error?.message || response.statusText || 'Lỗi không xác định';

      if (response.status === 429) {
        profile.status = 'rate_limited';
        profile.lastError = 'API này đang chạm giới hạn sử dụng.';
        saveProfiles();
        throw new Error(`API "${profile.name}" đang chạm giới hạn sử dụng (429).`);
      }

      if (response.status === 401 || response.status === 403) {
        profile.status = 'error';
        profile.lastError = 'API key này không hoạt động hoặc không có quyền truy cập model đã chọn.';
        saveProfiles();
        throw new Error(`API key của "${profile.name}" không hoạt động hoặc không có quyền truy cập model đã chọn (${response.status}).`);
      }

      if (response.status === 413) {
        throw new Error('PAYLOAD_413_TOO_LARGE');
      }

      if (response.status === 400) {
        profile.status = 'error';
        saveProfiles();
        throw new Error(`Yêu cầu không hợp lệ cho "${profile.name}" (400): ${apiMsg}`);
      }

      if ([500, 502, 503, 504].includes(response.status) && retryCount < 2) {
        state.requestStats.retries += 1;
        updateRequestStatsDisplay();
        const waitMs = 1200 * Math.pow(2, retryCount) + Math.floor(Math.random() * 300);
        await delay(waitMs);
        return callGeminiApiForProfile(profile, images, prompt, kind, retryCount + 1);
      }

      throw new Error(`Google API (${response.status}): ${apiMsg}`);
    }

    const rawText = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!rawText.trim()) {
      throw new Error(`Gemini (${profile.name}) không trả về nội dung kết quả.`);
    }

    profile.status = 'ready';
    profile.lastError = null;
    return rawText.trim();
  } catch (err) {
    if (err.message === 'PAYLOAD_413_TOO_LARGE') throw err;

    const msg = err?.message || '';
    const isNetwork = /Failed to fetch|NetworkError|network|timeout|Load failed/i.test(msg);
    const isDomainError = /API này đang chạm|không hoạt động|Yêu cầu không hợp lệ/i.test(msg);

    if (isNetwork && !isDomainError && retryCount < 2) {
      state.requestStats.retries += 1;
      updateRequestStatsDisplay();
      const waitMs = 1000 * Math.pow(2, retryCount);
      await delay(waitMs);
      return callGeminiApiForProfile(profile, images, prompt, kind, retryCount + 1);
    }
    throw err;
  }
}

// ==========================================
// 8. Output Normalization & Strict SEB Format
// ==========================================
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
    const validLetter = /^[A-H]$/.test(letter) ? letter : '?';
    const rawQ = String(item.question || '').replace(/^Câu\s*(?:hỏi\s*)?\d+\s*:\s*/i, '').trim();
    const rawA = String(item.answer_text || '').replace(/^[A-H]\s*[\.):]\s*/i, '').trim();

    return {
      number: i + 1,
      questionText: rawQ || 'Không đọc được câu hỏi',
      answerLetter: validLetter,
      answerText: rawA || 'Chưa xác định được đáp án',
      letter: validLetter
    };
  });
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

  return Array.from({ length: count }, (_, i) => {
    const chunk = chunks[i] || '';
    const match = chunk.match(/\b([A-H])\s*[\.):]/i);
    const letter = match ? match[1].toUpperCase() : '?';
    const qMatch = chunk.match(/^Câu\s*(?:hỏi\s*)?\d+\s*:\s*(.*?)(?=\n[A-H]\s*[\.):]|$)/is);
    const qText = qMatch ? qMatch[1].trim() : chunk.replace(/\b[A-H]\s*[\.):].*/s, '').trim();
    const aText = chunk.replace(/^.*?\b[A-H]\s*[\.):]\s*/s, '').trim();

    return {
      number: i + 1,
      questionText: qText || 'Không đọc được câu hỏi',
      answerLetter: letter,
      answerText: aText || 'Chưa xác định được đáp án',
      letter
    };
  });
}

function cleanQuestionLine(rawQuestion, index) {
  let qText = String(rawQuestion || '').trim();
  qText = qText.replace(/^Câu\s*(?:hỏi\s*)?\d+\s*:\s*/i, '').trim();
  return `Câu ${index + 1}: ${qText || '(Không đọc được câu hỏi)'}`;
}

function cleanAnswerLine(letter, answerText) {
  const l = String(letter || '').trim().toUpperCase();
  const validLetter = /^[A-H]$/.test(l) ? l : '?';
  let text = String(answerText || '').trim();
  text = text.replace(/^[A-H]\s*[\.):]\s*/i, '').trim();

  if (validLetter === '?') {
    return text ? `? ${text}` : 'Chưa xác định được đáp án';
  }
  return text ? `${validLetter}. ${text}` : `${validLetter}.`;
}

// ==========================================
// 9. Adaptive Payload Budget & Image Batching
// ==========================================
function estimatePayloadBytes(images) {
  const base64Bytes = images.reduce((sum, q) => sum + String(q.base64 || '').length, 0);
  return base64Bytes + 15000;
}

async function fitImagesWithinBudget(images) {
  const targetBytes = state.maxInlineRequestBytes || 18_500_000;
  if (estimatePayloadBytes(images) <= targetBytes) return true;

  const qualitySteps = [
    { maxDim: 1600, quality: 0.82 },
    { maxDim: 1400, quality: 0.74 },
    { maxDim: 1200, quality: 0.65 },
    { maxDim: 1000, quality: 0.55 },
    { maxDim: 880,  quality: 0.48 }
  ];

  for (const step of qualitySteps) {
    for (const q of images) {
      await recompressImage(q, step.maxDim, step.quality);
    }
    if (estimatePayloadBytes(images) <= targetBytes) return true;
  }
  return false;
}

function recompressImage(q, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
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

async function splitImagesIntoBatches(images) {
  const maxPerBatch = state.maxImagesPerRequest || 15;
  const batches = [];
  let current = [];

  for (const img of images) {
    if (current.length >= maxPerBatch) {
      await fitImagesWithinBudget(current);
      batches.push(current);
      current = [];
    }

    const testCandidate = [...current, img];
    const fits = await fitImagesWithinBudget(testCandidate);

    if (fits && testCandidate.length <= maxPerBatch) {
      current = testCandidate;
    } else {
      if (current.length > 0) {
        await fitImagesWithinBudget(current);
        batches.push(current);
        current = [img];
        await fitImagesWithinBudget(current);
      } else {
        current = [img];
        await fitImagesWithinBudget(current);
        batches.push(current);
        current = [];
      }
    }
  }

  if (current.length > 0) {
    await fitImagesWithinBudget(current);
    batches.push(current);
  }

  return batches;
}

// ==========================================
// 10. Main Solver Engine (Parallel Cross-Check)
// ==========================================
async function solveAllQuestions() {
  if (state.questions.length === 0) return;

  if (state.mode === 'lookup') {
    const solver = getProfileById(state.lookupProfileId);
    if (!solver || !solver.apiKey) {
      elements.settingsModal.classList.remove('hidden');
      showToast('Vui lòng chọn Profile có API key hợp lệ trong chế độ Chỉ tra.', 'error');
      return;
    }
  } else {
    const p1 = getProfileById(state.solverProfileId);
    const p2 = getProfileById(state.verifierProfileId);
    if (!p1 || !p1.apiKey || !p2 || !p2.apiKey) {
      elements.settingsModal.classList.remove('hidden');
      showToast('Chế độ Kiểm tra chéo cần cấu hình cả API 1 (Giải) và API 2 (Kiểm tra).', 'error');
      return;
    }
  }

  const pendingQuestions = state.questions.filter(q => q.status !== 'done');
  if (pendingQuestions.length === 0) {
    showToast('Tất cả câu hỏi đã được giải hoàn tất.', 'success');
    return;
  }

  if (!state.timer.isRunning) toggleTimer();
  elements.btnSolveAll.disabled = true;
  if (elements.btnMobileSolve) elements.btnMobileSolve.disabled = true;

  pendingQuestions.forEach(q => {
    q.status = 'loading';
    renderQuestionCard(q);
  });
  renderMatrix();
  resetRequestStats();

  try {
    const batches = await splitImagesIntoBatches(pendingQuestions);
    state.requestStats.batches = batches.length;
    updateRequestStatsDisplay();

    let globalStartIndex = 0;

    for (let bIndex = 0; bIndex < batches.length; bIndex++) {
      const batch = batches[bIndex];
      const batchLabel = batches.length > 1 ? ` (Batch ${bIndex + 1}/${batches.length})` : '';

      if (state.mode === 'lookup') {
        // ========================================
        // CHẾ ĐỘ 1: CHỈ TRA (Siêu tốc 1 request/batch)
        // ========================================
        const solverProfile = getProfileById(state.lookupProfileId);
        state.currentProcessStage = `⚡ Đang giải siêu tốc ${batch.length} ảnh (${solverProfile.name})${batchLabel}...`;
        updateResultBanner();
        showToast(state.currentProcessStage, 'info');

        const rawResult = await callGeminiApiForProfile(solverProfile, batch, getSystemPrompt(), 'lookup');
        const parsed = normalizeStructuredItems(rawResult, batch.length);

        batch.forEach((q, idx) => {
          const item = parsed[idx] || {};
          const qNum = globalStartIndex + idx;
          q.questionLine = cleanQuestionLine(item.questionText, qNum);
          q.answerLine = cleanAnswerLine(item.answerLetter, item.answerText);
          q.letter = item.answerLetter || '?';
          q.status = q.letter !== '?' ? 'done' : 'warning';
          q.confidence = 'single-pass';
          q.check1 = q.letter;
          q.check2 = null;
          q.check3 = null;
        });

      } else {
        // ========================================
        // CHẾ ĐỘ 2: KIỂM TRA CHÉO SONG SONG (TỐC ĐỘ GẤP 2X)
        // ========================================
        const solverProfile = getProfileById(state.solverProfileId);
        const verifierProfile = getProfileById(state.verifierProfileId);
        const arbitratorProfile = getProfileById(state.arbitratorProfileId);

        state.currentProcessStage = `🚀 Đang chạy song song 2 API: ${solverProfile.name} ✖ ${verifierProfile.name}${batchLabel}...`;
        updateResultBanner();
        showToast(state.currentProcessStage, 'info');

        // BẮT ĐẦU CHẠY CẢ 2 LƯỢT ĐỒNG THỜI BẰNG PROMISE.ALLSETTLED
        const [res1, res2] = await Promise.allSettled([
          callGeminiApiForProfile(solverProfile, batch, getSystemPrompt(), 'first'),
          callGeminiApiForProfile(verifierProfile, batch, getIndependentCheckPrompt(batch.length), 'second')
        ]);

        if (res1.status === 'rejected' && res2.status === 'rejected') {
          throw new Error(`Cả 2 API đều lỗi! Lượt 1: ${res1.reason?.message}; Lượt 2: ${res2.reason?.message}`);
        }

        const firstPass = res1.status === 'fulfilled'
          ? normalizeStructuredItems(res1.value, batch.length)
          : null;

        const secondPass = res2.status === 'fulfilled'
          ? normalizeStructuredItems(res2.value, batch.length)
          : null;

        // Nếu 1 trong 2 lượt lỗi, vẫn giữ kết quả của lượt thành công (Section 12)
        if (!firstPass || !secondPass) {
          const validPass = firstPass || secondPass;
          const failedErr = res1.status === 'rejected' ? res1.reason : res2.reason;
          batch.forEach((q, idx) => {
            const item = validPass[idx] || {};
            const qNum = globalStartIndex + idx;
            q.questionLine = cleanQuestionLine(item.questionText, qNum);
            q.answerLine = cleanAnswerLine(item.answerLetter, item.answerText);
            q.letter = item.answerLetter || '?';
            q.status = q.letter !== '?' ? 'warning' : 'error';
            q.confidence = 'verification-failed';
            q.check1 = firstPass ? firstPass[idx]?.answerLetter : '!';
            q.check2 = secondPass ? secondPass[idx]?.answerLetter : '!';
          });
          showToast(`⚠ Một API gặp lỗi: ${failedErr.message}`, 'error');
          renderQuestions();
          renderMatrix();
          globalStartIndex += batch.length;
          continue;
        }

        // ĐỐI SOÁT LƯỢT 1 VS LƯỢT 2
        state.currentProcessStage = `🔎 Đang đối chiếu 2 kết quả độc lập${batchLabel}...`;
        updateResultBanner();

        const conflicts = [];

        batch.forEach((q, idx) => {
          const f = firstPass[idx] || {};
          const s = secondPass[idx] || {};
          const qNum = globalStartIndex + idx;

          q.check1 = f.answerLetter || '?';
          q.check2 = s.answerLetter || '?';

          const isAgreed = q.check1 !== '?' && q.check1 === q.check2;

          if (isAgreed) {
            // Section 5: ✓ Hai lượt thống nhất
            q.letter = q.check1;
            q.status = 'done';
            q.confidence = 'agreed';
            q.questionLine = cleanQuestionLine(s.questionText || f.questionText, qNum);
            q.answerLine = cleanAnswerLine(q.letter, s.answerText || f.answerText);
          } else {
            // Section 6: ⚠ Hai lượt không thống nhất
            q.letter = '?';
            q.status = 'warning';
            q.confidence = 'conflict';
            q.questionLine = cleanQuestionLine(f.questionText || s.questionText, qNum);
            q.answerLine = `⚠ Lệch đáp án (Lượt 1: ${q.check1} • Lượt 2: ${q.check2})`;

            conflicts.push({
              localIndex: idx,
              question: q,
              first: f,
              second: s
            });
          }
        });

        // PHÂN XỬ LƯỢT 3 (CHỈ GỌI CHO CÁC CÂU LỆCH NẾU CÓ PROFILE 3)
        if (conflicts.length > 0 && arbitratorProfile && arbitratorProfile.apiKey) {
          state.currentProcessStage = `⚖ Đang phân xử ${conflicts.length} câu lệch (${arbitratorProfile.name})${batchLabel}...`;
          updateResultBanner();
          showToast(state.currentProcessStage, 'info');

          try {
            const conflictImages = conflicts.map(c => c.question);
            const rawArbitration = await callGeminiApiForProfile(
              arbitratorProfile,
              conflictImages,
              getArbitrationPrompt(conflicts),
              'arbitration'
            );
            const arbitrationResults = normalizeStructuredItems(rawArbitration, conflictImages.length);

            conflicts.forEach((c, cIdx) => {
              const res = arbitrationResults[cIdx];
              if (res && res.answerLetter && res.answerLetter !== '?') {
                c.question.letter = res.answerLetter;
                c.question.status = 'done';
                c.question.confidence = 'arbitrated';
                c.question.check3 = res.answerLetter;
                c.question.answerLine = cleanAnswerLine(res.answerLetter, res.answerText);
              } else {
                c.question.letter = '?';
                c.question.status = 'warning';
                c.question.confidence = 'uncertain';
                c.question.check3 = '?';
                c.question.answerLine = 'Không xác định chắc chắn';
              }
            });
          } catch (arbErr) {
            console.error('Lỗi phân xử Lượt 3:', arbErr);
            showToast(`Lỗi phân xử: ${arbErr.message}`, 'error');
          }
        }
      }

      renderQuestions();
      renderMatrix();
      globalStartIndex += batch.length;
    }

    state.currentProcessStage = '✓ Đã hoàn tất xử lý';
    updateResultBanner();

    const doneCount = pendingQuestions.filter(q => q.status === 'done').length;
    const conflictCount = pendingQuestions.filter(q => q.status === 'warning').length;
    showToast(
      `Hoàn tất ${doneCount}/${pendingQuestions.length} câu${conflictCount ? ` • ${conflictCount} câu cần xem lại` : ''}`,
      conflictCount ? 'info' : 'success'
    );
  } catch (err) {
    console.error('Lỗi khi giải:', err);
    state.currentProcessStage = `Lỗi: ${err.message}`;
    updateResultBanner();
    showToast(`Không thể hoàn tất: ${err.message}`, 'error');
  } finally {
    elements.btnSolveAll.disabled = false;
    if (elements.btnMobileSolve) elements.btnMobileSolve.disabled = false;
    updateQuestionCounters();
    updateRequestStatsDisplay();
    playCompletionSound();
  }
}

// Section 6: Kiểm tra lại 1 câu lẻ (Chỉ request riêng câu đó)
async function recheckSingleQuestion(q) {
  if (!q) return;

  const card = document.getElementById(`card-${q.id}`);
  if (card) card.classList.add('loading');
  q.status = 'loading';
  renderQuestionCard(q);
  renderMatrix();

  showToast(`Đang kiểm tra lại riêng Câu ${state.questions.indexOf(q) + 1}...`, 'info');

  try {
    const qIndex = state.questions.indexOf(q);

    if (state.mode === 'lookup') {
      const solver = getProfileById(state.lookupProfileId);
      const raw = await callGeminiApiForProfile(solver, [q], getSystemPrompt(), 'single');
      const parsed = normalizeStructuredItems(raw, 1)[0] || {};

      q.questionLine = cleanQuestionLine(parsed.questionText, qIndex);
      q.answerLine = cleanAnswerLine(parsed.answerLetter, parsed.answerText);
      q.letter = parsed.answerLetter || '?';
      q.status = q.letter !== '?' ? 'done' : 'warning';
      q.confidence = 'single-pass';
    } else {
      const solver = getProfileById(state.solverProfileId);
      const verifier = getProfileById(state.verifierProfileId);
      const arbitrator = getProfileById(state.arbitratorProfileId);

      // Chạy song song cả 2 lượt cho câu lẻ này
      const [r1, r2] = await Promise.all([
        callGeminiApiForProfile(solver, [q], getSystemPrompt(), 'single'),
        callGeminiApiForProfile(verifier, [q], getIndependentCheckPrompt(1), 'single')
      ]);

      const f = normalizeStructuredItems(r1, 1)[0] || {};
      const s = normalizeStructuredItems(r2, 1)[0] || {};

      q.check1 = f.answerLetter || '?';
      q.check2 = s.answerLetter || '?';

      if (q.check1 !== '?' && q.check1 === q.check2) {
        q.letter = q.check1;
        q.status = 'done';
        q.confidence = 'agreed';
        q.questionLine = cleanQuestionLine(s.questionText || f.questionText, qIndex);
        q.answerLine = cleanAnswerLine(q.letter, s.answerText || f.answerText);
      } else if (arbitrator && arbitrator.apiKey) {
        const conflict = [{ first: f, second: s, question: q }];
        const raw3 = await callGeminiApiForProfile(arbitrator, [q], getArbitrationPrompt(conflict), 'arbitration');
        const arb = normalizeStructuredItems(raw3, 1)[0] || {};

        if (arb.answerLetter && arb.answerLetter !== '?') {
          q.letter = arb.answerLetter;
          q.status = 'done';
          q.confidence = 'arbitrated';
          q.check3 = arb.answerLetter;
          q.answerLine = cleanAnswerLine(arb.answerLetter, arb.answerText);
        } else {
          q.letter = '?';
          q.status = 'warning';
          q.confidence = 'uncertain';
          q.answerLine = 'Không xác định chắc chắn';
        }
      } else {
        q.letter = '?';
        q.status = 'warning';
        q.confidence = 'conflict';
        q.answerLine = `⚠ Lệch đáp án (Lượt 1: ${q.check1} • Lượt 2: ${q.check2})`;
      }
    }

    showToast(`Đã kiểm tra xong Câu ${state.questions.indexOf(q) + 1}!`, 'success');
  } catch (err) {
    q.status = 'warning';
    showToast(`Lỗi kiểm tra lại: ${err.message}`, 'error');
  } finally {
    renderQuestionCard(q);
    renderMatrix();
    updateQuestionCounters();
    updateRequestStatsDisplay();
  }
}

async function retryFailedQuestions() {
  const failed = state.questions.filter(q => q.status === 'error' || q.status === 'warning' || q.letter === '?');
  if (failed.length === 0) {
    showToast('Không có câu lỗi cần giải lại.', 'success');
    return;
  }

  showToast(`Đang giải lại ${failed.length} câu lỗi...`);
  for (const q of failed) {
    await recheckSingleQuestion(q);
  }
}

// ==========================================
// 11. UI Rendering: Cards & Matrix Bar
// ==========================================
function renderMatrix() {
  const container = elements.matrixGrid;
  if (!container) return;
  container.innerHTML = '';

  if (state.questions.length === 0) {
    container.innerHTML = '<div class="matrix-empty">Chưa có ảnh câu hỏi. Chạm tải ảnh bên dưới!</div>';
    if (elements.matrixStats) elements.matrixStats.textContent = '(0/0)';
    return;
  }

  const doneCount = state.questions.filter(q => q.status === 'done').length;
  if (elements.matrixStats) elements.matrixStats.textContent = `(${doneCount}/${state.questions.length})`;

  state.questions.forEach((q, index) => {
    const item = document.createElement('div');
    item.className = `matrix-item ${q.status}`;
    item.id = `matrix-badge-${q.id}`;
    item.title = `Chạm để tới Câu ${index + 1}`;

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
        setTimeout(() => card.style.outline = 'none', 1400);
      }
    });

    container.appendChild(item);
  });
}

function renderQuestions() {
  const grid = elements.questionsGrid;
  if (!grid) return;
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
  } else if (elements.questionsGrid) {
    elements.questionsGrid.appendChild(newCard);
  }
}

function createQuestionCardElement(q, index) {
  const card = document.createElement('div');
  card.className = `gemini-response-card status-${q.status}`;
  card.id = `card-${q.id}`;

  const statusLabels = {
    idle: 'Chờ giải',
    loading: 'Đang xử lý...',
    done: 'Hoàn tất',
    warning: 'Cần xem lại',
    error: 'Lỗi'
  };

  const displayQ = q.questionLine || cleanQuestionLine(q.name, index);
  const displayA = q.answerLine || (q.status === 'loading' ? '' : 'Chưa có đáp án. Bấm GIẢI để xem.');

  let agreementBadgeHtml = '';
  let conflictBoxHtml = '';

  if (state.mode === 'cross_check') {
    if (q.confidence === 'agreed' || (q.check1 && q.check1 === q.check2 && q.check1 !== '?')) {
      agreementBadgeHtml = `<span class="card-agreement-badge badge-agreed">✓ Hai lượt thống nhất (${q.check1})</span>`;
    } else if (q.confidence === 'arbitrated') {
      agreementBadgeHtml = `<span class="card-agreement-badge badge-arbitrated">⚖ Đã phân xử: ${q.letter}</span>`;
    } else if (q.confidence === 'conflict' || (q.check1 && q.check2 && q.check1 !== q.check2)) {
      agreementBadgeHtml = `<span class="card-agreement-badge badge-conflict">⚠ Lệch: L1 (${q.check1 || '?'}) vs L2 (${q.check2 || '?'})</span>`;
      conflictBoxHtml = `
        <div class="conflict-action-box">
          <div class="conflict-desc">⚠ Lượt 1: <b>${q.check1 || '?'}</b> • Lượt 2: <b>${q.check2 || '?'}</b></div>
          <button type="button" class="btn-recheck-single" data-qid="${q.id}">
            🎯 Kiểm tra lại câu này
          </button>
        </div>
      `;
    }
  }

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
        <button class="btn-card-copy btn-quick-copy" title="Copy câu này">📋</button>
      </div>
    </div>

    <!-- Collapsible Image Section -->
    <div class="card-collapsible-img ${q.isImageOpen ? '' : 'collapsed'}" id="img-box-${q.id}">
      <img src="${q.dataUrl}" alt="Câu hỏi ${index + 1}">
      <div class="card-zoom-badge">Phóng to</div>
    </div>

    <!-- Response Content: Exact Question / Answer Line Format -->
    <div class="card-bubble-content">
      <div class="question-bubble">
        <div class="bubble-tag-q">❓ CÂU HỎI:</div>
        <div class="bubble-text-q">${escapeHtml(displayQ)}</div>
      </div>
      
      <div class="answer-bubble ${q.status === 'done' ? 'ready' : ''}">
        <div class="bubble-tag-a">
          <span>✨ ĐÁP ÁN ĐÚNG:</span>
          ${agreementBadgeHtml}
        </div>
        ${q.status === 'loading'
          ? '<div class="gemini-loading-wave"></div>'
          : `<div class="bubble-text-a">${escapeHtml(displayA)}</div>`
        }
        ${conflictBoxHtml}
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

  imgBox.addEventListener('click', () => {
    elements.zoomModalImage.src = q.dataUrl;
    elements.zoomModalTitle.textContent = `Câu ${index + 1}: ${q.name}`;
    elements.imageZoomModal.classList.remove('hidden');
  });

  const btnQuickCopy = card.querySelector('.btn-quick-copy');
  btnQuickCopy.addEventListener('click', () => {
    const singleText = `${displayQ}\n${displayA}`;
    navigator.clipboard.writeText(singleText).then(() => {
      showToast(`📋 Đã copy Câu ${index + 1}!`, 'success');
    });
  });

  const btnReSolve = card.querySelector('.btn-re-solve');
  btnReSolve.addEventListener('click', () => recheckSingleQuestion(q));

  const btnRecheckSingle = card.querySelector('.btn-recheck-single');
  if (btnRecheckSingle) {
    btnRecheckSingle.addEventListener('click', () => recheckSingleQuestion(q));
  }

  const btnDel = card.querySelector('.btn-del-q');
  btnDel.addEventListener('click', () => {
    state.questions = state.questions.filter(item => item.id !== q.id);
    updateQuestionCounters();
    renderQuestions();
    renderMatrix();
    updateResultBanner();
  });

  return card;
}

// ==========================================
// 12. File Upload & Camera Handler
// ==========================================
async function handleFiles(files, isPasted = false) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (imageFiles.length === 0) {
    showToast('Vui lòng chỉ chọn file hình ảnh (PNG, JPG, JPEG, WEBP)!', 'error');
    return;
  }

  const remainingSlots = state.maxImagesPerRequest - state.questions.length;
  if (remainingSlots <= 0) {
    showToast(`Đã đủ ${state.maxImagesPerRequest} ảnh. Vui lòng giải hoặc xóa bớt trước.`, 'error');
    return;
  }

  const acceptedFiles = imageFiles.slice(0, remainingSlots);
  if (imageFiles.length > acceptedFiles.length) {
    showToast(`Tối đa ${state.maxImagesPerRequest} ảnh/lần. Đã nhận ${acceptedFiles.length} ảnh.`, 'error');
  } else {
    showToast(`Đang xử lý ${acceptedFiles.length} ảnh...`);
  }

  for (let file of acceptedFiles) {
    try {
      const prepared = await prepareImageForUpload(file);
      const newQuestion = {
        id: 'q_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: isPasted ? `Ảnh dán ${state.questions.length + 1}.jpg` : file.name,
        base64: prepared.base64,
        mimeType: prepared.mimeType,
        dataUrl: prepared.dataUrl,
        originalDataUrl: prepared.dataUrl,
        status: 'idle',
        questionLine: '',
        answerLine: '',
        letter: '?',
        confidence: 'pending',
        check1: null,
        check2: null,
        check3: null,
        isImageOpen: false
      };
      state.questions.push(newQuestion);
    } catch (err) {
      console.error('Lỗi đọc ảnh:', err);
    }
  }

  updateQuestionCounters();
  renderQuestions();
  renderMatrix();
  updateResultBanner();
  showToast(`Đã thêm thành công! Tổng cộng: ${state.questions.length} ảnh.`);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function prepareImageForUpload(file) {
  const originalUrl = await readFileAsDataURL(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = originalUrl;
  });

  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(image, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return {
    dataUrl,
    base64: dataUrl.split(',')[1],
    mimeType: 'image/jpeg'
  };
}

function updateQuestionCounters() {
  const total = state.questions.length;
  if (elements.totalQuestionsCount) elements.totalQuestionsCount.textContent = total;
  if (elements.mobileQuestionCount) elements.mobileQuestionCount.textContent = total;
  if (elements.btnSolveAll) elements.btnSolveAll.disabled = total === 0;
  if (elements.btnMobileSolve) elements.btnMobileSolve.disabled = total === 0;
  if (elements.btnExportReport) elements.btnExportReport.disabled = total === 0;

  const failedCount = state.questions.filter(q => q.status === 'error' || q.status === 'warning' || q.letter === '?').length;
  if (elements.btnRetryFailed) elements.btnRetryFailed.disabled = total === 0 || failedCount === 0;
}

function sortQuestionsNatural() {
  if (state.questions.length <= 1) return;

  state.questions.sort((a, b) => {
    const numA = (a.name.match(/\d+/) ? parseInt(a.name.match(/\d+/)[0], 10) : null);
    const numB = (b.name.match(/\d+/) ? parseInt(b.name.match(/\d+/)[0], 10) : null);
    if (numA !== null && numB !== null) return numA - numB;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  renderQuestions();
  renderMatrix();
  showToast('Đã sắp xếp câu hỏi tự nhiên (1 ➔ 15)!', 'success');
}

function clearAllQuestions() {
  if (state.questions.length === 0) return;
  if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ danh sách ảnh?')) return;
  state.questions = [];
  updateQuestionCounters();
  renderQuestions();
  renderMatrix();
  updateResultBanner();
  showToast('Đã xóa hết câu hỏi.');
}

// ==========================================
// 13. Copy & Export Helpers (Exact SEB Format)
// ==========================================
function getFormattedSebText() {
  if (state.questions.length === 0) return '';
  return state.questions.map((q, idx) => {
    const qLine = q.questionLine || cleanQuestionLine(q.name, idx);
    const aLine = q.answerLine || 'Chưa có đáp án';
    return `${qLine}\n${aLine}`;
  }).join('\n\n');
}

function copyAllAnswers() {
  if (state.questions.length === 0) {
    showToast('Chưa có câu hỏi nào để copy!', 'error');
    return;
  }
  const text = getFormattedSebText();
  navigator.clipboard.writeText(text).then(() => {
    showToast(`📋 Đã copy toàn bộ ${state.questions.length} câu theo chuẩn SEB!`, 'success');
  }).catch(() => {
    showToast('Không thể truy cập Clipboard!', 'error');
  });
}

function copyInlineFormat() {
  if (state.questions.length === 0) return;
  const inline = state.questions.map((q, idx) => `${idx + 1}.${q.letter || '?'}`).join('  |  ');
  navigator.clipboard.writeText(inline).then(() => {
    showToast('📋 Đã copy chuỗi ngang!', 'success');
  });
}

function copyLettersOnly() {
  if (state.questions.length === 0) return;
  const letters = state.questions.map(q => q.letter || '?').join(' ');
  navigator.clipboard.writeText(letters).then(() => {
    showToast('🔤 Đã copy dãy chữ cái!', 'success');
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
  a.download = `FastExam_SEB_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Đã tải xuống file .txt!', 'success');
}

// ==========================================
// 14. Demo Generator (15 Sample Questions)
// ==========================================
function loadDemoQuestions() {
  showToast('Đang tạo 15 câu hỏi mẫu chuẩn SEB...');

  const sampleQuestions = [
    { q: 'Đạo hàm của hàm số y = x^3 - 3x^2 + 2 là gì?', a: 'A. y\' = 3x^2 - 6x', l: 'A', c1: 'A', c2: 'A' },
    { q: 'Chu kỳ dao động điều hòa của con lắc đơn tính theo công thức nào?', a: 'B. T = 2π√(l/g)', l: 'B', c1: 'B', c2: 'B' },
    { q: 'Thủy phân este Etyl axetat trong dung dịch NaOH tạo thành muối gì?', a: 'C. CH3COONa', l: 'C', c1: 'C', c2: 'C' },
    { q: 'She ____ in Hanoi for 10 years before moving to Da Nang.', a: 'D. had lived', l: 'D', c1: 'D', c2: 'D' },
    { q: 'Năm 1945, Bác Hồ đọc Tuyên ngôn Độc lập tại quảng trường nào?', a: 'A. Quảng trường Ba Đình', l: 'A', c1: 'A', c2: 'A' },
    { q: 'Độ cao đỉnh núi Fansipan là bao nhiêu mét?', a: 'B. 3.143 m', l: 'B', c1: 'B', c2: 'B' },
    { q: 'Kim loại nào sau đây có khả năng dẫn điện tốt nhất ở điều kiện thường?', a: 'A. Bạc (Ag)', l: 'A', c1: 'A', c2: 'A' },
    { q: 'Đơn vị đo điện trở trong hệ đo lường quốc tế SI là gì?', a: 'C. Ôm (Ω)', l: 'C', c1: 'C', c2: 'C' },
    { q: 'Giá trị của tích phân I = ∫ (0 đến 1) 2x dx bằng bao nhiêu?', a: 'A. 1', l: 'A', c1: 'A', c2: 'A' },
    { q: 'Trong kiến trúc máy tính, 1 Byte tương đương với bao nhiêu Bit?', a: 'B. 8 bit', l: 'B', c1: 'B', c2: 'B' },
    { q: 'Định luật vạn vật hấp dẫn do nhà bác học nào phát minh?', a: 'D. Isaac Newton', l: 'D', c1: 'D', c2: 'D' },
    { q: 'Thủ đô của nước Úc (Australia) là thành phố nào?', a: 'C. Canberra', l: 'C', c1: 'C', c2: 'B', isConflict: true },
    { q: 'Khí nào chiếm tỉ lệ phần trăm thể tích lớn nhất trong không khí?', a: 'A. Nitơ (khoảng 78%)', l: 'A', c1: 'A', c2: 'A' },
    { q: 'Vận tốc ánh sáng truyền trong chân không xấp xỉ bằng bao nhiêu?', a: 'B. 3 x 10^8 m/s', l: 'B', c1: 'B', c2: 'B' },
    { q: 'Từ nào sau đây đồng nghĩa với từ "Crucial"?', a: 'C. Essential', l: 'C', c1: 'C', c2: 'C' }
  ];

  state.questions = sampleQuestions.map((item, idx) => {
    const canvas = document.createElement('canvas');
    canvas.width = 620;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.fillStyle = '#6366f1';
    ctx.fillRect(20, 20, 140, 32);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`ĐỀ THI SEB #${idx + 1}`, 30, 42);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(item.q.length > 52 ? item.q.substring(0, 50) + '...' : item.q, 20, 85);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('A. Phương án 1                 B. Phương án 2', 30, 135);
    ctx.fillText('C. Phương án 3                 D. Phương án 4', 30, 175);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const isConf = Boolean(item.isConflict);

    return {
      id: 'demo_' + (idx + 1),
      name: `cau_${idx + 1}.jpg`,
      base64: dataUrl.split(',')[1],
      mimeType: 'image/jpeg',
      dataUrl: dataUrl,
      originalDataUrl: dataUrl,
      status: isConf ? 'warning' : 'done',
      questionLine: `Câu ${idx + 1}: ${item.q}`,
      answerLine: isConf ? '⚠ Lệch đáp án (Lượt 1: C • Lượt 2: B)' : item.a,
      letter: isConf ? '?' : item.l,
      confidence: isConf ? 'conflict' : 'agreed',
      check1: item.c1,
      check2: item.c2,
      check3: null,
      isImageOpen: false
    };
  });

  updateQuestionCounters();
  renderQuestions();
  renderMatrix();
  updateResultBanner();
  showToast('Đã tải 15 câu mẫu (Câu 12 mô phỏng trường hợp lệch đối soát)!', 'success');
}

// ==========================================
// 15. Exam Timer & Sound FX
// ==========================================
function toggleTimer() {
  if (state.timer.isRunning) pauseTimer();
  else startTimer();
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

  if (state.timer.remainingSeconds <= 3 * 60 && state.timer.remainingSeconds > 0) {
    elements.timerWidget.classList.add('warning');
  } else {
    elements.timerWidget.classList.remove('warning');
  }
}

function playCompletionSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (_) {}
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
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
  }, 3200);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// 16. Event Listeners Setup
// ==========================================
function setupEventListeners() {
  elements.btnStartTimer.addEventListener('click', toggleTimer);
  elements.btnResetTimer.addEventListener('click', resetTimer);

  elements.btnOpenSettings.addEventListener('click', () => {
    renderProfilesList();
    elements.settingsModal.classList.remove('hidden');
  });
  elements.btnCloseSettings.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
  elements.btnCloseSettingsModal.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) elements.settingsModal.classList.add('hidden');
  });

  elements.btnAddNewProfile.addEventListener('click', openAddProfileForm);
  elements.btnCancelProfileForm.addEventListener('click', closeProfileForm);
  elements.btnCancelProfile.addEventListener('click', closeProfileForm);
  elements.btnSaveProfileItem.addEventListener('click', saveProfileFormData);
  elements.btnTestThisKey.addEventListener('click', testFormKey);

  elements.btnToggleKeyVisibility.addEventListener('click', () => {
    const isPass = elements.inputProfileKey.type === 'password';
    elements.inputProfileKey.type = isPass ? 'text' : 'password';
    elements.btnToggleKeyVisibility.textContent = isPass ? '🔒' : '👁';
  });

  elements.inputProfileModel.addEventListener('change', () => {
    if (elements.inputProfileModel.value === 'custom') {
      elements.inputCustomModel.classList.remove('hidden');
      elements.inputCustomModel.focus();
    } else {
      elements.inputCustomModel.classList.add('hidden');
    }
  });

  elements.btnModeLookup.addEventListener('click', () => {
    state.mode = 'lookup';
    saveModeAndAssignments();
    updateModeUI();
  });
  elements.btnModeCrossCheck.addEventListener('click', () => {
    state.mode = 'cross_check';
    saveModeAndAssignments();
    updateModeUI();
  });

  if (elements.selectLookupProfile) {
    elements.selectLookupProfile.addEventListener('change', () => {
      state.lookupProfileId = elements.selectLookupProfile.value;
      const p = getProfileById(state.lookupProfileId);
      if (elements.badgeLookupModel && p) {
        elements.badgeLookupModel.textContent = `${p.model} • ${p.thinkingLevel.toUpperCase()}`;
      }
      saveModeAndAssignments();
    });
  }

  if (elements.selectCrossSolver) {
    elements.selectCrossSolver.addEventListener('change', () => {
      state.solverProfileId = elements.selectCrossSolver.value;
      saveModeAndAssignments();
    });
  }

  if (elements.selectCrossVerifier) {
    elements.selectCrossVerifier.addEventListener('change', () => {
      state.verifierProfileId = elements.selectCrossVerifier.value;
      saveModeAndAssignments();
    });
  }

  if (elements.selectCrossArbitrator) {
    elements.selectCrossArbitrator.addEventListener('change', () => {
      state.arbitratorProfileId = elements.selectCrossArbitrator.value;
      saveModeAndAssignments();
    });
  }

  elements.btnCloseZoom.addEventListener('click', () => elements.imageZoomModal.classList.add('hidden'));
  elements.imageZoomModal.addEventListener('click', (e) => {
    if (e.target === elements.imageZoomModal) elements.imageZoomModal.classList.add('hidden');
  });

  if (elements.btnExportReport) elements.btnExportReport.addEventListener('click', openExportModal);
  if (elements.btnCloseExport) elements.btnCloseExport.addEventListener('click', () => elements.exportModal.classList.add('hidden'));
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
      elements.fileInput.value = '';
    }
  });

  document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items || [];
    const pastedFiles = [];
    for (let item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        pastedFiles.push(item.getAsFile());
      }
    }
    if (pastedFiles.length > 0) {
      handleFiles(pastedFiles, true);
      showToast(`Đã dán ${pastedFiles.length} ảnh từ Clipboard!`, 'success');
    }
  });

  elements.btnSolveAll.addEventListener('click', solveAllQuestions);
  elements.btnSortQuestions.addEventListener('click', sortQuestionsNatural);
  elements.btnRetryFailed.addEventListener('click', retryFailedQuestions);
  elements.btnClearAll.addEventListener('click', clearAllQuestions);
  elements.btnCopyAnswers.addEventListener('click', copyAllAnswers);
  if (elements.btnLoadDemo) elements.btnLoadDemo.addEventListener('click', loadDemoQuestions);

  if (elements.btnMobileSolve) elements.btnMobileSolve.addEventListener('click', solveAllQuestions);
  if (elements.btnMobileCopyAll) elements.btnMobileCopyAll.addEventListener('click', copyAllAnswers);
  if (elements.btnMobileDemo) elements.btnMobileDemo.addEventListener('click', loadDemoQuestions);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      elements.settingsModal.classList.add('hidden');
      elements.imageZoomModal.classList.add('hidden');
      if (elements.exportModal) elements.exportModal.classList.add('hidden');
    }
  });
}

// Start application
window.addEventListener('DOMContentLoaded', init);
