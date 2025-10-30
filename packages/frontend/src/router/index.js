import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import RoomView from '../views/RoomView.vue';

const routes = [
  { path: '/', component: HomeView },
  { path: '/room/:code', component: RoomView }
];

export default createRouter({
  history: createWebHistory(),
  routes
});
