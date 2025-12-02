
import React, { useState, useRef, useEffect } from 'react';
import { ModelType, Layer, ToolType, User } from '../types';
import { MODEL_1_RESOLUTIONS, MODEL_2_RESOLUTIONS, VEO_RESOLUTIONS } from '../constants';
import { generateImageContent, getClosestAspectRatio, generateVideo } from '../services/geminiService';
import LayerPanel from './LayerPanel';
import Toolbar from './Toolbar';
import LayerMenu from './LayerMenu';
import { Loader2, BoxSelect, Check, ArrowRight, Sparkles, AlertTriangle, Film, Video, Clapperboard, Paperclip, X, Copy } from 'lucide-react';

interface CanvasModeProps {
    user: User;
    layers: Layer[];
    setLayers: React.Dispatch<React.SetStateAction<Layer[]>>;
}

const CanvasMode: React.FC<CanvasModeProps> = ({ user, layers, setLayers }) => {
    // --- State ---
    const [activeModel, setActiveModel] = useState<ModelType>(ModelType.NANO_BANANA_1);
    const [selectedTool, setSelectedTool] = useState<ToolType>('select');
    // layers are now passed via props
    const [redoStack, setRedoStack] = useState<Layer[]>([]); // Stack for Redo
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const [showLayerMenuMobile, setShowLayerMenuMobile] = useState(false); // Mobile specific menu toggle
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatingEffect, setGeneratingEffect] = useState<string>(''); // Stores current random effect class
    const [prompt, setPrompt] = useState('');
    const [referenceImages, setReferenceImages] = useState<string[]>([]); // Array of reference images
    const [variationCount, setVariationCount] = useState<number>(1); // Number of variations to generate

    // Canvas State
    const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
    const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
    const [layerDragOffset, setLayerDragOffset] = useState<{ x: number, y: number } | null>(null);

    // Selection Drag Refs
    const isDraggingSelectionRef = useRef(false);
    const selectionDragStartRef = useRef<{ x: number, y: number } | null>(null);
    const initialSelectionPosRef = useRef<{ x: number, y: number } | null>(null);
    const dragAxisRef = useRef<'horizontal' | 'vertical' | null>(null);

    // Initialize canvas centered with smart zoom
    const CANVAS_SIZE = 4000;

    // Calculate initial zoom to fit ~2500px width on screen
    const INITIAL_VIEWPORT_WIDTH = 2500;
    const initialZoom = typeof window !== 'undefined' ? Math.max(0.05, window.innerWidth / INITIAL_VIEWPORT_WIDTH) : 0.15;

    const [zoom, setZoom] = useState(initialZoom);

    const [canvasOffset, setCanvasOffset] = useState({
        x: (window.innerWidth / 2) - (CANVAS_SIZE / 2) * initialZoom,
        y: (window.innerHeight / 2) - (CANVAS_SIZE / 2) * initialZoom
    });

    // Refs
    const canvasRef = useRef<HTMLDivElement>(null);
    const promptInputRef = useRef<HTMLInputElement>(null);
    const isMiddlePanning = useRef(false);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const isDraggingRef = useRef(false);
    const layersRef = useRef<Layer[]>(layers);
    const isDraggingLayerRef = useRef(false);

    // Multitouch Refs
    const lastTouchDist = useRef<number | null>(null);
    const lastTouchCenter = useRef<{ x: number, y: number } | null>(null);

    // Sync ref
    layersRef.current = layers;

    // Constants: Determine resolutions based on active model
    const availableResolutions =
        activeModel === ModelType.NANO_BANANA_1 ? MODEL_1_RESOLUTIONS :
            activeModel === ModelType.NANO_BANANA_2 ? MODEL_2_RESOLUTIONS :
                VEO_RESOLUTIONS; // Use video resolutions for Veo models

    const ALL_EFFECTS = [
        { name: 'Rainbow Linear', class: 'effect-rainbow-linear' },
        { name: 'Rainbow Diagonal', class: 'effect-rainbow-diagonal' },
        { name: 'Rainbow Vertical', class: 'effect-rainbow-vertical' },
        { name: 'Rainbow Plasma', class: 'effect-rainbow-plasma' },
    ];

    // --- Helpers ---

    const getTouchDistance = (touches: React.TouchList) => {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    const getTouchCenter = (touches: React.TouchList) => {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        };
    };

    const handleStart = (clientX: number, clientY: number, button: number = 0) => {
        if (!canvasRef.current) return;
        if (zoom <= 0.001) return;
        if (isGenerating) return; // Prevent interaction during real generation

        if (showLayerMenuMobile) setShowLayerMenuMobile(false);

        if (button === 1) {
            isMiddlePanning.current = true;
            isDraggingRef.current = true;
            setIsDragging(true);
            dragStartRef.current = { x: clientX, y: clientY };
            setDragStart({ x: clientX, y: clientY });
            return;
        }

        const rect = canvasRef.current.getBoundingClientRect();
        const x = (clientX - rect.left - canvasOffset.x) / zoom;
        const y = (clientY - rect.top - canvasOffset.y) / zoom;

        if (selectedTool === 'select') {
            // Check if clicking inside existing selection to move it
            if (selection &&
                x >= selection.x && x <= selection.x + selection.w &&
                y >= selection.y && y <= selection.y + selection.h) {

                isDraggingSelectionRef.current = true;
                selectionDragStartRef.current = { x, y };
                initialSelectionPosRef.current = { x: selection.x, y: selection.y };
                dragAxisRef.current = null;
                return;
            }

            isDraggingRef.current = true;
            setIsDragging(true);
            dragStartRef.current = { x, y };
            setDragStart({ x, y });
            setSelection(null);
        } else if (selectedTool === 'hand') {
            isDraggingRef.current = true;
            setIsDragging(true);
            dragStartRef.current = { x: clientX, y: clientY };
            setDragStart({ x: clientX, y: clientY });
        } else if (selectedTool === 'move') {
            // Find topmost visible unlocked layer under cursor
            // Layers are rendered bottom-to-top, so the last one in the list is on top.
            const clickedLayer = [...layersRef.current].reverse().find(l =>
                x >= l.x && x <= l.x + l.width &&
                y >= l.y && y <= l.y + l.height &&
                l.visible && !l.locked
            );

            if (clickedLayer) {
                isDraggingLayerRef.current = true;
                setDraggingLayerId(clickedLayer.id);
                setSelectedLayerId(clickedLayer.id);
                // Store offset relative to layer origin
                setLayerDragOffset({ x: x - clickedLayer.x, y: y - clickedLayer.y });
            }
        } else if (selectedTool === 'eraser') {
            const clickedLayer = [...layersRef.current].reverse().find(l =>
                x >= l.x && x <= l.x + l.width &&
                y >= l.y && y <= l.y + l.height &&
                l.visible && !l.locked
            );
            if (clickedLayer) {
                setLayers(prev => prev.filter(l => l.id !== clickedLayer.id));
                setRedoStack([]);
            }
        }
    };

    const handleMove = (clientX: number, clientY: number) => {
        // Handle Layer Dragging
        if (selectedTool === 'move' && isDraggingLayerRef.current && draggingLayerId && layerDragOffset && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const currentX = (clientX - rect.left - canvasOffset.x) / zoom;
            const currentY = (clientY - rect.top - canvasOffset.y) / zoom;

            const newX = currentX - layerDragOffset.x;
            const newY = currentY - layerDragOffset.y;

            setLayers(prev => prev.map(l => l.id === draggingLayerId ? { ...l, x: newX, y: newY } : l));
            return;
        }

        // Handle Selection Dragging (Restricted Axis)
        if (isDraggingSelectionRef.current && selectionDragStartRef.current && initialSelectionPosRef.current && selection && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const currentX = (clientX - rect.left - canvasOffset.x) / zoom;
            const currentY = (clientY - rect.top - canvasOffset.y) / zoom;

            const dx = currentX - selectionDragStartRef.current.x;
            const dy = currentY - selectionDragStartRef.current.y;

            if (!dragAxisRef.current) {
                // Determine axis based on first significant movement
                const threshold = 5; // pixels
                if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
                    if (Math.abs(dx) > Math.abs(dy)) {
                        dragAxisRef.current = 'horizontal';
                    } else {
                        dragAxisRef.current = 'vertical';
                    }
                }
            }

            if (dragAxisRef.current) {
                let newX = initialSelectionPosRef.current.x;
                let newY = initialSelectionPosRef.current.y;

                if (dragAxisRef.current === 'horizontal') {
                    newX += dx;
                } else {
                    newY += dy;
                }

                setSelection(prev => prev ? ({
                    ...prev,
                    x: newX,
                    y: newY
                }) : null);
            }
            return;
        }

        if (!isDraggingRef.current || !dragStartRef.current) return;

        if (isMiddlePanning.current || selectedTool === 'hand') {
            const dx = clientX - dragStartRef.current.x;
            const dy = clientY - dragStartRef.current.y;
            setCanvasOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            dragStartRef.current = { x: clientX, y: clientY };
            return;
        }

        if (selectedTool === 'select') {
            if (!canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const currentX = (clientX - rect.left - canvasOffset.x) / zoom;
            const currentY = (clientY - rect.top - canvasOffset.y) / zoom;

            const startX = dragStartRef.current.x;
            const startY = dragStartRef.current.y;

            let rawW = Math.abs(currentX - startX);
            let rawH = Math.abs(currentY - startY);

            const resolutions = availableResolutions && availableResolutions.length > 0
                ? availableResolutions
                : [{ w: 1024, h: 1024, ratio: 1 }];

            const currentRatio = rawH === 0 ? 1 : rawW / rawH;

            let bestRes = resolutions[0];
            let minDiff = Number.MAX_VALUE;

            for (const res of resolutions) {
                const diff = Math.abs(res.ratio - currentRatio);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestRes = res;
                }
            }

            let newW, newH;
            if (currentRatio > bestRes.ratio) {
                newH = rawH;
                newW = newH * bestRes.ratio;
            } else {
                newW = rawW;
                newH = newW / bestRes.ratio;
            }

            const isLeft = currentX < startX;
            const isUp = currentY < startY;

            let finalX = isLeft ? startX - newW : startX;
            let finalY = isUp ? startY - newH : startY;

            setSelection({
                x: finalX,
                y: finalY,
                w: newW,
                h: newH
            });
        }
    };

    const handleEnd = () => {
        if (selectedTool === 'select') {
            setSelection(prev => {
                if (prev && (prev.w < 10 || prev.h < 10)) {
                    return null;
                }
                return prev;
            });
        }
        isMiddlePanning.current = false;
        isDraggingRef.current = false;
        isDraggingLayerRef.current = false;
        setIsDragging(false);
        setDraggingLayerId(null);
        setLayerDragOffset(null);
        setDragStart(null);
        dragStartRef.current = null;
        lastTouchDist.current = null;
        lastTouchCenter.current = null;

        // Reset Selection Drag
        isDraggingSelectionRef.current = false;
        selectionDragStartRef.current = null;
        initialSelectionPosRef.current = null;
        dragAxisRef.current = null;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        handleStart(e.clientX, e.clientY, e.button);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        handleMove(e.clientX, e.clientY);
    };

    const handleMouseUp = () => handleEnd();

    // Double click handler to auto-select layer bounds
    const handleDoubleClick = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - canvasOffset.x) / zoom;
        const y = (e.clientY - rect.top - canvasOffset.y) / zoom;

        // Find topmost visible layer under cursor
        const clickedLayer = [...layersRef.current].reverse().find(l =>
            x >= l.x && x <= l.x + l.width &&
            y >= l.y && y <= l.y + l.height &&
            l.visible
        );

        if (clickedLayer) {
            setSelection({
                x: clickedLayer.x,
                y: clickedLayer.y,
                w: clickedLayer.width,
                h: clickedLayer.height
            });
            setSelectedLayerId(clickedLayer.id);
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            handleStart(touch.clientX, touch.clientY, 0);
        } else if (e.touches.length === 2) {
            isDraggingRef.current = false;
            setIsDragging(false);
            setDragStart(null);
            dragStartRef.current = null;

            lastTouchDist.current = getTouchDistance(e.touches);
            lastTouchCenter.current = getTouchCenter(e.touches);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            handleMove(touch.clientX, touch.clientY);
        } else if (e.touches.length === 2 && lastTouchDist.current && lastTouchCenter.current && canvasRef.current) {
            const currentDist = getTouchDistance(e.touches);
            const currentCenter = getTouchCenter(e.touches);

            const scale = currentDist / lastTouchDist.current;
            const newZoom = Math.min(Math.max(0.05, zoom * scale), 5);

            const rect = canvasRef.current.getBoundingClientRect();
            const centerX = lastTouchCenter.current.x - rect.left;
            const centerY = lastTouchCenter.current.y - rect.top;

            const worldX = (centerX - canvasOffset.x) / zoom;
            const worldY = (centerY - canvasOffset.y) / zoom;

            const newOffsetX = currentCenter.x - rect.left - (worldX * newZoom);
            const newOffsetY = currentCenter.y - rect.top - (worldY * newZoom);

            setZoom(newZoom);
            setCanvasOffset({ x: newOffsetX, y: newOffsetY });

            lastTouchDist.current = currentDist;
            lastTouchCenter.current = currentCenter;
        }
    };

    const handleTouchEnd = () => {
        handleEnd();
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (!canvasRef.current) return;
        if (Math.abs(e.deltaY) < 0.001) return;

        const zoomIntensity = 0.001;
        const newZoom = Math.min(Math.max(0.05, zoom * Math.exp(-e.deltaY * zoomIntensity)), 5);

        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - canvasOffset.x) / zoom;
        const worldY = (mouseY - canvasOffset.y) / zoom;

        const newOffsetX = mouseX - worldX * newZoom;
        const newOffsetY = mouseY - worldY * newZoom;

        setZoom(newZoom);
        setCanvasOffset({ x: newOffsetX, y: newOffsetY });
    };

    const getCanvasSnapshot = async (rect: { x: number, y: number, w: number, h: number }): Promise<string | null> => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(rect.w);
        canvas.height = Math.round(rect.h);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const layersToDraw = [...layers].reverse();

        const loadPromises = layersToDraw.map(layer => {
            if (!layer.visible) return Promise.resolve(null);
            if (layer.type === 'video') return Promise.resolve(null);

            return new Promise<{ img: HTMLImageElement, layer: Layer } | null>((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve({ img, layer });
                img.onerror = () => resolve(null);
                img.src = layer.src || '';
            });
        });

        const loadedImages = await Promise.all(loadPromises);

        loadedImages.forEach(item => {
            if (!item) return;
            const { img, layer } = item;
            const drawX = layer.x - rect.x;
            const drawY = layer.y - rect.y;
            ctx.drawImage(img, drawX, drawY, layer.width, layer.height);
        });

        return canvas.toDataURL('image/png');
    };

    // --- Generation Logic ---

    const triggerGeneration = async (promptText: string, options: { defaultFeather?: number } = {}) => {
        if (!selection) return;

        // Pick random effect from our approved list
        const randomEffect = ALL_EFFECTS[Math.floor(Math.random() * ALL_EFFECTS.length)].class;
        setGeneratingEffect(randomEffect);

        setIsGenerating(true);

        try {
            const ratio = selection.w / selection.h;
            const apiAspectRatio = getClosestAspectRatio(ratio);

            let imagesToSend: string[] = [];
            let finalPrompt = promptText;

            // Render mode Logic:
            // 'fill' - stretches image to fit selection (used for pixel-perfect inpainting)
            // 'cover' - crops image to fill selection (used for video/references)
            let layerRenderMode: 'cover' | 'fill' = 'cover';

            // CAPTURE SNAPSHOT FIRST (The Context)
            const snapshot = await getCanvasSnapshot(selection);

            if (snapshot) {
                // If we have a snapshot, we are doing Inpainting (Editing the canvas)
                // Add snapshot as the first image
                imagesToSend.push(snapshot);

                // If we have reference images (e.g. "Add this armchair"), append them
                if (referenceImages.length > 0) {
                    imagesToSend.push(...referenceImages);
                    finalPrompt += " . Blend the object from the reference image(s) naturally into the scene.";
                    // If using reference + snapshot, we want pixel perfect fit for the hole (snapshot)
                    layerRenderMode = 'fill';
                } else {
                    finalPrompt += " . Maintain exact scale, perspective and position of original image elements.";

                    // LOGIC UPDATE: Nano 2 vs Nano 1 Render Mode
                    // Nano 2 (Pro) sometimes adds black bars. 'cover' crops them.
                    // Nano 1 (Flash) matches pixels. 'fill' is better.
                    if (activeModel === ModelType.NANO_BANANA_2) {
                        layerRenderMode = 'cover';
                    } else {
                        layerRenderMode = 'fill';
                    }
                }

            } else {
                // No snapshot (rare/impossible if selection is valid), but maybe pure Text-to-Image logic fallback
                // If we have references but no snapshot, treat as Image Variation / Text-to-Image with Ref
                if (referenceImages.length > 0) {
                    imagesToSend = referenceImages;
                    layerRenderMode = 'cover'; // Cover to avoid squashing if ratio differs
                }
            }

            // Detect if current model is a Video model
            const isVideoModel = activeModel === ModelType.VEO_FAST || activeModel === ModelType.VEO_HQ;

            // Force 'cover' for video layers always
            if (isVideoModel) {
                layerRenderMode = 'cover';
            }

            // Loop for variations (Video usually strictly 1 for now to avoid overload, Image can be N)
            const loops = isVideoModel ? 1 : variationCount;

            for (let i = 0; i < loops; i++) {
                if (isVideoModel && imagesToSend.length > 0) {
                    // Video Generation using Veo (takes first image)
                    const videoUrl = await generateVideo(finalPrompt, imagesToSend[0], activeModel);
                    if (videoUrl) {
                        const newLayer: Layer = {
                            id: Date.now().toString() + i,
                            name: `Video: ${finalPrompt.slice(0, 10)}...`,
                            visible: true,
                            locked: false,
                            type: 'video',
                            src: videoUrl,
                            x: selection.x,
                            y: selection.y,
                            width: selection.w,
                            height: selection.h,
                            initialX: selection.x,
                            initialY: selection.y,
                            initialWidth: selection.w,
                            initialHeight: selection.h,
                            feather: 0,
                            isPlaying: true,
                            renderMode: 'cover' // Always cover for video
                        };
                        setLayers(prev => [newLayer, ...prev]);
                        setSelectedLayerId(newLayer.id);
                    }
                } else {
                    // Image Generation
                    let sizeLabel = "1K";
                    if (activeModel === ModelType.NANO_BANANA_2) {
                        if (selection.w > 2000 || selection.h > 2000) sizeLabel = "2K";
                    }

                    const base64Image = await generateImageContent(
                        activeModel,
                        finalPrompt,
                        apiAspectRatio,
                        sizeLabel,
                        imagesToSend,
                        referenceImages.length > 0 && !snapshot // Force ratio ONLY if we don't have a snapshot (pure Text-to-Image with ref)
                    );

                    if (base64Image) {
                        const newLayer: Layer = {
                            id: Date.now().toString() + i,
                            name: `Gen ${i + 1}: ${finalPrompt.slice(0, 10)}...`,
                            visible: true,
                            locked: false,
                            type: 'generation',
                            src: base64Image,
                            x: selection.x,
                            y: selection.y,
                            width: selection.w,
                            height: selection.h,
                            initialX: selection.x,
                            initialY: selection.y,
                            initialWidth: selection.w,
                            initialHeight: selection.h,
                            feather: options.defaultFeather || 0,
                            renderMode: layerRenderMode // Apply determined render mode
                        };
                        setLayers(prev => [newLayer, ...prev]);
                        setSelectedLayerId(newLayer.id);
                    }
                }
            }

            setRedoStack([]);

        } catch (err) {
            console.error("Failed to generate", err);
            alert("Erro na geração. Verifique o console ou a chave de API.");
        } finally {
            setIsGenerating(false);
            setSelection(null);
            setGeneratingEffect('');
        }
    }

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        triggerGeneration(prompt);
    };

    const handleMagicFill = async () => {
        const magicPrompt = `TASK: OUTPAINTING / EXTENSÃO DE IMAGEM.
INSTRUÇÃO: A imagem de entrada contém uma área visual válida e uma área vazia (preta/transparente).
OBJETIVO: Preencher APENAS a área vazia para estender a cena de forma invisível e contínua.
REGRAS RÍGIDAS:
1. NÃO ALTERE os pixels da imagem original visível.
2. Mantenha continuidade perfeita de linhas, iluminação, sombras, textura e perspectiva.
3. Se a imagem é uma paisagem, estenda a paisagem. Se é um objeto cortado, complete o objeto.
4. O resultado final deve parecer uma única imagem coesa.
5. Fazer a transição das bordas de forma imperceptível, evitando cortes abruptos.`;

        triggerGeneration(magicPrompt, { defaultFeather: 20 });
    };

    // --- Upload & Reorder & Fit & Download ---

    const handleDownload = async () => {
        if (layers.length === 0) return;

        const visibleLayers = layers.filter(l => l.visible);
        if (visibleLayers.length === 0) {
            alert("Nenhuma camada visível para baixar.");
            return;
        }

        // Calculate Bounding Box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        visibleLayers.forEach(layer => {
            if (layer.x < minX) minX = layer.x;
            if (layer.y < minY) minY = layer.y;
            if (layer.x + layer.width > maxX) maxX = layer.x + layer.width;
            if (layer.y + layer.height > maxY) maxY = layer.y + layer.height;
        });

        const width = maxX - minX;
        const height = maxY - minY;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw bottom-up
        const layersToDraw = [...visibleLayers].reverse();

        const loadPromises = layersToDraw.map(layer => {
            return new Promise<{ img: HTMLImageElement | HTMLVideoElement, layer: Layer } | null>((resolve) => {
                if (layer.type === 'video') {
                    resolve(null);
                } else {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => resolve({ img, layer });
                    img.onerror = () => resolve(null);
                    img.src = layer.src || '';
                }
            });
        });

        const loadedImages = await Promise.all(loadPromises);

        loadedImages.forEach(item => {
            if (!item) return;
            const { img, layer } = item;
            ctx.drawImage(img, layer.x - minX, layer.y - minY, layer.width, layer.height);
        });

        const link = document.createElement('a');
        link.download = `visualizae-art-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const handleFitScreen = () => {
        if (layers.length === 0) {
            const newZoom = initialZoom;
            const newOffset = {
                x: (window.innerWidth / 2) - (CANVAS_SIZE / 2) * newZoom,
                y: (window.innerHeight / 2) - (CANVAS_SIZE / 2) * newZoom
            };
            setZoom(newZoom);
            setCanvasOffset(newOffset);
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        layers.forEach(layer => {
            if (!layer.visible) return;
            if (layer.x < minX) minX = layer.x;
            if (layer.y < minY) minY = layer.y;
            if (layer.x + layer.width > maxX) maxX = layer.x + layer.width;
            if (layer.y + layer.height > maxY) maxY = layer.y + layer.height;
        });

        if (minX === Infinity) return;

        const contentW = maxX - minX;
        const contentH = maxY - minY;
        const padding = 100;

        const scaleX = window.innerWidth / (contentW + padding * 2);
        const scaleY = window.innerHeight / (contentH + padding * 2);
        const newZoom = Math.min(Math.min(scaleX, scaleY), 1.5);

        const centerX = minX + contentW / 2;
        const centerY = minY + contentH / 2;

        const newOffset = {
            x: (window.innerWidth / 2) - (centerX * newZoom),
            y: (window.innerHeight / 2) - (centerY * newZoom)
        };

        setZoom(newZoom);
        setCanvasOffset(newOffset);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const viewportCenterX = (window.innerWidth / 2 - canvasOffset.x) / zoom;
                const viewportCenterY = (window.innerHeight / 2 - canvasOffset.y) / zoom;

                const newLayer: Layer = {
                    id: Date.now().toString(),
                    name: file.name,
                    visible: true,
                    locked: false,
                    type: 'image',
                    src: event.target?.result as string,
                    x: viewportCenterX - (img.width / 2),
                    y: viewportCenterY - (img.height / 2),
                    width: img.width,
                    height: img.height,
                    initialX: viewportCenterX - (img.width / 2),
                    initialY: viewportCenterY - (img.height / 2),
                    initialWidth: img.width,
                    initialHeight: img.height,
                    feather: 0,
                    renderMode: 'fill' // Default for uploads to match their intrinsic size exactly
                };
                setLayers(prev => [newLayer, ...prev]);
                setSelectedLayerId(newLayer.id);
                setRedoStack([]);
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result && typeof event.target.result === 'string') {
                if (referenceImages.length < 10) {
                    setReferenceImages(prev => [...prev, event.target!.result as string]);
                } else {
                    alert("Limite de 10 referências atingido.");
                }
            }
        }
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleRemoveReference = (index: number) => {
        setReferenceImages(prev => prev.filter((_, i) => i !== index));
    };

    useEffect(() => {
        const handleGlobalPaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const blob = item.getAsFile();
                    if (!blob) continue;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                        if (event.target?.result && typeof event.target.result === 'string') {
                            const result = event.target.result;

                            // Check if pasting into Prompt Input
                            if (document.activeElement === promptInputRef.current) {
                                if (referenceImages.length < 10) {
                                    setReferenceImages(prev => [...prev, result]);
                                } else {
                                    alert("Limite de 10 referências atingido.");
                                }
                            } else {
                                // Paste into Canvas
                                const img = new Image();
                                img.onload = () => {
                                    const viewportCenterX = (window.innerWidth / 2 - canvasOffset.x) / zoom;
                                    const viewportCenterY = (window.innerHeight / 2 - canvasOffset.y) / zoom;

                                    const newLayer: Layer = {
                                        id: Date.now().toString(),
                                        name: "Pasted Image",
                                        visible: true,
                                        locked: false,
                                        type: 'image',
                                        src: result,
                                        x: viewportCenterX - (img.width / 2),
                                        y: viewportCenterY - (img.height / 2),
                                        width: img.width,
                                        height: img.height,
                                        initialX: viewportCenterX - (img.width / 2),
                                        initialY: viewportCenterY - (img.height / 2),
                                        initialWidth: img.width,
                                        initialHeight: img.height,
                                        feather: 0,
                                        renderMode: 'fill'
                                    };
                                    setLayers(prev => [newLayer, ...prev]);
                                    setSelectedLayerId(newLayer.id);
                                    setRedoStack([]);
                                };
                                img.src = result;
                            }
                        }
                    };
                    reader.readAsDataURL(blob);
                }
            }
        };

        window.addEventListener('paste', handleGlobalPaste);
        return () => {
            window.removeEventListener('paste', handleGlobalPaste);
        };
    }, [canvasOffset, zoom, referenceImages, setLayers]);

    const handleUseLayerAsReference = (layer: Layer) => {
        if (layer.src && layer.type !== 'video') {
            if (referenceImages.length < 10) {
                setReferenceImages(prev => [...prev, layer.src!]);
            } else {
                alert("Limite de 10 referências atingido.");
            }
        }
    };

    const handleResetLayer = () => {
        if (!selectedLayerId) return;
        setLayers(prev => prev.map(l => {
            if (l.id === selectedLayerId && l.initialX !== undefined) {
                return {
                    ...l,
                    x: l.initialX!,
                    y: l.initialY!,
                    width: l.initialWidth!,
                    height: l.initialHeight!
                };
            }
            return l;
        }));
    };

    const handleReorderLayers = (fromIndex: number, toIndex: number) => {
        setLayers(prev => {
            const newLayers = [...prev];
            const [movedItem] = newLayers.splice(fromIndex, 1);
            newLayers.splice(toIndex, 0, movedItem);
            return newLayers;
        });
    };

    const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
        setLayers(prev => {
            const index = prev.findIndex(l => l.id === id);
            if (index === -1) return prev;

            const newLayers = [...prev];

            if (direction === 'up') {
                if (index === 0) return prev;
                const temp = newLayers[index];
                newLayers[index] = newLayers[index - 1];
                newLayers[index - 1] = temp;
            } else {
                if (index === prev.length - 1) return prev;
                const temp = newLayers[index];
                newLayers[index] = newLayers[index + 1];
                newLayers[index + 1] = temp;
            }
            return newLayers;
        });
    };

    const handleUndo = () => {
        if (layers.length === 0) return;
        const [removed, ...remaining] = layers;
        setLayers(remaining);
        setRedoStack(prev => [removed, ...prev]);

        if (selectedLayerId === removed.id) {
            setSelectedLayerId(null);
            setShowLayerMenuMobile(false);
        }
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const [restored, ...remainingStack] = redoStack;
        setRedoStack(remainingStack);
        setLayers(prev => [restored, ...prev]);
        setSelectedLayerId(restored.id);
    };

    const handleUpdateLayer = (id: string, updates: Partial<Layer>) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    };

    const handleDeleteLayer = (id: string) => {
        setLayers(prev => prev.filter(l => l.id !== id));
        if (selectedLayerId === id) {
            setSelectedLayerId(null);
            setShowLayerMenuMobile(false);
        }
        setRedoStack([]);
    };

    const handleMobileLayerSelect = (id: string) => {
        if (selectedLayerId === id) {
            setShowLayerMenuMobile(!showLayerMenuMobile);
        } else {
            setSelectedLayerId(id);
            setShowLayerMenuMobile(true);
        }
    };

    const getCurrentResolutionMatch = () => {
        if (!selection) return null;
        return availableResolutions?.find(r =>
            Math.abs(r.ratio - (selection.w / selection.h)) < 0.02
        );
    };

    const currentMatch = getCurrentResolutionMatch();

    const getResolutionStatus = () => {
        if (!selection || !currentMatch) return { status: 'ok', msg: '' };

        if (selection.w > currentMatch.w + 2 || selection.h > currentMatch.h + 2) {
            return {
                status: 'warning',
                msg: `Resolução nativa excedida (${currentMatch.w}x${currentMatch.h})`
            };
        }

        return { status: 'ok', msg: '' };
    };

    const resStatus = getResolutionStatus();
    const isWarning = resStatus.status === 'warning';
    const bgColor = 'bg-transparent';
    const visualScale = 1 / zoom;

    const activeLayer = layers.find(l => l.id === selectedLayerId);
    const activeLayerIndex = activeLayer ? layers.findIndex(l => l.id === activeLayer.id) : -1;

    // Determine if Video model is active for UI styling
    const isVideoMode = activeModel === ModelType.VEO_FAST || activeModel === ModelType.VEO_HQ;

    return (
        <div className="flex-1 flex flex-col h-full relative">
            {/* Top Bar (Within Component scope now only mainly affects internal positioning if needed, but App.tsx handles the main nav) */}
            <div
                className="h-14 border-b border-white/5 bg-[#1f1f23] flex items-center px-4 justify-between z-40 relative shadow-sm shrink-0"
                style={{ transform: 'translateZ(0)' }}
            >
                {/* Left: Spacer to balance layout if needed, or tools */}
                <div className="flex items-center gap-2 shrink-0 z-10 w-24">
                    {/* Space reserved for back button or future use */}
                </div>

                {/* Center: Model Selector (Absolutely Centered) */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    {/* Desktop Selector */}
                    <div className="flex bg-[#121215] rounded-lg p-1 border border-white/5 gap-1">
                        <button
                            onClick={() => setActiveModel(ModelType.NANO_BANANA_1)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activeModel === ModelType.NANO_BANANA_1 ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            Nano 1
                        </button>
                        <button
                            onClick={() => setActiveModel(ModelType.NANO_BANANA_2)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${activeModel === ModelType.NANO_BANANA_2 ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            Nano 2
                            <span className="bg-black/20 px-1 rounded text-[9px] border border-white/10">PRO</span>
                        </button>
                        <button
                            onClick={() => setActiveModel(ModelType.VEO_FAST)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${activeModel === ModelType.VEO_FAST ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            Veo
                            <span className="bg-black/20 px-1 rounded text-[9px] border border-white/10"><Video size={8} /></span>
                        </button>
                        <button
                            onClick={() => setActiveModel(ModelType.VEO_HQ)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${activeModel === ModelType.VEO_HQ ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                            title="Veo High Quality (1080p)"
                        >
                            Veo Pro
                            <span className="bg-black/20 px-1 rounded text-[9px] border border-white/10"><Clapperboard size={8} /></span>
                        </button>
                    </div>
                </div>

                {/* Right: Layers & Avatar */}
                <div className="flex items-center gap-2 z-10 flex-1 justify-end md:flex-none">
                    {/* Mobile Layers Scroll */}
                    <div className="flex items-center overflow-x-auto gap-2 no-scrollbar md:hidden mask-linear h-8 max-w-[120px]">
                        {[...layers].reverse().map(layer => (
                            <div key={layer.id} className="relative shrink-0">
                                <button
                                    onClick={() => handleMobileLayerSelect(layer.id)}
                                    className={`relative w-8 h-8 rounded-md overflow-hidden border-2 shrink-0 transition-all ${selectedLayerId === layer.id ? 'border-purple-500 scale-110 z-10' : 'border-white/10 opacity-70 grayscale'
                                        }`}
                                >
                                    {layer.type === 'video' ? (
                                        <div className="w-full h-full bg-black flex items-center justify-center">
                                            <Film size={12} className="text-teal-400" />
                                        </div>
                                    ) : (
                                        <img src={layer.src} className="w-full h-full object-cover" alt="layer" />
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {showLayerMenuMobile && activeLayer && (
                <div
                    className="fixed inset-0 z-[60] flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm md:hidden"
                    onClick={() => setShowLayerMenuMobile(false)}
                    style={{ touchAction: 'none' }}
                >
                    <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <LayerMenu
                            layer={activeLayer}
                            onUpdate={(updates) => handleUpdateLayer(activeLayer.id, updates)}
                            onDelete={() => handleDeleteLayer(activeLayer.id)}
                            onMove={(dir) => handleMoveLayer(activeLayer.id, dir)}
                            onUseAsReference={() => handleUseLayerAsReference(activeLayer)}
                            onResetPosition={activeLayer.initialX !== undefined ? handleResetLayer : undefined}
                            isFirst={activeLayerIndex === 0}
                            isLast={activeLayerIndex === layers.length - 1}
                            className="w-80 shadow-2xl border-purple-500/20"
                        />
                    </div>
                </div>
            )}

            {/* Main Layout Area */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* Canvas Wrapper */}
                <div className="flex-1 relative bg-[#0f0f12] overflow-hidden touch-none overscroll-none min-w-0"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onWheel={handleWheel}
                    onDoubleClick={handleDoubleClick}
                >

                    <Toolbar
                        selectedTool={selectedTool}
                        onSelectTool={setSelectedTool}
                        canUndo={layers.length > 0}
                        canRedo={redoStack.length > 0}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        onUploadImage={handleImageUpload}
                        onFitScreen={handleFitScreen}
                        onDownload={handleDownload}
                    />

                    <div
                        ref={canvasRef}
                        className={`absolute inset-0 origin-top-left ${selectedTool === 'hand' ? 'cursor-grab active:cursor-grabbing' : selectedTool === 'move' ? 'cursor-move' : selectedTool === 'eraser' ? 'cursor-not-allowed' : 'pointer-events-auto cursor-crosshair'}`}
                    >
                        <div style={{
                            transform: `translate3d(${canvasOffset.x}px, ${canvasOffset.y}px, 0) scale(${zoom})`,
                            transformOrigin: '0 0',
                            width: `${CANVAS_SIZE}px`,
                            height: `${CANVAS_SIZE}px`,
                            willChange: 'transform',
                            backfaceVisibility: 'hidden'
                        }}>
                            <div className="absolute inset-0 w-[4000px] h-[4000px] pointer-events-none opacity-20"
                                style={{
                                    backgroundImage: 'radial-gradient(#3f3f46 1px, transparent 1px)',
                                    backgroundSize: '20px 20px'
                                }}>
                            </div>

                            {[...layers].reverse().map(layer => {
                                if (!layer.visible) return null;
                                const maskStyle: React.CSSProperties = layer.feather ? {
                                    maskImage: `linear-gradient(to right, transparent, black ${layer.feather}px, black calc(100% - ${layer.feather}px), transparent), linear-gradient(to bottom, transparent, black ${layer.feather}px, black calc(100% - ${layer.feather}px), transparent)`,
                                    WebkitMaskImage: `linear-gradient(to right, transparent, black ${layer.feather}px, black calc(100% - ${layer.feather}px), transparent), linear-gradient(to bottom, transparent, black ${layer.feather}px, black calc(100% - ${layer.feather}px), transparent)`,
                                    maskComposite: 'intersect',
                                    WebkitMaskComposite: 'source-in'
                                } : {};

                                // Use renderMode if available, default to 'cover' for legacy layers (though uploaded ones default to 'fill' in new logic)
                                // 'fill' prevents black borders on inpainting (exact pixel match)
                                // 'cover' prevents squashing on reference generation (crops instead of distortion)
                                const renderMode = layer.renderMode || 'cover';
                                const objectFitClass = `object-${renderMode}`;

                                return (
                                    <div
                                        key={layer.id}
                                        className={`absolute ${selectedTool === 'move' ? 'pointer-events-auto' : 'pointer-events-none'}`}
                                        style={{
                                            left: layer.x,
                                            top: layer.y,
                                            width: layer.width,
                                            height: layer.height,
                                            ...maskStyle
                                        }}
                                    >
                                        {layer.type === 'video' ? (
                                            <video
                                                ref={(el) => {
                                                    if (el) {
                                                        if (layer.isPlaying !== false) {
                                                            el.play().catch(() => { });
                                                        } else {
                                                            el.pause();
                                                        }
                                                    }
                                                }}
                                                src={layer.src}
                                                className="w-full h-full object-cover select-none"
                                                loop
                                                playsInline
                                            />
                                        ) : (
                                            <img
                                                src={layer.src}
                                                alt={layer.name}
                                                className={`w-full h-full ${objectFitClass} select-none`}
                                                draggable={false}
                                            />
                                        )}
                                    </div>
                                );
                            })}

                            {selection && (
                                <div
                                    className={`absolute ${bgColor} z-10 flex flex-col justify-end transition-colors shadow-[0_0_15px_rgba(0,0,0,0.5)] pointer-events-auto cursor-move`}
                                    style={{
                                        left: selection.x,
                                        top: selection.y,
                                        width: selection.w,
                                        height: selection.h,
                                        borderWidth: `${2 * visualScale}px`,
                                        borderStyle: 'solid',
                                        borderColor: isWarning ? '#facc15' : isVideoMode ? '#2563eb' : '#9333ea'
                                    }}
                                >
                                    {isGenerating && (
                                        <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden rounded-sm">
                                            <div className={`absolute inset-0 ${generatingEffect} opacity-30 blur-xl`}></div>
                                            <div className="absolute inset-0 animate-pulse-border z-30"></div>
                                        </div>
                                    )}

                                    <div
                                        className={`absolute ${isWarning ? 'bg-yellow-400 text-black' : isVideoMode ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'} text-xs font-bold px-3 py-1.5 rounded-md shadow-xl font-mono whitespace-nowrap flex items-center gap-2 transition-colors border border-white/20 z-50`}
                                        style={{
                                            transform: `scale(${visualScale})`,
                                            transformOrigin: 'bottom left',
                                            bottom: `calc(100% + ${5 * visualScale}px)`,
                                            left: 0
                                        }}
                                    >
                                        <BoxSelect size={14} />
                                        {Math.round(selection.w)} x {Math.round(selection.h)}

                                        {currentMatch && !isWarning && (
                                            <span className="flex items-center gap-1 ml-1 font-extrabold border-l border-white/20 pl-2">
                                                <Check size={12} strokeWidth={3} /> Valid
                                            </span>
                                        )}

                                        {isWarning && (
                                            <span className="flex items-center gap-1 ml-1 font-extrabold border-l border-black/20 pl-2">
                                                <AlertTriangle size={12} strokeWidth={3} /> Qualidade Reduzida
                                            </span>
                                        )}
                                    </div>

                                    {isWarning && (
                                        <div
                                            className="absolute bg-yellow-400 text-black font-bold text-xs px-3 py-2 rounded-md shadow-xl w-max max-w-xs border-2 border-white/20 z-50"
                                            style={{
                                                transform: `scale(${visualScale})`,
                                                transformOrigin: 'top left',
                                                top: `calc(100% + ${5 * visualScale}px)`,
                                                left: 0
                                            }}
                                        >
                                            {resStatus.msg}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Floating Reference Tray (Moved here to avoid overlapping UI) */}
                    {referenceImages.length > 0 && (
                        <div
                            className="absolute bottom-[72px] left-4 bg-[#1f1f23] border border-white/10 p-2 rounded-xl shadow-2xl flex gap-2 z-50 max-w-[calc(100%-32px)] overflow-x-auto"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {referenceImages.map((img, idx) => (
                                <div key={idx} className="w-12 h-12 rounded overflow-hidden border border-white/20 relative shrink-0 group">
                                    <img src={img} alt="Ref" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                                        onClick={() => handleRemoveReference(idx)}>
                                        <X size={14} className="text-white hover:text-red-400" />
                                    </div>
                                </div>
                            ))}
                            <div className="flex items-center justify-center px-2">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">{referenceImages.length}/10 Refs</span>
                            </div>
                        </div>
                    )}

                    {/* Bottom Prompt Bar (Full Width & Bottom Fixed) */}
                    <div
                        className="absolute bottom-0 left-0 w-full p-1 md:p-2 bg-[#1f1f23] border-t border-white/10 z-50 flex gap-1 md:gap-2 shadow-[0_-5px_15px_rgba(0,0,0,0.3)] items-center min-h-[56px] md:min-h-[64px] pb-[env(safe-area-inset-bottom)]"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Reference Image Trigger */}
                        <label className={`p-2 md:p-3 rounded-lg font-bold transition-all flex items-center justify-center aspect-square cursor-pointer h-9 w-9 md:h-10 md:w-10 ${referenceImages.length > 0 ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50' : 'bg-gray-800 text-gray-500 hover:bg-white/5'
                            }`} title="Anexar Referência">
                            <Paperclip size={18} className="md:w-5 md:h-5" />
                            <input
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={handleReferenceUpload}
                            />
                        </label>

                        {/* Input Area (Clean, refs moved to tray) */}
                        <div className="flex-1 relative flex flex-col justify-center min-w-0">
                            <input
                                ref={promptInputRef}
                                type="text"
                                placeholder={isVideoMode ? "Descreva o vídeo..." : referenceImages.length > 0 ? "Descreva como usar as referências..." : "Descreva a imagem..."}
                                className="w-full bg-[#121215] border border-white/10 rounded-lg px-3 md:px-4 h-9 md:h-10 text-sm md:text-base text-white focus:border-purple-500 focus:outline-none transition-all placeholder:text-gray-600"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                            />
                        </div>

                        {/* Variation Count Selector */}
                        {!isVideoMode && (
                            <div className="hidden md:flex flex-col gap-0.5 justify-center">
                                <div className="flex items-center bg-gray-800 rounded-lg border border-white/5 h-10 px-1">
                                    <span className="text-[9px] text-gray-500 font-bold uppercase mr-1">VARS</span>
                                    <select
                                        value={variationCount}
                                        onChange={(e) => setVariationCount(parseInt(e.target.value))}
                                        className="bg-transparent text-white font-bold text-sm outline-none cursor-pointer text-center"
                                        title="Quantidade de Variações"
                                    >
                                        <option value={1} className="bg-[#1f1f23] text-white">1</option>
                                        <option value={2} className="bg-[#1f1f23] text-white">2</option>
                                        <option value={3} className="bg-[#1f1f23] text-white">3</option>
                                        <option value={4} className="bg-[#1f1f23] text-white">4</option>
                                        <option value={5} className="bg-[#1f1f23] text-white">5</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleMagicFill}
                            disabled={isGenerating || !selection || isVideoMode}
                            className={`rounded-lg font-bold transition-all flex items-center justify-center h-9 w-9 md:h-10 md:w-10 md:w-auto md:px-4 gap-2 ${!selection || isVideoMode ? 'bg-gray-800 text-gray-500 cursor-not-allowed' :
                                'bg-teal-600 text-white hover:bg-teal-500 shadow-lg'
                                }`}
                            title="Preencher Vazio"
                        >
                            <Sparkles size={18} className="md:w-5 md:h-5" />
                            <span className="hidden md:inline">Preencher</span>
                        </button>

                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !selection}
                            className={`rounded-lg font-bold transition-all flex items-center justify-center h-9 w-9 md:h-10 md:w-10 md:w-auto md:px-6 gap-2 ${isGenerating ? 'bg-purple-900 text-purple-300' :
                                !selection ? 'bg-gray-800 text-gray-500 cursor-not-allowed' :
                                    isVideoMode ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg' :
                                        'bg-purple-600 text-white hover:bg-purple-500 shadow-lg'
                                }`}
                        >
                            {isGenerating ? <Loader2 className="animate-spin md:w-6 md:h-6" size={18} /> : <ArrowRight size={18} className="md:w-6 md:h-6" />}
                            <span className="hidden md:inline">{isGenerating ? 'Gerando...' : 'Gerar'}</span>
                        </button>
                    </div>
                </div>

                {/* Right Sidebar (Desktop Only) */}
                <div className="hidden md:block w-72 bg-[#1f1f23] border-l border-white/5 z-50 relative shrink-0">
                    <LayerPanel
                        layers={layers}
                        selectedLayerId={selectedLayerId}
                        onSelect={setSelectedLayerId}
                        onToggleVisibility={(id) => handleUpdateLayer(id, { visible: !layers.find(l => l.id === id)?.visible })}
                        onDelete={handleDeleteLayer}
                        onUpdateLayer={handleUpdateLayer}
                        isOpen={true}
                        onClose={() => { }}
                        onReorder={handleReorderLayers}
                        onMoveLayer={handleMoveLayer}
                        onUseAsReference={handleUseLayerAsReference}
                    />
                </div>
            </div>
        </div>
    );
};

export default CanvasMode;
