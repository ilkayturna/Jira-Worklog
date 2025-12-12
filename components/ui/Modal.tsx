import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className = '' }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop blur with gradient */}
      <div 
        className="absolute inset-0 backdrop-blur-xl" 
        style={{ 
          background: 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%)'
        }} 
      />
      
      {/* Modal */}
      <div 
        ref={modalRef}
        className={`relative w-full max-w-lg max-h-[85vh] flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
          animation: 'modalSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
      >
        {/* Gradient accent at top */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '24px',
          right: '24px',
          height: '3px',
          background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-ai-400), var(--color-primary-400))',
          borderRadius: '0 0 4px 4px'
        }} />
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <h2 className="text-lg font-bold bg-clip-text text-transparent" style={{ 
            backgroundImage: 'linear-gradient(135deg, var(--color-on-surface) 0%, var(--color-primary-600) 100%)',
            letterSpacing: '-0.02em' 
          }}>{title}</h2>
          <button 
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-all hover:scale-110"
            style={{ 
              background: 'linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.08) 100%)',
              border: '1px solid rgba(0,0,0,0.06)'
            }}
          >
            <X size={18} style={{ color: 'var(--color-on-surface-variant)' }} />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
};