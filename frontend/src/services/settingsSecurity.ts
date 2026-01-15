let settingsPassword = ''

export const setSettingsPassword = (password: string) => {
  settingsPassword = password
}

export const getSettingsPassword = (): string => settingsPassword

export const clearSettingsPassword = () => {
  settingsPassword = ''
}

export const getSettingsAuthHeaders = (): Record<string, string> => {
  const password = settingsPassword.trim()
  return password ? { 'x-settings-password': password } : {}
}
