/**
 * FastExam AI v2.0 - Mobile-First SEB Exam Solver
 * - Multi-API Profile Management (BYOK per account/project)
 * - 2 Modes: [ Chỉ Tra ] & [ Kiểm Tra Chéo ]
 * - Lượt 1 & Lượt 2 giải hoàn toàn độc lập từ ảnh gốc (Pass 2 independent)
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
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Khuyên dùng - Ổn định nhất)' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Tốc độ cao)' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Mới - Dễ quá tải 503)' },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' }
];

function getFallbackModel(currentModel) {
  const norm = (currentModel || '').toLowerCase().trim();
  if (norm.includes('3.8') || norm.includes('3.7') || norm.includes('3.6') || norm.includes('3.5')) {
    return 'gemini-2.5-flash';
  }
  if (norm.includes('2.5')) {
    return 'gemini-2.0-flash';
  }
  if (norm.includes('2.0')) {
    return 'gemini-1.5-flash';
  }
  return 'gemini-2.5-flash';
}

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

  maxImagesPerRequest: 8,
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
  // Matrix
  matrixGrid: document.getElementById('matrixGrid'),
  matrixStats: document.getElementById('matrixStats'),

  // Mode Bar
  btnModeLookup: document.getElementById('btnModeLookup'),
  btnModeCrossCheck: document.getElementById('btnModeCrossCheck'),

  // Result Status Banner
  resultStatusBanner: document.getElementById('resultStatusBanner'),
  bannerModeText: document.getElementById('bannerModeText'),
  bannerRequestStats: document.getElementById('bannerRequestStats'),
  bannerProgressText: document.getElementById('bannerProgressText'),

  // Upload & Actions
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  btnSolveAll: document.getElementById('btnSolveAll'),
  btnSortQuestions: document.getElementById('btnSortQuestions'),
  btnRetryFailed: document.getElementById('btnRetryFailed'),
  btnClearAll: document.getElementById('btnClearAll'),
  totalQuestionsCount: document.getElementById('totalQuestionsCount'),
  questionsGrid: document.getElementById('questionsGrid'),

  // Mobile Bottom Bar
  mobileBottomBar: document.getElementById('mobileBottomBar'),
  btnMobileSolve: document.getElementById('btnMobileSolve'),
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
      model: 'gemini-2.5-flash',
      thinkingLevel: 'high',
      status: 'untested', // 'ready' | 'rate_limited' | 'error' | 'untested'
      lastChecked: null,
      lastError: null,
      availableModels: []
    },
    {
      id: 'prof_' + (Date.now() + 1) + '_2',
      name: 'Tài khoản phụ 1',
      apiKey: '',
      model: 'gemini-2.5-flash',
      thinkingLevel: 'high',
      status: 'untested',
      lastChecked: null,
      lastError: null,
      availableModels: []
    }
  ];
}

function loadProfilesAndSettings() {
  try {
    // 1. Load Profiles
    const savedProfiles = localStorage.getItem('fastexam_profiles');
    if (savedProfiles) {
      try {
        state.profiles = JSON.parse(savedProfiles);
      } catch (_) {
        state.profiles = [];
      }
    }

    // Migrate from legacy single-key storage if needed
    if (!state.profiles || state.profiles.length === 0) {
      const legacyKey = (localStorage.getItem('fastexam_api_key') || '').trim();
      const legacyModel = (localStorage.getItem('fastexam_model') || 'gemini-3.8-flash').trim();
      const legacyThinking = localStorage.getItem('fastexam_thinking_level') || 'high';

      const defaults = createDefaultProfiles();
      if (legacyKey) {
        defaults[0].apiKey = legacyKey;
        defaults[0].model = legacyModel;
        defaults[0].thinkingLevel = ['low', 'medium', 'high'].includes(legacyThinking) ? legacyThinking : 'high';
      }
      state.profiles = defaults;
      saveProfiles();
    }

    // 2. Load Selected Mode
    const savedMode = localStorage.getItem('fastexam_mode');
    state.mode = (savedMode === 'lookup' || savedMode === 'cross_check') ? savedMode : 'cross_check';

    // 3. Load Profile Assignments
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
    elements.apiKeyStatusBadge.title = `${activeProfilesCount} API Profile đã nhập key`;
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
    if (elements.btnModeLookup) elements.btnModeLookup.classList.add('active');
    if (elements.btnModeCrossCheck) elements.btnModeCrossCheck.classList.remove('active');
  } else {
    if (elements.btnModeLookup) elements.btnModeLookup.classList.remove('active');
    if (elements.btnModeCrossCheck) elements.btnModeCrossCheck.classList.add('active');
  }
  updateHeaderBadges();
  updateResultBanner();
}

function renderProfilePickers() {
  const profileIds = state.profiles.map(p => p.id);
  state.lookupProfileId = state.lookupProfileId && profileIds.includes(state.lookupProfileId) ? state.lookupProfileId : (profileIds[0] || '');
  state.solverProfileId = state.solverProfileId && profileIds.includes(state.solverProfileId) ? state.solverProfileId : (profileIds[0] || '');
  state.verifierProfileId = state.verifierProfileId && profileIds.includes(state.verifierProfileId) ? state.verifierProfileId : (profileIds[1] || profileIds[0] || '');
  state.arbitratorProfileId = state.arbitratorProfileId && profileIds.includes(state.arbitratorProfileId) ? state.arbitratorProfileId : (profileIds[2] || '');
}

function renderProfilesList() {
  const container = elements.profilesListContainer;
  if (!container) return;

  if (state.profiles.length === 0) {
    container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-dim); font-size: 0.85rem;">Chưa có API Profile nào. Hãy bấm "+ Thêm Profile" để tạo mới!</div>';
    return;
  }

  container.innerHTML = state.profiles.map((p, index) => {
    const statusMap = {
      ready: { label: '● Khả dụng (200 OK)', cls: 'status-ready' },
      rate_limited: { label: '● Chạm hạn mức (429)', cls: 'status-rate_limited' },
      error: { label: '● Lỗi xác thực / Quyền', cls: 'status-error' },
      untested: { label: '● Chưa kiểm tra', cls: 'status-untested' }
    };
    const s = statusMap[p.status] || statusMap.untested;
    const lastCheckedText = p.lastChecked ? `Kiểm tra: ${formatTimestamp(p.lastChecked)}` : 'Chưa kiểm tra';

    const roleBadges = [
      '<span class="profile-role-badge badge-role-1" style="font-size: 0.68rem; padding: 2px 7px; border-radius: 99px; background: rgba(66, 133, 244, 0.2); color: #8ab4f8; font-weight: 600;">👑 1. Giải Chính</span>',
      '<span class="profile-role-badge badge-role-2" style="font-size: 0.68rem; padding: 2px 7px; border-radius: 99px; background: rgba(155, 114, 203, 0.2); color: #c58af9; font-weight: 600;">🔍 2. Kiểm Tra Chéo</span>',
      '<span class="profile-role-badge badge-role-3" style="font-size: 0.68rem; padding: 2px 7px; border-radius: 99px; background: rgba(217, 101, 112, 0.2); color: #f28b82; font-weight: 600;">⚖ 3. Phân Xử</span>'
    ];
    const roleBadge = roleBadges[index] || `<span class="profile-role-badge badge-role-sub" style="font-size: 0.68rem; padding: 2px 7px; border-radius: 99px; background: rgba(255,255,255,0.08); color: var(--text-dim);">Dự phòng ${index + 1}</span>`;

    return `
      <div class="profile-item-card" id="profile-card-${p.id}">
        <div class="profile-card-top">
          <div class="profile-name-tag" style="display: flex; align-items: center; gap: 8px;">
            <span>👤 ${escapeHtml(p.name)}</span>
            ${roleBadge}
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

  // Attach card action listeners
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
  elements.inputProfileModel.value = 'gemini-2.5-flash';
  elements.inputCustomModel.value = '';
  elements.inputCustomModel.classList.add('hidden');
  elements.inputProfileThinking.value = 'high';
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

  elements.inputProfileThinking.value = p.thinkingLevel || 'high';
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
    ? (elements.inputCustomModel.value || '').trim() || 'gemini-2.5-flash'
    : elements.inputProfileModel.value;
  const thinking = elements.inputProfileThinking.value || 'high';
  const editId = elements.editProfileId.value;

  if (editId) {
    // Update existing
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
    // Create new
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

  // Fetch available models from Google Generative Language API
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url).catch(err => {
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

    // Populate model dropdown with detected models if available
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

  if (elements.bannerModeText) {
    elements.bannerModeText.textContent = state.mode === 'lookup' ? 'Chế độ: Chỉ tra' : 'Chế độ: Kiểm tra chéo';
  }
  if (elements.bannerProgressText) {
    elements.bannerProgressText.textContent = state.currentProcessStage;
  }
  if (elements.bannerRequestStats) {
    elements.bannerRequestStats.textContent = `Request thành công: ${state.requestStats.run}`;
  }
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
  if (r.retries) breakdown += ` • Thử lại: ${r.retries}`;

  const summary = `Request thành công: ${r.run} (${breakdown})`;
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

function registerRequest(kind, profileName = '') {
  state.requestStats.run += 1;
  if (kind === 'lookup') state.requestStats.lookupPass += 1;
  if (kind === 'first') state.requestStats.firstPass += 1;
  if (kind === 'second') state.requestStats.secondPass += 1;
  if (kind === 'arbitration') state.requestStats.arbitration += 1;
  if (kind === 'single') state.requestStats.singleRechecks += 1;
  updateRequestStatsDisplay();
}

// ==========================================
// 6. Prompts & Structured JSON Engine
// ==========================================
function supportsThinkingLevel(model) {
  return /gemini-(?:3\.[1-8]|2\.5)/i.test(model || '') && /flash/i.test(model || '');
}

function getStructuredSchema(count) {
  return {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'Danh sách câu hỏi trắc nghiệm tương ứng từng ảnh.',
        items: {
          type: 'object',
          properties: {
            number: { type: 'integer', description: 'Số thứ tự ảnh từ 1 trở đi' },
            question: { type: 'string', description: 'Nội dung câu hỏi, không thêm nhãn Câu N:' },
            answer_letter: { type: 'string', description: 'Chữ cái phương án đúng: A, B, C, D...' },
            answer_text: { type: 'string', description: 'Nội dung đầy đủ của phương án đúng' },
            uncertain: { type: 'boolean', description: 'True nếu ảnh quá mờ hoặc không đọc rõ' }
          },
          required: ['number', 'question', 'answer_letter', 'answer_text']
        }
      }
    },
    required: ['questions']
  };
}

function getLookupPrompt() {
  return `Bạn là chuyên gia giải đề thi trắc nghiệm từ hình ảnh với độ chính xác cao nhất.
Đọc kỹ từng ảnh theo đúng thứ tự ảnh được gửi. Tự phân tích câu hỏi và tất cả phương án A, B, C, D (hoặc A-H).
Tự giải bằng kiến thức chuẩn xác trước khi chốt đáp án.

BẮT BUỘC TRẢ VỀ JSON HỢP LỆ THEO SCHEMA:
{
  "questions": [
    {
      "number": 1,
      "question": "Toàn bộ nội dung câu hỏi, không thêm nhãn Câu 1:",
      "answer_letter": "B",
      "answer_text": "Nội dung đầy đủ của phương án B",
      "uncertain": false
    }
  ]
}
Số lượng phần tử questions phải đúng bằng số ảnh gửi. Không trả markdown hay giải thích ngoài JSON.`;
}

function getSolverPrompt() {
  return `Bạn là chuyên gia giải đề trắc nghiệm độc lập (LƯỢT 1).
Xem từng ảnh câu hỏi, phân tích kỹ nội dung đề và tất cả phương án A, B, C, D (hoặc A-H).
Tự giải bằng kiến thức chuyên môn và đưa ra đáp án đúng nhất.

BẮT BUỘC trả JSON theo schema:
{
  "questions": [
    {
      "number": 1,
      "question": "Nội dung câu hỏi",
      "answer_letter": "B",
      "answer_text": "Nội dung phương án",
      "uncertain": false
    }
  ]
}
Chỉ trả JSON, không thêm văn bản ngoài JSON.`;
}

function getIndependentVerifierPrompt(count) {
  // CRITICAL REQUIREMENT (PHẦN 7):
  // Lượt 2 phải giải hoàn toàn độc lập từ ảnh, KHÔNG nhìn đáp án lượt 1.
  return `Bạn là người kiểm tra ĐỘC LẬP cho ${count} câu trắc nghiệm từ hình ảnh (LƯỢT 2).
Hãy đọc kỹ toàn bộ hình ảnh và TỰ GIẢI LẠI TỪ ĐẦU từ nội dung ảnh. Tuyệt đối không có đáp án lượt trước để tham khảo.
Đối với từng ảnh, xác định chính xác câu hỏi, các phương án và phương án đúng.

BẮT BUỘC trả về JSON theo schema:
{
  "questions": [
    {
      "number": 1,
      "question": "Nội dung câu hỏi",
      "answer_letter": "B",
      "answer_text": "Nội dung phương án",
      "uncertain": false
    }
  ]
}
Số lượng đúng ${count} câu theo thứ tự ảnh. Không trả markdown hay chữ thừa.`;
}

function getArbitrationPrompt(conflicts) {
  const list = conflicts.map((c, i) => {
    return `--- CÂU LỆCH ${i + 1} (Ảnh số ${i + 1}) ---
Lượt 1: ${c.first.answer_letter}. ${c.first.answer_text}
Lượt 2: ${c.second.answer_letter}. ${c.second.answer_text}
Nội dung câu hỏi tạm ghi: ${c.first.question || c.second.question || '(xem ảnh)'}`;
  }).join('\n\n');

  return `Bạn là người PHÂN XỬ CUỐI CÙNG cho các câu trắc nghiệm mà hai lượt giải độc lập có đáp án KHÁC NHAU.
Xem lại trực tiếp hình ảnh gốc của từng câu bên dưới, đọc kỹ đề bài và tất cả các phương án.

DANH SÁCH HAI LƯỢT TRƯỚC ĐƯA RA:
${list}

QUY TẮC PHÂN XỬ:
1. Không được mặc định chọn Lượt 1. Không được mặc định chọn Lượt 2.
2. Ưu tiên tuyệt đối vào nội dung hình ảnh gốc và kiến thức chuẩn xác nhất.
3. Nếu cả 2 lượt đều sai, bạn tự chọn phương án đúng thực sự từ ảnh.
4. Nếu vẫn không thể kết luận chắc chắn vì ảnh mờ hoặc đề tranh cãi: đặt "uncertain": true, "answer_letter": "?", "answer_text": "Không xác định chắc chắn".

BẮT BUỘC trả JSON:
{
  "questions": [
    {
      "number": 1,
      "question": "Nội dung câu hỏi",
      "answer_letter": "B",
      "answer_text": "Nội dung phương án chốt",
      "uncertain": false
    }
  ]
}
Đúng ${conflicts.length} phần tử theo thứ tự ảnh. Không thêm lời giải thích ngoài JSON.`;
}

function buildParts(images, prompt) {
  const parts = [{ text: `${prompt}\n\n` }];
  images.forEach((q, idx) => {
    parts.push({ text: `=== ẢNH CÂU HỎI ${idx + 1} / ${images.length} (Tên: ${q.name || `cau_${idx + 1}.jpg`}) ===\n` });
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
// 7. Robust Gemini API Transport
// ==========================================
async function callGeminiApiForProfile(profile, images, prompt, kind, retryCount = 0, fallbackCount = 0) {
  if (!profile || !profile.apiKey) {
    const pName = profile?.name || 'Tài khoản đã chọn';
    throw new Error(`Profile "${pName}" chưa có API key. Vui lòng bấm biểu tượng Cài đặt để nhập key.`);
  }

  const model = profile.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: getStructuredSchema(images.length),
    maxOutputTokens: Math.min(14000, Math.max(3000, 700 + images.length * 850))
  };

  // Thinking Level logic (Section 2: Default High when Cross-Check)
  if (supportsThinkingLevel(model)) {
    let level = profile.thinkingLevel || 'high';
    if (state.mode === 'cross_check' && level === 'low') {
      level = 'high';
    }
    generationConfig.thinkingConfig = { thinkingLevel: level };
  }

  const payload = {
    contents: [{ role: 'user', parts: buildParts(images, prompt) }],
    generationConfig
  };

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

      // 503 / High Demand: Tự động chuyển model dự phòng ngay lập tức (Không tốn quota vì Google chưa xử lý)
      const isHighDemand503 = response.status === 503 || /high demand|temporarily unavailable|overloaded/i.test(apiMsg);
      if (isHighDemand503 && fallbackCount < 2) {
        const fallbackModel = getFallbackModel(model);
        if (fallbackModel && fallbackModel !== model) {
          showToast(`⚡ Model ${model} quá tải (503), tự động chuyển sang ${fallbackModel} để giải ngay...`, 'info');
          state.requestStats.retries += 1;
          updateRequestStatsDisplay();
          const fallbackProfile = { ...profile, model: fallbackModel };
          await delay(600);
          return callGeminiApiForProfile(fallbackProfile, images, prompt, kind, 0, fallbackCount + 1);
        }
      }

      // 429 = Rate limit/Quota: KHÔNG retry liên tục (Section 1 & 12)
      if (response.status === 429) {
        profile.status = 'rate_limited';
        profile.lastError = 'API này đang chạm giới hạn sử dụng (429).';
        saveProfiles();
        throw new Error(`API "${profile.name}" đang chạm giới hạn sử dụng (429).`);
      }

      // 401 / 403 = Invalid key or no access
      if (response.status === 401 || response.status === 403) {
        profile.status = 'error';
        profile.lastError = 'API key này không hoạt động hoặc không có quyền truy cập model đã chọn.';
        saveProfiles();
        throw new Error(`API key của "${profile.name}" không hoạt động hoặc không có quyền truy cập model đã chọn (${response.status}).`);
      }

      // 413 = Payload Too Large: Ném cờ để chia batch nhỏ hơn
      if (response.status === 413) {
        throw new Error('PAYLOAD_413_TOO_LARGE');
      }

      // 400 = Invalid request
      if (response.status === 400) {
        profile.status = 'error';
        saveProfiles();
        throw new Error(`Yêu cầu không hợp lệ cho "${profile.name}" (400): ${apiMsg}`);
      }

      // 500, 502, 504 = Lỗi dịch vụ tạm thời: Retry tối đa 1 lần có backoff
      if ([500, 502, 504].includes(response.status) && retryCount < 1) {
        state.requestStats.retries += 1;
        updateRequestStatsDisplay();
        const waitMs = 1200 + Math.floor(Math.random() * 400);
        await delay(waitMs);
        return callGeminiApiForProfile(profile, images, prompt, kind, retryCount + 1, fallbackCount);
      }

      throw new Error(`Google API (${response.status}): ${apiMsg}`);
    }

    const rawText = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!rawText.trim()) {
      throw new Error(`Gemini (${profile.name}) không trả về nội dung kết quả.`);
    }

    profile.status = 'ready';
    profile.lastError = null;

    // CHỈ ĐĂNG KÝ REQUEST KHI ĐÃ THÀNH CÔNG 200 OK (Tuyệt đối không đếm ảo khi bị lỗi mạng hoặc 503)
    registerRequest(kind, profile.name);

    return rawText.trim();
  } catch (err) {
    if (err.message === 'PAYLOAD_413_TOO_LARGE') throw err;

    const msg = err?.message || '';
    const isNetwork = /Failed to fetch|NetworkError|network|timeout|Load failed/i.test(msg);
    const isDomainError = /API này đang chạm|không hoạt động|Yêu cầu không hợp lệ/i.test(msg);

    if (isNetwork && !isDomainError && retryCount < 1) {
      state.requestStats.retries += 1;
      updateRequestStatsDisplay();
      const waitMs = 1000;
      await delay(waitMs);
      return callGeminiApiForProfile(profile, images, prompt, kind, retryCount + 1, fallbackCount);
    }
    throw err;
  }
}

// ==========================================
// 8. Output Normalization & Format Enforcer
// ==========================================
// Section 9: JSON Nội bộ & Định dạng hiển thị chuẩn:
// Câu 1: [nội dung câu hỏi]
// B. [nội dung đáp án đúng]
function cleanQuestionLine(rawQuestion, index) {
  let qText = String(rawQuestion || '').trim();
  qText = qText.replace(/^Câu\s*(?:hỏi\s*)?\d+\s*:\s*/i, '').trim();
  return `Câu ${index + 1}: ${qText || '(Không đọc được câu hỏi từ ảnh)'}`;
}

function cleanAnswerLine(letter, answerText) {
  const l = String(letter || '').trim().toUpperCase();
  const text = String(answerText || '').trim();
  const validLetter = /^[A-H]$/.test(l) ? l : '?';

  if (validLetter === '?') {
    return text ? `? ${text}` : 'Chưa xác định được đáp án';
  }
  return text ? `${validLetter}. ${text}` : `${validLetter}.`;
}

function parseStructuredJson(rawText, expectedCount) {
  let parsed;
  try {
    const cleaned = String(rawText || '').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (_) {
    return fallbackRegexParse(rawText, expectedCount);
  }

  const items = Array.isArray(parsed) ? parsed : parsed?.questions;
  if (!Array.isArray(items)) {
    return fallbackRegexParse(rawText, expectedCount);
  }

  return Array.from({ length: expectedCount }, (_, i) => {
    const item = items[i] || {};
    const letter = String(item.answer_letter || '').trim().toUpperCase();
    const validLetter = /^[A-H]$/.test(letter) ? letter : '?';
    const isUncertain = Boolean(item.uncertain) || validLetter === '?';

    return {
      number: i + 1,
      questionText: String(item.question || '').trim(),
      answerLetter: isUncertain ? '?' : validLetter,
      answerText: String(item.answer_text || '').trim(),
      uncertain: isUncertain
    };
  });
}

function fallbackRegexParse(rawText, count) {
  const clean = String(rawText || '').replace(/```[a-z]*|```/gi, '').trim();
  const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  return Array.from({ length: count }, (_, i) => {
    const line = lines[i] || '';
    const match = line.match(/\b([A-H])\s*[\.):]/i);
    const letter = match ? match[1].toUpperCase() : '?';
    return {
      number: i + 1,
      questionText: line.replace(/\b[A-H]\s*[\.):].*/, '').trim(),
      answerLetter: letter,
      answerText: line,
      uncertain: letter === '?'
    };
  });
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
    { maxDim: 1650, quality: 0.80 },
    { maxDim: 1450, quality: 0.72 },
    { maxDim: 1250, quality: 0.65 },
    { maxDim: 1050, quality: 0.55 },
    { maxDim: 900,  quality: 0.48 }
  ];

  for (const step of qualitySteps) {
    for (const q of images) {
      await recompressImage(q, step.maxDim, step.quality);
    }
    if (estimatePayloadBytes(images) <= targetBytes) {
      return true;
    }
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
  const maxPerBatch = Math.min(state.maxImagesPerRequest || 8, 8);
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
// 10. Main Solver Engine (Lookup & Cross-Check)
// ==========================================
async function solveAllQuestions() {
  if (state.questions.length === 0) return;

  // Validate Active Mode Profiles
  if (state.mode === 'lookup') {
    const solver = getProfileById(state.lookupProfileId);
    if (!solver || !solver.apiKey) {
      elements.settingsModal.classList.remove('hidden');
      showToast('Vui lòng chọn Profile có API key hợp lệ trong chế độ Chỉ tra.', 'error');
      return;
    }
  } else {
    // Cross check requires at least 2 profiles with keys
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
        // CHẾ ĐỘ 1: CHỈ TRA (1 request per batch)
        // ========================================
        const solverProfile = getProfileById(state.lookupProfileId);
        state.currentProcessStage = `Đang phân tích ảnh ${globalStartIndex + 1}–${globalStartIndex + batch.length}${batchLabel}...`;
        updateResultBanner();
        showToast(state.currentProcessStage, 'info');

        const rawResult = await callGeminiApiForProfile(solverProfile, batch, getLookupPrompt(), 'lookup');
        const parsed = parseStructuredJson(rawResult, batch.length);

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
        // CHẾ ĐỘ 2: KIỂM TRA CHÉO (Pass 1 + Pass 2 Độc Lập)
        // ========================================
        const solverProfile = getProfileById(state.solverProfileId);
        const verifierProfile = getProfileById(state.verifierProfileId);
        const arbitratorProfile = getProfileById(state.arbitratorProfileId);

        // Lượt 1: Giải độc lập với Profile 1
        state.currentProcessStage = `Đang phân tích Lượt 1 (${solverProfile.name})${batchLabel}...`;
        updateResultBanner();
        showToast(state.currentProcessStage, 'info');

        const rawFirst = await callGeminiApiForProfile(solverProfile, batch, getSolverPrompt(), 'first');
        const firstPass = parseStructuredJson(rawFirst, batch.length);

        // Cập nhật tạm thời để người dùng thấy đáp án Lượt 1 ngay
        batch.forEach((q, idx) => {
          const item = firstPass[idx] || {};
          const qNum = globalStartIndex + idx;
          q.questionLine = cleanQuestionLine(item.questionText, qNum);
          q.answerLine = cleanAnswerLine(item.answerLetter, item.answerText);
          q.letter = item.answerLetter || '?';
          q.check1 = item.answerLetter || '?';
          q.status = 'loading';
        });
        renderQuestions();
        renderMatrix();

        // Lượt 2: Giải độc lập từ ảnh gốc với Profile 2 (KHÔNG nhìn đáp án lượt 1!)
        state.currentProcessStage = `Đang kiểm tra chéo độc lập Lượt 2 (${verifierProfile.name})${batchLabel}...`;
        updateResultBanner();
        showToast(state.currentProcessStage, 'info');

        let secondPass;
        try {
          const rawSecond = await callGeminiApiForProfile(verifierProfile, batch, getIndependentVerifierPrompt(batch.length), 'second');
          secondPass = parseStructuredJson(rawSecond, batch.length);
        } catch (secondErr) {
          console.error('Lỗi Lượt 2:', secondErr);
          // Giữ kết quả lượt 1 nếu lượt 2 gặp lỗi (Section 12)
          batch.forEach((q, idx) => {
            q.status = 'warning';
            q.check2 = '!';
            q.answerLine += ` (Lượt 2 lỗi: ${secondErr.message})`;
          });
          renderQuestions();
          renderMatrix();
          globalStartIndex += batch.length;
          continue;
        }

        // Đối Soát Lượt 1 vs Lượt 2
        state.currentProcessStage = `Đang đối chiếu kết quả 2 lượt${batchLabel}...`;
        updateResultBanner();

        const conflicts = [];

        batch.forEach((q, idx) => {
          const f = firstPass[idx] || {};
          const s = secondPass[idx] || {};
          q.check1 = f.answerLetter || '?';
          q.check2 = s.answerLetter || '?';

          const isAgreed = q.check1 !== '?' && q.check1 === q.check2;

          if (isAgreed) {
            // Section 5: ✓ Hai lượt thống nhất
            q.letter = q.check1;
            q.status = 'done';
            q.confidence = 'agreed';
            q.questionLine = cleanQuestionLine(s.questionText || f.questionText, globalStartIndex + idx);
            q.answerLine = cleanAnswerLine(q.letter, s.answerText || f.answerText);
          } else {
            // Section 6: ⚠ Hai lượt không thống nhất
            q.letter = '?';
            q.status = 'warning';
            q.confidence = 'conflict';
            q.questionLine = cleanQuestionLine(f.questionText || s.questionText, globalStartIndex + idx);
            q.answerLine = `⚠ Lệch đáp án (Lượt 1: ${q.check1} • Lượt 2: ${q.check2})`;

            conflicts.push({
              localIndex: idx,
              question: q,
              first: f,
              second: s
            });
          }
        });

        // Phân Xử Lượt 3 (Nếu có bất đồng & Đã cấu hình Profile 3)
        if (conflicts.length > 0 && arbitratorProfile && arbitratorProfile.apiKey) {
          state.currentProcessStage = `Có ${conflicts.length} câu cần phân xử Lượt 3 (${arbitratorProfile.name})${batchLabel}...`;
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
            const arbitrationResults = parseStructuredJson(rawArbitration, conflictImages.length);

            conflicts.forEach((c, cIdx) => {
              const res = arbitrationResults[cIdx];
              if (res && res.answerLetter && res.answerLetter !== '?' && !res.uncertain) {
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
    pendingQuestions.forEach(q => {
      if (q.status === 'loading') {
        q.status = 'error';
        q.letter = '?';
        q.answerLine = `Chưa có đáp án (${err.message.includes('503') ? 'Google quá tải tạm thời' : err.message})`;
      }
    });
    renderQuestions();
    renderMatrix();
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

// Section 6: Kiểm tra lại 1 câu lẻ (Chỉ request lại câu đó, không giải lại cả 15 câu)
async function recheckSingleQuestion(q) {
  if (!q) return;

  const card = document.getElementById(`card-${q.id}`);
  if (card) {
    card.classList.add('loading');
  }
  q.status = 'loading';
  renderQuestionCard(q);
  renderMatrix();

  showToast(`Đang kiểm tra lại riêng Câu ${state.questions.indexOf(q) + 1}...`, 'info');

  try {
    if (state.mode === 'lookup') {
      const solver = getProfileById(state.lookupProfileId);
      const raw = await callGeminiApiForProfile(solver, [q], getLookupPrompt(), 'single');
      const parsed = parseStructuredJson(raw, 1)[0] || {};
      const qIndex = state.questions.indexOf(q);

      q.questionLine = cleanQuestionLine(parsed.questionText, qIndex);
      q.answerLine = cleanAnswerLine(parsed.answerLetter, parsed.answerText);
      q.letter = parsed.answerLetter || '?';
      q.status = q.letter !== '?' ? 'done' : 'warning';
      q.confidence = 'single-pass';
    } else {
      const solver = getProfileById(state.solverProfileId);
      const verifier = getProfileById(state.verifierProfileId);
      const arbitrator = getProfileById(state.arbitratorProfileId);

      // Lượt 1
      const raw1 = await callGeminiApiForProfile(solver, [q], getSolverPrompt(), 'single');
      const f = parseStructuredJson(raw1, 1)[0] || {};

      // Lượt 2
      const raw2 = await callGeminiApiForProfile(verifier, [q], getIndependentVerifierPrompt(1), 'single');
      const s = parseStructuredJson(raw2, 1)[0] || {};

      q.check1 = f.answerLetter || '?';
      q.check2 = s.answerLetter || '?';
      const qIndex = state.questions.indexOf(q);

      if (q.check1 !== '?' && q.check1 === q.check2) {
        q.letter = q.check1;
        q.status = 'done';
        q.confidence = 'agreed';
        q.questionLine = cleanQuestionLine(s.questionText || f.questionText, qIndex);
        q.answerLine = cleanAnswerLine(q.letter, s.answerText || f.answerText);
      } else if (arbitrator && arbitrator.apiKey) {
        // Phân xử
        const conflict = [{ first: f, second: s, question: q }];
        const raw3 = await callGeminiApiForProfile(arbitrator, [q], getArbitrationPrompt(conflict), 'arbitration');
        const arb = parseStructuredJson(raw3, 1)[0] || {};

        if (arb.answerLetter && arb.answerLetter !== '?' && !arb.uncertain) {
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

  // Agreement Badges
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

  // Toggle image
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



  // Re-resolve
  const btnReSolve = card.querySelector('.btn-re-solve');
  btnReSolve.addEventListener('click', () => recheckSingleQuestion(q));

  // Single recheck button in conflict box
  const btnRecheckSingle = card.querySelector('.btn-recheck-single');
  if (btnRecheckSingle) {
    btnRecheckSingle.addEventListener('click', () => recheckSingleQuestion(q));
  }

  // Delete
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
    // Câu 12 cố tình tạo tình huống lệch để minh họa Kiểm tra chéo & phân xử!
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

    // Canvas Card Render
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
  // Settings Modal Controls
  elements.btnOpenSettings.addEventListener('click', () => {
    renderProfilesList();
    elements.settingsModal.classList.remove('hidden');
  });
  elements.btnCloseSettings.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
  elements.btnCloseSettingsModal.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) elements.settingsModal.classList.add('hidden');
  });

  // Profile Form Controls
  elements.btnAddNewProfile.addEventListener('click', openAddProfileForm);
  elements.btnCancelProfileForm.addEventListener('click', closeProfileForm);
  elements.btnCancelProfile.addEventListener('click', closeProfileForm);
  elements.btnSaveProfileItem.addEventListener('click', saveProfileFormData);
  elements.btnTestThisKey.addEventListener('click', testFormKey);

  // Toggle API key visibility in form
  elements.btnToggleKeyVisibility.addEventListener('click', () => {
    const isPass = elements.inputProfileKey.type === 'password';
    elements.inputProfileKey.type = isPass ? 'text' : 'password';
    elements.btnToggleKeyVisibility.textContent = isPass ? '🔒' : '👁';
  });

  // Custom model input toggle in profile form
  elements.inputProfileModel.addEventListener('change', () => {
    if (elements.inputProfileModel.value === 'custom') {
      elements.inputCustomModel.classList.remove('hidden');
      elements.inputCustomModel.focus();
    } else {
      elements.inputCustomModel.classList.add('hidden');
    }
  });

  // Mode Switch Tab Controls
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

  // Zoom Modal
  elements.btnCloseZoom.addEventListener('click', () => elements.imageZoomModal.classList.add('hidden'));
  elements.imageZoomModal.addEventListener('click', (e) => {
    if (e.target === elements.imageZoomModal) elements.imageZoomModal.classList.add('hidden');
  });

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
      elements.fileInput.value = '';
    }
  });

  // Clipboard Paste (Ctrl + V)
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

  // Toolbar Actions
  elements.btnSolveAll.addEventListener('click', solveAllQuestions);
  elements.btnSortQuestions.addEventListener('click', sortQuestionsNatural);
  elements.btnRetryFailed.addEventListener('click', retryFailedQuestions);
  elements.btnClearAll.addEventListener('click', clearAllQuestions);

  // Mobile Bottom Bar Actions
  if (elements.btnMobileSolve) elements.btnMobileSolve.addEventListener('click', solveAllQuestions);

  // Escape Key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      elements.settingsModal.classList.add('hidden');
      elements.imageZoomModal.classList.add('hidden');
    }
  });
}

// Start application
window.addEventListener('DOMContentLoaded', init);
