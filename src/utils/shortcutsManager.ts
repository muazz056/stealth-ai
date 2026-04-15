/**
 * Keyboard Shortcuts Manager
 * Cross-platform shortcuts handling with OS detection
 */

export type ModifierKey = 'Control' | 'Alt' | 'Shift' | 'Meta';
export type ShortcutAction = 
  | 'toggleOverlay'
  | 'toggleListen'
  | 'analyzeScreen'
  | 'getAnswer'
  | 'clearQuestion'
  | 'focusInput'
  | 'stopOrClear'
  | 'toggleBrowseAI';

export interface ShortcutConfig {
  action: ShortcutAction;
  label: string;
  description: string;
  defaultKey: string;
  modifier: ModifierKey;
  key: string;
}

export interface ShortcutsState {
  [key: string]: ShortcutConfig;
}

// Detect Operating System
export const detectOS = (): 'windows' | 'mac' | 'linux' => {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'mac';
  } else if (platform.includes('win') || userAgent.includes('win')) {
    return 'windows';
  } else {
    return 'linux';
  }
};

// Get primary modifier key based on OS
export const getPrimaryModifier = (): ModifierKey => {
  const os = detectOS();
  return os === 'mac' ? 'Meta' : 'Control'; // Cmd for Mac, Ctrl for others
};

// Default shortcuts configuration
export const getDefaultShortcuts = (): ShortcutsState => {
  const primaryMod = getPrimaryModifier();
  
  return {
    toggleOverlay: {
      action: 'toggleOverlay',
      label: 'Toggle Overlay',
      description: 'Minimize/restore the overlay window',
      defaultKey: "'",
      modifier: primaryMod,
      key: "'"
    },
    toggleListen: {
      action: 'toggleListen',
      label: 'Toggle Listen',
      description: 'Start/stop voice recording',
      defaultKey: '\\',
      modifier: primaryMod,
      key: '\\'
    },
    analyzeScreen: {
      action: 'analyzeScreen',
      label: 'Analyze Screen',
      description: 'Capture and analyze screen content',
      defaultKey: ']',
      modifier: primaryMod,
      key: ']'
    },
    getAnswer: {
      action: 'getAnswer',
      label: 'Get Answer',
      description: 'Submit question and get AI response',
      defaultKey: 'Enter',
      modifier: primaryMod,
      key: 'Enter'
    },
    clearQuestion: {
      action: 'clearQuestion',
      label: 'Clear Question',
      description: 'Clear the question input field',
      defaultKey: 'Backspace',
      modifier: primaryMod,
      key: 'Backspace'
    },
    focusInput: {
      action: 'focusInput',
      label: 'Focus Input',
      description: 'Focus on the question input field',
      defaultKey: '',
      modifier: 'Shift',
      key: ''
    },
    stopOrClear: {
      action: 'stopOrClear',
      label: 'Stop/Clear All',
      description: 'Stop AI generation or clear everything',
      defaultKey: 'Backspace',
      modifier: primaryMod,
      key: 'Backspace'
    },
    toggleBrowseAI: {
      action: 'toggleBrowseAI',
      label: 'Toggle BrowseAI',
      description: 'Open/close BrowseAI browser',
      defaultKey: '[',
      modifier: primaryMod,
      key: '['
    }
  };
};

// Format shortcut for display (e.g., "Ctrl+'" or "Cmd+'" or just "Shift")
export const formatShortcut = (shortcut: ShortcutConfig): string => {
  const modifierName = shortcut.modifier === 'Meta' 
    ? (detectOS() === 'mac' ? 'Cmd' : 'Win')
    : shortcut.modifier === 'Control'
    ? 'Ctrl'
    : shortcut.modifier;
  
  // If no key, return just the modifier (single-key shortcut)
  if (!shortcut.key || shortcut.key.trim() === '') {
    return modifierName;
  }
  
  const keyName = shortcut.key === ' ' ? 'Space' : shortcut.key;
  
  return `${modifierName}+${keyName}`;
};

// Validate modifier key
export const isValidModifier = (key: string): boolean => {
  return ['Control', 'Alt', 'Shift', 'Meta', 'Command'].includes(key);
};

// Validate key combination
export const isValidKeyCombination = (modifier: ModifierKey, key: string): { valid: boolean; reason?: string } => {
  // Allow empty key for single-modifier shortcuts (e.g., just "Shift")
  if (!key || key.trim() === '') {
    return { valid: true }; // Single modifier key is valid
  }
  
  // Check if key is a modifier itself
  if (isValidModifier(key)) {
    return { valid: false, reason: 'Second key cannot be a modifier' };
  }
  
  // Check for system-reserved shortcuts (common ones)
  const systemShortcuts = [
    { mod: 'Control', key: 'c' },
    { mod: 'Control', key: 'v' },
    { mod: 'Control', key: 'x' },
    { mod: 'Control', key: 'a' },
    { mod: 'Control', key: 's' },
    { mod: 'Control', key: 'z' },
    { mod: 'Control', key: 'y' },
    { mod: 'Meta', key: 'c' },
    { mod: 'Meta', key: 'v' },
    { mod: 'Meta', key: 'x' },
    { mod: 'Meta', key: 'a' },
    { mod: 'Meta', key: 's' },
    { mod: 'Meta', key: 'z' },
    { mod: 'Meta', key: 'y' },
    { mod: 'Alt', key: 'F4' },
    { mod: 'Control', key: 'w' },
    { mod: 'Control', key: 't' },
  ];
  
  const isSystemShortcut = systemShortcuts.some(
    sc => sc.mod === modifier && sc.key.toLowerCase() === key.toLowerCase()
  );
  
  if (isSystemShortcut) {
    return { valid: false, reason: 'This is a system-reserved shortcut' };
  }
  
  return { valid: true };
};

// Check for shortcut conflicts
export const hasConflict = (shortcuts: ShortcutsState, modifier: ModifierKey, key: string, excludeAction?: ShortcutAction): { conflict: boolean; conflictWith?: string } => {
  const normalizedKey = (key || '').toLowerCase();
  
  for (const [action, config] of Object.entries(shortcuts)) {
    if (excludeAction && config.action === excludeAction) continue;
    
    const configKey = (config.key || '').toLowerCase();
    
    // Check if both shortcuts match (including single-key shortcuts)
    if (config.modifier === modifier && configKey === normalizedKey) {
      // Allow "clearQuestion" and "stopOrClear" to have the same shortcut (they work together)
      if (
        (excludeAction === 'clearQuestion' && config.action === 'stopOrClear') ||
        (excludeAction === 'stopOrClear' && config.action === 'clearQuestion')
      ) {
        continue; // Skip conflict check for these two
      }
      
      return { conflict: true, conflictWith: config.label };
    }
  }
  
  return { conflict: false };
};

// Convert key event to standardized format
export const normalizeKey = (event: KeyboardEvent): { modifier: ModifierKey | null; key: string } => {
  let modifier: ModifierKey | null = null;
  
  if (event.metaKey) modifier = 'Meta';
  else if (event.ctrlKey) modifier = 'Control';
  else if (event.altKey) modifier = 'Alt';
  else if (event.shiftKey && event.key !== 'Shift') modifier = 'Shift';
  
  let key = event.key;
  
  // Normalize special keys
  if (key === ' ') key = 'Space';
  if (key.length === 1) key = key.toUpperCase();
  
  return { modifier, key };
};

// Match keyboard event with shortcut
export const matchesShortcut = (event: KeyboardEvent, shortcut: ShortcutConfig): boolean => {
  const { modifier, key } = normalizeKey(event);
  
  if (!modifier || modifier !== shortcut.modifier) return false;
  
  // For single-key shortcuts (no second key), match if only modifier is pressed
  if (!shortcut.key || shortcut.key.trim() === '') {
    // Check if ONLY the modifier is pressed (no other keys)
    return !key || key === shortcut.modifier;
  }
  
  // For regular shortcuts, match both modifier and key
  if (key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
  
  return true;
};

// Get OS-specific modifier symbol
export const getModifierSymbol = (modifier: ModifierKey): string => {
  const os = detectOS();
  
  if (os === 'mac') {
    switch (modifier) {
      case 'Meta': return '⌘';
      case 'Control': return '⌃';
      case 'Alt': return '⌥';
      case 'Shift': return '⇧';
      default: return modifier;
    }
  }
  
  return modifier === 'Meta' ? 'Win' : modifier === 'Control' ? 'Ctrl' : modifier;
};

