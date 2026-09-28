import {
  AdminShell,
  Button,
  ContributionCard,
  Field,
  FounderCard,
  MarketingShell,
  MemberShell,
  RequestCard,
  RequestContext,
} from '@founderchatters/ui';
import { notFound } from 'next/navigation';

const views = ['admin', 'marketing', 'member', 'primitives'] as const;
type View = (typeof views)[number];

export function generateStaticParams() {
  return views.map((view) => ({ view }));
}

function Surface() {
  return (
    <section style={{ display: 'grid', gap: 24 }}>
      <p className="fc-label">Shell verification surface</p>
      <h1 className="fc-h1" style={{ margin: 0 }}>
        Founder-to-founder support
      </h1>
      <p className="fc-body" style={{ maxWidth: 620 }}>
        A neutral content region used only to verify the reusable shell. Feature
        pages begin in later tasks.
      </p>
    </section>
  );
}

function Primitives() {
  return (
    <main
      style={{
        display: 'grid',
        gap: 40,
        margin: '0 auto',
        maxWidth: 1100,
        padding: 48,
      }}
    >
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button disabled>Disabled</Button>
      </section>
      <section style={{ display: 'grid', gap: 24 }}>
        <Field
          hint="We will use this for account updates."
          label="Email"
          placeholder="you@company.com"
        />
        <Field
          error="Please add a little more detail."
          fieldType="textarea"
          label="How can founders help?"
        />
      </section>
      <RequestCard>
        <h2 className="fc-title">Looking for practical onboarding advice</h2>
        <p className="fc-small">SaaS · Early stage · Product</p>
      </RequestCard>
      <FounderCard>
        <h2 className="fc-title">Maya Chen</h2>
        <p className="fc-small">Founder at Northstar Labs · Singapore</p>
      </FounderCard>
      <RequestContext>
        <strong>Request context</strong>
        <p>Advice on improving first-week activation.</p>
      </RequestContext>
      <ContributionCard>
        <p className="fc-label">Contribution</p>
        <h2 className="fc-title">Product onboarding</h2>
        <p>Helpful guidance confirmed by the requester.</p>
      </ContributionCard>
    </main>
  );
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  // FC-004 visual verification surface: never expose it as a production route.
  if (process.env.NODE_ENV !== 'development') notFound();

  const { view } = await params;
  if (!views.includes(view as View)) notFound();
  if (view === 'member')
    return (
      <MemberShell>
        <Surface />
      </MemberShell>
    );
  if (view === 'marketing')
    return (
      <MarketingShell>
        <Surface />
      </MarketingShell>
    );
  if (view === 'admin')
    return (
      <AdminShell>
        <Surface />
      </AdminShell>
    );
  return <Primitives />;
}
