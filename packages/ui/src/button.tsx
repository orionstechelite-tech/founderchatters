import type { ButtonHTMLAttributes } from 'react';

import { cx } from './utils';

export type ButtonSize = 'small' | 'medium';
export type ButtonVariant = 'primary' | 'secondary';
export type ButtonState = 'default' | 'hover' | 'disabled';

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'disabled'
> {
  className?: string;
  disabled?: boolean;
  size?: ButtonSize;
  state?: ButtonState;
  variant?: ButtonVariant;
}

export function Button({
  className,
  disabled = false,
  size = 'medium',
  state = 'default',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || state === 'disabled';

  return (
    <button
      className={cx(
        'fc-button',
        `fc-button--${size}`,
        `fc-button--${variant}`,
        className,
      )}
      data-state={state}
      disabled={isDisabled}
      type={type}
      {...props}
    />
  );
}
