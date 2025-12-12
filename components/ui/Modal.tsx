import React, { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { trapFocus, useFocusReturn, generateId, announce } from '../../utils/accessibility';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Optional description for screen readers */
  description?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Whether to show close button */
  showCloseButton?: boolean;
  /** Initial focus element selector */
  initialFocus?: string;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
};

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  className = '',
  description,
  size = 'md',
  showCloseButton = true,
  initialFocus
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(generateId('modal-title'));
  const descriptionId = useRef(generateId('modal-desc'));
  
  // Return focus to trigger element when modal closes
  useFocusReturn(isOpen);

  // Handle escape key and focus trap
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    
    // Set up focus trap
    const cleanup = trapFocus(modalRef.current);
    
    // Announce modal opening
    announce(`${title} penceresi açıldı`, 'assertive');
    
    // Focus initial element or modal itself
    if (initialFocus) {
      const element = modalRef.current.querySelector<HTMLElement>(initialFocus);
      element?.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
      cleanup();
    };
  }, [isOpen, onClose, title, initialFocus]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Handle close button
  const handleClose = useCallback(() => {
    announce(`${title} penceresi kapatıldı`, 'polite');
    onClose();
  }, [onClose, title]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      {/* Backdrop blur with gradient */}
      <div 
        className="absolute inset-0 backdrop-blur-xl" 
        style={{ 
          background: 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%)'
        }}
        aria-hidden="true"
      />
      
      {/* Modal Dialog */}
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        aria-describedby={description ? descriptionId.current : undefined}
        className={`relative w-full ${sizeClasses[size]} max-h-[85vh] flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
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
        <div 
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: '24px',
            right: '24px',
            height: '3px',
            background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-ai-400), var(--color-primary-400))',
            borderRadius: '0 0 4px 4px'
          }} 
        />
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div>
            <h2 
              id={titleId.current}
              className="text-lg font-bold bg-clip-text text-transparent" 
              style={{ 
                backgroundImage: 'linear-gradient(135deg, var(--color-on-surface) 0%, var(--color-primary-600) 100%)',
                letterSpacing: '-0.02em' 
              }}
            >
              {title}
            </h2>
            {description && (
              <p 
                id={descriptionId.current}
                className="text-sm mt-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                {description}
              </p>
            )}
          </div>
          {showCloseButton && (
            <button 
              onClick={handleClose}
              className="w-9 h-9 flex items-center justify-center rounded-full transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{ 
                background: 'linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.08) 100%)',
                border: '1px solid rgba(0,0,0,0.06)'
              }}
              aria-label="Pencereyi kapat"
              type="button"
            >
              <X size={18} style={{ color: 'var(--color-on-surface-variant)' }} aria-hidden="true" />
            </button>
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
};