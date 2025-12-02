
import { Resolution } from './types';

// Helper to create landscape versions of provided resolutions
const withOrientations = (resolutions: Resolution[]): Resolution[] => {
  const all: Resolution[] = [...resolutions];
  
  resolutions.forEach(res => {
    // If it's not a square, add the rotated version
    if (res.w !== res.h) {
      all.push({
        w: res.h,
        h: res.w,
        ratio: Number((res.h / res.w).toFixed(3)), // Recalculate ratio
        label: res.label
      });
    }
  });
  
  return all;
};

// Base vertical resolutions
const BASE_MODEL_1: Resolution[] = [
  { w: 1024, h: 1024, ratio: 1.000 },
  { w: 512, h: 2048, ratio: 0.250 },
  { w: 992, h: 1056, ratio: 0.939 },
  { w: 960, h: 1088, ratio: 0.882 },
  { w: 640, h: 1632, ratio: 0.392 },
  { w: 544, h: 1920, ratio: 0.283 },
  { w: 928, h: 1120, ratio: 0.829 },
  { w: 832, h: 1248, ratio: 0.667 },
  { w: 736, h: 1408, ratio: 0.523 },
  { w: 704, h: 1472, ratio: 0.478 },
  { w: 896, h: 1152, ratio: 0.778 },
  { w: 768, h: 1344, ratio: 0.571 },
  { w: 672, h: 1536, ratio: 0.438 },
  { w: 576, h: 1792, ratio: 0.321 },
  { w: 608, h: 1696, ratio: 0.358 },
  { w: 800, h: 1280, ratio: 0.625 },
  { w: 864, h: 1184, ratio: 0.730 },
];

const BASE_MODEL_2: Resolution[] = [
  { w: 2048, h: 2048, ratio: 1.000, label: "Quadrado" },
  { w: 1056, h: 4096, ratio: 0.258 },
  { w: 1088, h: 3936, ratio: 0.276 },
  { w: 1120, h: 3808, ratio: 0.294 },
  { w: 1152, h: 3680, ratio: 0.313 },
  { w: 1440, h: 2944, ratio: 0.489 },
  { w: 1472, h: 2880, ratio: 0.511 },
  { w: 1536, h: 2784, ratio: 0.552 },
  { w: 1600, h: 2656, ratio: 0.602 },
  { w: 1792, h: 2400, ratio: 0.747 },
  { w: 1920, h: 2208, ratio: 0.870 },
  { w: 1984, h: 2144, ratio: 0.925 },
  { w: 2016, h: 2112, ratio: 0.955 },
  // Adding Model 1 resolutions to Model 2 list as they are usually supported subsets
  ...BASE_MODEL_1
];

// Veo strictly prefers 16:9 or 9:16. 
// Adding 1080p (FHD) support for the "Pro" model.
const VEO_BASE: Resolution[] = [
    { w: 1280, h: 720, ratio: 1.777, label: "HD Landscape" },
    { w: 720, h: 1280, ratio: 0.562, label: "HD Portrait" },
    { w: 1920, h: 1080, ratio: 1.777, label: "FHD Landscape" },
    { w: 1080, h: 1920, ratio: 0.562, label: "FHD Portrait" },
];

export const MODEL_1_RESOLUTIONS = withOrientations(BASE_MODEL_1);
export const MODEL_2_RESOLUTIONS = withOrientations(BASE_MODEL_2);
export const VEO_RESOLUTIONS = VEO_BASE; // No need to auto-rotate, we defined both orientations
