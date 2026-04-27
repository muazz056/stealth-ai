import React, { useState, useEffect, useRef } from 'react';
import { ModifierKey, normalizeKey, getModifierSymbol } from '../src/utils/shortcutsManager';

type ModifierOption = ModifierKey | 'None';

interface ShortcutRecorderProps {
  modifier: ModifierKey;
  currentKey: string;
  onModifierChange: (modifier: ModifierKey) => void;
  onKeyChange: (key: string) => void;
  label: string;
  description?: string;
  error?: string;
}

const ShortcutRecorder: React.FC<ShortcutRecorderProps> = ({
  modifier,
  currentKey,
  onModifierChange,
  onKeyChange,
  label,
  description,
  error
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedModifier, setRecordedModifier] = useState<ModifierOption | null>(null);
  const [recordedKey, setRecordedKey] = useState<string>('');
  const inputRef = useRef<HTMLDivElement>(null);

  const modifierOptions: { value: ModifierOption; label: string }[] = [
    { value: 'None', label: 'None' },
    { value: 'Control', label: `${getModifierSymbol('Control')} (Ctrl)` },
    { value: 'Alt', label: `${getModifierSymbol('Alt')} (Alt)` },
    { value: 'Shift', label: `${getModifierSymbol('Shift')} (Shift)` },
    { value: 'Meta', label: `${getModifierSymbol('Meta')} (Cmd)` },
  ];

  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordedModifier(null);
    setRecordedKey('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;
    
    e.preventDefault();
    e.stopPropagation();

    const { modifier: eventModifier, key: eventKey } = normalizeKey(e.nativeEvent);

    if (!eventModifier && eventKey) {
      setRecordedModifier('None');
      setRecordedKey(eventKey);
      setTimeout(() => {
        onModifierChange('Control');
        onKeyChange(eventKey);
        setIsRecording(false);
      }, 300);
      return;
    }

    if (recordedModifier === 'None' && eventKey) {
      setRecordedKey(eventKey);
      setTimeout(() => {
        onModifierChange('Control');
        onKeyChange(eventKey);
        setIsRecording(false);
      }, 300);
      return;
    }

    if (!recordedModifier && eventModifier) {
      setRecordedModifier(eventModifier);
      return;
    }

    if (recordedModifier && eventModifier === recordedModifier && !eventKey) {
      setRecordedKey('');
      setTimeout(() => {
        onModifierChange(recordedModifier as ModifierKey);
        onKeyChange('');
        setIsRecording(false);
      }, 300);
      return;
    }

    if (recordedModifier && eventKey && eventKey !== recordedModifier) {
      setRecordedKey(eventKey);
      setTimeout(() => {
        onModifierChange(recordedModifier as ModifierKey);
        onKeyChange(eventKey);
        setIsRecording(false);
      }, 300);
    }
  };

  const handleModifierSelect = (value: ModifierOption) => {
    if (value === 'None') {
      onModifierChange('Control');
      onKeyChange('');
    } else {
      onModifierChange(value);
    }
  };

  const handleCancel = () => {
    setIsRecording(false);
    setRecordedModifier(null);
    setRecordedKey('');
  };

  const displayValue = isRecording
    ? recordedModifier === 'None'
      ? recordedKey 
        ? recordedKey
        : 'Press a key...'
      : recordedModifier
        ? recordedKey 
          ? `${getModifierSymbol(recordedModifier)}+${recordedKey}`
          : `${getModifierSymbol(recordedModifier)} (press again for single-key or press another key)`
        : 'Press modifier key...'
    : currentKey && currentKey.trim() !== ''
      ? modifier === 'Control' && modifierOptions.find(o => o.value === 'None')
        ? currentKey
        : `${getModifierSymbol(modifier)}+${currentKey}`
      : modifierOptions.find(o => o.value === modifier)?.label || modifier;

  const effectiveModifier: ModifierOption = modifier === 'Control' && !currentKey ? 'None' : modifier;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </label>
        {description && (
          <span className="text-[11px] text-slate-600 dark:text-slate-500 mt-0.5">
            {description}
          </span>
        )}
      </div>
      
      <div className="flex gap-2 items-center">
        {/* Modifier Dropdown */}
        <select
          value={effectiveModifier}
          onChange={(e) => handleModifierSelect(e.target.value as ModifierOption)}
          disabled={isRecording}
          className="w-32 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-black dark:text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
        >
          {modifierOptions.map((mod) => (
            <option key={mod.value} value={mod.value}>
              {mod.label}
            </option>
          ))}
        </select>

        {/* Plus Sign */}
        <span className="text-slate-600 dark:text-slate-500 font-bold">+</span>

        {/* Key Recorder */}
        <div
          ref={inputRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onClick={handleStartRecording}
          className={`flex-1 bg-slate-100 dark:bg-slate-800 border ${
            isRecording ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-slate-300 dark:border-slate-700'
          } ${error ? 'border-red-500' : ''} rounded-lg px-3 py-2 text-black dark:text-white text-sm cursor-pointer focus:outline-none transition-all`}
        >
          <div className="flex items-center justify-between">
            <span className={isRecording ? 'text-blue-600 dark:text-blue-400 animate-pulse' : ''}>
              {currentKey && currentKey.trim() !== '' ? currentKey : '(Optional) Click to record'}
            </span>
            {isRecording && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Record Button */}
        {!isRecording && (
          <button
            onClick={handleStartRecording}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all"
          >
            Record
          </button>
        )}
      </div>

      {/* Display Current Shortcut */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 dark:text-slate-500">Current:</span>
        <kbd className="px-2 py-1 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono text-slate-700 dark:text-slate-300">
          {displayValue}
        </kbd>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
};

export default ShortcutRecorder;

