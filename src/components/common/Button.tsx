import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseClasses =
    'rounded-full font-semibold transition-all duration-200 active:scale-95 touch-target flex items-center justify-center gap-2';

  const variantClasses = {
    primary: 'bg-primary-blue text-white hover:brightness-105 active:bg-[#4A7CE0]',
    secondary: 'bg-white text-ink hover:bg-gray-50 active:bg-gray-100 border border-gray-200',
    danger: 'bg-primary-pink text-white hover:brightness-105 active:brightness-95',
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-6 py-4 text-lg',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
