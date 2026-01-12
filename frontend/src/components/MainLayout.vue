<template>
  <div class="meeting-container">
    <header class="meeting-header">
      <slot name="header" />
    </header>

    <main class="meeting-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.meeting-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f5f5;
}

.meeting-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background-color: #fff;
  border-bottom: 1px solid #e8e8e8;
}

.meeting-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  padding: 16px;
  gap: 16px;
}

@media (max-width: 768px) {
  .meeting-main {
    flex-direction: column;
  }
}
</style>
