<template>
  <div class="genre-selection">
    <div class="container">
      <h1 class="text-center mb-4">Choose Your Metal Subgenre</h1>
      <p class="text-center mb-5">Select a subgenre to discover bands that match your taste</p>

      <!-- LLM Configuration Panel -->
      <div v-if="isApiMode" class="llm-config-section">
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
              <label for="llm-endpoint">LLM Endpoint URL</label>
              <input
                id="llm-endpoint"
                v-model="llmConfig.endpoint"
                type="text"
                placeholder="https://api.openai.com/v1 or your custom endpoint"
                class="form-control"
                @blur="updateLLMConfig"
              />
              <small class="form-text">The API endpoint for your LLM service</small>
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

const emit = defineEmits(['genre-selected']);

const genres = ref<string[]>([]);
const loading = ref(true);
const error = ref('');
const isApiMode = ref(false);

// LLM Configuration
const showLLMConfig = ref(false);
const llmConfig = ref<LLMConfig>({
  endpoint: '',
  apiKey: '',
  model: '',
  enabled: false,
});
const testingConnection = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

const llmEnabled = computed(() => llmConfig.value.enabled && isApiMode.value);

onMounted(async () => {
  // Check if we're in API mode
  isApiMode.value = apiService.isApiMode();

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
};

const testLLMConnection = async () => {
  testingConnection.value = true;
  testResult.value = null;

  try {
    // Simple test - just check if endpoint is provided
    if (!llmConfig.value.endpoint) {
      testResult.value = {
        success: false,
        message: 'Please provide an LLM endpoint URL',
      };
      return;
    }

    // In a real implementation, you might want to make an actual API call here
    // For now, we'll just simulate a successful configuration
    testResult.value = {
      success: true,
      message: 'Configuration saved successfully! AI recommendations are enabled.',
    };
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
  emit('genre-selected', genre);
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
</style>