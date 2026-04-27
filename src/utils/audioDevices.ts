/**
 * Audio Device Detection Utilities
 * Helps detect and manage audio input/output devices
 */

export interface AudioDeviceInfo {
  deviceId: string;
  kind: 'audioinput' | 'audiooutput';
  label: string;
  groupId: string;
}

export interface AudioDeviceState {
  hasHeadphones: boolean;
  hasBuiltInMic: boolean;
  hasExternalMic: boolean;
  hasMultipleMics: boolean;
  defaultInputDevice: string | null;
  defaultOutputDevice: string | null;
}

/**
 * Enumerate all audio devices
 */
export async function enumerateAudioDevices(): Promise<AudioDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    console.warn('enumerateDevices not supported');
    return [];
  }

  try {
    // Request permission first to get labels
    await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput')
      .map(d => ({
        deviceId: d.deviceId,
        kind: d.kind as 'audioinput' | 'audiooutput',
        label: d.label,
        groupId: d.groupId,
      }));
  } catch (e) {
    console.error('enumerateAudioDevices error:', e);
    return [];
  }
}

/**
 * Get audio device state
 */
export async function getAudioDeviceState(): Promise<AudioDeviceState> {
  const devices = await enumerateAudioDevices();

  const audioInputs = devices.filter(d => d.kind === 'audioinput');
  const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

  // Detect headphones based on device labels
  const hasHeadphones = audioInputs.some(d =>
    d.label.toLowerCase().includes('headset') ||
    d.label.toLowerCase().includes('headphone') ||
    d.label.toLowerCase().includes('airpod') ||
    d.label.toLowerCase().includes('earphone') ||
    d.label.toLowerCase().includes('beats') ||
    d.label.toLowerCase().includes('buds')
  );

  const hasBuiltInMic = audioInputs.some(d =>
    d.label.toLowerCase().includes('built-in') ||
    d.label.toLowerCase().includes('internal') ||
    d.label.toLowerCase().includes('macbook') ||
    d.label.toLowerCase().includes('display')
  );

  const hasExternalMic = audioInputs.some(d =>
    !d.label.toLowerCase().includes('built-in') &&
    !d.label.toLowerCase().includes('internal') &&
    d.label.length > 0
  );

  return {
    hasHeadphones,
    hasBuiltInMic,
    hasExternalMic,
    hasMultipleMics: audioInputs.length > 1,
    defaultInputDevice: audioInputs[0]?.deviceId || null,
    defaultOutputDevice: audioOutputs[0]?.deviceId || null,
  };
}

/**
 * Get optimal microphone constraints based on device state
 * and whether headphones are connected
 */
export function getMicConstraints(headphonesConnected: boolean = false) {
  if (headphonesConnected) {
    // With headphones: safer to disable some processing
    // but echoCancellation keeps feedback away
    return {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: false },
      channelCount: { ideal: 1 },
    };
  } else {
    // Without headphones: disable processing to capture raw audio
    // This helps with system audio capture
    return {
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: false },
      channelCount: { ideal: 1 },
    };
  }
}

/**
 * Check if audio is being captured from a specific device
 */
export function getActiveAudioDevice(stream: MediaStream): string | null {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return null;

  const settings = audioTracks[0].getSettings();
  return settings.deviceId || null;
}

/**
 * Set specific audio input device
 */
export async function getUserMediaWithDevice(deviceId: string, audioConstraints?: MediaTrackConstraints) {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      ...audioConstraints,
    },
  });
}

/**
 * Create AudioContext mixer for combining multiple streams
 */
export class AudioStreamMixer {
  private audioContext: AudioContext;
  private destination: MediaStreamAudioDestinationNode;
  private sources: MediaStreamAudioSourceNode[] = [];
  private gains: GainNode[] = [];

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.destination = this.audioContext.createMediaStreamDestination();
  }

  async addStream(stream: MediaStream, gain: number = 1.0): Promise<void> {
    const source = this.audioContext.createMediaStreamSource(stream);
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = gain;

    source.connect(gainNode).connect(this.destination);

    this.sources.push(source);
    this.gains.push(gainNode);
  }

  setGain(index: number, value: number): void {
    if (this.gains[index]) {
      this.gains[index].gain.value = value;
    }
  }

  getStream(): MediaStream {
    return this.destination.stream;
  }

  async close(): Promise<void> {
    this.sources.forEach(s => s.disconnect());
    this.gains.forEach(g => g.disconnect());
    await this.audioContext.close();
  }
}

/**
 * Get supported mime type for MediaRecorder
 */
export function getSupportedMimeType(): string | undefined {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm;codecs=vp9,opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return undefined;
}