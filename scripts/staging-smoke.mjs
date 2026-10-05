import {
  assertNoSecretLeak,
  createSmokeAbortSignal,
  evaluateSmokeRequestFailure,
  evaluateSmokeStatus,
  evaluateSmokeTargets,
  formatReadinessReport,
  SMOKE_EXPECTED_STATUSES,
} from './staging-readiness.mjs';

function parseArgs(argv) {
  const options = {
    webUrl: process.env.WEB_URL ?? '',
    apiUrl: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '',
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--web-url') {
      options.webUrl = argv[index + 1] ?? '';
      index += 1;
    } else if (argument === '--api-url') {
      options.apiUrl = argv[index + 1] ?? '';
      index += 1;
    } else if (argument === '--dry-run') {
      options.dryRun = true;
    }
  }
  return options;
}

async function checkUrl(url, pathname) {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: createSmokeAbortSignal(),
    });
    const verdict = evaluateSmokeStatus(pathname, response.status);
    if (!verdict.ok) {
      throw new Error(verdict.message);
    }
  } catch (error) {
    if (error instanceof Error && SMOKE_EXPECTED_STATUSES[pathname] !== undefined) {
      if (error.message.includes('returned') || error.message.includes('not part')) {
        throw error;
      }
    }
    const failure = evaluateSmokeRequestFailure(error, pathname);
    throw new Error(failure.message);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targets = evaluateSmokeTargets({
    webUrl: options.webUrl,
    apiUrl: options.apiUrl,
  });
  const report = formatReadinessReport(targets);
  assertNoSecretLeak(report);
  if (!targets.ok) {
    console.error(report);
    process.exitCode = 1;
    return;
  }
  if (options.dryRun) {
    console.log(
      'Staging smoke targets are valid. Dry run only; no remote requests were sent.',
    );
    return;
  }

  const web = options.webUrl.replace(/\/$/, '');
  const api = options.apiUrl.replace(/\/$/, '');
  const webPaths = ['/', '/signin', '/signup', '/support'];
  await Promise.all([
    ...webPaths.map((path) => checkUrl(`${web}${path}`, path)),
    checkUrl(`${api}/v1/health/live`, '/v1/health/live'),
    checkUrl(`${api}/v1/health/ready`, '/v1/health/ready'),
  ]);
  console.log(
    `Automated safe staging smoke passed (${Object.keys(SMOKE_EXPECTED_STATUSES).length} exact 200 checks).`,
  );
}

try {
  await main();
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Staging smoke failed.';
  console.error(message);
  process.exitCode = 1;
}
