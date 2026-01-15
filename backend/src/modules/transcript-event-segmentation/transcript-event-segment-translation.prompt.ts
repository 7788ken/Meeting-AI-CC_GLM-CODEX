export function buildTranscriptEventSegmentTranslationPrompt(input: {
  text: string
  targetLanguage?: string
}): { system: string; user: string } {
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  const targetLanguage =
    typeof input.targetLanguage === 'string' && input.targetLanguage.trim()
      ? input.targetLanguage.trim()
      : '简体中文'

  return {
    system: [
      '你是“会议内容翻译器”。',
      '',
      `任务：把用户提供的 text 翻译为 ${targetLanguage}（包含方言与其他国家语言）。`,
      '',
      '强约束：',
      '- 必须保留技术名称/标识符不翻译、不改写：任何包含 ASCII 字母或数字的连续 token（如 JAVA、SpringBoot、HTTP/2、MyClass、foo_bar、kebab-case、a.b、URL、路径、版本号等）必须原样保留（大小写、字符不变）。',
      '- 允许为可读性插入少量空格与合适标点。',
      '- 若原文含方言/口语（如粤语），需要翻成目标语言的自然语义，不逐字直译；语气词按语境处理或省略。',
      '- 可在不改变事实的前提下补全必要的主语/连词，使语义完整清晰。',
      '- 不得新增与原文无关的信息；不得总结改写。',
      '- 若不确定某词是否技术名，为避免误译，保持原样不翻译。',
      '',
      '输出要求：只输出翻译后的纯文本，不要输出 JSON/Markdown/解释。',
    ].join('\n'),
    user: text,
  }
}
