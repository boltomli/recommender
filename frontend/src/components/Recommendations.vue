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
  padding-bottom: 6rem;
}

.recommendations h1 {
  color: #fff;
  font-weight: 700;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  margin-bottom: 0.5rem;
}

.recommendations p {
  color: #ccc;
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
  background: linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 100%);
  border: 2px solid #444;
  border-radius: 12px;
  padding: 1.25rem 1.25rem 1.25rem 1.25rem;
  transition: all 0.3s ease;
  overflow: visible;
}

.recommendation-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
}

.recommendation-card.confidence-high {
  border-color: #10b981;
}

.recommendation-card.confidence-medium {
  border-color: #f59e0b;
}

.recommendation-card.confidence-low {
  border-color: #6b7280;
}

.rank-badge {
  position: absolute;
  top: -10px;
  left: 15px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.recommendation-reason {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #444;
}

.recommendation-reason strong {
  color: #fff;
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.95rem;
}

.recommendation-reason p {
  color: #ccc;
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
  color: #999;
  font-size: 0.8rem;
  white-space: nowrap;
}

.confidence-bar {
  flex: 1;
  height: 6px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  transition: width 0.5s ease;
}

.confidence-value {
  color: #fff;
  font-weight: 600;
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
  background: linear-gradient(to top, rgba(15, 15, 35, 0.95) 0%, rgba(15, 15, 35, 0.8) 70%, transparent 100%);
  z-index: 100;
}

.btn-restart {
  padding: 0.875rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  color: white;
  border-radius: 8px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.btn-restart:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}

@media (max-width: 768px) {
  .recommendations-grid {
    grid-template-columns: 1fr;
  }
}
</style>