import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  label: string;
  showLabel?: boolean;
}

export function IconButton({
  variant = 'default',
  size = 'md',
  children,
  label,
  showLabel = false,
  className = '',
  ...props
}: IconButtonProps) {
  const baseClasses =
    'rounded-full transition-all duration-200 active:scale-90 flex items-center justify-center touch-target';

  const variantClasses = {
    default: 'bg-white/70 backdrop-blur-md text-ink hover:bg-white/90 shadow-sm border border-white/50',
    primary: 'bg-primary-blue text-white hover:brightness-105 shadow-md',
    danger: 'bg-primary-pink text-white hover:brightness-105',
  };

  const sizeClasses = {
    sm: 'w-10 h-10',      // 40px - compact areas
    md: 'w-12 h-12',      // 48px - standard
    lg: 'w-14 h-14',      // 56px - main actions
    xl: 'w-16 h-16',      // 64px - primary action
  };

  // When showing label, render as a flex column container
  if (showLabel) {
    return (
      <button
        className={`flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-90 touch-target rounded-xl px-2 py-2 ${
          variant === 'primary'
            ? 'bg-primary-blue text-white hover:brightness-105'
            : variant === 'danger'
            ? 'bg-primary-pink text-white hover:brightness-105'
            : 'text-ink-soft hover:bg-gray-100'
        } ${className}`}
        aria-label={label}
        {...props}
      >
        <div className={`${sizeClasses[size]} flex items-center justify-center ${
          variant === 'primary' ? '' : 'bg-white/70 backdrop-blur-md shadow-sm border border-white/50'
        } rounded-full`}>
          {children}
        </div>
        <span className="text-xs font-medium whitespace-nowrap">{label}</span>
      </button>
    );
  }

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
