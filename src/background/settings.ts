/**
 * Settings Manager Module
 * 
 * Handles extension settings storage, retrieval, and validation
 */

import { ExtensionSettings, DEFAULT_SETTINGS, ExtensionError } from '@/types';
import { getChromeStorage, setChromeStorage, validateSettings, createError, log } from '@/utils';

/**
 * Get extension settings from Chrome storage
 */
export async function getSettings(): Promise<ExtensionSettings> {
  try {
    log('info', 'Settings', 'Getting extension settings');
    
    const result = await getChromeStorage<Partial<ExtensionSettings>>([
      'savePath', 
      'fileFormat', 
      'downloadMedia'
    ]);
    
    // Merge with defaults
    const settings: ExtensionSettings = {
      savePath: result.savePath || DEFAULT_SETTINGS.savePath,
      fileFormat: result.fileFormat || DEFAULT_SETTINGS.fileFormat,
      downloadMedia: result.downloadMedia !== undefined ? result.downloadMedia : DEFAULT_SETTINGS.downloadMedia
    };
    
    log('info', 'Settings', 'Settings retrieved successfully', settings);
    return settings;
  } catch (error) {
    log('error', 'Settings', 'Failed to get settings', error);
    throw createError(
      ExtensionError.STORAGE_ERROR,
      '获取设置失败',
      'Failed to retrieve settings from Chrome storage',
      error as Error
    );
  }
}

/**
 * Save extension settings to Chrome storage
 */
export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  try {
    log('info', 'Settings', 'Saving extension settings', settings);
    
    // Validate settings
    const validationError = validateSettings(settings);
    if (validationError) {
      throw createError(
        validationError.type,
        validationError.message,
        validationError.details
      );
    }
    
    // Save to Chrome storage
    await setChromeStorage(settings);
    
    log('info', 'Settings', 'Settings saved successfully');
  } catch (error) {
    log('error', 'Settings', 'Failed to save settings', error);
    throw createError(
      ExtensionError.STORAGE_ERROR,
      '保存设置失败',
      'Failed to save settings to Chrome storage',
      error as Error
    );
  }
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(): Promise<void> {
  try {
    log('info', 'Settings', 'Resetting settings to defaults');
    
    await setChromeStorage(DEFAULT_SETTINGS);
    
    log('info', 'Settings', 'Settings reset successfully');
  } catch (error) {
    log('error', 'Settings', 'Failed to reset settings', error);
    throw createError(
      ExtensionError.STORAGE_ERROR,
      '重置设置失败',
      'Failed to reset settings to defaults',
      error as Error
    );
  }
}

/**
 * Check if settings are properly configured
 */
export async function areSettingsValid(): Promise<boolean> {
  try {
    const settings = await getSettings();
    const validationError = validateSettings(settings);
    return validationError === null;
  } catch (error) {
    log('error', 'Settings', 'Failed to validate settings', error);
    return false;
  }
}

export default {
  getSettings,
  saveSettings,
  resetSettings,
  areSettingsValid
}; 