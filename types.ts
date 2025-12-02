
export enum ModelType {
  NANO_BANANA_1 = 'gemini-2.5-flash-image', // "Nano Banana 1"
  NANO_BANANA_2 = 'gemini-3-pro-image-preview', // "Nano Banana 2"
  VEO_FAST = 'veo-3.1-fast-generate-preview', // "Veo Fast"
  VEO_HQ = 'veo-3.1-generate-preview', // "Veo HQ"
}

export interface Resolution {
  w: number;
  h: number;
  ratio: number;
  label?: string;
}

export type ToolType = 'select' | 'eraser' | 'move' | 'hand';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  type: 'image' | 'generation' | 'video';
  src?: string;
  thumbnail?: string;
  // Positioning
  x: number;
  y: number;
  width: number;
  height: number;
  
  // Initial state for reset
  initialX?: number;
  initialY?: number;
  initialWidth?: number;
  initialHeight?: number;

  // Style
  feather?: number; // 0 to 100 representing intensity of edge fade
  renderMode?: 'cover' | 'fill'; // Controls object-fit behavior

  // Video specific
  isPlaying?: boolean;
}

export interface User {
  id: string;
  username: string;
}

// Minimal shape for the Gemini API response handling within the app
export interface GenerationResult {
  imageUrl: string;
  prompt: string;
}
