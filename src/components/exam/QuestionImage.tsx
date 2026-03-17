import { useState } from 'react';
import { ZoomIn, ZoomOut, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface QuestionImageProps {
  imageUrl: string;
  altText?: string;
  className?: string;
  compact?: boolean; // For option-level images (smaller display)
}

export function QuestionImage({ 
  imageUrl, 
  altText = 'Question diagram', 
  className = '',
  compact = false 
}: QuestionImageProps) {
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return null;
  }

  return (
    <>
      <div className={`relative group rounded-lg overflow-hidden border bg-muted/30 ${className}`}>
        <img
          src={imageUrl}
          alt={altText}
          className={`max-w-full h-auto object-contain mx-auto ${
            compact ? 'max-h-32 md:max-h-40' : 'max-h-64 md:max-h-80'
          }`}
          onError={() => setImageError(true)}
          loading="lazy"
        />
        <Button
          variant="secondary"
          size={compact ? 'icon' : 'sm'}
          className={`absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity ${
            compact ? 'h-6 w-6' : ''
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setShowFullscreen(true);
          }}
        >
          <ZoomIn className={compact ? 'w-3 h-3' : 'w-4 h-4 mr-1'} />
          {!compact && 'Enlarge'}
        </Button>
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={showFullscreen} onOpenChange={setShowFullscreen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{compact ? 'Option Diagram' : 'Question Diagram'}</span>
              <Button variant="ghost" size="sm" onClick={() => setShowFullscreen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-4">
            <img
              src={imageUrl}
              alt={altText}
              className="max-w-full max-h-[70vh] object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default QuestionImage;
