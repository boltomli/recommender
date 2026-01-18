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
  font-size: 1.25rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  color: white;
  border-radius: 8px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.btn-genre:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}

.btn-genre:active {
  transform: translateY(-1px);
}

h1 {
  font-weight: 700;
  color: #fff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

p {
  color: #ccc;
  font-size: 1.1rem;
}
</style>