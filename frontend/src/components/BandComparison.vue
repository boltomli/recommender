<template>
  <div class="band-comparison">
    <div class="container">
      <div class="progress-header">
        <div class="header-top">
          <h2 class="text-center">Which band do you prefer?</h2>
          <button @click="handleRestart" class="restart-btn">Restart</button>
        </div>
      </div>

      <div v-if="loading" class="text-center loading-container">
        <div class="spinner-border text-light" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-3">Finding the perfect comparison...</p>
      </div>

      <div v-else-if="error" class="alert alert-danger">
        {{ error }}
      </div>

      <div v-else-if="comparisonPair && 'band1' in comparisonPair" class="comparison-container">
        <div class="comparison-grid">
          <BandCard
            :band="comparisonPair.band1"
            :selected="selectedBand === comparisonPair.band1.id"
            :compact="false"
            @select="selectBand(comparisonPair.band1.id)"
          />
          <div class="vs-divider">
            <span>VS</span>
          </div>
          <BandCard
            :band="comparisonPair.band2"
            :selected="selectedBand === comparisonPair.band2.id"
            :compact="false"
            @select="selectBand(comparisonPair.band2.id)"
          />
        </div>

        <div class="action-buttons">
          <button @click="handleSkip" class="skip-btn" :disabled="processing">
            Skip
          </button>
        </div>

        <div v-if="suggestions.length > 0" class="suggestions-section">
          <h3 class="suggestions-title">Based on your preferences</h3>
          <div class="suggestions-grid">
            <BandCard
              v-for="suggestion in suggestions"
              :key="suggestion.band.id"
              :band="suggestion.band"
              :compact="true"
            />
          </div>
        </div>
      </div>

      <div v-else class="text-center">
        <p>No more bands available for comparison.</p>
        <button @click="handleViewRecommendations" class="view-recommendations-btn">
          View Recommendations
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import BandCard from './BandCard.vue';
import { apiService, type ComparisonPair, type Recommendation } from '../api';

const props = defineProps<{
  sessionId: string;
  comparisonCount: number;
}>();

const emit = defineEmits(['preference-recorded', 'recommendations-ready', 'restart']);

const comparisonPair = ref<ComparisonPair | { done: true } | null>(null);
const loading = ref(true);
const error = ref('');
const selectedBand = ref<string | null>(null);
const processing = ref(false);
const suggestions = ref<Recommendation[]>([]);

onMounted(async () => {
  await loadComparison();
});

const loadComparison = async () => {
  try {
    loading.value = true;
    error.value = '';
    comparisonPair.value = await apiService.getComparison(props.sessionId);
    suggestions.value = [];

    if (comparisonPair.value && 'done' in comparisonPair.value) {
      emit('recommendations-ready');
    }
  } catch (err) {
    error.value = 'Failed to load comparison. Please try again.';
  } finally {
    loading.value = false;
  }
};

const loadSuggestions = async () => {
  try {
    suggestions.value = await apiService.getSuggestions(props.sessionId, 3);
  } catch (err) {
    console.error('Failed to load suggestions:', err);
    suggestions.value = [];
  }
};

const selectBand = async (bandId: string) => {
  if (!comparisonPair.value || 'done' in comparisonPair.value || processing.value) return;

  selectedBand.value = bandId;
  processing.value = true;

  try {
    const pair = comparisonPair.value as ComparisonPair;
    await apiService.submitPreference(
      props.sessionId,
      pair.band1.id,
      pair.band2.id,
      bandId
    );
    emit('preference-recorded');
    // Load the next comparison
    await loadComparison();
    // Load suggestions for the new comparison
    if (comparisonPair.value && !('done' in comparisonPair.value)) {
      await loadSuggestions();
    }
  } catch (err) {
    error.value = 'Failed to record preference. Please try again.';
    selectedBand.value = null;
  } finally {
    processing.value = false;
  }
};

const handleSkip = async () => {
  if (!comparisonPair.value || 'done' in comparisonPair.value || processing.value) return;

  processing.value = true;

  try {
    const pair = comparisonPair.value as ComparisonPair;
    await apiService.skipComparison(
      props.sessionId,
      pair.band1.id,
      pair.band2.id
    );
    emit('preference-recorded');
    // Load the next comparison
    await loadComparison();
    // Load suggestions for the new comparison
    if (comparisonPair.value && !('done' in comparisonPair.value)) {
      await loadSuggestions();
    }
  } catch (err) {
    error.value = 'Failed to skip comparison. Please try again.';
  } finally {
    processing.value = false;
  }
};

const handleRestart = () => {
  emit('restart');
};

const handleViewRecommendations = () => {
  emit('recommendations-ready');
};

defineExpose({
  loadComparison
});
</script>

<style scoped>
.band-comparison {
  min-height: 100vh;
  padding: 2rem 1rem;
}

.progress-header {
  max-width: 900px;
  margin: 0 auto 2rem;
  text-align: center;
}

.header-top {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.progress-header h2 {
  color: #fff;
  font-weight: 700;
  margin: 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.restart-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  padding: 0.5rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.restart-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.loading-container {
  padding: 4rem 0;
}

.loading-container p {
  color: #ccc;
  margin-top: 1rem;
}

.comparison-container {
  max-width: 1200px;
  margin: 0 auto;
}

.comparison-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 2rem;
  align-items: stretch;
}

.vs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
}

.vs-divider span {
  font-size: 2rem;
  font-weight: 900;
  color: #667eea;
  text-shadow: 0 0 10px rgba(102, 126, 234, 0.5);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.action-buttons {
  display: flex;
  justify-content: center;
  margin-top: 2rem;
}

.skip-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  padding: 0.75rem 2rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.skip-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.skip-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.suggestions-section {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.suggestions-title {
  color: #fff;
  font-size: 1.5rem;
  font-weight: 600;
  text-align: center;
  margin-bottom: 1.5rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.suggestions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  max-width: 900px;
  margin: 0 auto;
}

.suggestion-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.suggestion-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
  border-color: rgba(102, 126, 234, 0.3);
}

.suggestion-card h4 {
  color: #fff;
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.suggestion-genre {
  color: #667eea;
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0 0 0.75rem 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.suggestion-reason {
  color: #ccc;
  font-size: 0.9rem;
  line-height: 1.5;
  margin: 0;
}

@media (max-width: 768px) {
  .comparison-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .vs-divider {
    transform: rotate(90deg);
  }

  .vs-divider span {
    font-size: 1.5rem;
  }

  .header-top {
    flex-direction: column;
    gap: 1rem;
  }

  .suggestions-grid {
    grid-template-columns: 1fr;
  }
}
</style>