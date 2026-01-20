<template>
  <div class="recommendations">
    <div class="container">
      <h1 class="text-center mb-4">Your Personalized Recommendations</h1>
      <p class="text-center mb-5">Based on your preferences, here are bands you might enjoy</p>

      <div v-if="loading" class="text-center">
        <div class="spinner-border text-light" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-3">Analyzing your preferences...</p>
      </div>

      <div v-else-if="error" class="alert alert-danger">
        {{ error }}
      </div>

      <div v-else-if="recommendations.length > 0" class="recommendations-grid">
        <div
          v-for="(rec, index) in recommendations"
          :key="rec.band.id"
          class="recommendation-card"
          :class="`confidence-${getConfidenceLevel(rec.confidence)}`"
        >
          <div class="rank-badge">#{{ index + 1 }}</div>
          <BandCard :band="rec.band" :compact="true" />
          <div class="recommendation-reason">
            <strong>Why we think you'll like this:</strong>
            <p>{{ rec.reason }}</p>
            <div class="confidence-meter">
              <span class="confidence-label">Match Confidence:</span>
              <div class="confidence-bar">
                <div
                  class="confidence-fill"
                  :style="{ width: `${rec.confidence * 100}%` }"
                ></div>
              </div>
              <span class="confidence-value">{{ Math.round(rec.confidence * 100) }}%</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="text-center">
        <p>No recommendations available at this time.</p>
      </div>

      <div class="button-container">
        <button @click="restart" class="btn btn-restart">
          Start Over
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import BandCard from './BandCard.vue';
import { apiService, type Recommendation } from '../api';

const props = defineProps<{
  sessionId: string;
}>();

const emit = defineEmits(['restart']);

const recommendations = ref<Recommendation[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  await loadRecommendations();
});

const loadRecommendations = async () => {
  try {
    loading.value = true;
    error.value = '';
    recommendations.value = await apiService.getRecommendations(props.sessionId);
  } catch (err) {
    error.value = 'Failed to load recommendations. Please try again.';
  } finally {
    loading.value = false;
  }
};

const getConfidenceLevel = (confidence: number): string => {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
};

const restart = () => {
  emit('restart');
};
</script>

<style scoped>
.recommendations {
  min-height: 100vh;
  padding: 2rem 1rem;
  padding-bottom: 8rem;
}

.recommendations h1 {
  color: #f0f0f0;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.recommendations p {
  color: #b0b0b0;
  font-size: 1.1rem;
  margin-bottom: 1.5rem;
}

.recommendations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.recommendation-card {
  position: relative;
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 1.25rem 1.25rem 1.25rem 1.25rem;
  transition: border-color 0.2s ease;
  overflow: visible;
}

.recommendation-card:hover {
  border-color: #555;
}

.recommendation-card.confidence-high {
  border-color: #5a8a5a;
}

.recommendation-card.confidence-medium {
  border-color: #8a7a4a;
}

.recommendation-card.confidence-low {
  border-color: #6a6a6a;
}

.rank-badge {
  position: absolute;
  top: -8px;
  left: 15px;
  background: #4a4a4a;
  color: #e0e0e0;
  width: 36px;
  height: 36px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.95rem;
  z-index: 10;
}

.recommendation-reason {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #444;
}

.recommendation-reason strong {
  color: #d0d0d0;
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.95rem;
}

.recommendation-reason p {
  color: #a0a0a0;
  margin-bottom: 0.75rem;
  line-height: 1.5;
  font-size: 0.95rem;
}

.confidence-meter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.confidence-label {
  color: #888;
  font-size: 0.8rem;
  white-space: nowrap;
}

.confidence-bar {
  flex: 1;
  height: 6px;
  background: #3a3a3a;
  border-radius: 3px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  background: #5a8a5a;
  transition: width 0.3s ease;
}

.confidence-value {
  color: #d0d0d0;
  font-weight: 500;
  min-width: 45px;
  text-align: right;
  font-size: 0.9rem;
}

.button-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  padding: 1.5rem;
  background: #1a1a1a;
  border-top: 1px solid #333;
  z-index: 100;
}

.btn-restart {
  padding: 0.875rem 2rem;
  font-size: 1rem;
  font-weight: 500;
  background: #3a3a3a;
  border: 1px solid #555;
  color: #e0e0e0;
  border-radius: 6px;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.btn-restart:hover {
  background: #4a4a4a;
  border-color: #666;
}

@media (max-width: 768px) {
  .recommendations-grid {
    grid-template-columns: 1fr;
  }
}
</style>