<template>
  <div class="genre-selection">
    <div class="container">
      <h1 class="text-center mb-4">Choose Your Metal Subgenre</h1>
      <p class="text-center mb-5">Select a subgenre to discover bands that match your taste</p>

      <!-- Mode Indicator -->
      <div v-if="isStaticMode" class="mode-indicator static">
        <span class="mode-icon">📦</span>
        <span class="mode-text">Static Mode - No backend required</span>
      </div>
      <div v-else class="mode-indicator api">
        <span class="mode-icon">🔌</span>
        <span class="mode-text">API Mode - Connected to backend</span>
      </div>

      <!-- Static Mode Notice -->
      <div v-if="isStaticMode" class="static-notice">
        <p class="notice-text">
          <strong>ℹ️ Static Deployment Mode:</strong> Data and band matching are pre-cached with limited recommendation capabilities.
        </p>
        <p class="notice-text">
          Configure your own LLM to enter <strong>Zen Mode</strong> — an endless exploration mode where the system continuously discovers more bands for you. Select a subgenre to start immediately, or optionally enter a seed band for personalized exploration.
        </p>
        <p class="notice-text notice-small">
          🔒 Your configuration is only used for this session to enhance recommendations. It will not be permanently recorded or stored.
        </p>
      </div>

      <!-- LLM Configuration Panel -->
      <div class="llm-config-section">
        <button
          @click="toggleLLMConfig"
          class="btn btn-llm-toggle"
          :class="{ 'active': showLLMConfig }"
        >
          <span class="toggle-icon">{{ showLLMConfig ? '▼' : '▶' }}</span>
          AI Model Configuration
          <span v-if="llmEnabled" class="llm-status enabled">●</span>
          <span v-else class="llm-status disabled">●</span>
        </button>

        <div v-show="showLLMConfig" class="llm-config-panel">
          <div class="llm-config-header">
            <label class="llm-enable-label">
              <input
                type="checkbox"
                v-model="llmConfig.enabled"
                @change="updateLLMConfig"
              />
              Enable AI-powered recommendations
            </label>
            <p class="llm-description">
              When enabled, the system will use AI to generate band recommendations.
              Requires a valid LLM endpoint.
            </p>
          </div>

          <div v-if="llmConfig.enabled" class="llm-inputs">
            <div class="form-group">
              <label for="llm-api-type">API Type</label>
              <select
                id="llm-api-type"
                v-model="llmConfig.apiType"
                class="form-control"
                @change="updateLLMConfig"
              >
                <option value="openai">OpenAI / Compatible (OpenAI format)</option>
                <option value="anthropic">Anthropic Claude</option>
              </select>
              <small class="form-text">
                Select the API format your LLM service uses
              </small>
            </div>

            <div class="form-group">
              <label for="llm-endpoint">LLM Endpoint URL</label>
              <input
                id="llm-endpoint"
                v-model="llmConfig.endpoint"
                type="text"
                :placeholder="llmConfig.apiType === 'anthropic' 
                  ? 'https://api.anthropic.com' 
                  : 'https://api.openai.com/v1'"
                class="form-control"
                @blur="updateLLMConfig"
              />
              <small class="form-text">
                {{ llmConfig.apiType === 'anthropic' 
                  ? 'Anthropic API endpoint (e.g., https://api.anthropic.com or your proxy)' 
                  : 'OpenAI-compatible API endpoint (e.g., https://api.openai.com/v1, http://localhost:1234/v1)' }}
              </small>
            </div>

            <div class="form-group">
              <label for="llm-api-key">API Key / Auth Token</label>
              <input
                id="llm-api-key"
                v-model="llmConfig.apiKey"
                type="password"
                placeholder="sk-... or your auth token"
                class="form-control"
                @blur="updateLLMConfig"
              />
              <small class="form-text">Your API key for authentication</small>
            </div>

            <div class="form-group">
              <label for="llm-model">Model Name (Optional)</label>
              <input
                id="llm-model"
                v-model="llmConfig.model"
                type="text"
                placeholder="gpt-4, gpt-3.5-turbo, etc."
                class="form-control"
                @blur="updateLLMConfig"
              />
              <small class="form-text">The specific model to use (optional)</small>
            </div>

            <div class="llm-actions">
              <button @click="resetLLMConfig" class="btn btn-reset">Reset to Default</button>
              <button @click="testLLMConnection" class="btn btn-test" :disabled="testingConnection">
                {{ testingConnection ? 'Testing...' : 'Test Connection' }}
              </button>
            </div>

            <div v-if="testResult" class="test-result" :class="testResult.success ? 'success' : 'error'">
              {{ testResult.message }}
            </div>
          </div>

          <!-- Seed Band Input - Only shown when LLM is enabled and connection test passed -->
          <div v-if="llmEnabled && testResult?.success" class="seed-band-section">
            <div class="seed-band-divider"></div>
            <div class="form-group">
              <label for="seed-band">
                <span class="zen-label">🌱 Seed Band (Optional)</span>
              </label>
              <input
                id="seed-band"
                v-model="seedBand"
                type="text"
                placeholder="Enter a band name to start your journey (e.g., Metallica)"
                class="form-control"
              />
              <small class="form-text">
                Optional: Enter a seed band to start your journey. The AI will use this as the foundation for endless exploration. Leave empty to explore freely.
              </small>
            </div>
          </div>

          <!-- Start Zen Mode Button - Shown when LLM is enabled and (seed band entered or genre selected) -->
          <div v-if="llmEnabled && (seedBand.trim() || selectedGenre)" class="zen-start-section">
            <button
              @click="startZenMode"
              class="btn btn-zen-start"
              :disabled="startingZen"
            >
              <span class="zen-icon">☯</span>
              {{ startingZen ? 'Starting...' : 'Start Zen Mode' }}
              <span v-if="seedBand.trim()" class="seed-hint">with {{ seedBand }}</span>
            </button>
            <p class="genre-hint" v-if="selectedGenre">
              Filtered by: {{ selectedGenre.charAt(0).toUpperCase() + selectedGenre.slice(1) }}
            </p>
            <p class="genre-hint" v-else-if="!seedBand.trim()">
              Exploring all genres
            </p>
          </div>
        </div>
      </div>

      <div v-if="loading" class="text-center">
        <div class="spinner-border text-light" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <div v-else-if="error" class="alert alert-danger">
        {{ error }}
      </div>

      <div v-else class="genre-buttons">
        <button
          v-for="genre in genres"
          :key="genre"
          @click="selectGenre(genre)"
          class="btn btn-genre"
          :class="{ 'selected': selectedGenre === genre && llmEnabled }"
        >
          {{ genre.charAt(0).toUpperCase() + genre.slice(1) }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { apiService, type LLMConfig } from '../api';

const emit = defineEmits<{
  (e: 'genre-selected', genre: string, seedBand?: string): void;
}>();

const genres = ref<string[]>([]);
const loading = ref(true);
const error = ref('');
const isApiMode = ref(false);
const isStaticMode = ref(false);

// LLM Configuration
const showLLMConfig = ref(false);
const llmConfig = ref<LLMConfig>({
  endpoint: '',
  apiKey: '',
  model: '',
  enabled: false,
  apiType: 'openai',
});
const testingConnection = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);
const seedBand = ref('');
const selectedGenre = ref<string | null>(null);
const startingZen = ref(false);

const llmEnabled = computed(() => llmConfig.value.enabled && !!llmConfig.value.endpoint);

onMounted(async () => {
  // Check mode
  isApiMode.value = apiService.isApiMode();
  isStaticMode.value = apiService.isStaticMode();

  // Load LLM config
  llmConfig.value = apiService.getLLMConfig();

  try {
    genres.value = await apiService.getGenres();
  } catch (err) {
    error.value = 'Failed to load genres. Please try again.';
  } finally {
    loading.value = false;
  }
});

const toggleLLMConfig = () => {
  showLLMConfig.value = !showLLMConfig.value;
};

const updateLLMConfig = () => {
  apiService.updateLLMConfig(llmConfig.value);
  testResult.value = null;
};

const resetLLMConfig = () => {
  apiService.resetLLMConfig();
  llmConfig.value = apiService.getLLMConfig();
  testResult.value = null;
  seedBand.value = '';
};

const testLLMConnection = async () => {
  testingConnection.value = true;
  testResult.value = null;

  try {
    // Actually test the LLM connection by making an API call
    const result = await apiService.testLLMConnection();
    testResult.value = result;
  } catch (err) {
    testResult.value = {
      success: false,
      message: 'Failed to validate configuration. Please check your settings.',
    };
  } finally {
    testingConnection.value = false;
  }
};

const selectGenre = (genre: string) => {
  if (llmEnabled.value) {
    // LLM 模式下
    const trimmedSeed = seedBand.value.trim();

    if (selectedGenre.value === genre) {
      // 取消选择
      selectedGenre.value = null;
      return;
    }

    // 选择新流派
    selectedGenre.value = genre;

    // 如果没有输入种子乐队，直接开始
    if (!trimmedSeed) {
      startingZen.value = true;
      emit('genre-selected', genre, undefined);
      startingZen.value = false;
    }
    // 如果有种子乐队，等待用户点击 Start Zen Mode 按钮
  } else {
    // 普通模式下，直接触发事件
    const trimmedSeed = seedBand.value.trim();
    emit('genre-selected', genre, trimmedSeed || undefined);
  }
};

const startZenMode = async () => {
  const trimmedSeed = seedBand.value.trim();

  startingZen.value = true;
  try {
    // 使用选中的流派，如果没有选择则使用 'zen'（表示不限制流派）
    const genreToUse = selectedGenre.value || 'zen';
    emit('genre-selected', genreToUse, trimmedSeed || undefined);
  } finally {
    startingZen.value = false;
  }
};
</script>

<style scoped>
.genre-selection {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.genre-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  max-width: 900px;
  margin: 0 auto;
}

.btn-genre {
  padding: 1.5rem 2rem;
  font-size: 1.1rem;
  font-weight: 500;
  text-transform: capitalize;
  letter-spacing: 0.5px;
  background: #3a3a3a;
  border: 1px solid #555;
  color: #e0e0e0;
  border-radius: 6px;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.btn-genre:hover {
  background: #4a4a4a;
  border-color: #666;
}

.btn-genre:active {
  background: #505050;
}

h1 {
  font-weight: 600;
  color: #f0f0f0;
}

p {
  color: #b0b0b0;
  font-size: 1.1rem;
}

/* LLM Configuration Styles */
.llm-config-section {
  max-width: 600px;
  margin: 0 auto 2rem auto;
}

.btn-llm-toggle {
  width: 100%;
  padding: 0.75rem 1rem;
  background: #2d2d3a;
  border: 1px solid #4a4a5a;
  color: #c0c0d0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-llm-toggle:hover {
  background: #353545;
  border-color: #5a5a6a;
}

.btn-llm-toggle.active {
  background: #3a3a4a;
  border-color: #667eea;
}

.toggle-icon {
  font-size: 0.8rem;
  color: #888;
}

.llm-status {
  margin-left: auto;
  font-size: 0.6rem;
}

.llm-status.enabled {
  color: #4ade80;
}

.llm-status.disabled {
  color: #6b7280;
}

.llm-config-panel {
  margin-top: 0.5rem;
  padding: 1.25rem;
  background: #252532;
  border: 1px solid #3a3a4a;
  border-radius: 8px;
}

.llm-config-header {
  margin-bottom: 1rem;
}

.llm-enable-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #e0e0e0;
  font-size: 0.95rem;
  cursor: pointer;
}

.llm-enable-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #667eea;
}

.llm-description {
  margin-top: 0.5rem;
  margin-left: 1.6rem;
  font-size: 0.85rem;
  color: #888;
  line-height: 1.4;
}

.llm-inputs {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-group label {
  color: #c0c0d0;
  font-size: 0.85rem;
  font-weight: 500;
}

.form-control {
  padding: 0.6rem 0.75rem;
  background: #1a1a24;
  border: 1px solid #3a3a4a;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
}

.form-control:focus {
  outline: none;
  border-color: #667eea;
}

.form-control::placeholder {
  color: #666;
}

.form-text {
  font-size: 0.8rem;
  color: #666;
  margin-top: 0.2rem;
}

.llm-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn-reset,
.btn-test {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.btn-reset {
  background: #3a3a4a;
  color: #c0c0d0;
}

.btn-reset:hover {
  background: #4a4a5a;
}

.btn-test {
  background: #667eea;
  color: white;
}

.btn-test:hover:not(:disabled) {
  background: #5a6fd6;
}

.btn-test:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-result {
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

.test-result.success {
  background: rgba(74, 222, 128, 0.15);
  border: 1px solid rgba(74, 222, 128, 0.3);
  color: #4ade80;
}

.test-result.error {
  background: rgba(248, 113, 113, 0.15);
  border: 1px solid rgba(248, 113, 113, 0.3);
  color: #f87171;
}

/* Mode Indicator Styles */
.mode-indicator {
  max-width: 600px;
  margin: 0 auto 1.5rem auto;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.mode-indicator.static {
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.3);
  color: #4ade80;
}

.mode-indicator.api {
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.3);
  color: #667eea;
}

.mode-icon {
  font-size: 1rem;
}

.mode-text {
  font-weight: 500;
}

/* Static Mode Notice */
.static-notice {
  max-width: 600px;
  margin: 0 auto 1.5rem auto;
  padding: 1rem 1.25rem;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 8px;
  color: #fbbf24;
}

.notice-text {
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 0.5rem;
}

.notice-text:last-child {
  margin-bottom: 0;
}

.notice-small {
  font-size: 0.8rem;
  color: #d4a853;
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(251, 191, 36, 0.2);
}

/* Seed Band Section */
.seed-band-section {
  margin-top: 1rem;
}

.seed-band-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.5), transparent);
  margin: 1rem 0;
}

.zen-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #10b981;
  font-weight: 600;
  font-size: 0.95rem;
}

/* Zen Start Section */
.zen-start-section {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(102, 126, 234, 0.3);
}

.btn-zen-start {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn-zen-start:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.btn-zen-start:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-zen-start .zen-icon {
  font-size: 1.3rem;
}

.seed-hint {
  font-size: 0.85rem;
  opacity: 0.9;
  font-weight: 400;
}

.genre-hint {
  text-align: center;
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #888;
  font-style: italic;
}

/* Genre button selected state */
.btn-genre.selected {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.3);
}
</style>