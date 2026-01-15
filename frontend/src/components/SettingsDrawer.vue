<template>
  <el-drawer
    v-model="visibleProxy"
    :with-header="false"
    size="min(92vw, 720px)"
    direction="rtl"
    append-to-body
    class="settings-drawer"
    :destroy-on-close="false"
  >
    <div class="settings-shell">
      <header class="drawer-header">
        <div class="title-block">
          <div class="title">设置</div>
          <div class="subtitle">多数设置仅影响本地客户端；语句拆分与服务配置会同步到后端</div>
        </div>
        <div class="header-actions">
          <el-button size="small" class="icon-button" @click="visibleProxy = false">
            <el-icon><Close /></el-icon>
          </el-button>
          <el-button
            size="small"
            class="ghost-button"
            :icon="Refresh"
            @click="onReset"
          >
            重置
          </el-button>
          <el-button size="small" type="primary" :icon="Check" @click="onSave">
            保存并关闭
          </el-button>
        </div>
      </header>

      <div class="drawer-body">
        <el-tabs v-model="activeSection" tab-position="left" class="settings-tabs">
          <el-tab-pane name="asr">
            <template #label>
              <span class="tab-label">
                <el-icon><Microphone /></el-icon>
                ASR
              </span>
            </template>
            <section class="pane">
              <div class="pane-block">
                <div class="pane-title">ASR 模型</div>
                <div class="pane-subtitle">影响会话录音时的转写模型选择</div>

                <el-radio-group v-model="form.asrModel" class="choice-grid">
                  <el-radio
                    v-for="item in asrModels"
                    :key="item.value"
                    :label="item.value"
                    border
                    class="choice-card"
                  >
                    <div class="choice-title">{{ item.label }}</div>
                    <div class="choice-desc">{{ item.desc }}</div>
                  </el-radio>
                </el-radio-group>
              </div>

              <div class="pane-block">
                <div class="pane-title">录音来源</div>
                <div class="pane-subtitle">决定采集“麦克风 / 标签页音频 / 混合”。</div>

                <el-radio-group v-model="form.audioCaptureMode" class="choice-grid">
                  <el-radio
                    v-for="item in audioCaptureModes"
                    :key="item.value"
                    :label="item.value"
                    border
                    class="choice-card"
                  >
                    <div class="choice-title">{{ item.label }}</div>
                    <div class="choice-desc">{{ item.desc }}</div>
                  </el-radio>
                </el-radio-group>

                <div class="hint">
                  选择“标签页音频/混合”后，开始录音会弹出共享对话框；请选音頻播放的網頁标签页并勾选“共享音频”。
                </div>

                <el-form
                  v-if="form.audioCaptureMode !== 'tab'"
                  label-position="top"
                  :model="form"
                  class="pane-form"
                >
                  <el-form-item label="麦克风设备">
                    <div class="grid two-col">
                      <el-select v-model="form.micDeviceId" placeholder="系统默认" style="width: 100%">
                        <el-option label="系统默认" value="" />
                        <el-option
                          v-for="mic in microphones"
                          :key="mic.deviceId"
                          :label="mic.label || `麦克风 ${mic.deviceId}`"
                          :value="mic.deviceId"
                        />
                      </el-select>
                      <el-button size="small" :loading="loadingMicrophones" @click="refreshMicrophones">
                        刷新设备
                      </el-button>
                    </div>
                    <div class="hint">若设备列表为空，请先允许麦克风权限；“系统默认”会跟随系统输入设备。</div>
                  </el-form-item>
                </el-form>
              </div>
            </section>
          </el-tab-pane>

          <el-tab-pane name="vad">
            <template #label>
              <span class="tab-label">
                <el-icon><TrendCharts /></el-icon>
                VAD
              </span>
            </template>
            <section class="pane">
              <div class="pane-title">VAD 参数</div>
              <div class="pane-subtitle">能量阈值与静音窗口，决定分句敏感度</div>

              <div class="mono-preview">{{ vadPreview }}</div>

              <el-form label-position="top" :model="form" class="pane-form">
                <div class="grid two-col">
                  <el-form-item label="起始阈值 (start_th)">
                    <el-input-number
                      v-model="form.vadStartTh"
                      :step="0.001"
                      :precision="3"
                      :min="0"
                      controls-position="right"
                      class="mono-input"
                    />
                  </el-form-item>
                  <el-form-item label="停止阈值 (stop_th)">
                    <el-input-number
                      v-model="form.vadStopTh"
                      :step="0.001"
                      :precision="3"
                      :min="0"
                      controls-position="right"
                      class="mono-input"
                    />
                  </el-form-item>
                  <el-form-item label="静音间隔 (gap_ms)">
                    <el-input-number
                      v-model="form.vadGapMs"
                      :step="50"
                      :min="0"
                      controls-position="right"
                      class="mono-input"
                    />
                  </el-form-item>
                </div>
                <div class="hint">建议：start ≥ stop；gap 过小会导致频繁分段。</div>
              </el-form>
            </section>
          </el-tab-pane>

          <el-tab-pane name="segmentation">
            <template #label>
              <span class="tab-label">
                <el-icon><Document /></el-icon>
                语句拆分提示设置
              </span>
            </template>
            <section class="pane">
              <div class="pane-title">语句拆分提示设置</div>
              <div class="pane-subtitle">配置语句拆分的系统提示词与上下文窗口等参数。</div>

              <el-form label-position="top" :model="segmentationForm" class="pane-form">
                <el-form-item label="系统提示词">
                  <el-input
                    v-model="segmentationForm.systemPrompt"
                    type="textarea"
                    :autosize="{ minRows: 8, maxRows: 18 }"
                    placeholder="用于语句拆分的系统提示词"
                  />
                  <div class="hint">调整后将影响语句拆分的系统提示词规则。</div>
                  <div
                    v-if="getRemark('TRANSCRIPT_EVENTS_SEGMENT_SYSTEM_PROMPT')"
                    class="hint"
                  >
                    {{ getRemark('TRANSCRIPT_EVENTS_SEGMENT_SYSTEM_PROMPT') }}
                  </div>
                </el-form-item>

                <el-form-item label="严格回显提示词">
                  <el-input
                    v-model="segmentationForm.strictSystemPrompt"
                    type="textarea"
                    :autosize="{ minRows: 4, maxRows: 12 }"
                    placeholder="用于严格 JSON 回显校验失败后的兜底策略提示词"
                  />
                  <div class="hint">主要用于提升 JSON 模式下的输出稳定性；留空将沿用后端当前值。</div>
                  <div
                    v-if="getRemark('TRANSCRIPT_EVENTS_SEGMENT_STRICT_SYSTEM_PROMPT')"
                    class="hint"
                  >
                    {{ getRemark('TRANSCRIPT_EVENTS_SEGMENT_STRICT_SYSTEM_PROMPT') }}
                  </div>
                </el-form-item>

                <div class="grid two-col">
                  <el-form-item label="上下文窗口事件数">
                    <el-input-number
                      v-model="segmentationForm.windowEvents"
                      :min="5"
                      :max="2000"
                      :step="1"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('TRANSCRIPT_EVENTS_SEGMENT_CHUNK_SIZE')" class="hint">
                      {{ getRemark('TRANSCRIPT_EVENTS_SEGMENT_CHUNK_SIZE') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="拆分触发间隔 (ms)">
                    <el-input-number
                      v-model="segmentationForm.intervalMs"
                      :min="0"
                      :max="600000"
                      :step="100"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('TRANSCRIPT_EVENTS_SEGMENT_INTERVAL_MS')" class="hint">
                      {{ getRemark('TRANSCRIPT_EVENTS_SEGMENT_INTERVAL_MS') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="GLM 模型">
                    <el-input v-model="segmentationForm.model" placeholder="如 GLM-4X" />
                    <div v-if="getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL')" class="hint">
                      {{ getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="最大输出 tokens">
                    <el-input-number
                      v-model="segmentationForm.maxTokens"
                      :min="256"
                      :max="8192"
                      :step="128"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_MAX_TOKENS')" class="hint">
                      {{ getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_MAX_TOKENS') }}
                    </div>
                  </el-form-item>
                </div>

                <div class="grid two-col">
                  <el-form-item label="JSON 模式">
                    <el-switch v-model="segmentationForm.jsonMode" />
                    <div v-if="getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_JSON_MODE')" class="hint">
                      {{ getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_JSON_MODE') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="触发条件：stop_transcribe">
                    <el-switch v-model="segmentationForm.triggerOnStopTranscribe" />
                    <div
                      v-if="getRemark('TRANSCRIPT_EVENTS_SEGMENT_TRIGGER_ON_STOP_TRANSCRIBE')"
                      class="hint"
                    >
                      {{ getRemark('TRANSCRIPT_EVENTS_SEGMENT_TRIGGER_ON_STOP_TRANSCRIBE') }}
                    </div>
                  </el-form-item>
                </div>

                <div class="pane-title section-title">高级参数</div>
                <div class="pane-subtitle">影响单次拆分生成上限、截断补偿、429 退避与严格失败降级。</div>

                <div class="grid two-col">
                  <el-form-item label="单次最多生成段数">
                    <el-input-number
                      v-model="segmentationForm.maxSegmentsPerRun"
                      :min="1"
                      :max="100"
                      :step="1"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div
                      v-if="getRemark('TRANSCRIPT_EVENTS_SEGMENT_MAX_SEGMENTS_PER_RUN')"
                      class="hint"
                    >
                      {{ getRemark('TRANSCRIPT_EVENTS_SEGMENT_MAX_SEGMENTS_PER_RUN') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="截断补偿 tokens">
                    <el-input-number
                      v-model="segmentationForm.bumpMaxTokens"
                      :min="256"
                      :max="8192"
                      :step="128"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div
                      v-if="getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_BUMP_MAX_TOKENS')"
                      class="hint"
                    >
                      {{ getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_BUMP_MAX_TOKENS') }}
                    </div>
                  </el-form-item>
                </div>

                <div class="grid two-col">
                  <el-form-item label="429 重试次数">
                    <el-input-number
                      v-model="segmentationForm.retryMax"
                      :min="0"
                      :max="10"
                      :step="1"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX')" class="hint">
                      {{ getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="退避基准 (ms)">
                    <el-input-number
                      v-model="segmentationForm.retryBaseMs"
                      :min="0"
                      :max="60000"
                      :step="100"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div
                      v-if="getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_BASE_MS')"
                      class="hint"
                    >
                      {{ getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_BASE_MS') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="退避上限 (ms)">
                    <el-input-number
                      v-model="segmentationForm.retryMaxMs"
                      :min="0"
                      :max="120000"
                      :step="100"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div
                      v-if="getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX_MS')"
                      class="hint"
                    >
                      {{ getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX_MS') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="严格失败降级">
                    <el-switch v-model="segmentationForm.degradeOnStrictFail" />
                    <div
                      v-if="getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_DEGRADE_ON_STRICT_FAIL')"
                      class="hint"
                    >
                      {{ getRemark('GLM_TRANSCRIPT_EVENT_SEGMENT_DEGRADE_ON_STRICT_FAIL') }}
                    </div>
                  </el-form-item>
                </div>

                <div class="hint">触发间隔为 0 表示每次事件更新都会尝试拆分；修改后可在会议页点击“重拆”立即生效。</div>
              </el-form>
            </section>
          </el-tab-pane>

          <el-tab-pane name="backend">
            <template #label>
              <span class="tab-label">
                <el-icon><Setting /></el-icon>
                AI 服务
              </span>
            </template>
            <section class="pane">
              <div class="pane-title">AI 服务配置</div>
              <div class="pane-subtitle">保存后写入后端数据库，用于 GLM 调用与限流。</div>

              <el-form label-position="top" :model="backendForm" class="pane-form">
                <el-form-item label="GLM API Key">
                  <el-input
                    v-model="backendForm.glmApiKey"
                    show-password
                    placeholder="如 apiKey 或 apiKey.secret"
                  />
                  <div v-if="getRemark('GLM_API_KEY')" class="hint">
                    {{ getRemark('GLM_API_KEY') }}
                  </div>
                </el-form-item>
                <el-form-item label="GLM Endpoint">
                  <el-input
                    v-model="backendForm.glmEndpoint"
                    placeholder="https://open.bigmodel.cn/api/paas/v4/chat/completions"
                  />
                  <div v-if="getRemark('GLM_ENDPOINT')" class="hint">
                    {{ getRemark('GLM_ENDPOINT') }}
                  </div>
                </el-form-item>

                <div class="grid two-col">
                  <el-form-item label="会议总结模型">
                    <el-input v-model="backendForm.glmTranscriptSummaryModel" placeholder="如 GLM-4.6V-Flash" />
                    <div v-if="getRemark('GLM_TRANSCRIPT_SUMMARY_MODEL')" class="hint">
                      {{ getRemark('GLM_TRANSCRIPT_SUMMARY_MODEL') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="会议总结最大 tokens">
                    <el-input-number
                      v-model="backendForm.glmTranscriptSummaryMaxTokens"
                      :min="256"
                      :max="8192"
                      :step="128"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('GLM_TRANSCRIPT_SUMMARY_MAX_TOKENS')" class="hint">
                      {{ getRemark('GLM_TRANSCRIPT_SUMMARY_MAX_TOKENS') }}
                    </div>
                  </el-form-item>
                </div>

                <div class="grid two-col">
                  <el-form-item label="会议总结深度思考">
                    <el-switch v-model="backendForm.glmTranscriptSummaryThinking" />
                    <div v-if="getRemark('GLM_TRANSCRIPT_SUMMARY_THINKING')" class="hint">
                      {{ getRemark('GLM_TRANSCRIPT_SUMMARY_THINKING') }}
                    </div>
                  </el-form-item>
                </div>

                <div class="pane-title section-title">限流与重试</div>
                <div class="pane-subtitle">调整请求节奏与重试策略。</div>

                <div class="grid two-col">
                  <el-form-item label="并发上限">
                    <el-input-number
                      v-model="backendForm.glmGlobalConcurrency"
                      :min="1"
                      :max="50"
                      :step="1"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('GLM_GLOBAL_CONCURRENCY')" class="hint">
                      {{ getRemark('GLM_GLOBAL_CONCURRENCY') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="最小间隔 (ms)">
                    <el-input-number
                      v-model="backendForm.glmGlobalMinIntervalMs"
                      :min="0"
                      :max="60000"
                      :step="100"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('GLM_GLOBAL_MIN_INTERVAL_MS')" class="hint">
                      {{ getRemark('GLM_GLOBAL_MIN_INTERVAL_MS') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="冷却时间 (ms)">
                    <el-input-number
                      v-model="backendForm.glmGlobalRateLimitCooldownMs"
                      :min="0"
                      :max="120000"
                      :step="100"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('GLM_GLOBAL_RATE_LIMIT_COOLDOWN_MS')" class="hint">
                      {{ getRemark('GLM_GLOBAL_RATE_LIMIT_COOLDOWN_MS') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="冷却上限 (ms)">
                    <el-input-number
                      v-model="backendForm.glmGlobalRateLimitMaxMs"
                      :min="0"
                      :max="300000"
                      :step="100"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('GLM_GLOBAL_RATE_LIMIT_MAX_MS')" class="hint">
                      {{ getRemark('GLM_GLOBAL_RATE_LIMIT_MAX_MS') }}
                    </div>
                  </el-form-item>
                </div>

                <div class="grid two-col">
                  <el-form-item label="重试次数">
                    <el-input-number
                      v-model="backendForm.glmTranscriptSummaryRetryMax"
                      :min="0"
                      :max="10"
                      :step="1"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('GLM_TRANSCRIPT_SUMMARY_RETRY_MAX')" class="hint">
                      {{ getRemark('GLM_TRANSCRIPT_SUMMARY_RETRY_MAX') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="退避基准 (ms)">
                    <el-input-number
                      v-model="backendForm.glmTranscriptSummaryRetryBaseMs"
                      :min="0"
                      :max="60000"
                      :step="100"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('GLM_TRANSCRIPT_SUMMARY_RETRY_BASE_MS')" class="hint">
                      {{ getRemark('GLM_TRANSCRIPT_SUMMARY_RETRY_BASE_MS') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="退避上限 (ms)">
                    <el-input-number
                      v-model="backendForm.glmTranscriptSummaryRetryMaxMs"
                      :min="0"
                      :max="120000"
                      :step="100"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('GLM_TRANSCRIPT_SUMMARY_RETRY_MAX_MS')" class="hint">
                      {{ getRemark('GLM_TRANSCRIPT_SUMMARY_RETRY_MAX_MS') }}
                    </div>
                  </el-form-item>
                </div>

                <div class="pane-title section-title">系统设置</div>
                <div class="pane-subtitle">设置系统安全密码，启用后打开设置需验证。</div>

                <el-form-item label="当前状态">
                  <el-tag v-if="securityStatus.enabled" type="success" size="small">已设置</el-tag>
                  <el-tag v-else type="info" size="small">未设置</el-tag>
                </el-form-item>

                <el-form-item v-if="securityStatus.enabled" label="当前密码">
                  <el-input
                    v-model="securityForm.currentPassword"
                    show-password
                    placeholder="请输入当前密码"
                  />
                </el-form-item>

                <el-form-item label="新密码">
                  <el-input
                    v-model="securityForm.newPassword"
                    show-password
                    placeholder="请输入新密码"
                  />
                  <div class="hint">该密码用于进入设置与修改服务配置。</div>
                </el-form-item>

                <el-button size="small" type="primary" @click="updateSecurityPassword">
                  {{ securityStatus.enabled ? '更新密码' : '初始化密码' }}
                </el-button>

                <div class="pane-title section-title">转写与音频</div>
                <div class="pane-subtitle">影响实时转写的自动切分与音频 buffer 触发策略。</div>

                <div class="grid two-col">
                  <el-form-item label="自动切分间隔 (ms)">
                    <el-input-number
                      v-model="backendForm.transcriptAutoSplitGapMs"
                      :min="0"
                      :max="600000"
                      :step="100"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('TRANSCRIPT_AUTO_SPLIT_GAP_MS')" class="hint">
                      {{ getRemark('TRANSCRIPT_AUTO_SPLIT_GAP_MS') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="音频 buffer 软上限 (ms)">
                    <el-input-number
                      v-model="backendForm.transcriptMaxBufferDurationSoftMs"
                      :min="5000"
                      :max="59000"
                      :step="500"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('TRANSCRIPT_MAX_BUFFER_DURATION_SOFT_MS')" class="hint">
                      {{ getRemark('TRANSCRIPT_MAX_BUFFER_DURATION_SOFT_MS') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="音频 buffer 硬上限 (ms)">
                    <el-input-number
                      v-model="backendForm.transcriptMaxBufferDurationHardMs"
                      :min="backendForm.transcriptMaxBufferDurationSoftMs"
                      :max="59000"
                      :step="500"
                      controls-position="right"
                      class="mono-input"
                    />
                    <div v-if="getRemark('TRANSCRIPT_MAX_BUFFER_DURATION_HARD_MS')" class="hint">
                      {{ getRemark('TRANSCRIPT_MAX_BUFFER_DURATION_HARD_MS') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="调试：打印语句日志">
                    <el-switch v-model="backendForm.transcriptDebugLogUtterances" />
                    <div v-if="getRemark('TRANSCRIPT_DEBUG_LOG_UTTERANCES')" class="hint">
                      {{ getRemark('TRANSCRIPT_DEBUG_LOG_UTTERANCES') }}
                    </div>
                  </el-form-item>
                  <el-form-item label="语句翻译（简体中文）">
                    <el-switch v-model="backendForm.transcriptSegmentTranslationEnabled" />
                    <div v-if="getRemark('TRANSCRIPT_SEGMENT_TRANSLATION_ENABLED')" class="hint">
                      {{ getRemark('TRANSCRIPT_SEGMENT_TRANSLATION_ENABLED') }}
                    </div>
                  </el-form-item>
                </div>
              </el-form>
            </section>
          </el-tab-pane>

          <el-tab-pane name="service">
            <template #label>
              <span class="tab-label">
                <el-icon><Connection /></el-icon>
                服务
              </span>
            </template>
            <section class="pane">
              <div class="pane-title">服务地址</div>
              <div class="pane-subtitle">覆盖 HTTP / WebSocket 地址（仅前端）</div>

              <el-alert
                type="warning"
                show-icon
                :closable="false"
                class="alert"
                title="修改地址会影响后续请求/连接；录音中不建议修改。"
              />

              <el-form label-position="top" :model="form" class="pane-form">
                <el-form-item label="API 基础地址">
                  <el-input v-model="form.apiBaseUrl" placeholder="如 https://host/api 或 /api" />
                </el-form-item>
                <el-form-item label="WebSocket 地址">
                  <el-input v-model="form.wsUrl" placeholder="如 wss://host/transcript" />
                </el-form-item>
              </el-form>
            </section>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </el-drawer>

</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Connection,
  TrendCharts,
  Document,
  Microphone,
  Refresh,
  Close,
  Check,
  Setting,
} from '@element-plus/icons-vue'
import { useAppSettings, type AppSettings, type AsrModel, type AudioCaptureMode } from '@/composables/useAppSettings'
import { useBackendConfig } from '@/composables/useBackendConfig'
import { appConfigRemarksApi, appConfigSecurityApi, transcriptEventSegmentationConfigApi } from '@/services/api'
import type { AppConfigRemark, BackendConfig, TranscriptEventSegmentationConfig } from '@/services/api'
import { setSettingsPassword } from '@/services/settingsSecurity'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const {
  settings,
  updateSettings,
  resetSettings,
  validateSettings,
} = useAppSettings()
const { backendConfig, refreshBackendConfig, updateBackendConfig, validateBackendConfig } =
  useBackendConfig()

const visibleProxy = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<AppSettings>({ ...settings.value })
const segmentationForm = reactive<TranscriptEventSegmentationConfig>({
  systemPrompt: '',
  strictSystemPrompt: '',
  windowEvents: 120,
  intervalMs: 3000,
  triggerOnStopTranscribe: true,
  model: '',
  maxTokens: 2000,
  jsonMode: true,
  bumpMaxTokens: 4096,
  retryMax: 5,
  retryBaseMs: 500,
  retryMaxMs: 8000,
  degradeOnStrictFail: false,
  maxSegmentsPerRun: 8,
})
const activeSection = ref<'asr' | 'vad' | 'segmentation' | 'backend' | 'service'>('asr')
const microphones = ref<MediaDeviceInfo[]>([])
const loadingMicrophones = ref(false)
const configRemarks = ref<Record<string, string>>({})

const asrModels: Array<{ value: AsrModel; label: string; desc: string }> = [
  { value: 'glm', label: 'GLM ASR', desc: '高精度，适合高噪声场景' },
]

const audioCaptureModes: Array<{ value: AudioCaptureMode; label: string; desc: string }> = [
  { value: 'mic', label: '仅麦克风', desc: '默认模式，只采集你的麦克风输入' },
  { value: 'tab', label: '仅标签页音频', desc: '采集共享标签页的音频（例如 YouTube）' },
  { value: 'mix', label: '麦克风 + 标签页音频', desc: '将麦克风与共享标签页音频混合后转写' },
]

const backendForm = reactive<BackendConfig>({ ...backendConfig.value })
const securityStatus = ref({ enabled: false })
const securityForm = reactive({
  currentPassword: '',
  newPassword: '',
})

const vadPreview = computed(() => {
  return `VAD_START_TH=${form.vadStartTh}  VAD_STOP_TH=${form.vadStopTh}  VAD_GAP_MS=${form.vadGapMs}`
})

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      await refreshBackendConfig()
      await refreshConfigRemarks()
      await refreshSegmentationConfig()
      await refreshSecurityStatus()
      Object.assign(form, settings.value)
      Object.assign(backendForm, backendConfig.value)
      activeSection.value = 'asr'
      if (form.audioCaptureMode !== 'tab') {
        await refreshMicrophones()
      }
    }
  },
  { immediate: true },
)

watch(
  () => form.audioCaptureMode,
  async (mode) => {
    if (!props.modelValue) return
    if (mode === 'tab') return
    await refreshMicrophones()
  },
)

async function refreshMicrophones(): Promise<void> {
  if (loadingMicrophones.value) return
  loadingMicrophones.value = true
  try {
    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
      ElMessage.warning('当前浏览器不支持麦克风设备枚举')
      microphones.value = []
      return
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())

    const devices = await navigator.mediaDevices.enumerateDevices()
    microphones.value = devices.filter((d) => d.kind === 'audioinput')

    if (form.micDeviceId && !microphones.value.some((mic) => mic.deviceId === form.micDeviceId)) {
      form.micDeviceId = ''
    }
  } catch (error) {
    console.error('获取麦克风列表失败:', error)
    microphones.value = []
  } finally {
    loadingMicrophones.value = false
  }
}

function getRemark(key: string): string {
  return (configRemarks.value[key] ?? '').trim()
}

async function refreshConfigRemarks(): Promise<void> {
  try {
    const response = await appConfigRemarksApi.get()
    const list: AppConfigRemark[] = Array.isArray(response?.data) ? response.data : []
    configRemarks.value = Object.fromEntries(list.map(item => [item.key, item.remark]))
  } catch {
    configRemarks.value = {}
  }
}

function validateSegmentationConfig(input: Partial<TranscriptEventSegmentationConfig>): string[] {
  const errors: string[] = []
  if (!String(input.systemPrompt ?? '').trim()) errors.push('语句拆分提示词不能为空')
  if (!String(input.model ?? '').trim()) errors.push('语句拆分模型不能为空')

  const windowEvents = Number(input.windowEvents)
  if (!Number.isFinite(windowEvents) || windowEvents < 5 || windowEvents > 2000) {
    errors.push('语句拆分上下文窗口事件数范围为 5~2000')
  }

  const intervalMs = Number(input.intervalMs)
  if (!Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 10 * 60 * 1000) {
    errors.push('语句拆分触发间隔范围为 0~600000ms')
  }

  const maxTokens = Number(input.maxTokens)
  if (!Number.isFinite(maxTokens) || maxTokens < 256 || maxTokens > 8192) {
    errors.push('语句拆分最大 tokens 范围为 256~8192')
  }

  const bumpMaxTokens = Number(input.bumpMaxTokens)
  if (!Number.isFinite(bumpMaxTokens) || bumpMaxTokens < 256 || bumpMaxTokens > 8192) {
    errors.push('语句拆分补偿 tokens 范围为 256~8192')
  }

  const retryMax = Number(input.retryMax)
  if (!Number.isFinite(retryMax) || retryMax < 0 || retryMax > 10) {
    errors.push('语句拆分重试次数范围为 0~10')
  }

  const retryBaseMs = Number(input.retryBaseMs)
  if (!Number.isFinite(retryBaseMs) || retryBaseMs < 0 || retryBaseMs > 60000) {
    errors.push('语句拆分退避基准范围为 0~60000ms')
  }

  const retryMaxMs = Number(input.retryMaxMs)
  if (!Number.isFinite(retryMaxMs) || retryMaxMs < 0 || retryMaxMs > 120000) {
    errors.push('语句拆分退避上限范围为 0~120000ms')
  }

  const maxSegmentsPerRun = Number(input.maxSegmentsPerRun)
  if (!Number.isFinite(maxSegmentsPerRun) || maxSegmentsPerRun < 1 || maxSegmentsPerRun > 100) {
    errors.push('单次语句拆分最大生成段数范围为 1~100')
  }

  return errors
}

async function refreshSegmentationConfig(): Promise<boolean> {
  try {
    const response = await transcriptEventSegmentationConfigApi.get()
    if (response?.data) {
      Object.assign(segmentationForm, response.data)
      return true
    }
    return false
  } catch {
    return false
  }
}

async function refreshSecurityStatus(): Promise<void> {
  try {
    const response = await appConfigSecurityApi.getStatus()
    securityStatus.value.enabled = response?.data?.enabled === true
  } catch {
    securityStatus.value.enabled = false
  }
}

async function updateSecurityPassword(): Promise<void> {
  const nextPassword = securityForm.newPassword.trim()
  if (!nextPassword) {
    ElMessage.warning('请输入新密码')
    return
  }
  const payload: { password: string; currentPassword?: string } = {
    password: nextPassword,
  }
  if (securityStatus.value.enabled) {
    const currentPassword = securityForm.currentPassword.trim()
    if (!currentPassword) {
      ElMessage.warning('请输入当前密码')
      return
    }
    payload.currentPassword = currentPassword
  }
  try {
    await appConfigSecurityApi.updatePassword(payload)
    securityStatus.value.enabled = true
    setSettingsPassword(nextPassword)
    securityForm.currentPassword = ''
    securityForm.newPassword = ''
    ElMessage.success('系统设置密码已更新')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '系统设置密码更新失败')
  }
}

function buildSegmentationConfigPayload() {
  return {
    systemPrompt: segmentationForm.systemPrompt,
    strictSystemPrompt: segmentationForm.strictSystemPrompt,
    windowEvents: segmentationForm.windowEvents,
    intervalMs: segmentationForm.intervalMs,
    triggerOnStopTranscribe: segmentationForm.triggerOnStopTranscribe,
    model: segmentationForm.model,
    maxTokens: segmentationForm.maxTokens,
    jsonMode: segmentationForm.jsonMode,
    bumpMaxTokens: segmentationForm.bumpMaxTokens,
    retryMax: segmentationForm.retryMax,
    retryBaseMs: segmentationForm.retryBaseMs,
    retryMaxMs: segmentationForm.retryMaxMs,
    degradeOnStrictFail: segmentationForm.degradeOnStrictFail,
    maxSegmentsPerRun: segmentationForm.maxSegmentsPerRun,
  }
}

async function syncSegmentationConfig(): Promise<boolean> {
  try {
    await transcriptEventSegmentationConfigApi.update(buildSegmentationConfigPayload())
    return true
  } catch (error) {
    console.error('语句拆分配置同步失败:', error)
    return false
  }
}

async function syncBackendConfig(): Promise<boolean> {
  const synced = await updateBackendConfig(backendForm)
  if (synced) {
    Object.assign(backendForm, backendConfig.value)
  }
  return synced
}

const onSave = async () => {
  const errors = validateSettings(form)
  if (errors.length > 0) {
    ElMessage.error(errors[0])
    return
  }
  const segmentationErrors = validateSegmentationConfig(segmentationForm)
  if (segmentationErrors.length > 0) {
    ElMessage.error(segmentationErrors[0])
    return
  }
  const backendErrors = validateBackendConfig(backendForm)
  if (backendErrors.length > 0) {
    ElMessage.error(backendErrors[0])
    return
  }
  updateSettings(form)
  const segmentationSynced = await syncSegmentationConfig()
  const backendSynced = await syncBackendConfig()
  if (segmentationSynced && backendSynced) {
    ElMessage.success('设置已保存')
  } else if (!segmentationSynced && !backendSynced) {
    ElMessage.warning('设置已保存，但语句拆分与服务配置同步失败')
  } else if (!segmentationSynced) {
    ElMessage.warning('设置已保存，但语句拆分设置同步失败')
  } else {
    ElMessage.warning('设置已保存，但服务配置同步失败')
  }
  visibleProxy.value = false
}

const onReset = async () => {
  try {
    await ElMessageBox.confirm('确定恢复默认设置？', '重置', { type: 'warning' })
    const next = resetSettings()
    Object.assign(form, next)

    try {
      const response = await transcriptEventSegmentationConfigApi.reset()
      Object.assign(segmentationForm, response.data)
      ElMessage.success('已恢复默认值')
    } catch (error) {
      console.error('语句拆分配置重置失败:', error)
      ElMessage.warning('已恢复默认值，但语句拆分设置重置失败')
    }

    await refreshBackendConfig()
    Object.assign(backendForm, backendConfig.value)
  } catch {
    // 用户取消
  }
}
</script>

<style scoped>
.settings-drawer :deep(.el-drawer__body) {
  padding: 0;
  background: var(--paper-50);
  background-image:
    linear-gradient(rgba(47, 107, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(47, 107, 255, 0.06) 1px, transparent 1px);
  background-size: 24px 24px;
}

.settings-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: var(--font-sans);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
}

.title-block .title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink-900);
}

.title-block .subtitle {
  color: var(--ink-500);
  font-size: 12px;
  margin-top: 4px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.drawer-body {
  flex: 1;
  min-height: 0;
  padding: 14px 16px 16px;
}

.settings-tabs {
  height: 100%;
}

.settings-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.settings-tabs :deep(.el-tabs__nav-wrap) {
  padding-right: 10px;
}

.settings-tabs :deep(.el-tabs__item) {
  height: 44px;
  line-height: 44px;
  border-radius: 10px;
  margin: 4px 0;
  color: var(--ink-700);
  transition: all 0.15s ease;
}

.settings-tabs :deep(.el-tabs__item.is-active) {
  background: rgba(47, 107, 255, 0.10);
  color: var(--brand-700);
}

.settings-tabs :deep(.el-tabs__active-bar) {
  background: transparent;
}

.settings-tabs :deep(.el-tabs__content) {
  height: 100%;
  overflow: hidden;
}

.settings-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.pane {
  height: 100%;
  overflow: auto;
  padding: 14px 16px 18px;
  border-radius: 14px;
  border: 1px solid rgba(47, 107, 255, 0.12);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.06);
}

.pane-block + .pane-block {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.pane-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-900);
}

.section-title {
  margin-top: 18px;
}

.pane-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink-500);
}

.pane-form {
  margin-top: 14px;
}

.grid.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px 16px;
}

.hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-500);
  line-height: 16px;
}

.choice-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
  min-width: 0;
}

.choice-card {
  width: 100%;
  align-items: flex-start;
  height: auto;
  min-height: 56px;
  margin: 0;
  padding: 12px 12px;
  border-radius: 12px;
  border-color: rgba(31, 41, 55, 0.16);
  background: rgba(255, 255, 255, 0.7);
  transition: all 0.15s ease;
  white-space: normal;
}

.choice-card.is-checked {
  border-color: rgba(47, 107, 255, 0.55);
  background: rgba(47, 107, 255, 0.06);
  box-shadow: 0 10px 26px rgba(47, 107, 255, 0.10);
}

.choice-card.is-checked .choice-title {
  color: var(--brand-700);
}

.ghost-button {
  border-color: rgba(31, 41, 55, 0.16);
  color: #374151;
  background: rgba(255, 255, 255, 0.6);
}

.icon-button {
  border-color: rgba(31, 41, 55, 0.16);
  background: rgba(255, 255, 255, 0.6);
}

.icon-button:hover,
.ghost-button:hover {
  border-color: rgba(47, 107, 255, 0.40);
  background: rgba(47, 107, 255, 0.06);
}

.choice-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-900);
}

.choice-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink-500);
  overflow-wrap: anywhere;
}

.mono-preview {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed rgba(47, 107, 255, 0.28);
  background: rgba(47, 107, 255, 0.04);
  color: var(--ink-700);
  font-size: 12px;
  font-family:
    "JetBrains Mono",
    "SFMono-Regular",
    ui-monospace,
    "SF Mono",
    Menlo,
    monospace;
  line-height: 1.6;
  word-break: break-word;
}


.mono-input :deep(.el-input__inner) {
  font-family:
    "JetBrains Mono",
    "SFMono-Regular",
    ui-monospace,
    "SF Mono",
    Menlo,
    monospace;
}

.alert {
  margin-top: 12px;
}

@media (max-width: 960px) {
  .settings-tabs :deep(.el-tabs--left) {
    display: block;
  }

  .settings-tabs :deep(.el-tabs__header) {
    margin-bottom: 10px;
  }
}
</style>
