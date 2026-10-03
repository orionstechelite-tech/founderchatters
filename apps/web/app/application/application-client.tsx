'use client';

import {
  APPLICATION_ELIGIBILITY_ROLES,
  type ApplicationEligibilityRole,
  type FounderApplication,
  type FounderApplicationResponse,
  type UpdateFounderApplicationRequest,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import {
  ApplicationApiError,
  applicationRequest,
  authSessionRequest,
} from './application-api';

type View =
  | 'loading'
  | 'eligibility'
  | 'details'
  | 'review'
  | 'status'
  | 'denied'
  | 'error';

type ApplicationForm = {
  eligibilityRole: ApplicationEligibilityRole | '';
  companyName: string;
  roleTitle: string;
  website: string;
  city: string;
  country: string;
  buildingSummary: string;
};

const emptyForm: ApplicationForm = {
  eligibilityRole: '',
  companyName: '',
  roleTitle: '',
  website: '',
  city: '',
  country: '',
  buildingSummary: '',
};

const eligibilityOptions: Array<{
  value: ApplicationEligibilityRole;
  label: string;
}> = [
  {
    value: APPLICATION_ELIGIBILITY_ROLES.founder,
    label: 'Founder / Co-founder',
  },
  {
    value: APPLICATION_ELIGIBILITY_ROLES.operator,
    label: 'Founding team / operator',
  },
  {
    value: APPLICATION_ELIGIBILITY_ROLES.notBuilding,
    label: 'Not currently building',
  },
];

const STATE_CONFLICT_CODES = new Set([
  'APPLICATION_ALREADY_SUBMITTED',
  'APPLICATION_INVALID_STATE',
  'APPLICATION_NEEDS_INFO',
]);

function isEligibleToContinue(
  role: ApplicationEligibilityRole | null | '',
): boolean {
  return (
    role === APPLICATION_ELIGIBILITY_ROLES.founder ||
    role === APPLICATION_ELIGIBILITY_ROLES.operator
  );
}

export function ApplicationClient() {
  const router = useRouter();
  const [view, setView] = useState<View>('loading');
  const [application, setApplication] = useState<FounderApplication | null>(
    null,
  );
  const [form, setForm] = useState<ApplicationForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [readOnlyReview, setReadOnlyReview] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void applicationRequest<FounderApplicationResponse>()
      .then(async ({ application: current }) => {
        if (cancelled) return;
        applyApplication(current);
        if (current.status === 'APPROVED') {
          const session = await authSessionRequest();
          if (cancelled) return;
          router.replace(
            session.access.state === 'ACTIVE'
              ? '/home'
              : session.access.state === 'SUSPENDED'
                ? '/suspended'
                : '/onboarding',
          );
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (
          error instanceof ApplicationApiError &&
          error.code === 'APPLICATION_NOT_FOUND'
        ) {
          setView('eligibility');
          return;
        }
        if (
          error instanceof ApplicationApiError &&
          error.code === 'AUTH_EMAIL_NOT_VERIFIED'
        ) {
          router.replace('/verify-email');
          return;
        }
        if (
          error instanceof ApplicationApiError &&
          error.code === 'AUTH_SESSION_EXPIRED'
        ) {
          router.replace('/signin');
          return;
        }
        if (
          error instanceof ApplicationApiError &&
          error.code === 'AUTH_ACCOUNT_SUSPENDED'
        ) {
          router.replace('/suspended');
          return;
        }
        if (
          error instanceof ApplicationApiError &&
          error.code === 'AUTH_FORBIDDEN'
        ) {
          setMessage(error.message);
          setView('denied');
          return;
        }
        setMessage(
          error instanceof Error
            ? error.message
            : 'We could not load your application.',
        );
        setView('error');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (Object.keys(fieldErrors).length > 0) {
      errorSummary.current?.focus();
    }
  }, [fieldErrors]);

  function applyApplication(current: FounderApplication) {
    setApplication(current);
    setForm(formFromApplication(current));
    if (current.status === 'DRAFT') {
      setReadOnlyReview(false);
      setView(
        isEligibleToContinue(current.eligibilityRole)
          ? 'details'
          : 'eligibility',
      );
      return;
    }
    if (current.status === 'NEEDS_INFO') {
      setReadOnlyReview(false);
    }
    setView('status');
  }

  async function recoverAuthoritativeApplication() {
    const { application: current } =
      await applicationRequest<FounderApplicationResponse>();
    applyApplication(current);
    if (current.status === 'APPROVED') {
      const session = await authSessionRequest();
      router.replace(
        session.access.state === 'ACTIVE'
          ? '/home'
          : session.access.state === 'SUSPENDED'
            ? '/suspended'
            : '/onboarding',
      );
    }
  }

  function updateField<K extends keyof ApplicationForm>(
    field: K,
    value: ApplicationForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function continueEligibility() {
    if (!form.eligibilityRole) {
      setFieldErrors({
        eligibilityRole: ['Choose the option that best describes you.'],
      });
      return;
    }
    if (form.eligibilityRole === APPLICATION_ELIGIBILITY_ROLES.notBuilding) {
      setFieldErrors({
        eligibilityRole: [
          'FounderChatters currently requires an active company build.',
        ],
      });
      return;
    }
    setPending(true);
    setMessage('');
    try {
      const response = await applicationRequest<FounderApplicationResponse>(
        'me',
        {
          method: 'PUT',
          body: JSON.stringify({
            eligibilityRole: form.eligibilityRole,
          }),
        },
      );
      setApplication(response.application);
      setView('details');
    } catch (error) {
      handleApiError(error);
    } finally {
      setPending(false);
    }
  }

  async function saveEligibilityAndExit() {
    if (!form.eligibilityRole) {
      router.replace('/');
      return;
    }
    setPending(true);
    setMessage('');
    try {
      await applicationRequest<FounderApplicationResponse>('me', {
        method: 'PUT',
        body: JSON.stringify({ eligibilityRole: form.eligibilityRole }),
      });
      router.replace('/');
    } catch (error) {
      handleApiError(error);
    } finally {
      setPending(false);
    }
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateDetails(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setPending(true);
    setMessage('');
    try {
      const response = await applicationRequest<FounderApplicationResponse>(
        'me',
        {
          method: 'PUT',
          body: JSON.stringify(toRequest(form)),
        },
      );
      setApplication(response.application);
      setReadOnlyReview(false);
      setView('review');
    } catch (error) {
      handleApiError(error);
    } finally {
      setPending(false);
    }
  }

  async function saveDraft() {
    setPending(true);
    setMessage('');
    try {
      const response = await applicationRequest<FounderApplicationResponse>(
        'me',
        {
          method: 'PUT',
          body: JSON.stringify(toRequest(form)),
        },
      );
      setApplication(response.application);
      setMessage('Draft saved.');
    } catch (error) {
      handleApiError(error);
    } finally {
      setPending(false);
    }
  }

  async function submitApplication() {
    setPending(true);
    setMessage('');
    try {
      const path =
        application?.status === 'NEEDS_INFO' ? 'me/resubmit' : 'me/submit';
      const response = await applicationRequest<FounderApplicationResponse>(
        path,
        { method: 'POST', body: '{}' },
      );
      setApplication(response.application);
      setView('status');
    } catch (error) {
      await handleMutationError(error, { recoverState: true });
    } finally {
      setPending(false);
    }
  }

  async function handleMutationError(
    error: unknown,
    options: { recoverState?: boolean } = {},
  ) {
    if (
      options.recoverState &&
      error instanceof ApplicationApiError &&
      STATE_CONFLICT_CODES.has(error.code) &&
      Object.keys(error.fieldErrors).length === 0
    ) {
      try {
        await recoverAuthoritativeApplication();
        return;
      } catch {
        setMessage(error.message);
        return;
      }
    }
    handleApiError(error);
  }

  function handleApiError(error: unknown) {
    if (error instanceof ApplicationApiError) {
      setFieldErrors(error.fieldErrors);
      setMessage(error.message);
    } else {
      setMessage('Something went wrong. Please try again.');
    }
  }

  let content: ReactNode;
  if (view === 'loading') {
    content = (
      <ApplicationState title="Loading your application…" busy>
        We’re checking your current application status.
      </ApplicationState>
    );
  } else if (view === 'error') {
    content = (
      <ApplicationState title="We couldn’t load your application">
        {message}
        <Button
          className="fc-application-state__action"
          onClick={() => window.location.reload()}
          variant="secondary"
        >
          Try again
        </Button>
      </ApplicationState>
    );
  } else if (view === 'denied') {
    content = (
      <ApplicationState title="You can’t access this application">
        {message}
        <Link className="fc-application-secondary-link" href="/support">
          Contact support
        </Link>
      </ApplicationState>
    );
  } else if (view === 'eligibility') {
    content = (
      <EligibilityStep
        errors={fieldErrors}
        onChange={(value) => updateField('eligibilityRole', value)}
        onContinue={continueEligibility}
        onHome={() => router.replace('/')}
        onSaveExit={saveEligibilityAndExit}
        pending={pending}
        value={form.eligibilityRole}
      />
    );
  } else if (view === 'details') {
    content = (
      <DetailsStep
        errors={fieldErrors}
        form={form}
        message={message}
        onBack={() => setView('eligibility')}
        onChange={updateField}
        onReview={review}
        onSave={saveDraft}
        pending={pending}
        resubmitting={application?.status === 'NEEDS_INFO'}
        summaryRef={errorSummary}
      />
    );
  } else if (view === 'review') {
    content = (
      <ReviewStep
        application={application}
        form={form}
        message={message}
        onBack={() => (readOnlyReview ? setView('status') : setView('details'))}
        onSubmit={submitApplication}
        pending={pending}
        readOnly={readOnlyReview}
      />
    );
  } else {
    content = (
      <StatusStep
        application={application}
        onEdit={() => setView('details')}
        onView={() => {
          setReadOnlyReview(true);
          setView('review');
        }}
      />
    );
  }

  return (
    <main className="fc-application-shell">
      <header className="fc-application-topbar">
        <Link href="/" className="fc-application-wordmark">
          FOUNDERCHATTERS
        </Link>
        <span className="fc-application-network">Founder-only network</span>
        <Link
          aria-label="Back to FounderChatters"
          className="fc-application-mobile-back"
          href="/"
        >
          ←
        </Link>
        <span className="fc-application-mobile-title">Application</span>
      </header>
      {content}
    </main>
  );
}

function EligibilityStep({
  errors,
  onChange,
  onContinue,
  onHome,
  onSaveExit,
  pending,
  value,
}: {
  readonly errors: Record<string, string[]>;
  readonly onChange: (value: ApplicationEligibilityRole) => void;
  readonly onContinue: () => void;
  readonly onHome: () => void;
  readonly onSaveExit: () => void;
  readonly pending: boolean;
  readonly value: ApplicationEligibilityRole | '';
}) {
  return (
    <>
      <ApplicationHero
        eyebrow="STEP 1 OF 3"
        mobileCopy="A short check keeps the network focused on people actively building companies."
        mobileTitle="Founder application"
        title="A founder network should start with founders."
      >
        We ask a few focused questions so the community stays useful and
        low-noise.
      </ApplicationHero>
      <section className="fc-application-layout">
        <div className="fc-application-main">
          <p className="fc-application-mobile-step">01 / 03 · ELIGIBILITY</p>
          <div className="fc-application-eligibility-card">
            <h2>Are you actively building a company?</h2>
            <p className="fc-application-intro">
              FounderChatters is designed primarily for active founders and
              founding operators.
            </p>
            <fieldset
              className="fc-application-choices"
              aria-describedby={
                [
                  errors.eligibilityRole ? 'eligibility-error' : '',
                  value === APPLICATION_ELIGIBILITY_ROLES.notBuilding
                    ? 'eligibility-ineligible'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            >
              <legend className="sr-only">Founder eligibility</legend>
              {eligibilityOptions.map((option) => (
                <label
                  className="fc-application-choice"
                  data-selected={value === option.value}
                  key={option.value}
                >
                  <input
                    checked={value === option.value}
                    name="eligibilityRole"
                    onChange={() => onChange(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            {errors.eligibilityRole ? (
              <p
                className="fc-application-field-error"
                id="eligibility-error"
                role="alert"
              >
                {errors.eligibilityRole[0]}
              </p>
            ) : null}
            {value === APPLICATION_ELIGIBILITY_ROLES.notBuilding ? (
              <p
                className="fc-application-ineligible"
                id="eligibility-ineligible"
                role="status"
              >
                FounderChatters currently requires an active company build.
                Choose a different option to continue this application. Saving
                this choice keeps a draft only — it is not a rejected
                application.
              </p>
            ) : null}
            <p className="fc-application-eligibility-note">
              FounderChatters is not a general networking directory or lead
              list.
            </p>
          </div>
          <div className="fc-application-actions">
            <Button
              aria-describedby={
                value === APPLICATION_ELIGIBILITY_ROLES.notBuilding
                  ? 'eligibility-ineligible'
                  : undefined
              }
              disabled={
                pending || value === APPLICATION_ELIGIBILITY_ROLES.notBuilding
              }
              onClick={onContinue}
            >
              {pending ? 'Saving…' : 'Continue'}
            </Button>
            <Button
              className="fc-application-desktop-action"
              disabled={pending}
              onClick={onSaveExit}
              variant="secondary"
            >
              Save &amp; exit
            </Button>
            <Button
              className="fc-application-mobile-action"
              disabled={pending}
              onClick={onHome}
              variant="secondary"
            >
              Back
            </Button>
          </div>
        </div>
        <aside className="fc-application-context fc-application-context--dark">
          <p className="fc-application-label">WHY THIS EXISTS</p>
          <h3>Quality before scale.</h3>
          <p>
            Early members shape the culture. Manual checks help keep spam,
            lead-generation accounts, and irrelevant profiles out of the
            network.
          </p>
        </aside>
      </section>
    </>
  );
}

function DetailsStep({
  errors,
  form,
  message,
  onBack,
  onChange,
  onReview,
  onSave,
  pending,
  resubmitting,
  summaryRef,
}: {
  readonly errors: Record<string, string[]>;
  readonly form: ApplicationForm;
  readonly message: string;
  readonly onBack: () => void;
  readonly onChange: <K extends keyof ApplicationForm>(
    field: K,
    value: ApplicationForm[K],
  ) => void;
  readonly onReview: (event: FormEvent<HTMLFormElement>) => void;
  readonly onSave: () => void;
  readonly pending: boolean;
  readonly resubmitting: boolean;
  readonly summaryRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <ApplicationHero
        eyebrow="STEP 2 OF 3"
        mobileCopy="Enough context for a reviewer—and later, for useful founder discovery."
        title="Tell us what you’re building."
      >
        Enough context for another founder to understand who you are — without
        turning signup into a questionnaire.
      </ApplicationHero>
      <section className="fc-application-layout">
        <form className="fc-application-form" noValidate onSubmit={onReview}>
          <p className="fc-application-mobile-step">
            02 / 03 · FOUNDER &amp; COMPANY
          </p>
          <h2 className="sr-only">Founder and company</h2>
          {Object.keys(errors).length > 0 ? (
            <div
              className="fc-application-error-summary"
              ref={summaryRef}
              role="alert"
              tabIndex={-1}
            >
              <strong>Review the highlighted fields.</strong>
              <span>Your draft is still here.</span>
            </div>
          ) : null}
          <Field
            disabled={pending}
            error={errors.companyName?.[0] ?? ''}
            label="Company / startup"
            name="companyName"
            onChange={(event) =>
              onChange('companyName', event.currentTarget.value)
            }
            placeholder="Company name"
            value={form.companyName}
          />
          <Field
            disabled={pending}
            error={errors.roleTitle?.[0] ?? ''}
            label="Role"
            name="roleTitle"
            onChange={(event) =>
              onChange('roleTitle', event.currentTarget.value)
            }
            placeholder="Founder / Co-founder"
            value={form.roleTitle}
          />
          <Field
            disabled={pending}
            error={errors.website?.[0] ?? ''}
            label="Website"
            name="website"
            onChange={(event) => onChange('website', event.currentTarget.value)}
            placeholder="https://"
            type="url"
            value={form.website}
          />
          <fieldset className="fc-application-location">
            <legend>Location</legend>
            <div className="fc-application-location-fields">
              <Field
                disabled={pending}
                error={errors.city?.[0] ?? ''}
                label="City"
                name="city"
                onChange={(event) =>
                  onChange('city', event.currentTarget.value)
                }
                placeholder="City"
                value={form.city}
              />
              <Field
                disabled={pending}
                error={errors.country?.[0] ?? ''}
                label="Country"
                name="country"
                onChange={(event) =>
                  onChange('country', event.currentTarget.value)
                }
                placeholder="Country"
                value={form.country}
              />
            </div>
          </fieldset>
          <Field
            disabled={pending}
            error={errors.buildingSummary?.[0] ?? ''}
            fieldType="textarea"
            label="What are you building?"
            name="buildingSummary"
            onChange={(event) =>
              onChange('buildingSummary', event.currentTarget.value)
            }
            placeholder="Describe the product, customer, and current stage."
            rows={5}
            value={form.buildingSummary}
          />
          {message ? (
            <p className="fc-application-message" role="status">
              {message}
            </p>
          ) : null}
          <div className="fc-application-actions">
            <Button disabled={pending} type="submit">
              {pending
                ? 'Saving…'
                : resubmitting
                  ? 'Review updates'
                  : 'Review application'}
            </Button>
            <Button disabled={pending} onClick={onBack} variant="secondary">
              Back
            </Button>
            <Button
              className="fc-application-desktop-action"
              disabled={pending}
              onClick={onSave}
              variant="secondary"
            >
              Save draft
            </Button>
          </div>
          <p className="fc-application-form-note">
            Your application can be returned for more information before
            approval.
          </p>
        </form>
        <aside className="fc-application-context">
          <p className="fc-application-label">WHAT WE CARE ABOUT</p>
          <h3>
            Real founder identity.
            <br />A real company or active build.
            <br />
            Enough context to be useful.
          </h3>
          <hr />
          <p>
            We do not need a pitch deck, revenue number, funding history or
            polished founder story just to join.
          </p>
        </aside>
      </section>
    </>
  );
}

function ReviewStep({
  application,
  form,
  message,
  onBack,
  onSubmit,
  pending,
  readOnly,
}: {
  readonly application: FounderApplication | null;
  readonly form: ApplicationForm;
  readonly message: string;
  readonly onBack: () => void;
  readonly onSubmit: () => void;
  readonly pending: boolean;
  readonly readOnly: boolean;
}) {
  return (
    <>
      <ApplicationHero
        eyebrow="STEP 3 OF 3"
        title={
          readOnly ? 'Your founder application.' : 'Review your application.'
        }
      >
        {readOnly
          ? 'This is the application currently on file.'
          : 'Confirm the details below before sending them for manual review.'}
      </ApplicationHero>
      <section className="fc-application-review">
        <dl>
          <ReviewItem label="Eligibility">
            {eligibilityLabel(form.eligibilityRole)}
          </ReviewItem>
          <ReviewItem label="Company">{form.companyName}</ReviewItem>
          <ReviewItem label="Role">{form.roleTitle}</ReviewItem>
          <ReviewItem label="Website">
            {form.website || 'Not provided'}
          </ReviewItem>
          <ReviewItem label="Location">
            {[form.city, form.country].filter(Boolean).join(', ')}
          </ReviewItem>
          <ReviewItem label="What are you building?">
            {form.buildingSummary}
          </ReviewItem>
        </dl>
        {message ? (
          <p className="fc-application-message" role="alert">
            {message}
          </p>
        ) : null}
        <div className="fc-application-actions">
          {!readOnly ? (
            <Button disabled={pending} onClick={onSubmit}>
              {pending
                ? 'Submitting…'
                : application?.status === 'NEEDS_INFO'
                  ? 'Resubmit application'
                  : 'Submit application'}
            </Button>
          ) : null}
          <Button disabled={pending} onClick={onBack} variant="secondary">
            {readOnly ? 'Back to status' : 'Back to edit'}
          </Button>
        </div>
      </section>
    </>
  );
}

function StatusStep({
  application,
  onEdit,
  onView,
}: {
  readonly application: FounderApplication | null;
  readonly onEdit: () => void;
  readonly onView: () => void;
}) {
  if (!application) {
    return (
      <ApplicationState title="Application unavailable">
        Refresh the page to load your current status.
      </ApplicationState>
    );
  }
  const copy = statusCopy(application.status);
  return (
    <>
      <ApplicationHero
        eyebrow={copy.eyebrow}
        mobileCopy="We’ll keep this page as the source of truth for your application status."
        mobileTitle={copy.mobileHero}
        title={copy.hero}
      >
        {copy.desktopIntro}
      </ApplicationHero>
      <section className="fc-application-status-layout">
        <div className="fc-application-status-card">
          <p className="fc-application-label">STATUS</p>
          <h2>
            <span className="fc-application-title-desktop">
              {copy.desktopTitle}
            </span>
            <span className="fc-application-title-mobile">{copy.title}</span>
          </h2>
          {application.submittedAt ? (
            <p className="fc-application-date">
              Submitted · {formatDate(application.submittedAt)}
            </p>
          ) : null}
          <p>{copy.description}</p>
          {application.status === 'NEEDS_INFO' && application.needsInfoNote ? (
            <div className="fc-application-request">
              <strong>Requested update</strong>
              <span>{application.needsInfoNote}</span>
            </div>
          ) : null}
          {application.status === 'NEEDS_INFO' ? (
            <Button onClick={onEdit}>Update application</Button>
          ) : application.status === 'APPROVED' ? (
            <Link className="fc-application-secondary-link" href="/onboarding">
              Continue to onboarding
            </Link>
          ) : application.status === 'REJECTED' ? (
            <Link className="fc-application-secondary-link" href="/support">
              Contact support
            </Link>
          ) : (
            <Button onClick={onView} variant="secondary">
              View application
            </Button>
          )}
        </div>
        <aside className="fc-application-next">
          <p className="fc-application-label">NEXT</p>
          <ol>
            <li>Manual review</li>
            <li>Founder profile</li>
            <li>I can help with</li>
            <li>I need help with</li>
            <li>Enter the network</li>
          </ol>
        </aside>
      </section>
    </>
  );
}

function ApplicationHero({
  children,
  eyebrow,
  mobileCopy,
  mobileTitle,
  title,
}: {
  readonly children: ReactNode;
  readonly eyebrow: string;
  readonly mobileCopy?: string;
  readonly mobileTitle?: string;
  readonly title: string;
}) {
  return (
    <header className="fc-application-hero">
      <p className="fc-application-label">{eyebrow}</p>
      <h1>
        <span className="fc-application-title-desktop">{title}</span>
        <span className="fc-application-title-mobile">
          {mobileTitle ?? title}
        </span>
      </h1>
      <p>
        <span className="fc-application-copy-desktop">{children}</span>
        <span className="fc-application-copy-mobile">
          {mobileCopy ?? children}
        </span>
      </p>
    </header>
  );
}

function ApplicationState({
  busy = false,
  children,
  title,
}: {
  readonly busy?: boolean;
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <section className="fc-application-state" aria-live="polite">
      <span aria-hidden="true">{busy ? '···' : '!'}</span>
      <h1>{title}</h1>
      <div>{children}</div>
    </section>
  );
}

function ReviewItem({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function formFromApplication(application: FounderApplication): ApplicationForm {
  return {
    eligibilityRole: application.eligibilityRole ?? '',
    companyName: application.companyName ?? '',
    roleTitle: application.roleTitle ?? '',
    website: application.website ?? '',
    city: application.city ?? '',
    country: application.country ?? '',
    buildingSummary: application.buildingSummary ?? '',
  };
}

function toRequest(form: ApplicationForm): UpdateFounderApplicationRequest {
  return {
    ...(form.eligibilityRole ? { eligibilityRole: form.eligibilityRole } : {}),
    companyName: form.companyName,
    roleTitle: form.roleTitle,
    website: form.website || null,
    city: form.city,
    country: form.country,
    buildingSummary: form.buildingSummary,
  };
}

function validateDetails(form: ApplicationForm): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  if (form.companyName.trim().length < 2) {
    errors.companyName = ['Enter your company or startup name.'];
  }
  if (form.roleTitle.trim().length < 2) {
    errors.roleTitle = ['Enter your role.'];
  }
  if (form.website.trim()) {
    try {
      const url = new URL(form.website.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        errors.website = ['Enter a valid HTTP or HTTPS website URL.'];
      }
    } catch {
      errors.website = ['Enter a valid HTTP or HTTPS website URL.'];
    }
  }
  if (!form.city.trim()) errors.city = ['Enter your city.'];
  if (form.country.trim().length < 2) errors.country = ['Enter your country.'];
  if (form.buildingSummary.trim().length < 20) {
    errors.buildingSummary = [
      'Describe the product, customer, and current stage.',
    ];
  }
  return errors;
}

function eligibilityLabel(value: ApplicationForm['eligibilityRole']): string {
  return (
    eligibilityOptions.find((option) => option.value === value)?.label ??
    'Not provided'
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function statusCopy(status: FounderApplication['status']) {
  switch (status) {
    case 'NEEDS_INFO':
      return {
        eyebrow: 'APPLICATION UPDATE NEEDED',
        hero: 'Your application needs more information.',
        mobileHero: 'More information needed.',
        desktopIntro:
          'We’ll keep this page as the source of truth for your application status.',
        desktopTitle: 'Needs more info',
        title: 'Needs more info',
        description:
          'Update the requested details, review them, and resubmit your application.',
      };
    case 'REJECTED':
      return {
        eyebrow: 'APPLICATION DECIDED',
        hero: 'Your application was not approved.',
        mobileHero: 'Application not approved.',
        desktopIntro:
          'We’ll keep this page as the source of truth for your application status.',
        desktopTitle: 'Not approved',
        title: 'Not approved',
        description:
          'Applications are final for the MVP unless an administrator explicitly reopens one.',
      };
    case 'APPROVED':
      return {
        eyebrow: 'APPLICATION APPROVED',
        hero: 'Welcome to FounderChatters.',
        mobileHero: 'Application approved.',
        desktopIntro:
          'We’ll keep this page as the source of truth for your application status.',
        desktopTitle: 'Approved',
        title: 'Approved',
        description: 'Continue to onboarding to complete your founder profile.',
      };
    default:
      return {
        eyebrow: 'APPLICATION SUBMITTED',
        hero: 'We’ll check this like humans, not like a funnel.',
        mobileHero: 'Application submitted.',
        desktopIntro:
          'A short manual review keeps the early network founder-led. You can complete your contribution profile as soon as you’re approved.',
        desktopTitle: 'Application received.',
        title: 'Pending review',
        description:
          'If more context is needed, this same screen changes to “Needs more info” and shows the requested action.',
      };
  }
}
