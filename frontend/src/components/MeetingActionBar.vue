<template>
  <div ref="hostRef" class="actionbar-host" :aria-hidden="!enabled">
    <div v-if="enabled" class="actionbar app-surface">
      <div v-if="!compact" class="left" >
        <el-button
          size="small"
          type="danger"
          class="end-session-button"
          :disabled="disabled || ending"
          :icon="CircleClose"
          @click="emit('end-session')"
        >
          结束会话
        </el-button>
      </div>
      <div class="hint">
        <span class="hint-item"><kbd>R</kbd>录音</span>
        <span class="hint-item"><kbd>M</kbd>切麦/闭麦</span>
        <span class="hint-item"><kbd>?</kbd>帮助</span>
      </div>
      <div class="right">
        <el-button
          size="small"
          :type="recordingStatus === 'recording' ? 'warning' : 'success'"
          :disabled="disabled"
          :icon="recordButtonIcon"
          @click="emit('toggle-recording')"
        >
          {{ recordButtonText }}
        </el-button>
        <el-button
          size="small"
          :disabled="disabled || !canToggleMute"
          :icon="muteButtonIcon"
          @click="emit('toggle-mute')"
        >
          {{ muteButtonText }}
        </el-button>
        <template v-if="!compact">
          <el-button size="small" class="ghost" :icon="Key" @click="helpVisible = true">
            快捷键
          </el-button>
        </template>

        <template v-else>
          <el-dropdown
            trigger="click"
            :hide-on-click="true"
            @command="handleMoreCommand"
            @visible-change="(v: boolean) => (moreVisible = v)"
          >
            <el-button
              size="small"
              class="ghost"
              :icon="MoreFilled"
              :class="[moreVisible ? 'is-active' : '']"
            >
              更多
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="showShortcuts">快捷键</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>

        <el-button
          v-if="compact"
          size="small"
          type="danger"
          class="end-session-button"
          :disabled="disabled || ending"
          :icon="CircleClose"
          @click="emit('end-session')"
        >
          结束会话
        </el-button>
      </div>
    </div>

    <el-dialog
      v-model="helpVisible"
      title="快捷键"
      width="min(92vw, 560px)"
      append-to-body
    >
      <div class="help-grid">
        <div class="help-row">
          <kbd>R</kbd>
          <div class="help-text">开始/停止录音</div>
        </div>
        <div class="help-row">
          <kbd>M</kbd>
          <div class="help-text">切麦/闭麦（录音中：暂停/继续）</div>
        </div>
        <div class="help-row">
          <kbd>?</kbd>
          <div class="help-text">打开快捷键帮助</div>
        </div>
      </div>
      <template #footer>
        <el-button size="small" @click="helpVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  VideoPlay,
  VideoPause,
  Microphone,
  Mute,
  CircleClose,
  Key,
  MoreFilled,
} from "@element-plus/icons-vue";

type RecordingStatus = "idle" | "connecting" | "recording" | "paused" | "error";

const hostRef = ref<HTMLElement | null>(null);

const props = defineProps<{
  enabled: boolean;
  compact: boolean;
  disabled: boolean;
  ending: boolean;
  isSessionEnded: boolean;
  recordingStatus: RecordingStatus;
  isPaused: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle-recording"): void;
  (e: "toggle-mute"): void;
  (e: "end-session"): void;
  (e: "toggle-realtime"): void;
}>();

const helpVisible = ref(false);
const moreVisible = ref(false);
function openHelp(): void {
  helpVisible.value = true;
}

defineExpose({ openHelp, hostEl: hostRef });

function handleMoreCommand(command: string): void {
  switch (command) {
    case "toggleRealtime":
      emit("toggle-realtime");
      break;
    case "showShortcuts":
      helpVisible.value = true;
      break;
    default:
      break;
  }
}

const canToggleMute = computed(
  () => props.recordingStatus === "recording" || props.recordingStatus === "paused"
);
const recordButtonIcon = computed(() =>
  props.recordingStatus === "recording" ? VideoPause : VideoPlay
);
const muteButtonIcon = computed(() => (props.isPaused ? Microphone : Mute));

const recordButtonText = computed(() => {
  if (props.isSessionEnded) return "会话已结束";
  if (props.recordingStatus === "recording") return "停止录音";
  if (props.recordingStatus === "connecting") return "连接中...";
  return "开始录音";
});

const muteButtonText = computed(() => (props.isPaused ? "继续" : "切麦/闭麦"));
</script>

<style scoped>
.actionbar-host {
  /* position: fixed;
  left: 50%;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  width: min(1400px, calc(100vw - 24px));
  z-index: 30; */
  pointer-events: none;
}

.actionbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  pointer-events: auto;
}

.left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.hint {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--ink-500);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

kbd {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 7px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.64);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.08);
}

.ghost {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.55);
}

.ghost.is-active {
  border-color: rgba(47, 107, 255, 0.4);
  background: rgba(47, 107, 255, 0.08);
}

.help-grid {
  display: grid;
  gap: 10px;
}

.help-row {
  display: grid;
  grid-template-columns: 44px 1fr;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.55);
}

.help-text {
  color: var(--ink-700);
  line-height: 1.4;
}

@media (max-width: 860px) {
  .hint {
    display: none;
  }
}

@media (max-width: 540px) {
  .actionbar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .left {
    flex-direction: row;
    align-items: center;
  }

  .end-session-button {
    margin-right: auto;
  }

  .right {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
    justify-content: stretch;
  }

  .right > .el-button,
  .right .el-dropdown,
  .right .el-dropdown .el-button {
    width: 100%;
    justify-content: center;
  }
  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
</style>
