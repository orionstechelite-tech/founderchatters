import { useId } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cx } from './utils';

export type FieldState = 'default' | 'focus' | 'error' | 'disabled';

interface FieldBaseProps {
  className?: string;
  controlClassName?: string;
  error?: string;
  hint?: string;
  id?: string;
  label: string;
  state?: FieldState;
}

export type InputFieldProps = FieldBaseProps &
  Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'className' | 'disabled' | 'id' | 'size'
  > & {
    fieldType?: 'input';
    disabled?: boolean;
  };

export type TextareaFieldProps = FieldBaseProps &
  Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'className' | 'disabled' | 'id'
  > & {
    fieldType: 'textarea';
    disabled?: boolean;
  };

export type FieldProps = InputFieldProps | TextareaFieldProps;

export function Field(props: FieldProps) {
  const generatedId = useId();
  const {
    className,
    controlClassName,
    error,
    fieldType = 'input',
    hint,
    id = generatedId,
    label,
  } = props;
  const state = props.state ?? (error ? 'error' : 'default');
  const isDisabled = state === 'disabled' || props.disabled === true;
  const isError = state === 'error' || Boolean(error);
  const message =
    error ?? (isError ? 'Please add a little more detail.' : hint);
  const messageId = message ? `${id}-message` : undefined;
  const shared = {
    'aria-describedby': messageId,
    'aria-invalid': isError || undefined,
    className: cx('fc-field__control', controlClassName),
    disabled: isDisabled,
    id,
  };

  const controlProps = { ...props } as Record<string, unknown>;
  for (const key of [
    'className',
    'controlClassName',
    'error',
    'fieldType',
    'hint',
    'id',
    'label',
    'state',
  ]) {
    delete controlProps[key];
  }

  let control;
  if (fieldType === 'textarea') {
    control = (
      <textarea
        {...(controlProps as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        {...shared}
      />
    );
  } else {
    control = (
      <input
        {...(controlProps as InputHTMLAttributes<HTMLInputElement>)}
        {...shared}
      />
    );
  }

  return (
    <div
      className={cx(
        'fc-field',
        `fc-field--${fieldType}`,
        `fc-field--${state}`,
        className,
      )}
      data-state={state}
    >
      <label className="fc-field__label" htmlFor={id}>
        {label}
      </label>
      {control}
      {message ? (
        <p
          className={cx(
            'fc-field__message',
            isError && 'fc-field__message--error',
          )}
          id={messageId}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
