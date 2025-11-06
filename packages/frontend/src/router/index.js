import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import RoomView from '../views/RoomView.vue';
import GameView from '../views/GameView.vue';

const routes = [
  { path: '/', component: HomeView },
  { path: '/room/:code', component: RoomView },
  { path: '/game/:code', component: GameView }
];

export default createRouter({
  history: createWebHistory(),
  routes
});
