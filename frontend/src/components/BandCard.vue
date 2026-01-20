<template>
  <div class="band-card" :class="{ 'selected': selected, 'compact': compact }" @click="$emit('select')" @mouseenter="onHover" @mouseleave="onLeave">
    <h3>{{ band.name }}</h3>
    <div class="genre-tags">
      <span v-for="genre in band.genre" :key="genre" class="badge">
        {{ genre }}
      </span>
    </div>
    <div class="band-info">
      <p class="era"><strong>Era:</strong> {{ band.era }}</p>
      <p class="description">{{ band.description }}</p>
      <div class="expandable-info" :class="{ 'expanded': !compact || isHovered }">
        <div v-if="band.albums && band.albums.length > 0" class="albums">
          <strong>Notable Albums:</strong>
          <ul>
            <li v-for="album in band.albums.slice(0, 5)" :key="album">{{ album }}</li>
          </ul>
        </div>
        <div v-if="band.styleNotes" class="style-notes">
          <strong>Style Evolution:</strong> {{ band.styleNotes }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Band } from '../api';

defineProps<{
  band: Band;
  selected?: boolean;
  compact?: boolean;
}>();

defineEmits<{
  select: [];
}>();

const isHovered = ref(false);

const onHover = () => {
  isHovered.value = true;
};

const onLeave = () => {
  isHovered.value = false;
};
</script>

<style scoped>
.band-card {
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 1.25rem;
  cursor: pointer;
  transition: border-color 0.2s ease;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.band-card:hover {
  border-color: #5a5a5a;
}

.band-card.selected {
  border-color: #666;
  background: #333;
}

.band-card.compact {
  padding: 1rem;
}

.band-card h3 {
  color: #f0f0f0;
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 1.35rem;
}

.band-card.compact h3 {
  font-size: 1.1rem;
}

.genre-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.band-card.compact .genre-tags {
  margin-bottom: 0.5rem;
}

.badge {
  background: #4a4a4a;
  color: #e0e0e0;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.band-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.band-info p {
  color: #b0b0b0;
  margin: 0;
  line-height: 1.5;
}

.band-info strong {
  color: #d0d0d0;
}

.era {
  font-size: 0.9rem;
}

.band-card.compact .era {
  font-size: 0.85rem;
}

.band-card.compact .description {
  font-size: 0.85rem;
}

.expandable-info {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: all 0.3s ease;
}

.expandable-info.expanded {
  max-height: 500px;
  opacity: 1;
  margin-top: 0.5rem;
}

.albums {
  margin-top: 0.25rem;
}

.albums ul {
  margin: 0.35rem 0 0 1.1rem;
  padding: 0;
  color: #a0a0a0;
}

.albums li {
  margin-bottom: 0.15rem;
  font-size: 0.9rem;
}

.style-notes {
  background: #3a3a3a;
  padding: 0.6rem;
  border-radius: 4px;
  border-left: 2px solid #555;
  font-size: 0.85rem;
  color: #c0c0c0;
  line-height: 1.4;
  margin-top: 0.5rem;
}

.band-card.compact .style-notes {
  font-size: 0.75rem;
  padding: 0.4rem;
}
</style>