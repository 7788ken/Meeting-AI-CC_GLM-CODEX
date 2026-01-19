import { getLocal, removeLocal, setLocal, StorageKeys } from '@/utils/storage'

const settingsPasswordExpiresSeconds = 24 * 60 * 60
let settingsPassword = ''

export const setSettingsPassword = (password: string) => {
  const normalized = password.trim()
  settingsPassword = normalized
  if (normalized) {
    setLocal(StorageKeys.SETTINGS_PASSWORD, normalized, settingsPasswordExpiresSeconds)
  } else {
    removeLocal(StorageKeys.SETTINGS_PASSWORD)
  }
}

export const getSettingsPassword = (): string => {
  if (settingsPassword.trim()) return settingsPassword
  const cached = getLocal<string>(StorageKeys.SETTINGS_PASSWORD)
  if (cached) {
    settingsPassword = cached
    return cached
  }
  return ''
}

export const clearSettingsPassword = () => {
  settingsPassword = ''
  removeLocal(StorageKeys.SETTINGS_PASSWORD)
}

export const getSettingsAuthHeaders = (): Record<string, string> => {
  const password = getSettingsPassword().trim()
  return password ? { 'x-settings-password': password } : {}
}
