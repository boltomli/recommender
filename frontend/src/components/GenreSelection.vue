<template>
  <div class="genre-selection">
    <div class="container">
      <h1 class="text-center mb-4">Choose Your Metal Subgenre</h1>
      <p class="text-center mb-5">Select a subgenre to discover bands that match your taste</p>
      
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
import { ref, onMounted } from 'vue';
import { apiService } from '../api';

const emit = defineEmits(['genre-selected']);

const genres = ref<string[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    genres.value = await apiService.getGenres();
  } catch (err) {
    error.value = 'Failed to load genres. Please try again.';
  } finally {
    loading.value = false;
  }
});

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
</style>