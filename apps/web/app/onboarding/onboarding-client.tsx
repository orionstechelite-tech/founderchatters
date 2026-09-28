'use client';

import {
  ONBOARDING_LIMITS,
  type OnboardingProfileResponse,
  type OnboardingTopicRef,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import {
  authSessionRequest,
  completeOnboarding,
  getOnboardingProfile,
  OnboardingApiError,
  saveOnboardingExpertise,
  saveOnboardingNeeds,
  saveOnboardingProfile,
} from './onboarding-api';

type Step = 1 | 2 | 3 | 4;
type View = 'loading' | 'form' | 'denied' | 'error';

type ProfileForm = {
  displayName: string;
  companyName: string;
  industry: string;
  stage: string;
  city: string;
  country: string;
  description: string;
};

function emptyForm(): ProfileForm {
  return {
    displayName: '',
    companyName: '',
    industry: '',
    stage: '',
    city: '',
    country: '',
    description: '',
  };
}

function formFromProfile(payload: OnboardingProfileResponse): ProfileForm {
  return {
    displayName: payload.profile.displayName ?? '',
    companyName: payload.company?.name ?? '',
    industry: payload.company?.industry ?? '',
    stage: payload.company?.stage ?? '',
    city: payload.profile.city ?? payload.company?.city ?? '',
    country: payload.profile.country ?? payload.company?.country ?? '',
    description: payload.company?.description ?? '',
  };
}

function furthestStep(payload: OnboardingProfileResponse): Step {
  const expertiseCount =
    payload.expertise.length + (payload.profile.customExpertise ? 1 : 0);
  if (!payload.profile.displayName) return 1;
  if (expertiseCount < ONBOARDING_LIMITS.expertiseMin) return 2;
  if (!payload.profile.currentNeedText) return 3;
  return 4;
}

function stepForFieldErrors(
  fieldErrors: Record<string, string[]>,
): Step | null {
  if (
    fieldErrors.displayName ||
    fieldErrors['company.name'] ||
    fieldErrors.city ||
    fieldErrors.country ||
    fieldErrors['company.city'] ||
    fieldErrors['company.country'] ||
    fieldErrors['company.description']
  ) {
    return 1;
  }
  if (fieldErrors.topicIds || fieldErrors.customExpertise) {
    return 2;
  }
  if (fieldErrors.currentNeedText) {
    return 3;
  }
  return null;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first) return 'FC';
  if (!last || parts.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

export function OnboardingClient() {
  const router = useRouter();
  const headingId = useId();
  const [view, setView] = useState<View>('loading');
  const [step, setStep] = useState<Step>(1);
  const [payload, setPayload] = useState<OnboardingProfileResponse | null>(
    null,
  );
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [expertiseIds, setExpertiseIds] = useState<string[]>([]);
  const [customExpertise, setCustomExpertise] = useState('');
  const [needIds, setNeedIds] = useState<string[]>([]);
  const [currentNeedText, setCurrentNeedText] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    void authSessionRequest()
      .then(async (session) => {
        if (cancelled) return;
        if (session.access.state === 'VERIFY_EMAIL') {
          router.replace('/verify-email');
          return;
        }
        if (session.access.state === 'APPLICATION') {
          router.replace('/application');
          return;
        }
        if (session.access.state === 'ACTIVE') {
          router.replace('/home');
          return;
        }
        const profile = await getOnboardingProfile();
        if (cancelled) return;
        applyPayload(profile, true);
        setView('form');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof OnboardingApiError) {
          if (error.code === 'AUTH_SESSION_EXPIRED') {
            router.replace('/signin');
            return;
          }
          if (error.code === 'AUTH_EMAIL_NOT_VERIFIED') {
            router.replace('/verify-email');
            return;
          }
          if (error.code === 'AUTH_FORBIDDEN') {
            setMessage(error.message);
            setView('denied');
            return;
          }
        }
        setMessage(
          error instanceof Error
            ? error.message
            : 'We could not load onboarding.',
        );
        setView('error');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (view === 'form') {
      headingRef.current?.focus();
    }
  }, [step, view]);

  useEffect(() => {
    if (Object.keys(fieldErrors).length > 0) {
      errorSummary.current?.focus();
    }
  }, [fieldErrors]);

  function applyPayload(next: OnboardingProfileResponse, restoreStep: boolean) {
    setPayload(next);
    setForm(formFromProfile(next));
    setExpertiseIds(next.expertise.map((topic) => topic.id));
    setCustomExpertise(next.profile.customExpertise ?? '');
    setNeedIds(next.needs.map((topic) => topic.id));
    setCurrentNeedText(next.profile.currentNeedText ?? '');
    if (restoreStep) {
      setStep(furthestStep(next));
    }
  }

  function updateForm<K extends keyof ProfileForm>(field: K, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    clearFieldError(field === 'companyName' ? 'company.name' : field);
  }

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function persistProfile(): Promise<OnboardingProfileResponse | null> {
    if (!form.displayName.trim()) {
      return payload;
    }
    return saveOnboardingProfile({
      displayName: form.displayName,
      city: form.city,
      country: form.country,
      company: {
        name: form.companyName,
        industry: form.industry,
        stage: form.stage,
        city: form.city,
        country: form.country,
        description: form.description,
      },
    });
  }

  async function continueStep1(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setFieldErrors({});
    try {
      if (!form.displayName.trim()) {
        setFieldErrors({ displayName: ['Enter your name.'] });
        return;
      }
      if (!form.companyName.trim() && !payload?.company?.name) {
        setFieldErrors({ 'company.name': ['Enter a company name.'] });
        return;
      }
      const next = await persistProfile();
      if (next) applyPayload(next, false);
      setStep(2);
    } catch (error) {
      handleFormError(error);
    } finally {
      setPending(false);
    }
  }

  async function skipStep1() {
    setPending(true);
    setMessage('');
    setFieldErrors({});
    try {
      if (form.displayName.trim()) {
        const next = await persistProfile();
        if (next) applyPayload(next, false);
      }
      setStep(2);
    } catch (error) {
      handleFormError(error);
    } finally {
      setPending(false);
    }
  }

  async function continueStep2(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setFieldErrors({});
    try {
      const next = await saveOnboardingExpertise({
        topicIds: expertiseIds,
        customExpertise,
      });
      applyPayload(next, false);
      setStep(3);
    } catch (error) {
      handleFormError(error);
    } finally {
      setPending(false);
    }
  }

  async function continueStep3(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setFieldErrors({});
    try {
      const next = await saveOnboardingNeeds({
        topicIds: needIds,
        currentNeedText,
      });
      applyPayload(next, false);
      setStep(4);
    } catch (error) {
      handleFormError(error);
    } finally {
      setPending(false);
    }
  }

  async function enterNetwork() {
    setPending(true);
    setMessage('');
    setFieldErrors({});
    try {
      await completeOnboarding();
      const session = await authSessionRequest();
      if (session.access.state !== 'ACTIVE') {
        setMessage('Your profile is saved, but membership is not active yet.');
        return;
      }
      router.replace('/home');
    } catch (error) {
      handleFormError(error);
    } finally {
      setPending(false);
    }
  }

  function handleFormError(error: unknown) {
    if (error instanceof OnboardingApiError) {
      setFieldErrors(error.fieldErrors);
      setMessage(error.message);
      const nextStep = stepForFieldErrors(error.fieldErrors);
      if (nextStep) {
        setStep(nextStep);
      }
      return;
    }
    setMessage(
      error instanceof Error ? error.message : 'Something went wrong.',
    );
  }

  function toggleTopic(
    id: string,
    selected: string[],
    setSelected: (next: string[]) => void,
    field: string,
  ) {
    setSelected(
      selected.includes(id)
        ? selected.filter((topicId) => topicId !== id)
        : [...selected, id],
    );
    clearFieldError(field);
  }

  if (view === 'loading') {
    return (
      <OnboardingShell>
        <p className="fc-onboarding-status">Loading onboarding…</p>
      </OnboardingShell>
    );
  }
  if (view === 'denied' || view === 'error') {
    return (
      <OnboardingShell>
        <section className="fc-onboarding-state" role="alert">
          <h1>
            {view === 'denied'
              ? 'Onboarding unavailable'
              : 'Something went wrong'}
          </h1>
          <p>{message}</p>
        </section>
      </OnboardingShell>
    );
  }

  const topics = payload?.topics ?? { expertise: [], needs: [] };
  const previewName = form.displayName || payload?.profile.displayName || '';
  const previewCompany = form.companyName || payload?.company?.name || '';
  const previewRole = payload?.applicationRoleTitle;
  const location = [form.city, form.country].filter(Boolean).join(', ');

  return (
    <OnboardingShell step={step}>
      {Object.keys(fieldErrors).length > 0 || message ? (
        <div
          className="fc-onboarding-error-summary"
          ref={errorSummary}
          role="alert"
          tabIndex={-1}
        >
          <strong>Review the highlighted fields.</strong>
          <span>
            {message || 'Some details need attention before continuing.'}
          </span>
        </div>
      ) : null}
      {step === 1 ? (
        <form onSubmit={(event) => void continueStep1(event)}>
          <OnboardingHero
            copy="This gives other founders enough context to decide when their experience is relevant."
            headingRef={headingRef}
            id={headingId}
            step={1}
            title="What are you building?"
          />
          <section className="fc-onboarding-layout">
            <div className="fc-onboarding-main">
              <Field
                autoComplete="name"
                disabled={pending}
                error={fieldErrors.displayName?.[0] ?? ''}
                label="Display name"
                name="displayName"
                onChange={(event) =>
                  updateForm('displayName', event.currentTarget.value)
                }
                placeholder="Your name"
                value={form.displayName}
              />
              <Field
                disabled={pending}
                error={fieldErrors['company.name']?.[0] ?? ''}
                label="Company"
                name="companyName"
                onChange={(event) =>
                  updateForm('companyName', event.currentTarget.value)
                }
                placeholder="Company / project"
                value={form.companyName}
              />
              <Field
                disabled={pending}
                error={fieldErrors['company.industry']?.[0] ?? ''}
                label="Industry"
                name="industry"
                onChange={(event) =>
                  updateForm('industry', event.currentTarget.value)
                }
                placeholder="Industry"
                value={form.industry}
              />
              <Field
                disabled={pending}
                error={fieldErrors['company.stage']?.[0] ?? ''}
                label="Stage"
                name="stage"
                onChange={(event) =>
                  updateForm('stage', event.currentTarget.value)
                }
                placeholder="Pre-launch / MVP"
                value={form.stage}
              />
              <fieldset className="fc-onboarding-location">
                <legend>Location</legend>
                <div className="fc-onboarding-location-fields">
                  <Field
                    disabled={pending}
                    error={fieldErrors.city?.[0] ?? ''}
                    label="City"
                    name="city"
                    onChange={(event) =>
                      updateForm('city', event.currentTarget.value)
                    }
                    placeholder="City"
                    value={form.city}
                  />
                  <Field
                    disabled={pending}
                    error={fieldErrors.country?.[0] ?? ''}
                    label="Country"
                    name="country"
                    onChange={(event) =>
                      updateForm('country', event.currentTarget.value)
                    }
                    placeholder="Country"
                    value={form.country}
                  />
                </div>
              </fieldset>
              <Field
                disabled={pending}
                error={fieldErrors['company.description']?.[0] ?? ''}
                fieldType="textarea"
                label="One-line description"
                name="description"
                onChange={(event) =>
                  updateForm('description', event.currentTarget.value)
                }
                placeholder="A founder-to-founder support network."
                rows={4}
                value={form.description}
              />
              <OnboardingActions
                pending={pending}
                primary="Continue"
                secondary="Skip for now"
                onSecondary={() => void skipStep1()}
              />
            </div>
            <aside className="fc-onboarding-context">
              <p className="fc-onboarding-kicker">CONTEXT</p>
              <h2>Context makes help useful.</h2>
              <p>
                A founder deciding whether to respond should understand your
                company, stage and situation without opening a pitch deck.
              </p>
            </aside>
          </section>
        </form>
      ) : null}
      {step === 2 ? (
        <form onSubmit={(event) => void continueStep2(event)}>
          <OnboardingHero
            copy="Choose what you have real experience with. This shapes what requests we show you."
            headingRef={headingRef}
            id={headingId}
            step={2}
            title="What can you help another founder with?"
          />
          <section className="fc-onboarding-layout fc-onboarding-layout--single">
            <div className="fc-onboarding-main">
              <p className="fc-onboarding-kicker">SELECT TOPICS</p>
              <TopicChips
                labelledBy={headingId}
                onToggle={(id) =>
                  toggleTopic(id, expertiseIds, setExpertiseIds, 'topicIds')
                }
                selected={expertiseIds}
                topics={topics.expertise}
              />
              <Field
                disabled={pending}
                error={fieldErrors.customExpertise?.[0] ?? ''}
                label="Add something specific"
                name="customExpertise"
                onChange={(event) => {
                  setCustomExpertise(event.currentTarget.value);
                  clearFieldError('customExpertise');
                  clearFieldError('topicIds');
                }}
                placeholder="e.g. Outstation taxi marketplace operations"
                value={customExpertise}
              />
              {fieldErrors.topicIds ? (
                <p className="fc-onboarding-field-error" role="alert">
                  {fieldErrors.topicIds[0]}
                </p>
              ) : null}
              <OnboardingActions
                pending={pending}
                primary="Continue"
                secondary="Back"
                onSecondary={() => setStep(1)}
              />
              <p className="fc-onboarding-note">
                Your selections shape the requests we show you.
              </p>
            </div>
          </section>
        </form>
      ) : null}
      {step === 3 ? (
        <form onSubmit={(event) => void continueStep3(event)}>
          <OnboardingHero
            copy="This can change anytime. Start with the thing that would genuinely move your company forward."
            headingRef={headingRef}
            id={headingId}
            step={3}
            title="What do you need help with right now?"
          />
          <section className="fc-onboarding-layout">
            <div className="fc-onboarding-main">
              <Field
                disabled={pending}
                error={fieldErrors.currentNeedText?.[0] ?? ''}
                fieldType="textarea"
                label="Current need"
                name="currentNeedText"
                onChange={(event) => {
                  setCurrentNeedText(event.currentTarget.value);
                  clearFieldError('currentNeedText');
                }}
                placeholder="e.g. Finding founders who have launched in the UAE"
                rows={5}
                value={currentNeedText}
              />
              <p className="fc-onboarding-kicker">COMMON AREAS</p>
              <TopicChips
                labelledBy={headingId}
                onToggle={(id) =>
                  toggleTopic(id, needIds, setNeedIds, 'topicIds')
                }
                selected={needIds}
                topics={topics.needs}
              />
              {fieldErrors.topicIds ? (
                <p className="fc-onboarding-field-error" role="alert">
                  {fieldErrors.topicIds[0]}
                </p>
              ) : null}
              <OnboardingActions
                pending={pending}
                primary="Continue"
                secondary="Back"
                onSecondary={() => setStep(2)}
              />
            </div>
            <aside className="fc-onboarding-context">
              <p className="fc-onboarding-kicker">PRODUCT RULE</p>
              <h2>Needs are temporary. Experience compounds.</h2>
            </aside>
          </section>
        </form>
      ) : null}
      {step === 4 ? (
        <section>
          <OnboardingHero
            copy="Your profile now tells the community what you’re building, what you know and what you need."
            headingRef={headingRef}
            id={headingId}
            kicker="PROFILE READY"
            step={4}
            title="You’re ready to enter the network."
          />
          <section className="fc-onboarding-ready">
            <article className="fc-onboarding-preview">
              <div className="fc-onboarding-identity">
                <span aria-hidden="true" className="fc-onboarding-avatar">
                  {initialsFrom(previewName)}
                </span>
                <div>
                  <h2>{previewName || 'Add your name to continue'}</h2>
                  <p>
                    {[previewRole, previewCompany, location]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
              <p className="fc-onboarding-kicker">CAN HELP WITH</p>
              <ul className="fc-onboarding-preview-chips">
                {(payload?.expertise ?? []).map((topic) => (
                  <li key={topic.id}>{topic.label}</li>
                ))}
                {payload?.profile.customExpertise ? (
                  <li>{payload.profile.customExpertise}</li>
                ) : null}
              </ul>
              <p className="fc-onboarding-kicker">CURRENTLY NEEDS</p>
              <p className="fc-onboarding-need">
                {payload?.profile.currentNeedText}
              </p>
              {(payload?.needs.length ?? 0) > 0 ? (
                <ul className="fc-onboarding-preview-chips">
                  {(payload?.needs ?? []).map((topic) => (
                    <li key={topic.id}>{topic.label}</li>
                  ))}
                </ul>
              ) : null}
            </article>
            <div className="fc-onboarding-next">
              <p className="fc-onboarding-kicker">NEXT</p>
              <p>
                Start by helping someone — or ask the community for something
                you need.
              </p>
              {message ? (
                <p className="fc-onboarding-field-error" role="alert">
                  {message}
                </p>
              ) : null}
              <Button disabled={pending} onClick={() => void enterNetwork()}>
                {pending ? 'Entering…' : 'Enter FounderChatters'}
              </Button>
              {!previewName ? (
                <Button
                  disabled={pending}
                  onClick={() => setStep(1)}
                  variant="secondary"
                >
                  Add your name
                </Button>
              ) : null}
              <Button
                disabled={pending}
                onClick={() => setStep(3)}
                variant="secondary"
              >
                Back
              </Button>
            </div>
          </section>
        </section>
      ) : null}
    </OnboardingShell>
  );
}

function OnboardingShell({
  children,
  step,
}: {
  readonly children: ReactNode;
  readonly step?: Step;
}) {
  return (
    <main className="fc-onboarding-shell">
      <header className="fc-onboarding-topbar">
        <p className="fc-onboarding-wordmark">FOUNDERCHATTERS</p>
        <p className="fc-onboarding-progress">
          {step ? `STEP ${String(step)} OF 4` : 'FC'}
        </p>
      </header>
      {children}
    </main>
  );
}

function OnboardingHero({
  copy,
  headingRef,
  id,
  kicker,
  step,
  title,
}: {
  readonly copy: string;
  readonly headingRef: { current: HTMLHeadingElement | null };
  readonly id: string;
  readonly kicker?: string;
  readonly step: Step;
  readonly title: string;
}) {
  return (
    <section className="fc-onboarding-hero">
      <p className="fc-onboarding-step-label">
        {kicker ?? `STEP ${String(step)} OF 4`}
      </p>
      <h1 id={id} ref={headingRef} tabIndex={-1}>
        {title}
      </h1>
      <p>{copy}</p>
    </section>
  );
}

function OnboardingActions({
  onSecondary,
  pending,
  primary,
  secondary,
}: {
  readonly onSecondary: () => void;
  readonly pending: boolean;
  readonly primary: string;
  readonly secondary: string;
}) {
  return (
    <div className="fc-onboarding-actions">
      <Button disabled={pending} type="submit">
        {pending ? 'Saving…' : primary}
      </Button>
      <Button disabled={pending} onClick={onSecondary} variant="secondary">
        {secondary}
      </Button>
    </div>
  );
}

function TopicChips({
  labelledBy,
  onToggle,
  selected,
  topics,
}: {
  readonly labelledBy: string;
  readonly onToggle: (id: string) => void;
  readonly selected: string[];
  readonly topics: OnboardingTopicRef[];
}) {
  return (
    <div
      aria-labelledby={labelledBy}
      className="fc-onboarding-chips"
      role="group"
    >
      {topics.map((topic) => {
        const isSelected = selected.includes(topic.id);
        return (
          <button
            aria-pressed={isSelected}
            className="fc-onboarding-chip"
            data-selected={isSelected}
            key={topic.id}
            onClick={() => onToggle(topic.id)}
            type="button"
          >
            <span>{topic.label}</span>
            <span className="sr-only">
              {isSelected ? 'selected' : 'not selected'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
