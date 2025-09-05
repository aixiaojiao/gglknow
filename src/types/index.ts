/**
 * GglKnow Extension Type Definitions
 * 
 * This file contains all TypeScript type definitions for the GglKnow Chrome extension.
 * These types ensure type safety across background, content, and popup scripts.
 */

// ===== Core Data Types =====

/**
 * Tweet media data structure
 */
export interface TweetMedia {
  /** Array of image URLs from the tweet */
  images: string[];
  /** Array of video URLs from the tweet */
  videos: string[];
}

/**
 * Inline media item that appears within tweet text
 */
export interface InlineMediaItem {
  /** Type of media */
  type: 'image' | 'video';
  /** Media source URL */
  src: string;
  /** Index in the media array */
  index: number;
  /** Position relative to text */
  position: 'inline' | 'end';
}

/**
 * Tweet interaction statistics
 */
export interface TweetStats {
  /** Number of replies */
  replies: string;
  /** Number of retweets */
  retweets: string;
  /** Number of likes */
  likes: string;
}

/**
 * Complete tweet data structure extracted from Twitter/X
 */
export interface TweetData {
  /** User's display name */
  userName: string;
  /** User's handle (without @) */
  userHandle: string;
  /** User's avatar image URL */
  userAvatar: string;
  /** Tweet text content (may contain HTML) */
  text: string;
  /** Tweet timestamp (ISO string) */
  timestamp: string;
  /** Tweet's original posting time */
  tweetTime: string;
  /** Current page URL where tweet was found */
  url: string;
  /** Direct link to the tweet */
  tweetUrl: string;
  /** Media attachments */
  media: TweetMedia;
  /** Interaction statistics */
  stats: TweetStats;
  /** Inline media items that appear within the text content */
  inlineMedia?: InlineMediaItem[];
  /** Preferred media positioning for HTML generation */
  mediaPosition?: 'top' | 'bottom';
}

/**
 * Data for a complete tweet thread
 */
export interface ThreadData {
  tweets: TweetData[];
  mainTweet: TweetData | null;
}

// ===== Extension Settings =====

/**
 * User preferences and settings
 */
export interface ExtensionSettings {
  /** Directory path where tweets should be saved */
  savePath: string;
  /** File formats for saved tweets */
  fileFormats: ('html' | 'markdown' | 'json')[];
  /** Whether to download media files */
  downloadMedia: boolean;
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  savePath: 'Downloads/Twitter',
  fileFormats: ['html'],
  downloadMedia: true
};

// ===== Message Types =====

/**
 * Message types for communication between extension components
 */
export enum MessageType {
  COLLECT_TWEET = 'collectTweet',
  COLLECT_THREAD = 'collectThread',
  CONTENT_LOADED = 'CONTENT_LOADED',
  TEST_CONNECTION = 'TEST_CONNECTION',
  GET_SETTINGS = 'GET_SETTINGS',
  SAVE_SETTINGS = 'SAVE_SETTINGS'
}

/**
 * Base message structure
 */
export interface BaseMessage {
  /** Type of the message */
  type: MessageType;
  /** Message timestamp */
  timestamp?: string;
}

/**
 * Message to collect a tweet
 */
export interface CollectTweetMessage extends BaseMessage {
  type: MessageType.COLLECT_TWEET;
  /** Tweet data to be collected */
  tweetData: TweetData;
}

/**
 * Message to collect a thread
 */
export interface CollectThreadMessage extends BaseMessage {
  type: MessageType.COLLECT_THREAD;
  /** Thread data to be collected */
  threadData: ThreadData;
}

/**
 * Message indicating content script loaded
 */
export interface ContentLoadedMessage extends BaseMessage {
  type: MessageType.CONTENT_LOADED;
}

/**
 * Message to test connection
 */
export interface TestConnectionMessage extends BaseMessage {
  type: MessageType.TEST_CONNECTION;
}

/**
 * Message to get settings
 */
export interface GetSettingsMessage extends BaseMessage {
  type: MessageType.GET_SETTINGS;
}

/**
 * Message to save settings
 */
export interface SaveSettingsMessage extends BaseMessage {
  type: MessageType.SAVE_SETTINGS;
  /** Settings to save */
  settings: Partial<ExtensionSettings>;
}

/**
 * Union type for all possible messages
 */
export type ExtensionMessage = 
  | CollectTweetMessage
  | CollectThreadMessage
  | ContentLoadedMessage
  | TestConnectionMessage
  | GetSettingsMessage
  | SaveSettingsMessage;

// ===== Response Types =====

/**
 * Base response structure
 */
export interface BaseResponse {
  /** Whether the operation was successful */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
  /** Success message if operation succeeded */
  message?: string;
}

/**
 * Response for tweet collection
 */
export interface CollectTweetResponse extends BaseResponse {
  /** Generated filename if successful */
  filename?: string;
  /** Number of media files downloaded */
  mediaCount?: number;
}

/**
 * Response for thread collection
 */
export interface CollectThreadResponse extends BaseResponse {
  /** Generated filename if successful */
  filename?: string;
  /** Number of tweets in the thread */
  tweetCount?: number;
  /** Number of media files downloaded */
  mediaCount?: number;
}

/**
 * Response for settings operations
 */
export interface SettingsResponse extends BaseResponse {
  /** Current settings */
  settings?: ExtensionSettings;
}

/**
 * Response for test connection
 */
export interface TestConnectionResponse extends BaseResponse {
  /** Extension version */
  version?: string;
}

/**
 * Union type for all possible responses
 */
export type ExtensionResponse = 
  | CollectTweetResponse
  | CollectThreadResponse
  | SettingsResponse
  | TestConnectionResponse
  | BaseResponse;

// ===== File Operations =====

/**
 * Media files to be downloaded
 */
export interface MediaToDownload {
  /** Image URLs to download */
  images: string[];
  /** Video URLs to download */
  videos: string[];
  /** Avatar URL to download */
  avatar: string | null;
}

/**
 * Download progress information
 */
export interface DownloadProgress {
  /** Current download ID */
  downloadId: number;
  /** Download state */
  state: 'in_progress' | 'interrupted' | 'complete';
  /** Number of bytes downloaded */
  bytesReceived: number;
  /** Total number of bytes */
  totalBytes: number;
  /** Download filename */
  filename: string;
}

/**
 * File generation result
 */
export interface FileGenerationResult {
  /** Generated content */
  content: string;
  /** Suggested filename */
  filename: string;
  /** File extension */
  extension: string;
}

// ===== UI State Types =====

/**
 * Button states for the collect button
 */
export enum ButtonState {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error'
}

/**
 * Popup window state
 */
export interface PopupState {
  /** Current connection status */
  isConnected: boolean;
  /** Current settings */
  settings: ExtensionSettings;
  /** Whether settings are being saved */
  isSaving: boolean;
  /** Last error message */
  lastError: string | null;
}

// ===== Utility Types =====

/**
 * Chrome extension context types
 */
export interface ChromeExtensionContext {
  /** Whether chrome.runtime is available */
  isRuntimeAvailable: boolean;
  /** Whether chrome.storage is available */
  isStorageAvailable: boolean;
  /** Whether chrome.downloads is available */
  isDownloadsAvailable: boolean;
}

/**
 * File path utilities
 */
export interface FilePathInfo {
  /** Base filename without extension */
  baseName: string;
  /** File extension */
  extension: string;
  /** Full filename */
  fullName: string;
  /** Directory path */
  directory: string;
  /** Full file path */
  fullPath: string;
}

/**
 * Error types that can occur in the extension
 */
export enum ExtensionError {
  SETTINGS_NOT_FOUND = 'SETTINGS_NOT_FOUND',
  INVALID_TWEET_DATA = 'INVALID_TWEET_DATA',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  STORAGE_ERROR = 'STORAGE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CONTEXT_INVALIDATED = 'CONTEXT_INVALIDATED'
}

/**
 * Structured error information
 */
export interface ExtensionErrorInfo {
  /** Error type */
  type: ExtensionError;
  /** Human-readable error message */
  message: string;
  /** Technical details */
  details?: string;
  /** Stack trace if available */
  stack?: string;
}

// ===== Legacy Support =====

/**
 * Legacy message format for backward compatibility
 */
export interface LegacyMessage {
  /** Legacy action field */
  action: string;
  /** Legacy tweet data field */
  tweetData?: TweetData;
}

/**
 * Type guard to check if message is legacy format
 */
export function isLegacyMessage(message: any): message is LegacyMessage {
  return typeof message === 'object' && 
         message !== null && 
         'action' in message && 
         typeof message.action === 'string';
}

/**
 * Type guard to check if message is new format
 */
export function isExtensionMessage(message: any): message is ExtensionMessage {
  return typeof message === 'object' && 
         message !== null && 
         'type' in message && 
         Object.values(MessageType).includes(message.type);
}

export default {
  MessageType,
  ButtonState,
  ExtensionError,
  DEFAULT_SETTINGS,
  isLegacyMessage,
  isExtensionMessage
}; 