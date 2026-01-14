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
  background: transparent;
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
  overflow: hidden;
  padding: 14px 12px calc(12px + var(--app-bottom-inset));
}

.meeting-main-inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

@media (max-width: 768px) {
  .meeting-main {
    flex-direction: column;
  }

  .meeting-header {
    margin: 10px 10px 0;
    top: 10px;
  }
}
</style>
