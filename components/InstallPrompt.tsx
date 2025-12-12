import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if app is already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Save the event for later use
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show our custom install prompt
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    await deferredPrompt.prompt();
    
    // Wait for the user's response
    const choiceResult = await deferredPrompt.userChoice;
    
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    
    // Clear the deferredPrompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Store in localStorage to not show again for a while
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't show if already installed or no prompt event
  if (isStandalone || !showPrompt || !deferredPrompt) {
    return null;
  }

  // Check if user dismissed recently (within 7 days)
  const dismissedTime = localStorage.getItem('pwa-install-dismissed');
  if (dismissedTime) {
    const daysSinceDismiss = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
    if (daysSinceDismiss < 7) {
      return null;
    }
  }

  return (
    <div 
      className="fixed bottom-24 lg:bottom-20 left-4 right-4 lg:left-auto lg:right-4 lg:max-w-sm z-50 animate-slide-in-up"
      style={{
        animation: 'slideInUp 0.3s ease-out'
      }}
    >
      <div 
        className="surface-card p-4 rounded-2xl"
        style={{
          boxShadow: 'var(--elevation-4)',
          border: '1px solid var(--color-outline-variant)'
        }}
      >
        <div className="flex items-start gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)'
            }}
          >
            <Download size={20} className="text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 
              className="text-sm font-semibold mb-1"
              style={{ color: 'var(--color-on-surface)' }}
            >
              Uygulamayı Yükle
            </h3>
            <p 
              className="text-xs mb-3"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              Jira Worklog Manager'ı ana ekranınıza ekleyin ve çevrimdışı kullanın.
            </p>
            
            <div className="flex gap-2">
              <button
                onClick={handleInstallClick}
                className="btn-filled text-xs px-3 py-2"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)'
                }}
              >
                Yükle
              </button>
              <button
                onClick={handleDismiss}
                className="btn-text text-xs px-3 py-2"
              >
                Şimdi Değil
              </button>
            </div>
          </div>
          
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
