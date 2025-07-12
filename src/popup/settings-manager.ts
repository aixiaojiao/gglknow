/**
 * Popup Settings Manager Module
 * 
 * Handles settings management for the popup window
 */

import { 
  ExtensionSettings, 
  MessageType, 
  SettingsResponse, 
  SaveSettingsMessage,
  GetSettingsMessage,
  DEFAULT_SETTINGS 
} from '@/types';
import { sendChromeMessage, validateSettings, log } from '@/utils';

/**
 * Get current extension settings
 */
export async function getSettings(): Promise<ExtensionSettings> {
  try {
    log('info', 'PopupSettings', 'Getting settings from background');
    
    const message: GetSettingsMessage = {
      type: MessageType.GET_SETTINGS,
      timestamp: new Date().toISOString()
    };
    
    const response = await sendChromeMessage<SettingsResponse>(message);
    
    if (response && response.success && response.settings) {
      log('info', 'PopupSettings', 'Settings retrieved successfully', response.settings);
      return response.settings;
    } else {
      log('warn', 'PopupSettings', 'Failed to get settings, using defaults');
      return DEFAULT_SETTINGS;
    }
  } catch (error) {
    log('error', 'PopupSettings', 'Error getting settings', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save extension settings
 */
export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<boolean> {
  try {
    log('info', 'PopupSettings', 'Saving settings', settings);
    
    // Validate settings
    const validationError = validateSettings(settings);
    if (validationError) {
      log('error', 'PopupSettings', 'Settings validation failed', validationError);
      throw new Error(validationError.message);
    }
    
    const message: SaveSettingsMessage = {
      type: MessageType.SAVE_SETTINGS,
      settings: settings,
      timestamp: new Date().toISOString()
    };
    
    const response = await sendChromeMessage<SettingsResponse>(message);
    
    if (response && response.success) {
      log('info', 'PopupSettings', 'Settings saved successfully');
      return true;
    } else {
      log('error', 'PopupSettings', 'Failed to save settings', response?.error);
      throw new Error(response?.error || '保存设置失败');
    }
  } catch (error) {
    log('error', 'PopupSettings', 'Error saving settings', error);
    throw error;
  }
}

/**
 * Test connection to background script
 */
export async function testConnection(): Promise<boolean> {
  try {
    log('info', 'PopupSettings', 'Testing connection to background');
    
    const response = await sendChromeMessage({
      type: MessageType.TEST_CONNECTION,
      timestamp: new Date().toISOString()
    });
    
    const isConnected = response && (response as any).success;
    log('info', 'PopupSettings', 'Connection test result', { isConnected });
    
    return isConnected;
  } catch (error) {
    log('error', 'PopupSettings', 'Connection test failed', error);
    return false;
  }
}

/**
 * Get extension version
 */
export function getExtensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch (error) {
    log('error', 'PopupSettings', 'Failed to get extension version', error);
    return '1.2.0';
  }
}

/**
 * Open extension options page
 */
export function openOptionsPage(): void {
  try {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      // Fallback for older Chrome versions
      window.open(chrome.runtime.getURL('options.html'));
    }
  } catch (error) {
    log('error', 'PopupSettings', 'Failed to open options page', error);
  }
}

/**
 * Open tweet browser
 */
export function openTweetBrowser(): void {
  try {
    const url = chrome.runtime.getURL('tweet-browser.html');
    chrome.tabs.create({ url });
  } catch (error) {
    log('error', 'PopupSettings', 'Failed to open tweet browser', error);
  }
}

/**
 * Open help page
 */
export function openHelpPage(): void {
  try {
    const url = chrome.runtime.getURL('help.html');
    chrome.tabs.create({ url });
  } catch (error) {
    log('error', 'PopupSettings', 'Failed to open help page', error);
  }
}

/**
 * Validate save path format
 */
export function validateSavePath(path: string): string | null {
  if (!path || path.trim() === '') {
    return '保存路径不能为空';
  }
  
  // Check for invalid characters
  const invalidChars = /[<>:"|?*]/;
  if (invalidChars.test(path)) {
    return '保存路径包含无效字符';
  }
  
  // Check if path is too long
  if (path.length > 200) {
    return '保存路径过长';
  }
  
  return null;
}

/**
 * Get default save path suggestions
 */
export function getDefaultSavePathSuggestions(): string[] {
  return [
    'Downloads/Twitter',
    'Documents/Twitter',
    'Desktop/Twitter',
    'Downloads/GglKnow',
    'Documents/GglKnow'
  ];
}

export default {
  getSettings,
  saveSettings,
  testConnection,
  getExtensionVersion,
  openOptionsPage,
  openTweetBrowser,
  openHelpPage,
  validateSavePath,
  getDefaultSavePathSuggestions
}; 