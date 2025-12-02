import React, { useState, useEffect } from 'react';
import { User, Layer } from './types';
import CanvasMode from './components/CanvasMode';
import StudioMode from './components/StudioMode';
import { Layers, Clapperboard, LogOut } from 'lucide-react';
import { auth, googleProvider } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'canvas' | 'studio'>('canvas');

  // Lifted State: Layers are now managed here to be accessible by Studio Mode
  const [layers, setLayers] = useState<Layer[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          id: firebaseUser.uid,
          username: firebaseUser.displayName || firebaseUser.email || 'User'
        });
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-[#18181b] overflow-hidden">

      {/* Global Navigation Bar */}
      <div className="h-12 bg-[#0f0f12] border-b border-white/5 flex items-center justify-between px-4 shrink-0 z-50">

        <div className="w-48">
          {/* Logo or Left Content could go here */}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('canvas')}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'canvas'
              ? 'bg-[#1f1f23] text-purple-400 shadow-inner'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
          >
            <Layers size={16} />
            Canvas Mode
          </button>

          <div className="w-px h-6 bg-white/5 mx-2"></div>

          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'studio'
              ? 'bg-[#1f1f23] text-blue-400 shadow-inner'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
          >
            <Clapperboard size={16} />
            Studio Mode
          </button>
        </div>

        <div className="w-48 flex justify-end items-center gap-3">
          {user ? (
            <>
              <span className="text-xs text-gray-400 truncate max-w-[120px]" title={user.username}>
                {user.username}
              </span>
              <button
                onClick={handleLogout}
                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-md transition-colors"
                title="Sair"
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors"
            >
              Login
            </button>
          )}
        </div>

      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'canvas' ? (
          <CanvasMode
            user={user}
            layers={layers}
            setLayers={setLayers}
          />
        ) : (
          <StudioMode
            canvasLayers={layers}
          />
        )}
      </div>

    </div>
  );
};

export default App;
