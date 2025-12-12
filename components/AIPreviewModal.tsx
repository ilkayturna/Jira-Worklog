// ===================================================================
// AI PREVIEW MODAL: Enhanced with Time Editing
// Purpose: Show before/after comparison with full edit capabilities
// Features: Edit text, edit time, delete, retry, batch apply
// ===================================================================

import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Trash2, Check, Clock, Edit3, AlertTriangle } from 'lucide-react';
import { TextChangePreview } from '../types';
import { computeWordDiff, DiffPart } from '../utils/diff';
import { parseSmartTimeInput } from '../utils/adf';

interface AIPreviewModalProps {
  previews: TextChangePreview[];
  onApply: (previews: TextChangePreview[]) => void;
  onCancel: () => void;
  onRetry: (worklogId: string) => void;
  onDelete: (worklogId: string) => void;
  isProcessing?: boolean;
  title?: string;
  subtitle?: string;
}

export const AIPreviewModal: React.FC<AIPreviewModalProps> = ({
  previews: initialPreviews,
  onApply,
  onCancel,
  onRetry,
  onDelete,
  isProcessing = false,
  title = '🤖 AI Değişiklik Önizleme',
  subtitle
}) => {
  const [previews, setPreviews] = useState(initialPreviews);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editTimeStr, setEditTimeStr] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync with external changes
  useEffect(() => {
    setPreviews(initialPreviews);
  }, [initialPreviews]);

  // Handle text edit start
  const startEditingText = (worklogId: string, currentText: string) => {
    if (editingTimeId) return;
    setEditingId(worklogId);
    setEditText(currentText);
    setValidationError(null);
  };

  // Handle text edit save
  const saveTextEdit = (worklogId: string) => {
    const trimmed = editText.trim();
    if (!trimmed) {
      setValidationError('Metin boş olamaz');
      return;
    }
    setPreviews(prev => prev.map(p => 
      p.worklogId === worklogId ? { ...p, after: trimmed } : p
    ));
    setEditingId(null);
    setEditText('');
    setValidationError(null);
  };

  // Handle time edit start
  const startEditingTime = (worklogId: string, currentHours: number) => {
    if (editingId) return;
    setEditingTimeId(worklogId);
    setEditTimeStr(currentHours.toFixed(2));
    setValidationError(null);
  };

  // Handle time edit save
  const saveTimeEdit = (worklogId: string) => {
    const parsed = parseSmartTimeInput(editTimeStr);
    if (parsed === null || parsed <= 0) {
      setValidationError('Geçersiz süre formatı (örn: 1.5, 1h 30m, 90m)');
      return;
    }
    if (parsed > 24) {
      setValidationError('Süre 24 saati geçemez');
      return;
    }
    setPreviews(prev => prev.map(p => 
      p.worklogId === worklogId ? { ...p, newHours: Math.round(parsed * 100) / 100 } : p
    ));
    setEditingTimeId(null);
    setEditTimeStr('');
    setValidationError(null);
  };

  // Handle edit cancel
  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setEditingTimeId(null);
    setEditTimeStr('');
    setValidationError(null);
  };

  // Handle delete
  const handleDelete = (worklogId: string) => {
    setPreviews(prev => prev.filter(p => p.worklogId !== worklogId));
    onDelete(worklogId);
  };

  // Handle retry
  const handleRetry = (worklogId: string) => {
    setPreviews(prev => prev.filter(p => p.worklogId !== worklogId));
    onRetry(worklogId);
  };

  // Handle apply
  const handleApply = () => {
    if (editingId || editingTimeId) {
      setValidationError('Lütfen önce düzenlemeyi kaydedin veya iptal edin');
      return;
    }
    onApply(previews);
  };

  // Check for changes
  const hasTimeChanges = previews.some(p => 
    p.currentHours !== undefined && 
    p.newHours !== undefined && 
    Math.abs(p.currentHours - p.newHours) > 0.01
  );
  const totalCurrentHours = previews.reduce((sum, p) => sum + (p.currentHours || 0), 0);
  const totalNewHours = previews.reduce((sum, p) => sum + (p.newHours || 0), 0);

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
              {title}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
              {subtitle || `${previews.length} değişiklik hazır • Metinlere/saatlere tıklayarak düzenleyebilirsiniz`}
            </p>
            {hasTimeChanges && (
              <p className="text-xs mt-2 px-3 py-1 rounded-full inline-block" style={{ 
                backgroundColor: 'var(--color-primary-100)',
                color: 'var(--color-primary-700)'
              }}>
                Toplam: {totalCurrentHours.toFixed(2)}h → {totalNewHours.toFixed(2)}h
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-opacity-10 hover:bg-black transition-all"
            title="Kapat (Esc)"
          >
            <X size={24} style={{ color: 'var(--color-on-surface)' }} />
          </button>
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="mx-6 mt-4 p-3 rounded-lg flex items-center gap-2" style={{
            backgroundColor: 'var(--color-error-container)',
            color: 'var(--color-on-error-container)'
          }}>
            <AlertTriangle size={18} />
            <span className="text-sm">{validationError}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {previews.map((preview) => {
            const isEditingText = editingId === preview.worklogId;
            const isEditingTime = editingTimeId === preview.worklogId;
            const diff = computeWordDiff(preview.before, preview.after);
            const hasTimeData = preview.currentHours !== undefined && preview.newHours !== undefined;
            const timeChanged = hasTimeData && Math.abs(preview.currentHours! - preview.newHours!) > 0.01;
            const textChanged = preview.before !== preview.after;

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
                <div className="mb-4 pr-24">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-sm px-2 py-1 rounded" style={{ 
                      backgroundColor: 'var(--color-primary-100)',
                      color: 'var(--color-primary-700)'
                    }}>
                      {preview.issueKey}
                    </span>
                    
                    {/* Time Display/Edit */}
                    {hasTimeData && (
                      <div className="flex items-center gap-2">
                        {isEditingTime ? (
                          <div className="flex items-center gap-2">
                            <Clock size={14} style={{ color: 'var(--color-on-surface-variant)' }} />
                            <input
                              type="text"
                              value={editTimeStr}
                              onChange={(e) => setEditTimeStr(e.target.value)}
                              className="w-20 px-2 py-1 text-sm rounded border-2"
                              style={{
                                borderColor: 'var(--color-primary-500)',
                                backgroundColor: 'var(--color-surface)',
                                color: 'var(--color-on-surface)'
                              }}
                              placeholder="1.5"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveTimeEdit(preview.worklogId);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                            />
                            <button
                              onClick={() => saveTimeEdit(preview.worklogId)}
                              className="p-1 rounded"
                              style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 rounded"
                              style={{ backgroundColor: 'var(--color-surface-variant)' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditingTime(preview.worklogId, preview.newHours!)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-sm transition-all hover:scale-105"
                            style={{ 
                              backgroundColor: timeChanged ? 'var(--color-warning-container)' : 'var(--color-surface-variant)',
                              color: timeChanged ? 'var(--color-on-warning-container)' : 'var(--color-on-surface-variant)'
                            }}
                            title="Süreyi düzenlemek için tıklayın"
                          >
                            <Clock size={14} />
                            <span className={timeChanged ? 'line-through opacity-60' : ''}>
                              {preview.currentHours!.toFixed(2)}h
                            </span>
                            {timeChanged && (
                              <>
                                <span>→</span>
                                <span className="font-semibold">{preview.newHours!.toFixed(2)}h</span>
                                <Edit3 size={12} className="ml-1 opacity-50" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-sm mt-2" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {preview.summary}
                  </p>
                </div>

                {/* Text Changes - Only show if text changed */}
                {textChanged && (
                  <>
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
                        Sonra {isEditingText && '(Düzenleniyor)'}
                      </label>
                      
                      {isEditingText ? (
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
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') cancelEdit();
                            }}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveTextEdit(preview.worklogId)}
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
                          className="p-3 rounded-lg cursor-pointer border-2 border-transparent hover:border-primary-500 transition-all group"
                          style={{ 
                            backgroundColor: 'var(--color-success-container)',
                            color: 'var(--color-on-success-container)'
                          }}
                          onClick={() => startEditingText(preview.worklogId, preview.after)}
                          title="Düzenlemek için tıklayın"
                        >
                          <div className="flex justify-between items-start">
                            <DiffDisplay diff={diff} type="added" />
                            <Edit3 size={14} className="opacity-0 group-hover:opacity-50 transition-opacity ml-2 flex-shrink-0" />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Time-only change indicator */}
                {!textChanged && timeChanged && (
                  <div className="p-3 rounded-lg text-sm" style={{ 
                    backgroundColor: 'var(--color-surface-variant)',
                    color: 'var(--color-on-surface-variant)'
                  }}>
                    <span className="italic">Metin değişikliği yok - sadece süre güncellenecek</span>
                  </div>
                )}
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
              disabled={isProcessing || editingId !== null || editingTimeId !== null}
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
const DiffDisplay: React.FC<{ diff: { beforeParts: DiffPart[]; afterParts: DiffPart[] }; type: 'added' | 'removed' }> = ({ diff, type }) => {
  const parts = type === 'removed' ? diff.beforeParts : diff.afterParts;
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, index) => {
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
