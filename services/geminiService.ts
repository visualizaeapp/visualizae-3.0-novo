
import { GoogleGenAI } from "@google/genai";
import { ModelType } from "../types";

/**
 * Initializes the Gemini API client.
 * For Model 2 (Pro/Veo), it ensures the user has selected a paid key via AI Studio.
 */
const getAiClient = async (model: ModelType | string): Promise<GoogleGenAI> => {
  const isPaidModel = model === ModelType.NANO_BANANA_2 ||
    model === ModelType.VEO_FAST ||
    model === ModelType.VEO_HQ;

  if (isPaidModel) {
    // Cast window to any to access aistudio without type conflict
    const win = window as any;
    if (win.aistudio) {
      const hasKey = await win.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await win.aistudio.openSelectKey();
      }
    }
    // For paid models/preview features using the selector, we re-instantiate
    // to ensure the injected key is used.
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  // Standard initialization for free/standard models
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Generates content using Gemini models.
 * @param model The model identifier
 * @param prompt The text prompt
 * @param aspectRatio The aspect ratio string
 * @param widthLabel Size label (1K, 2K) for Pro models
 * @param referenceImages Array of base64 image data strings for image-to-image/inpainting
 * @param forceRatio If true, sends aspect ratio config even if referenceImages is present
 */
export const generateImageContent = async (
  model: ModelType,
  prompt: string,
  aspectRatio: string = "1:1",
  widthLabel: string = "1K", // 1K, 2K, 4K for Pro model
  referenceImages: string[] = [],
  forceRatio: boolean = false
): Promise<string | null> => {
  try {
    const ai = await getAiClient(model);

    // Configuration based on model type
    const config: any = {};

    // Initialize imageConfig
    config.imageConfig = {};

    const hasInputImages = referenceImages && referenceImages.length > 0;
    const isNano2 = model === ModelType.NANO_BANANA_2;

    // LOGIC UPDATE: Two Reasoning Paths
    // 1. Nano 2 (Pro): ALWAYS send aspectRatio. It tends to default to square (1:1) with black bars if undefined.
    // 2. Text-to-Image (No inputs): ALWAYS send aspectRatio.
    // 3. Force Ratio: User explicitly requested structure change.
    // 4. Nano 1 (Flash) Inpainting: DO NOT send aspectRatio. Let it infer strict geometry from the input image cut.
    if (!hasInputImages || forceRatio || isNano2) {
      config.imageConfig.aspectRatio = aspectRatio;
    }

    // Same logic for imageSize. Only set it for Text-to-Image, Forced Ratio, or Pro model to ensure quality.
    if (model === ModelType.NANO_BANANA_2 && (!hasInputImages || forceRatio)) {
      config.imageConfig.imageSize = widthLabel as "1K" | "2K" | "4K";
    }

    // Build Content Parts
    const parts: any[] = [];

    // If initial images are provided (the "print" of the rectangle or references), add them
    if (hasInputImages) {
      referenceImages.forEach(imgBase64 => {
        // Strip prefix if present to get raw base64 data
        const base64Data = imgBase64.split(',')[1];
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Data
          }
        });
      });
    }

    // Add text prompt
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: parts,
      },
      config: config,
    });

    // Parse Response
    if (response.candidates && response.candidates.length > 0) {
      const content = response.candidates[0].content;
      if (content && content.parts) {
        for (const part of content.parts) {
          if (part.inlineData && part.inlineData.data) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          }
        }
      }
    }

    return null;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

/**
 * Generates a video using Veo models.
 * Supports optional start image and end image (lastFrame) for interpolation.
 */
export const generateVideo = async (
  prompt: string,
  imageBase64: string,
  model: string = ModelType.VEO_FAST,
  lastFrameBase64?: string,
  aspectRatio: string = '16:9'
): Promise<string | null> => {
  try {
    const ai = await getAiClient(model);
    const base64Data = imageBase64.split(',')[1];

    const config: any = {
      numberOfVideos: 1,
      aspectRatio: aspectRatio,
    };

    // For Veo HQ (Pro), request 1080p explicitly
    if (model === ModelType.VEO_HQ) {
      config.resolution = '1080p';
    }

    // If last frame is provided, add it to config for interpolation/transition
    if (lastFrameBase64) {
      const lastFrameData = lastFrameBase64.split(',')[1];
      config.lastFrame = {
        imageBytes: lastFrameData,
        mimeType: 'image/png'
      };
      console.log("Generating video with Start + End frames (Interpolation)");
    }

    // Start Video Generation Operation
    let operation = await ai.models.generateVideos({
      model: model,
      prompt: prompt,
      image: {
        imageBytes: base64Data,
        mimeType: 'image/png'
      },
      config: config
    });

    console.log("Video generation started...", operation);

    // Polling loop
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
      console.log("Polling video status...");
      // Use the operations API to check status
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    console.log("Video generation done!", operation);

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) {
      throw new Error("No video URI returned");
    }

    // Fetch the video content (requires API key appended)
    const videoResponse = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
    const videoBlob = await videoResponse.blob();

    // Create a local URL for the video blob
    return URL.createObjectURL(videoBlob);

  } catch (error) {
    console.error("Veo Video Generation Error:", error);
    throw error;
  }
}

/**
 * Helper to convert a numeric ratio to the closest Gemini API allowed enum string
 * Gemini allowed: "1:1", "3:4", "4:3", "9:16", "16:9"
 */
export const getClosestAspectRatio = (ratio: number): string => {
  const ratios = [
    { key: "1:1", val: 1.0 },
    { key: "3:4", val: 0.75 },
    { key: "4:3", val: 1.33 },
    { key: "9:16", val: 0.5625 },
    { key: "16:9", val: 1.77 },
  ];

  // Find the closest standard ratio to the custom resolution ratio
  const closest = ratios.reduce((prev, curr) => {
    return (Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev);
  });

  return closest.key;
};
