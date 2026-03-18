import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, CheckCircle2, Edit2, Save, X, Image, Upload, Trash2 } from 'lucide-react';
import { MathRenderer } from '@/components/exam/MathRenderer';
import type { ParsedQuestion } from '@/lib/questionParser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface QuestionPreviewCardProps {
  question: ParsedQuestion;
  sectionName: string;
  onUpdate: (updatedQuestion: ParsedQuestion) => void;
}

export const QuestionPreviewCard = ({
  question,
  sectionName,
  onUpdate,
}: QuestionPreviewCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<ParsedQuestion>(question);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    // Revalidate based on question type
    const errors: string[] = [];
    if (!editData.questionText) errors.push('Missing question text');

    const type = editData.questionType || 'MCQ';

    if (type === 'MCQ') {
      if (!editData.optionA) errors.push('Missing option A');
      if (!editData.optionB) errors.push('Missing option B');
      if (!editData.optionC) errors.push('Missing option C');
      if (!editData.optionD) errors.push('Missing option D');
      if (!editData.correctOption || !['A', 'B', 'C', 'D'].includes(editData.correctOption)) {
        errors.push('Invalid correct answer');
      }
    } else {
      if (!editData.correctAnswer || !editData.correctAnswer.trim()) {
        errors.push('Missing fill-in-the-blank answer');
      }
    }

    onUpdate({
      ...editData,
      isValid: errors.length === 0,
      errors,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData(question);
    setIsEditing(false);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload an image file (JPEG, PNG, WebP, GIF)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const fileName = `question-images/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('question-uploads')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('question-uploads')
        .getPublicUrl(fileName);

      setEditData({ ...editData, imageUrl: publicUrl });
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setEditData({ ...editData, imageUrl: null });
  };

  if (isEditing) {
    return (
      <Card className="border-primary/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{sectionName}</Badge>
              <span className="font-semibold">Q{question.questionNumber}</span>
              {editData.subject && (
                <Badge variant="secondary">{editData.subject}</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Question Text</Label>
            <Textarea
              value={editData.questionText}
              onChange={(e) => setEditData({ ...editData, questionText: e.target.value })}
              className="mt-1"
              rows={3}
            />
          </div>

          {/* Image Upload Section */}
          <div>
            <Label className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Question Image (Optional)
            </Label>
            <div className="mt-2">
              {editData.imageUrl ? (
                <div className="space-y-2">
                  <div className="relative inline-block">
                    <img 
                      src={editData.imageUrl} 
                      alt="Question diagram" 
                      className="max-h-40 rounded border object-contain"
                    />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={handleRemoveImage}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {isUploading ? 'Uploading...' : 'Add Image'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Options with Image Support */}
          <div className="space-y-4">
            {/* Option A */}
            <div className="border rounded-lg p-3 space-y-2">
              <Label>Option A</Label>
              <Input
                value={editData.optionA}
                onChange={(e) => setEditData({ ...editData, optionA: e.target.value })}
              />
              <OptionImageInput
                label="Option A Image"
                imageUrl={editData.optionAImage}
                onImageChange={(url) => setEditData({ ...editData, optionAImage: url })}
              />
            </div>

            {/* Option B */}
            <div className="border rounded-lg p-3 space-y-2">
              <Label>Option B</Label>
              <Input
                value={editData.optionB}
                onChange={(e) => setEditData({ ...editData, optionB: e.target.value })}
              />
              <OptionImageInput
                label="Option B Image"
                imageUrl={editData.optionBImage}
                onImageChange={(url) => setEditData({ ...editData, optionBImage: url })}
              />
            </div>

            {/* Option C */}
            <div className="border rounded-lg p-3 space-y-2">
              <Label>Option C</Label>
              <Input
                value={editData.optionC}
                onChange={(e) => setEditData({ ...editData, optionC: e.target.value })}
              />
              <OptionImageInput
                label="Option C Image"
                imageUrl={editData.optionCImage}
                onImageChange={(url) => setEditData({ ...editData, optionCImage: url })}
              />
            </div>

            {/* Option D */}
            <div className="border rounded-lg p-3 space-y-2">
              <Label>Option D</Label>
              <Input
                value={editData.optionD}
                onChange={(e) => setEditData({ ...editData, optionD: e.target.value })}
              />
              <OptionImageInput
                label="Option D Image"
                imageUrl={editData.optionDImage}
                onImageChange={(url) => setEditData({ ...editData, optionDImage: url })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Question Type</Label>
              <Select
                value={editData.questionType || 'MCQ'}
                onValueChange={(value) =>
                  setEditData({
                    ...editData,
                    questionType: value as 'MCQ' | 'FILL_BLANK',
                  })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MCQ">MCQ (Options A–D)</SelectItem>
                  <SelectItem value="FILL_BLANK">Fill in the blank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Correct Answer</Label>
              { (editData.questionType || 'MCQ') === 'MCQ' ? (
                <Select
                  value={editData.correctOption}
                  onValueChange={(value) => setEditData({ ...editData, correctOption: value, correctAnswer: null })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C</SelectItem>
                    <SelectItem value="D">D</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="mt-1"
                  placeholder="Correct answer text / value"
                  value={editData.correctAnswer || ''}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      correctAnswer: e.target.value,
                      correctOption: '',
                    })
                  }
                />
              )}
            </div>
            <div>
              <Label>Marks</Label>
              <Input
                type="number"
                value={editData.marks}
                onChange={(e) => setEditData({ ...editData, marks: parseInt(e.target.value) || 0 })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Negative Marks</Label>
              <Input
                type="number"
                value={editData.negativeMarks}
                onChange={(e) => setEditData({ ...editData, negativeMarks: parseFloat(e.target.value) || 0 })}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={!question.isValid ? 'border-destructive/50 bg-destructive/5' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{sectionName}</Badge>
            <span className="font-semibold">Q{question.questionNumber}</span>
            <Badge variant="outline" className="text-[10px]">
              {(question.questionType || 'MCQ') === 'MCQ' ? 'MCQ' : 'Fill in the blank'}
            </Badge>
            {question.subject && (
              <Badge variant="secondary" className="text-xs">{question.subject}</Badge>
            )}
            {question.isValid ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
            {question.hasLatex && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                LaTeX
              </Badge>
            )}
            {question.imageUrl && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                <Image className="h-3 w-3 mr-1" />
                Image
              </Badge>
            )}
            {(question.optionAImage || question.optionBImage || question.optionCImage || question.optionDImage) && (
              <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                <Image className="h-3 w-3 mr-1" />
                Opt. Images
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{question.marks} marks</Badge>
            {question.negativeMarks > 0 && (
              <Badge variant="outline" className="text-destructive">
                -{question.negativeMarks}
              </Badge>
            )}
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!question.isValid && question.errors.length > 0 && (
          <div className="bg-destructive/10 text-destructive text-sm p-2 rounded-md">
            {question.errors.join(', ')}
          </div>
        )}
        
        <div className="text-sm font-medium">
          {question.hasLatex ? (
            <MathRenderer content={question.questionText || '(No question text)'} />
          ) : (
            question.questionText || '(No question text)'
          )}
        </div>

        {/* Display question image if present */}
        {question.imageUrl && (
          <div className="my-3">
            <img 
              src={question.imageUrl} 
              alt="Question diagram" 
              className="max-h-48 rounded border object-contain mx-auto"
            />
          </div>
        )}
        
        {(question.questionType || 'MCQ') === 'MCQ' ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className={`p-2 rounded ${question.correctOption === 'A' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
              <span className="font-medium">A)</span>{' '}
              {question.hasLatex ? (
                <MathRenderer content={question.optionA || '(Empty)'} />
              ) : (
                question.optionA || '(Empty)'
              )}
              {question.optionAImage && (
                <img src={question.optionAImage} alt="Option A" className="max-h-16 mt-1 rounded" />
              )}
            </div>
            <div className={`p-2 rounded ${question.correctOption === 'B' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
              <span className="font-medium">B)</span>{' '}
              {question.hasLatex ? (
                <MathRenderer content={question.optionB || '(Empty)'} />
              ) : (
                question.optionB || '(Empty)'
              )}
              {question.optionBImage && (
                <img src={question.optionBImage} alt="Option B" className="max-h-16 mt-1 rounded" />
              )}
            </div>
            <div className={`p-2 rounded ${question.correctOption === 'C' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
              <span className="font-medium">C)</span>{' '}
              {question.hasLatex ? (
                <MathRenderer content={question.optionC || '(Empty)'} />
              ) : (
                question.optionC || '(Empty)'
              )}
              {question.optionCImage && (
                <img src={question.optionCImage} alt="Option C" className="max-h-16 mt-1 rounded" />
              )}
            </div>
            <div className={`p-2 rounded ${question.correctOption === 'D' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
              <span className="font-medium">D)</span>{' '}
              {question.hasLatex ? (
                <MathRenderer content={question.optionD || '(Empty)'} />
              ) : (
                question.optionD || '(Empty)'
              )}
              {question.optionDImage && (
                <img src={question.optionDImage} alt="Option D" className="max-h-16 mt-1 rounded" />
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
            <span className="text-xs font-semibold text-green-700 dark:text-green-400 block mb-1">CORRECT ANSWER</span>
            <div className="text-sm">
              {question.hasLatex ? (
                <MathRenderer content={question.correctAnswer || '(No answer set)'} />
              ) : (
                question.correctAnswer || '(No answer set)'
              )}
            </div>
          </div>
        )}
        
        <div className="text-sm text-muted-foreground">
          Correct Answer: <span className="font-semibold text-foreground">
            {question.questionType === 'FILL_BLANK' ? question.correctAnswer : question.correctOption || 'Not set'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

// Helper component for option image input
interface OptionImageInputProps {
  label: string;
  imageUrl?: string | null;
  onImageChange: (url: string | null) => void;
}

const OptionImageInput = ({ label, imageUrl, onImageChange }: OptionImageInputProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload an image file (JPEG, PNG, WebP, GIF)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const fileName = `option-images/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage
        .from('question-uploads')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('question-uploads')
        .getPublicUrl(fileName);

      onImageChange(publicUrl);
      toast.success('Image uploaded');
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlSubmit = () => {
    if (urlValue.trim()) {
      onImageChange(urlValue.trim());
      setShowUrlInput(false);
      setUrlValue('');
    }
  };

  if (imageUrl) {
    return (
      <div className="flex items-center gap-2">
        <img src={imageUrl} alt={label} className="max-h-12 rounded border" />
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-destructive"
          onClick={() => onImageChange(null)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  if (showUrlInput) {
    return (
      <div className="flex items-center gap-2">
        <Input
          placeholder="Paste image URL..."
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" className="h-8" onClick={handleUrlSubmit}>
          Add
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowUrlInput(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        <Upload className="h-3 w-3 mr-1" />
        {isUploading ? 'Uploading...' : 'Upload'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setShowUrlInput(true)}
      >
        <Image className="h-3 w-3 mr-1" />
        Paste URL
      </Button>
    </div>
  );
};
