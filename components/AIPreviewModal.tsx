// ===================================================================
// AI PREVIEW MODAL: Editable with Retry & Delete
// Purpose: Show before/after comparison with edit capabilities
// Features: Delete unwanted changes, retry with higher temperature
// ===================================================================

import React, { useState } from 'react';
import { X, RefreshCw, Trash2, Check } from 'lucide-react';
import { TextChangePreview } from '../types';
import { computeWordDiff, DiffPart } from '../utils/diff';

interface AIPreviewModalProps {
  previews: TextChangePreview[];
  onApply: (previews: TextChangePreview[]) => void;
  onCancel: () => void;
  onRetry: (worklogId: string) => void;
  onDelete: (worklogId: string) => void;
  isProcessing?: boolean;
}

export const AIPreviewModal: React.FC<AIPreviewModalProps> = ({
  previews: initialPreviews,
  onApply,
  onCancel,
  onRetry,
  onDelete,
  isProcessing = false
}) => {
  const [previews, setPreviews] = useState(initialPreviews);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Handle edit start
  const startEditing = (worklogId: string, currentText: string) => {
    setEditingId(worklogId);
    setEditText(currentText);
  };

  // Handle edit save
  const saveEdit = (worklogId: string) => {
    setPreviews(prev => prev.map(p => 
      p.worklogId === worklogId 
        ? { ...p, after: editText.trim() }
        : p
    ));
    setEditingId(null);
    setEditText('');
  };

  // Handle edit cancel
  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  // Handle delete
  const handleDelete = (worklogId: string) => {
    setPreviews(prev => prev.filter(p => p.worklogId !== worklogId));
    onDelete(worklogId);
  };

  // Handle retry
  const handleRetry = (worklogId: string) => {
    // Remove current preview and trigger retry
    setPreviews(prev => prev.filter(p => p.worklogId !== worklogId));
    onRetry(worklogId);
  };

  // Handle apply
  const handleApply = () => {
    if (editingId) {
      alert('⚠️ Lütfen önce düzenlemeyi kaydedin veya iptal edin');
      return;
    }
    onApply(previews);
  };

  if (previews.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <div className="surface-card rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">✅</div>
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--color-on-surface)' }}>
            Tüm Değişiklikler İşlendi
          </h3>
          <p className="text-sm mb-6" style={{ color: 'var(--color-on-surface-variant)' }}>
            Değişiklikler silindi veya uygulandı
          </p>
          <button
            onClick={onCancel}
            className="px-6 py-2 rounded-lg font-medium transition-all"
            style={{ 
              backgroundColor: 'var(--color-primary-500)',
              color: 'var(--color-on-primary)'
            }}
          >
            Kapat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="surface-card rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--color-on-surface)' }}>
              🤖 AI Değişiklik Önizleme
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
              {previews.length} değişiklik hazır • Metinlere tıklayarak düzenleyebilirsiniz
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-opacity-10 hover:bg-black transition-all"
            title="Kapat (Esc)"
          >
            <X size={24} style={{ color: 'var(--color-on-surface)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {previews.map((preview) => {
            const isEditing = editingId === preview.worklogId;
            const diff = computeWordDiff(preview.before, preview.after);

            return (
              <div 
                key={preview.worklogId} 
                className="border rounded-xl p-5 relative"
                style={{ 
                  borderColor: 'var(--color-outline-variant)',
                  backgroundColor: 'var(--color-surface-container)'
                }}
              >
                {/* Action Buttons - Top Right */}
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    onClick={() => handleRetry(preview.worklogId)}
                    className="p-2 rounded-lg transition-all hover:scale-110"
                    style={{ 
                      backgroundColor: 'var(--color-warning)',
                      color: 'white'
                    }}
                    title="Tekrar Dene (Farklı Sonuç)"
                    disabled={isProcessing}
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(preview.worklogId)}
                    className="p-2 rounded-lg transition-all hover:scale-110"
                    style={{ 
                      backgroundColor: 'var(--color-error)',
                      color: 'white'
                    }}
                    title="Bu Değişikliği Sil"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Issue Info */}
                <div className="mb-4 pr-20">
                  <span className="font-mono text-sm px-2 py-1 rounded" style={{ 
                    backgroundColor: 'var(--color-primary-100)',
                    color: 'var(--color-primary-700)'
                  }}>
                    {preview.issueKey}
                  </span>
                  <p className="text-sm mt-2" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {preview.summary}
                  </p>
                </div>

                {/* Before Text */}
                <div className="mb-4">
                  <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>
                    Önce
                  </label>
                  <div className="p-3 rounded-lg" style={{ 
                    backgroundColor: 'var(--color-error-container)',
                    color: 'var(--color-on-error-container)'
                  }}>
                    <DiffDisplay diff={diff} type="removed" />
                  </div>
                </div>

                {/* After Text - Editable */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>
                    Sonra {isEditing && '(Düzenleniyor)'}
                  </label>
                  
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full p-3 rounded-lg border-2 resize-none"
                        style={{
                          borderColor: 'var(--color-primary-500)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-on-surface)',
                          minHeight: '100px'
                        }}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(preview.worklogId)}
                          className="px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all"
                          style={{
                            backgroundColor: 'var(--color-success)',
                            color: 'white'
                          }}
                        >
                          <Check size={16} />
                          Kaydet
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2 rounded-lg font-medium transition-all"
                          style={{
                            backgroundColor: 'var(--color-surface-variant)',
                            color: 'var(--color-on-surface-variant)'
                          }}
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="p-3 rounded-lg cursor-pointer border-2 border-transparent hover:border-primary-500 transition-all"
                      style={{ 
                        backgroundColor: 'var(--color-success-container)',
                        color: 'var(--color-on-success-container)'
                      }}
                      onClick={() => startEditing(preview.worklogId, preview.after)}
                      title="Düzenlemek için tıklayın"
                    >
                      <DiffDisplay diff={diff} type="added" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            ⚠️ Değişiklikleri gözden geçirin, düzenleyin veya silin
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-2 rounded-lg font-medium transition-all"
              style={{ 
                backgroundColor: 'var(--color-surface-variant)',
                color: 'var(--color-on-surface-variant)'
              }}
            >
              İptal
            </button>
            <button
              onClick={handleApply}
              disabled={isProcessing || editingId !== null}
              className="px-6 py-2 rounded-lg font-medium transition-all disabled:opacity-50"
              style={{ 
                backgroundColor: 'var(--color-primary-500)',
                color: 'var(--color-on-primary)'
              }}
            >
              {isProcessing ? '⏳ Uygulanıyor...' : `✅ ${previews.length} Değişikliği Uygula`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper component for diff display
const DiffDisplay: React.FC<{ diff: DiffPart[]; type: 'added' | 'removed' }> = ({ diff, type }) => {
  return (
    <span className="whitespace-pre-wrap">
      {diff.map((part, index) => {
        if (type === 'removed' && part.type === 'removed') {
          return (
            <span key={index} className="line-through opacity-70">
              {part.text}
            </span>
          );
        }
        if (type === 'added' && part.type === 'added') {
          return (
            <span key={index} className="font-semibold">
              {part.text}
            </span>
          );
        }
        if (part.type === 'unchanged') {
          return <span key={index}>{part.text}</span>;
        }
        return null;
      })}
    </span>
  );
};
