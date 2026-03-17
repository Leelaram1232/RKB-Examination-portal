import { useState, useRef } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight, Upload, X, Camera, FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Step2PhotoUploadProps {
  form: UseFormReturn<any>;
  onNext: () => void;
  onBack: () => void;
  examId: string;
  photoRequired: boolean;
  signatureRequired: boolean;
}

export const Step2PhotoUpload = ({ 
  form, 
  onNext, 
  onBack, 
  examId,
  photoRequired,
  signatureRequired 
}: Step2PhotoUploadProps) => {
  const { watch, setValue } = form;
  const [isUploading, setIsUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const photoUrl = watch('photo_url');
  const signatureUrl = watch('signature_url');

  const handleFileUpload = async (file: File, type: 'photo' | 'signature') => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a JPG or PNG image');
      return;
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size must be less than 2MB');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${examId}/${type}_${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('student-uploads')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('student-uploads')
        .getPublicUrl(fileName);

      if (type === 'photo') {
        setValue('photo_url', publicUrl);
      } else {
        setValue('signature_url', publicUrl);
      }

      toast.success(`${type === 'photo' ? 'Photo' : 'Signature'} uploaded successfully`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Failed to upload ${type}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = (type: 'photo' | 'signature') => {
    if (type === 'photo') {
      setValue('photo_url', '');
    } else {
      setValue('signature_url', '');
    }
  };

  const canProceed = () => {
    if (photoRequired && !photoUrl) return false;
    if (signatureRequired && !signatureUrl) return false;
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">Upload Documents</h2>
        <p className="text-muted-foreground">Please upload required photos</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Student Photo */}
        {photoRequired && (
          <div className="space-y-4">
            <Label className="text-base font-medium flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Student Photo *
            </Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              {photoUrl ? (
                <div className="space-y-4">
                  <div className="relative inline-block">
                    <img 
                      src={photoUrl} 
                      alt="Student" 
                      className="h-40 w-32 object-cover rounded-lg mx-auto"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveFile('photo')}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">Photo uploaded</p>
                </div>
              ) : (
                <div 
                  className="cursor-pointer py-8"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Click to upload your photo
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG (Max 2MB) • Passport size photo recommended
                  </p>
                </div>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'photo');
                }}
              />
            </div>
          </div>
        )}

        {/* Signature Photo */}
        {signatureRequired && (
          <div className="space-y-4">
            <Label className="text-base font-medium flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Signature *
            </Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              {signatureUrl ? (
                <div className="space-y-4">
                  <div className="relative inline-block">
                    <img 
                      src={signatureUrl} 
                      alt="Signature" 
                      className="h-24 w-48 object-contain rounded-lg mx-auto bg-white p-2"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveFile('signature')}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">Signature uploaded</p>
                </div>
              ) : (
                <div 
                  className="cursor-pointer py-8"
                  onClick={() => signatureInputRef.current?.click()}
                >
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Click to upload your signature
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG (Max 2MB) • Sign on white paper and scan/photograph
                  </p>
                </div>
              )}
              <input
                ref={signatureInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'signature');
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>
        <Button 
          type="button" 
          onClick={onNext} 
          disabled={!canProceed() || isUploading}
        >
          {isUploading ? 'Uploading...' : 'Next Step'}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
