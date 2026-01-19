<template>
  <div class="meeting-container">
    <header class="meeting-header app-surface">
      <div class="meeting-header-inner">
        <slot name="header" />
      </div>
    </header>

    <main class="meeting-main">
      <div class="meeting-main-inner">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.meeting-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  background: transparent;
  overflow: hidden;
}

.meeting-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  margin: 12px 12px 0;
  position: sticky;
  top: 12px;
  z-index: 20;
}

.meeting-header-inner {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.meeting-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: visible;
  padding: 14px 12px calc(24px + var(--app-bottom-inset) + env(safe-area-inset-bottom, 0px));
}

.meeting-main-inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
  /* max-width: 1400px; */
  margin: 0 auto;
  width: 100%;
}

@media (max-width: 768px) {
  .meeting-main {
    flex-direction: column;
    padding: 10px 8px calc(16px + var(--app-bottom-inset) + env(safe-area-inset-bottom, 0px));
  }

  .meeting-header {
    padding: 8px 10px;
    margin: 8px 8px 0;
    top: 10px;
  }

  .meeting-header-inner {
    flex-wrap: wrap;
    gap: 8px 12px;
  }

  .meeting-header-inner :deep(.header-left) {
    flex: 1 1 100%;
    min-width: 0;
  }

  .meeting-header-inner :deep(.header-right) {
    flex: 1 1 100%;
    justify-content: center;
  }

  .meeting-main-inner {
    gap: 10px;
  }
}
</style>
