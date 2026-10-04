'use client';

import {
  PUBLIC_SUPPORT_CATEGORIES,
  PUBLIC_SUPPORT_LIMITS,
  type PublicSupportCategory,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useId, useState, type FormEvent } from 'react';

import { createPublicSupportCase, PublicSupportApiError } from './support-api';

const CATEGORY_SET = new Set<string>(PUBLIC_SUPPORT_CATEGORIES);

export function resolveSupportCategory(
  value: string | undefined,
): PublicSupportCategory {
  if (value && CATEGORY_SET.has(value)) {
    return value as PublicSupportCategory;
  }
  return 'other';
}

export function SupportForm({
  initialCategory,
}: {
  initialCategory: string | undefined;
}) {
  const categoryId = useId();
  const [category, setCategory] = useState(
    resolveSupportCategory(initialCategory),
  );
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [received, setReceived] = useState<{
    caseId: string;
    status: string;
  } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const result = await createPublicSupportCase({
        category,
        email,
        subject,
        message,
      });
      setReceived(result);
    } catch (error) {
      if (error instanceof PublicSupportApiError) {
        setFieldErrors(error.fieldErrors);
        setFormError(
          Object.keys(error.fieldErrors).length > 0 ? null : error.message,
        );
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setPending(false);
    }
  }

  if (received) {
    return (
      <section className="fc-mkt-success" aria-live="polite">
        <h2 className="fc-title">Your support request has been received.</h2>
        <p className="fc-body">
          Reference: <strong>{received.caseId}</strong>
        </p>
        <p className="fc-body">
          Status: open. The support team can use the email associated with this
          support request to reach you. This page does not send an automated
          email and does not promise a response time.
        </p>
      </section>
    );
  }

  return (
    <form className="fc-mkt-form" onSubmit={onSubmit} noValidate>
      <div className="fc-field">
        <label className="fc-field__label" htmlFor={categoryId}>
          Category
        </label>
        <select
          className="fc-field__control"
          id={categoryId}
          name="category"
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as PublicSupportCategory)
          }
        >
          {PUBLIC_SUPPORT_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <Field
        autoComplete="email"
        error={fieldErrors.email?.[0] ?? ''}
        label="Email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        required
        type="email"
        value={email}
      />
      <Field
        error={fieldErrors.subject?.[0] ?? ''}
        label="Subject"
        maxLength={PUBLIC_SUPPORT_LIMITS.subjectMax}
        name="subject"
        onChange={(event) => setSubject(event.target.value)}
        required
        value={subject}
      />
      <Field
        error={fieldErrors.message?.[0] ?? ''}
        fieldType="textarea"
        label="Message"
        maxLength={PUBLIC_SUPPORT_LIMITS.messageMax}
        name="message"
        onChange={(event) => setMessage(event.target.value)}
        required
        rows={8}
        value={message}
      />
      {formError ? (
        <p className="fc-body" role="alert">
          {formError}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? 'Sending…' : 'Submit request'}
      </Button>
    </form>
  );
}
