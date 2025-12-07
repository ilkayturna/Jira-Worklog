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
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
      onClick={onClose}
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 backdrop-blur-xl" style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }} />
      
      {/* Modal */}
      <div 
        ref={modalRef}
        className={`apple-modal glass-modal-content relative w-full max-w-lg max-h-[85vh] flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          borderRadius: '14px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(0, 0, 0, 0.05)',
          animation: 'modalSlideIn 0.25s ease-out'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <h2 className="text-[17px] font-semibold" style={{ color: 'var(--color-on-surface)', letterSpacing: '-0.02em' }}>{title}</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ backgroundColor: 'var(--color-surface-container)' }}
          >
            <X size={16} style={{ color: 'var(--color-on-surface-variant)' }} />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
};