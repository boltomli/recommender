<template>
  <div id="app">
    <GenreSelection
      v-if="currentView === 'genre'"
      @genre-selected="onGenreSelected"
    />
    <BandComparison
      v-else-if="currentView === 'comparison'"
      :session-id="sessionId"
      :comparison-count="comparisonCount"
      @preference-recorded="onPreferenceRecorded"
      @recommendations-ready="onRecommendationsReady"
      @restart="restart"
    />
    <Recommendations
      v-else-if="currentView === 'recommendations'"
      :session-id="sessionId"
      @restart="restart"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import GenreSelection from './components/GenreSelection.vue';
import BandComparison from './components/BandComparison.vue';
import Recommendations from './components/Recommendations.vue';
import { apiService } from './api';

type View = 'genre' | 'comparison' | 'recommendations';

const currentView = ref<View>('genre');
const sessionId = ref('');
const comparisonCount = ref(0);

const onGenreSelected = async (genre: string) => {
  try {
    sessionId.value = await apiService.createSession(genre);
    comparisonCount.value = 0;
    currentView.value = 'comparison';
  } catch (error) {
    console.error('Failed to create session:', error);
    alert('Failed to start session. Please try again.');
  }
};

const onPreferenceRecorded = () => {
  comparisonCount.value++;
};

const onRecommendationsReady = () => {
  currentView.value = 'recommendations';
};

const restart = () => {
  currentView.value = 'genre';
  sessionId.value = '';
  comparisonCount.value = 0;
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

body {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
  color: #e0e0e0;
}

.alert {
  background: rgba(220, 38, 38, 0.2);
  border: 1px solid rgba(220, 38, 38, 0.5);
  color: #fca5a5;
  padding: 1rem;
  border-radius: 8px;
  margin: 1rem auto;
  max-width: 600px;
}

.spinner-border {
  width: 3rem;
  height: 3rem;
  border: 4px solid rgba(255, 255, 255, 0.1);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>