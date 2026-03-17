import { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

const states = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh'
];

const boards = [
  'CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge', 'Other'
];

const classes = [
  '6th', '7th', '8th', '9th', '10th', '11th', '12th', 'Graduate', 'Post Graduate'
];

interface Step1DetailsProps {
  form: UseFormReturn<any>;
  onNext: () => void;
}

export const Step1Details = ({ form, onNext }: Step1DetailsProps) => {
  const { register, formState: { errors }, setValue, watch } = form;

  const handleNext = () => {
    const requiredFields = ['full_name', 'email', 'mobile', 'date_of_birth', 'gender', 'state', 'city', 'class', 'board', 'school_name'];
    const values = watch();
    const hasErrors = requiredFields.some(field => !values[field]);
    
    if (!hasErrors) {
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">Personal & Academic Details</h2>
        <p className="text-muted-foreground">Please fill in your registration details</p>
      </div>

      {/* Personal Information */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg border-b pb-2">Personal Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name *</Label>
            <Input
              id="full_name"
              placeholder="Enter your full name"
              {...register('full_name', { required: 'Full name is required' })}
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message as string}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              {...register('email', { 
                required: 'Email is required',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Invalid email format'
                }
              })}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message as string}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile Number *</Label>
            <Input
              id="mobile"
              type="tel"
              placeholder="Enter your mobile number"
              {...register('mobile', { 
                required: 'Mobile number is required',
                pattern: {
                  value: /^[6-9]\d{9}$/,
                  message: 'Invalid mobile number'
                }
              })}
            />
            {errors.mobile && (
              <p className="text-sm text-destructive">{errors.mobile.message as string}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date_of_birth">Date of Birth *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  {watch('date_of_birth')
                    ? format(new Date(watch('date_of_birth')), 'dd-MM-yyyy')
                    : 'Select date'}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={watch('date_of_birth') ? new Date(watch('date_of_birth')) : undefined}
                  onSelect={(date) => {
                    if (!date) {
                      setValue('date_of_birth', '');
                    } else {
                      // Store as local date string YYYY-MM-DD to avoid timezone shift
                      setValue('date_of_birth', format(date, 'yyyy-MM-dd'), { shouldValidate: true });
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
            {errors.date_of_birth && (
              <p className="text-sm text-destructive">{errors.date_of_birth.message as string}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Gender *</Label>
          <RadioGroup
            value={watch('gender') || ''}
            onValueChange={(value) => setValue('gender', value)}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="male" id="male" />
              <Label htmlFor="male" className="cursor-pointer">Male</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="female" id="female" />
              <Label htmlFor="female" className="cursor-pointer">Female</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="other" id="other" />
              <Label htmlFor="other" className="cursor-pointer">Other</Label>
            </div>
          </RadioGroup>
          {errors.gender && (
            <p className="text-sm text-destructive">{errors.gender.message as string}</p>
          )}
        </div>
      </div>

      {/* Address Information */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg border-b pb-2">Address</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="state">State *</Label>
            <Select
              value={watch('state') || ''}
              onValueChange={(value) => setValue('state', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {states.map((state) => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.state && (
              <p className="text-sm text-destructive">{errors.state.message as string}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input
              id="city"
              placeholder="Enter your city"
              {...register('city', { required: 'City is required' })}
            />
            {errors.city && (
              <p className="text-sm text-destructive">{errors.city.message as string}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Full Address</Label>
            <Input
              id="address"
              placeholder="Enter your full address"
              {...register('address')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pincode">Pincode</Label>
            <Input
              id="pincode"
              placeholder="Enter pincode"
              {...register('pincode', {
                pattern: {
                  value: /^\d{6}$/,
                  message: 'Pincode must be 6 digits'
                }
              })}
            />
            {errors.pincode && (
              <p className="text-sm text-destructive">{errors.pincode.message as string}</p>
            )}
          </div>
        </div>
      </div>

      {/* Academic Information */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg border-b pb-2">Academic Details</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="class">Class *</Label>
            <Select
              value={watch('class') || ''}
              onValueChange={(value) => setValue('class', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.class && (
              <p className="text-sm text-destructive">{errors.class.message as string}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="board">Board *</Label>
            <Select
              value={watch('board') || ''}
              onValueChange={(value) => setValue('board', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select board" />
              </SelectTrigger>
              <SelectContent>
                {boards.map((board) => (
                  <SelectItem key={board} value={board}>{board}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.board && (
              <p className="text-sm text-destructive">{errors.board.message as string}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="academic_year">Academic Year</Label>
            <Input
              id="academic_year"
              placeholder="e.g., 2024-2025"
              {...register('academic_year')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="school_name">School/College Name *</Label>
            <Input
              id="school_name"
              placeholder="Enter your school/college name"
              {...register('school_name', { required: 'School name is required' })}
            />
            {errors.school_name && (
              <p className="text-sm text-destructive">{errors.school_name.message as string}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="percentage">Previous Year Percentage</Label>
            <Input
              id="percentage"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="Enter percentage"
              {...register('percentage')}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="button" onClick={handleNext}>
          Next Step
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
