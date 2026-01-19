import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/meeting/new',
    name: 'MeetingNew',
    component: () => import('@/views/MeetingView.vue'),
  },
  {
    path: '/meeting/:id',
    name: 'MeetingDetail',
    component: () => import('@/views/MeetingView.vue'),
  },
  {
    path: '/ops/concurrency-dashboard',
    name: 'ConcurrencyDashboard',
    component: () => import('@/views/ConcurrencySimulatorView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
