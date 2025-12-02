
import React, { useState, useEffect, useRef } from 'react';
import { ModelType, Layer } from '../types';
import { generateVideo, generateImageContent } from '../services/geminiService';
import { Upload, ArrowRight, Loader2, Play, Layout, Video, Film, Wand2, ImagePlus, X, Check, Layers, Clapperboard, Download, Plus, Trash2, Merge, RefreshCw, ChevronDown, MonitorPlay } from 'lucide-react';

// --- Types ---

interface Scene {
    id: string;
    startFrame: string | null;
    endFrame: string | null;
    prompt: string;
    videos: string[]; // Changed from single video to array
    selectedVideoIndex: number; // Which video is the "active" one for export
    isGenerating: boolean;
    variationCount: number; // How many to generate (1-5)
}

// --- Helper: Layer Compositing ---

const compositeLayers = async (layers: Layer[]): Promise<string | null> => {
    if (layers.length === 0) return null;
    if (layers.length === 1 && layers[0].src) return layers[0].src; // Simple case

    // 1. Calculate Bounding Box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // Filter out videos for now, only composite images
    const imageLayers = layers.filter(l => l.type !== 'video' && l.visible);
    if (imageLayers.length === 0) return null;

    imageLayers.forEach(layer => {
        if (layer.x < minX) minX = layer.x;
        if (layer.y < minY) minY = layer.y;
        if (layer.x + layer.width > maxX) maxX = layer.x + layer.width;
        if (layer.y + layer.height > maxY) maxY = layer.y + layer.height;
    });

    const width = maxX - minX;
    const height = maxY - minY;

    // 2. Create Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 3. Draw Layers (Bottom to Top)
    // The layers prop comes in reverse order (top first), so we reverse it to draw background first
    const layersToDraw = [...imageLayers].reverse();

    const loadPromises = layersToDraw.map(layer => {
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
        ctx.drawImage(img, layer.x - minX, layer.y - minY, layer.width, layer.height);
    });

    return canvas.toDataURL('image/png');
};

// --- Helper: Crop/Resize to Aspect Ratio ---
// Prevents black bars by creating a cover-fit version of the image at target resolution
const cropImageToRatio = async (base64Str: string, targetWidth: number, targetHeight: number): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(base64Str); return; }

            // Calculate "Cover" dimensions logic
            // We want to fill the target area completely
            const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
            const w = img.width * scale;
            const h = img.height * scale;

            // Center the image
            const x = (targetWidth - w) / 2;
            const y = (targetHeight - h) / 2;

            // Draw with smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, x, y, w, h);

            resolve(canvas.toDataURL('image/png', 1.0)); // High quality PNG
        };
        img.src = base64Str;
    });
};


// --- Components ---

interface FrameSlotProps {
    label: string;
    image: string | null;
    setImage: (img: string | null) => void;
    orientation: 'horizontal' | 'vertical';
    canvasLayers: Layer[];
}

const FrameSlot: React.FC<FrameSlotProps> = ({ label, image, setImage, orientation, canvasLayers }) => {
    const [mode, setMode] = useState<'initial' | 'generate' | 'select_layer'>('initial');
    const [prompt, setPrompt] = useState('');
    const [refImage, setRefImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // Multi-select state
    const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isRef: boolean = false) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = ev.target?.result as string;
            if (isRef) setRefImage(result);
            else {
                setImage(result);
                setMode('initial');
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setIsGenerating(true);
        try {
            const aspectRatio = orientation === 'horizontal' ? '16:9' : '9:16';
            const refs = refImage ? [refImage] : [];
            const generated = await generateImageContent(
                ModelType.NANO_BANANA_2,
                prompt,
                aspectRatio,
                '1K',
                refs,
                !!refImage
            );
            if (generated) {
                setImage(generated);
                setMode('initial');
                setPrompt('');
                setRefImage(null);
            }
        } catch (error) {
            console.error(error);
            alert("Erro ao gerar frame.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleConfirmLayers = async () => {
        if (selectedLayerIds.length === 0) return;

        // Find actual layer objects
        const selectedLayers = canvasLayers.filter(l => selectedLayerIds.includes(l.id));

        // Composite them
        const composite = await compositeLayers(selectedLayers);
        if (composite) {
            setImage(composite);
            setMode('initial');
            setSelectedLayerIds([]);
        } else {
            alert("Erro ao compor camadas.");
        }
    };

    const toggleLayerSelection = (id: string) => {
        setSelectedLayerIds(prev =>
            prev.includes(id) ? prev.filter(lid => lid !== id) : [...prev, id]
        );
    };

    const handleClear = () => {
        setImage(null);
        setMode('initial');
        setPrompt('');
        setRefImage(null);
        setSelectedLayerIds([]);
    };

    // Container dimensions based on orientation
    const containerClass = orientation === 'horizontal' ? 'w-48 h-28' : 'w-28 h-48';

    return (
        <div className={`relative ${containerClass}`}>

            {/* 1. View Mode (Image Exists) */}
            {image && mode === 'initial' && (
                <div className="relative group w-full h-full">
                    <div className="border-2 border-white/10 rounded-xl flex items-center justify-center bg-[#121215] overflow-hidden shadow-lg w-full h-full">
                        <img src={image} alt={label} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[9px] text-white font-medium uppercase tracking-wider backdrop-blur-sm pointer-events-none">
                        {label}
                    </div>
                    <button
                        onClick={handleClear}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:bg-red-400 opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110 z-10"
                        title="Remover Frame"
                    >
                        <X size={12} strokeWidth={3} />
                    </button>
                </div>
            )}

            {/* 2. Initial Mode (Empty) */}
            {!image && mode === 'initial' && (
                <div className="w-full h-full border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center bg-[#121215] gap-2 transition-all hover:border-white/20">
                    <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">{label}</span>

                    <div className="flex gap-1.5">
                        <label className="flex items-center justify-center w-8 h-8 bg-[#1f1f23] rounded border border-white/5 cursor-pointer hover:bg-white/5 hover:border-purple-500/50 transition-all text-gray-500 hover:text-purple-400" title="Upload PC">
                            <Upload size={14} />
                            <input type="file" className="hidden" onChange={(e) => handleFileUpload(e)} accept="image/*" />
                        </label>

                        <button
                            onClick={() => setMode('generate')}
                            className="flex items-center justify-center w-8 h-8 bg-[#1f1f23] rounded border border-white/5 hover:bg-white/5 hover:border-purple-500/50 transition-all text-gray-500 hover:text-purple-400"
                            title="Gerar (Nano)"
                        >
                            <Wand2 size={14} />
                        </button>

                        <button
                            onClick={() => setMode('select_layer')}
                            className="flex items-center justify-center w-8 h-8 bg-[#1f1f23] rounded border border-white/5 hover:bg-white/5 hover:border-blue-500/50 transition-all text-gray-500 hover:text-blue-400"
                            title="Usar Camadas"
                        >
                            <Layers size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* 3. Select Layer Mode (Expanded Popover) */}
            {mode === 'select_layer' && (
                <div className="absolute top-0 left-0 z-50 w-80 bg-[#1f1f23] border-2 border-blue-500/30 rounded-xl shadow-2xl p-3 flex flex-col gap-2 max-h-96">
                    <div className="flex justify-between items-center pb-2 border-b border-white/10 shrink-0">
                        <span className="text-xs uppercase font-bold text-blue-400 flex items-center gap-2">
                            <Layers size={14} /> Selecionar Camadas
                        </span>
                        <button onClick={() => setMode('initial')} className="text-gray-500 hover:text-gray-300 bg-white/5 p-1 rounded-full">
                            <X size={14} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[150px]">
                        {canvasLayers.filter(l => l.type !== 'video').length === 0 ? (
                            <div className="text-xs text-gray-500 text-center mt-10">
                                Nenhuma imagem disponível no Canvas.
                            </div>
                        ) : (
                            canvasLayers.filter(l => l.type !== 'video').map(layer => {
                                const isSelected = selectedLayerIds.includes(layer.id);
                                return (
                                    <div
                                        key={layer.id}
                                        onClick={() => toggleLayerSelection(layer.id)}
                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all ${isSelected ? 'bg-blue-500/20 border-blue-500/50' : 'bg-[#18181b] hover:bg-white/5 border-white/5'}`}
                                    >
                                        <div className="w-10 h-10 rounded overflow-hidden bg-black shrink-0 border border-white/10">
                                            <img src={layer.src} className="w-full h-full object-cover" alt="" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-xs truncate font-medium ${isSelected ? 'text-blue-200' : 'text-gray-300'}`}>{layer.name}</p>
                                            <p className="text-[10px] text-gray-600">Imagem</p>
                                        </div>
                                        {isSelected && <div className="bg-blue-500 rounded-full p-0.5"><Check size={10} className="text-white" /></div>}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <button
                        onClick={handleConfirmLayers}
                        disabled={selectedLayerIds.length === 0}
                        className={`w-full py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${selectedLayerIds.length > 0
                            ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg'
                            : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                            }`}
                    >
                        <Merge size={14} />
                        {selectedLayerIds.length > 0 ? `Compor ${selectedLayerIds.length} Camadas` : 'Selecione...'}
                    </button>
                </div>
            )}

            {/* 4. Generate Mode Form (Expanded Popover) */}
            {mode === 'generate' && (
                <div className="absolute top-0 left-0 z-50 w-72 bg-[#1f1f23] border-2 border-purple-500/30 rounded-xl shadow-2xl p-3 flex flex-col gap-3">
                    <div className="flex justify-between items-center pb-1">
                        <span className="text-xs uppercase font-bold text-purple-400 flex items-center gap-2">
                            <Wand2 size={14} /> Gerar Frame
                        </span>
                        <button onClick={() => setMode('initial')} className="text-gray-500 hover:text-gray-300 bg-white/5 p-1 rounded-full">
                            <X size={14} />
                        </button>
                    </div>

                    <textarea
                        className="w-full bg-[#121215] text-xs text-white p-3 rounded-lg border border-white/10 focus:border-purple-500 outline-none resize-none h-24 placeholder:text-gray-600"
                        placeholder={`Descreva o frame...`}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                    />

                    <div className="flex gap-2">
                        <label className={`flex-1 flex items-center justify-center gap-2 bg-[#121215] border border-white/10 rounded-lg p-2 cursor-pointer hover:bg-white/5 transition-colors text-xs font-medium ${refImage ? 'border-green-500/50 text-green-400' : 'text-gray-400'}`} title="Referência">
                            {refImage ? <Check size={14} /> : <ImagePlus size={14} />}
                            {refImage ? 'Ref Anexada' : 'Anexar Ref'}
                            <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, true)} accept="image/*" />
                        </label>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !prompt}
                        className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors ${isGenerating || !prompt ? 'bg-gray-800 text-gray-500' : 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg'}`}
                    >
                        {isGenerating ? <Loader2 size={14} className="animate-spin" /> : 'Gerar com Nano Banana'}
                    </button>
                </div>
            )}
        </div>
    );
};


// --- Scene Row Component ---

interface SceneRowProps {
    scene: Scene;
    index: number;
    orientation: 'horizontal' | 'vertical';
    canvasLayers: Layer[];
    onUpdate: (id: string, updates: Partial<Scene>) => void;
    onDelete: (id: string) => void;
    activeModel: ModelType;
}

const SceneRow: React.FC<SceneRowProps> = ({ scene, index, orientation, canvasLayers, onUpdate, onDelete, activeModel }) => {

    const handleGenerate = async () => {
        if (!scene.startFrame) {
            alert("Frame inicial obrigatório.");
            return;
        }
        onUpdate(scene.id, { isGenerating: true });

        try {
            const targetW = orientation === 'horizontal' ? 1920 : 1080;
            const targetH = orientation === 'horizontal' ? 1080 : 1920;

            const cleanStart = await cropImageToRatio(scene.startFrame, targetW, targetH);
            const cleanEnd = scene.endFrame ? await cropImageToRatio(scene.endFrame, targetW, targetH) : undefined;

            // Generate variations sequentially
            for (let i = 0; i < scene.variationCount; i++) {
                const videoUrl = await generateVideo(
                    scene.prompt || "Smooth seamless transition",
                    cleanStart,
                    activeModel,
                    cleanEnd,
                    orientation === 'horizontal' ? '16:9' : '9:16'
                );

                if (videoUrl) {
                    onUpdate(scene.id, {
                        videos: [...(scene.videos || []), videoUrl],
                        selectedVideoIndex: scene.selectedVideoIndex === -1 ? 0 : scene.selectedVideoIndex
                    });

                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        } catch (error) {
            console.error(error);
            alert("Erro ao gerar cena.");
        } finally {
            onUpdate(scene.id, { isGenerating: false });
        }
    };

    const handleSelectVariation = (idx: number) => {
        onUpdate(scene.id, { selectedVideoIndex: idx });
    };

    return (
        <div className="bg-[#1f1f23] rounded-2xl border border-white/5 p-4 relative group">
            <div className="absolute top-2 left-2 text-xs font-mono text-gray-600">
                SCENE {index + 1}
            </div>
            <button
                onClick={() => onDelete(scene.id)}
                className="absolute top-2 right-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <Trash2 size={16} />
            </button>

            <div className={`flex ${orientation === 'horizontal' ? 'flex-row items-center justify-between gap-6' : 'flex-col items-center gap-4'} mt-4`}>

                {/* 1. Start Frame */}
                <FrameSlot
                    label="INÍCIO"
                    image={scene.startFrame}
                    setImage={(img) => onUpdate(scene.id, { startFrame: img })}
                    orientation={orientation}
                    canvasLayers={canvasLayers}
                />

                {/* 2. Action / Prompt Area */}
                <div className="flex-1 w-full flex flex-col gap-3 min-w-[200px]">
                    <div className="relative">
                        <Video className="absolute top-3 left-3 text-gray-600" size={16} />
                        <textarea
                            value={scene.prompt}
                            onChange={(e) => onUpdate(scene.id, { prompt: e.target.value })}
                            placeholder="Descreva a ação ou transição..."
                            className="w-full bg-[#121215] border border-white/10 rounded-lg pl-10 pr-3 py-2 text-sm text-white focus:border-purple-500 outline-none resize-none h-20"
                        />
                    </div>

                    <div className="flex gap-2">
                        {/* Variation Count Selector */}
                        <div className="flex items-center bg-[#121215] border border-white/10 rounded-lg px-2" title="Quantidade de Variações">
                            <span className="text-[10px] text-gray-500 font-bold mr-1">VARS</span>
                            <select
                                value={scene.variationCount}
                                onChange={(e) => onUpdate(scene.id, { variationCount: parseInt(e.target.value) })}
                                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
                                disabled={scene.isGenerating}
                            >
                                {[1, 2, 3, 4, 5].map(n => (
                                    <option key={n} value={n} className="bg-[#1f1f23] text-white">{n}x</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={scene.isGenerating || !scene.startFrame}
                            className={`flex-1 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${scene.isGenerating
                                ? 'bg-gray-800 text-gray-500'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg'
                                }`}
                        >
                            {scene.isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Film size={16} />}
                            {scene.isGenerating ? `Gerando Variações...` : 'Gerar Clipe'}
                        </button>
                    </div>
                </div>

                {/* 3. End Frame */}
                <FrameSlot
                    label="FIM (Opcional)"
                    image={scene.endFrame}
                    setImage={(img) => onUpdate(scene.id, { endFrame: img })}
                    orientation={orientation}
                    canvasLayers={canvasLayers}
                />
            </div>

            {/* 4. Result Videos (Gallery) */}
            {scene.videos && scene.videos.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5 flex flex-col items-center">
                    {/* Main Player */}
                    <div className="relative rounded-lg overflow-hidden border border-white/10 shadow-xl bg-black max-w-md w-full mb-3">
                        <video
                            key={scene.videos[scene.selectedVideoIndex]} // Force reload on switch
                            src={scene.videos[scene.selectedVideoIndex]}
                            controls
                            autoPlay
                            loop
                            className="w-full h-auto max-h-[300px]"
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                            <a href={scene.videos[scene.selectedVideoIndex]} download={`scene_${index + 1}_v${scene.selectedVideoIndex + 1}.mp4`} className="bg-black/50 hover:bg-black/80 text-white p-1.5 rounded-full backdrop-blur">
                                <Download size={14} />
                            </a>
                        </div>
                    </div>

                    {/* Variation Thumbnails */}
                    {scene.videos.length > 0 && (
                        <div className="flex gap-2 justify-center flex-wrap">
                            {scene.videos.map((vid, vidIdx) => (
                                <button
                                    key={vidIdx}
                                    onClick={() => handleSelectVariation(vidIdx)}
                                    className={`w-16 h-10 rounded-md border-2 overflow-hidden relative flex items-center justify-center transition-all ${scene.selectedVideoIndex === vidIdx ? 'border-blue-500 scale-105 shadow-lg' : 'border-white/10 opacity-60 hover:opacity-100'
                                        }`}
                                >
                                    <div className="bg-black/80 w-full h-full absolute inset-0"></div>
                                    <span className={`relative z-10 text-[10px] font-bold ${scene.selectedVideoIndex === vidIdx ? 'text-blue-400' : 'text-gray-400'}`}>
                                        V{vidIdx + 1}
                                    </span>
                                </button>
                            ))}
                            {/* Regenerate/Add Button with Refresh Icon */}
                            <button
                                onClick={handleGenerate}
                                disabled={scene.isGenerating || !scene.startFrame}
                                className="w-16 h-10 rounded-md border border-dashed border-white/20 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                                title="Regenerar Variação"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


// --- Main Studio Mode ---

interface StudioModeProps {
    canvasLayers: Layer[];
}

const StudioMode: React.FC<StudioModeProps> = ({ canvasLayers }) => {
    const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
    const [activeModel, setActiveModel] = useState<ModelType>(ModelType.VEO_FAST);
    const [isExporting, setIsExporting] = useState(false);
    const [exportStatus, setExportStatus] = useState('');

    // Timeline State
    const [scenes, setScenes] = useState<Scene[]>([
        { id: '1', startFrame: null, endFrame: null, prompt: '', videos: [], selectedVideoIndex: -1, isGenerating: false, variationCount: 1 }
    ]);

    const handleAddScene = () => {
        const lastScene = scenes[scenes.length - 1];
        // Automatic Chaining: Use previous endFrame as new startFrame if available
        const newStartFrame = lastScene ? (lastScene.endFrame || lastScene.startFrame) : null;

        const newScene: Scene = {
            id: Date.now().toString(),
            startFrame: newStartFrame, // CHAINING LOGIC
            endFrame: null,
            prompt: '',
            videos: [],
            selectedVideoIndex: -1,
            isGenerating: false,
            variationCount: 1
        };
        setScenes(prev => [...prev, newScene]);
    };

    const handleUpdateScene = (id: string, updates: Partial<Scene>) => {
        setScenes(prev => prev.map(s => {
            if (s.id === id) {
                return { ...s, ...updates };
            }
            return s;
        }));
    };

    const handleDeleteScene = (id: string) => {
        if (scenes.length <= 1) return; // Prevent deleting last scene
        setScenes(prev => prev.filter(s => s.id !== id));
    };

    const handleExportFullMovie = async () => {
        const validScenes = scenes.filter(s => s.videos.length > 0 && s.selectedVideoIndex !== -1);

        if (validScenes.length === 0) {
            alert("Nenhuma cena gerada para exportar.");
            return;
        }

        setIsExporting(true);
        setExportStatus("Preparando estúdio...");

        try {
            // Setup Audio Context for sound capturing
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const dest = audioCtx.createMediaStreamDestination();

            // Setup Canvas
            const canvas = document.createElement('canvas');
            const width = orientation === 'horizontal' ? 1920 : 1080;
            const height = orientation === 'horizontal' ? 1080 : 1920;
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not create canvas context");

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);

            // Capture Streams
            const canvasStream = canvas.captureStream(30); // 30 FPS Lock

            // Combine Video track from canvas and Audio track from AudioContext
            const combinedTracks = [
                ...canvasStream.getVideoTracks(),
                ...dest.stream.getAudioTracks()
            ];
            const combinedStream = new MediaStream(combinedTracks);

            const chunks: Blob[] = [];

            // High Bitrate for smooth playback (8 Mbps)
            let recorder: MediaRecorder;
            const options = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8000000 };

            try {
                recorder = new MediaRecorder(combinedStream, options);
            } catch (e) {
                recorder = new MediaRecorder(combinedStream); // Fallback
            }

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Visualizae_FullMovie_${Date.now()}.webm`;
                a.click();
                URL.revokeObjectURL(url);
                setIsExporting(false);
                setExportStatus('');
                audioCtx.close(); // Clean up
            };

            recorder.start();

            // Helper Video Element
            const videoEl = document.createElement('video');
            videoEl.crossOrigin = 'anonymous';
            videoEl.muted = false; // Important: Must not be muted to capture audio
            videoEl.volume = 1.0;

            // Connect Video Element to Audio Context
            const source = audioCtx.createMediaElementSource(videoEl);
            source.connect(dest);
            source.connect(audioCtx.destination); // Optional: lets user hear it while exporting

            let currentSceneIndex = 0;
            let animationFrameId: number;

            const drawFrame = () => {
                if (!videoEl.paused && !videoEl.ended) {
                    ctx.drawImage(videoEl, 0, 0, width, height);
                }
                animationFrameId = requestAnimationFrame(drawFrame);
            };

            const playNext = async () => {
                if (currentSceneIndex >= validScenes.length) {
                    cancelAnimationFrame(animationFrameId);
                    setTimeout(() => recorder.stop(), 500); // Buffer end
                    return;
                }

                const scene = validScenes[currentSceneIndex];
                setExportStatus(`Gravando cena ${currentSceneIndex + 1}/${validScenes.length}...`);

                const selectedVideoUrl = scene.videos[scene.selectedVideoIndex];
                videoEl.src = selectedVideoUrl;

                // Wait for video to be ready to ensure smooth playback
                await new Promise((resolve) => {
                    videoEl.oncanplaythrough = resolve;
                    videoEl.load(); // Force load
                });

                try {
                    await videoEl.play();
                } catch (e) {
                    console.error("Auto-play error", e);
                }

                if (currentSceneIndex === 0) drawFrame();

                videoEl.onended = () => {
                    currentSceneIndex++;
                    playNext();
                };
            };

            playNext();

        } catch (error) {
            console.error(error);
            alert("Erro na exportação.");
            setIsExporting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#18181b] p-4 overflow-y-auto custom-scrollbar">

            {/* Header / Config */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-[#1f1f23] p-4 rounded-xl border border-white/5 shadow-lg max-w-6xl mx-auto w-full gap-4 sticky top-0 z-50">
                <div className="flex gap-2">
                    <button
                        onClick={() => setOrientation('horizontal')}
                        className={`p-2 rounded-lg flex items-center gap-2 text-xs font-medium transition-colors ${orientation === 'horizontal' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                    >
                        <Layout size={16} className="rotate-0" /> 16:9
                    </button>
                    <button
                        onClick={() => setOrientation('vertical')}
                        className={`p-2 rounded-lg flex items-center gap-2 text-xs font-medium transition-colors ${orientation === 'vertical' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                    >
                        <Layout size={16} className="rotate-90" /> 9:16
                    </button>
                </div>

                <div className="flex flex-col items-center">
                    <h2 className="text-white font-bold text-lg flex items-center gap-2 tracking-tight">
                        <Clapperboard className="text-blue-500" /> VEO STORYBOARD
                    </h2>
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest">Editor de Sequência</span>
                </div>

                <div className="flex gap-1 bg-[#121215] p-1 rounded-lg border border-white/5">
                    <button
                        onClick={() => setActiveModel(ModelType.VEO_FAST)}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded transition-all ${activeModel === ModelType.VEO_FAST ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        FAST
                    </button>
                    <button
                        onClick={() => setActiveModel(ModelType.VEO_HQ)}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded transition-all ${activeModel === ModelType.VEO_HQ ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        PRO (HD)
                    </button>
                </div>
            </div>

            {/* Scenes List */}
            <div className="max-w-6xl mx-auto w-full space-y-8 pb-32">
                {scenes.map((scene, index) => (
                    <div key={scene.id} className="relative">
                        {index > 0 && (
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 h-8 w-px bg-gradient-to-b from-transparent via-blue-500/50 to-transparent z-0"></div>
                        )}
                        <SceneRow
                            scene={scene}
                            index={index}
                            orientation={orientation}
                            canvasLayers={canvasLayers}
                            onUpdate={handleUpdateScene}
                            onDelete={handleDeleteScene}
                            activeModel={activeModel}
                        />
                    </div>
                ))}

                {/* Add Scene Button */}
                <button
                    onClick={handleAddScene}
                    className="w-full py-4 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-purple-500/50 hover:bg-white/5 transition-all group"
                >
                    <Plus size={32} className="mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-bold uppercase tracking-widest">Adicionar Nova Cena</span>
                </button>
            </div>

            {/* Footer Actions (Export) */}
            <div className="fixed bottom-0 left-0 w-full bg-[#18181b]/90 backdrop-blur border-t border-white/10 p-4 z-[60]">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="text-xs text-gray-500 font-mono">
                        TOTAL CENAS: <span className="text-white">{scenes.length}</span>
                        {exportStatus && <span className="ml-4 text-blue-400 animate-pulse">{exportStatus}</span>}
                    </div>

                    <button
                        onClick={handleExportFullMovie}
                        disabled={isExporting || !scenes.some(s => s.videos.length > 0)}
                        className={`px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-all ${isExporting || !scenes.some(s => s.videos.length > 0)
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-500 text-white shadow-xl hover:shadow-green-500/20'
                            }`}
                    >
                        {isExporting ? <Loader2 className="animate-spin" /> : <Film />}
                        {isExporting ? 'Processando...' : '🎬 Exportar Filme Completo'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StudioMode;
