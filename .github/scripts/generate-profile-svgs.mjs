import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const GENERATED_DIR = path.join(ROOT_DIR, 'assets', 'generated');
const README_PATH = path.join(ROOT_DIR, 'README.md');

const USERNAME = process.env.GITHUB_USERNAME || 'cyberneticx-sketch';
const TOKEN = process.env.GITHUB_TOKEN || '';
const OFFLINE_PREVIEW = process.argv.includes('--offline-preview');

const THEMES = {
  dark: {
    canvas: '#0D1117',
    surface: '#131924',
    pillBg: '#0D1117',
    border: '#2A3448',
    divider: '#212B3B',
    grid: '#4568DC',
    gridOpacity: '0.08',
    auroraStart: '#B06AB3',
    auroraMid: '#7B6CE6',
    auroraEnd: '#4568DC',
    cyan: '#67E8F9',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    textMuted: '#6E7681',
    barTrack: '#1E2736',
  },
  light: {
    canvas: '#F8FAFC',
    surface: '#FFFFFF',
    pillBg: '#F1F5F9',
    border: '#D0D7DE',
    divider: '#E2E8F0',
    grid: '#4568DC',
    gridOpacity: '0.06',
    auroraStart: '#9E4FA3',
    auroraMid: '#6355D8',
    auroraEnd: '#3B5BDB',
    cyan: '#0E7490',
    textPrimary: '#1F2328',
    textSecondary: '#57606A',
    textMuted: '#6E7781',
    barTrack: '#E2E8F0',
  },
};

const LANG_COLORS = {
  TypeScript: '#3178C6',
  JavaScript: '#EAB308',
  HTML: '#E34C26',
  CSS: '#7B6CE6',
  SCSS: '#C6538C',
  Java: '#B07219',
  Python: '#3572A5',
  Shell: '#3FB950',
  SQL: '#0EA5E9',
  PHP: '#6366F1',
  Vue: '#41B883',
  Svelte: '#FF3E00',
  Go: '#00ADD8',
  Rust: '#DEA584',
  C: '#555555',
  'C++': '#F34B7D',
  'C#': '#178600',
};

const FALLBACK_PROJECTS = [
  {
    name: 'Interactive UI Systems',
    description:
      'Component-driven React, Next.js & Tailwind CSS interfaces built with accessibility, speed, and design-system discipline.',
    language: 'TypeScript',
    languageColor: '#3178C6',
    badge: 'FRONTEND',
    url: `https://github.com/${USERNAME}?tab=repositories`,
    isPlaceholder: true,
    stars: 0,
    forks: 0,
  },
  {
    name: 'Full-Stack Web Builds',
    description:
      'End-to-end prototypes and web applications combining modern frontends with Node.js APIs, MongoDB, and MySQL.',
    language: 'Node.js',
    languageColor: '#3FB950',
    badge: 'FULL-STACK',
    url: `https://github.com/${USERNAME}?tab=repositories`,
    isPlaceholder: true,
    stars: 0,
    forks: 0,
  },
];

const FALLBACK_LANGUAGES = [
  { name: 'TypeScript', pct: 34, color: '#3178C6' },
  { name: 'JavaScript', pct: 26, color: '#EAB308' },
  { name: 'CSS / Tailwind', pct: 18, color: '#7B6CE6' },
  { name: 'HTML', pct: 12, color: '#E34C26' },
  { name: 'Java / SQL', pct: 10, color: '#B07219' },
];

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatNumber(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

function wrapText(text, maxChars = 48, maxLines = 2) {
  const clean = String(text || 'No description provided yet.').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (lines.length === maxLines) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] =
          last.length >= maxChars ? `${last.slice(0, maxChars - 1).trimEnd()}…` : `${last}…`;
        return lines;
      }
      current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines.length ? lines : ['No description provided yet.'];
}

function defaultRepoDescription(language, updatedAt) {
  const langLabel = language && language !== 'Code' ? `${language} project` : 'Public repository';
  const month = updatedAt ? String(updatedAt).slice(0, 7) : '';
  return month
    ? `${langLabel} on GitHub · Last updated ${month}.`
    : `${langLabel} built by ${USERNAME}.`;
}

function truncateText(text, maxChars = 34) {
  const clean = String(text || '').trim();
  return clean.length > maxChars ? `${clean.slice(0, maxChars - 1)}…` : clean;
}

async function fetchJson(url, options = {}) {
  const headers = {
    'User-Agent': 'cyberneticx-sketch-profile-generator',
    Accept: 'application/vnd.github+json',
    ...options.headers,
  };
  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

async function fetchGraphQLData() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        followers { totalCount }
        contributionsCollection {
          contributionCalendar { totalContributions }
        }
        pinnedItems(first: 4, types: REPOSITORY) {
          nodes {
            ... on Repository {
              name
              description
              url
              stargazerCount
              forkCount
              isFork
              updatedAt
              primaryLanguage { name color }
            }
          }
        }
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: UPDATED_AT, direction: DESC }) {
          totalCount
          nodes {
            name
            description
            url
            stargazerCount
            forkCount
            isFork
            updatedAt
            primaryLanguage { name color }
            languages(first: 8, orderBy: { field: SIZE, direction: DESC }) {
              edges {
                size
                node { name color }
              }
            }
          }
        }
      }
    }
  `;

  const payload = await fetchJson('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });

  if (payload.errors?.length) {
    throw new Error(`GraphQL errors: ${payload.errors.map((e) => e.message).join('; ')}`);
  }

  const user = payload.data?.user;
  if (!user) throw new Error(`User ${USERNAME} not found via GraphQL`);

  const allRepos = user.repositories?.nodes || [];
  const totalStars = allRepos.reduce((sum, r) => sum + (r.stargazerCount || 0), 0);
  const totalForks = allRepos.reduce((sum, r) => sum + (r.forkCount || 0), 0);

  const langTotals = new Map();
  for (const repo of allRepos) {
    if (repo.name.toLowerCase() === USERNAME.toLowerCase()) continue;
    for (const edge of repo.languages?.edges || []) {
      const name = edge.node?.name;
      if (!name) continue;
      const prev = langTotals.get(name) || { bytes: 0, color: edge.node.color || LANG_COLORS[name] || '#7B6CE6' };
      prev.bytes += edge.size || 0;
      langTotals.set(name, prev);
    }
  }

  const pinned = (user.pinnedItems?.nodes || [])
    .filter((r) => r && !r.isFork && r.name.toLowerCase() !== USERNAME.toLowerCase())
    .map((r) => ({
      name: r.name,
      description: r.description || defaultRepoDescription(r.primaryLanguage?.name, r.updatedAt),
      url: r.url,
      stars: r.stargazerCount || 0,
      forks: r.forkCount || 0,
      language: r.primaryLanguage?.name || 'Code',
      languageColor: r.primaryLanguage?.color || LANG_COLORS[r.primaryLanguage?.name] || '#7B6CE6',
      badge: 'PINNED',
      isPlaceholder: false,
    }));

  const otherRepos = allRepos
    .filter((r) => r.name.toLowerCase() !== USERNAME.toLowerCase() && !pinned.some((p) => p.name === r.name))
    .sort((a, b) => (b.stargazerCount * 3 + b.forkCount * 2) - (a.stargazerCount * 3 + a.forkCount * 2))
    .map((r) => ({
      name: r.name,
      description: r.description || defaultRepoDescription(r.primaryLanguage?.name, r.updatedAt),
      url: r.url,
      stars: r.stargazerCount || 0,
      forks: r.forkCount || 0,
      language: r.primaryLanguage?.name || 'Code',
      languageColor: r.primaryLanguage?.color || LANG_COLORS[r.primaryLanguage?.name] || '#7B6CE6',
      badge: 'PUBLIC',
      isPlaceholder: false,
    }));

  const featuredProjects = [...pinned, ...otherRepos].slice(0, 4);

  return {
    source: 'graphql',
    publicRepos: user.repositories?.totalCount ?? allRepos.length,
    totalStars,
    totalForks,
    followers: user.followers?.totalCount ?? 0,
    contributions: user.contributionsCollection?.contributionCalendar?.totalContributions ?? null,
    languages: normalizeLanguages(langTotals),
    projects: featuredProjects.length > 0 ? featuredProjects : FALLBACK_PROJECTS,
    hasRealProjects: featuredProjects.length > 0,
  };
}

async function fetchRestData() {
  const user = await fetchJson(`https://api.github.com/users/${USERNAME}`);
  const repos = await fetchJson(
    `https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=updated&type=owner`
  );

  const nonForkRepos = (Array.isArray(repos) ? repos : []).filter((r) => !r.fork);
  const totalStars = nonForkRepos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const totalForks = nonForkRepos.reduce((sum, r) => sum + (r.forks_count || 0), 0);

  const projectRepos = nonForkRepos.filter((r) => r.name.toLowerCase() !== USERNAME.toLowerCase());

  const langTotals = new Map();
  for (const repo of projectRepos.slice(0, 12)) {
    try {
      const repoLangs = await fetchJson(repo.languages_url);
      for (const [lang, bytes] of Object.entries(repoLangs)) {
        const prev = langTotals.get(lang) || { bytes: 0, color: LANG_COLORS[lang] || '#7B6CE6' };
        prev.bytes += Number(bytes) || 0;
        langTotals.set(lang, prev);
      }
    } catch {
      if (repo.language) {
        const prev = langTotals.get(repo.language) || {
          bytes: 0,
          color: LANG_COLORS[repo.language] || '#7B6CE6',
        };
        prev.bytes += 1;
        langTotals.set(repo.language, prev);
      }
    }
  }

  const featuredProjects = [...projectRepos]
    .sort((a, b) => (b.stargazers_count * 3 + b.forks_count * 2) - (a.stargazers_count * 3 + a.forks_count * 2))
    .slice(0, 4)
    .map((r) => ({
      name: r.name,
      description: r.description || defaultRepoDescription(r.language, r.updated_at),
      url: r.html_url,
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      language: r.language || 'Code',
      languageColor: LANG_COLORS[r.language] || '#7B6CE6',
      badge: 'PUBLIC',
      isPlaceholder: false,
    }));

  return {
    source: 'rest',
    publicRepos: user.public_repos ?? nonForkRepos.length,
    totalStars,
    totalForks,
    followers: user.followers ?? 0,
    contributions: null,
    languages: normalizeLanguages(langTotals),
    projects: featuredProjects.length > 0 ? featuredProjects : FALLBACK_PROJECTS,
    hasRealProjects: featuredProjects.length > 0,
  };
}

function normalizeLanguages(langTotals) {
  const entries = [...langTotals.entries()]
    .filter(([, v]) => v.bytes > 0)
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 5);

  const totalBytes = entries.reduce((sum, [, v]) => sum + v.bytes, 0);
  if (!totalBytes) {
    return { items: FALLBACK_LANGUAGES, isFallback: true };
  }

  const raw = entries.map(([name, info]) => ({
    name,
    color: info.color,
    pct: Math.max(1, Math.round((info.bytes / totalBytes) * 100)),
  }));

  // Normalize rounding so segments sum cleanly to 100%
  const sum = raw.reduce((acc, item) => acc + item.pct, 0);
  if (raw.length > 0 && sum !== 100) {
    raw[0].pct = Math.max(1, raw[0].pct + (100 - sum));
  }

  return { items: raw, isFallback: false };
}

function getOfflineData() {
  return {
    source: 'offline-preview',
    publicRepos: 1,
    totalStars: 0,
    totalForks: 0,
    followers: 0,
    contributions: null,
    languages: { items: FALLBACK_LANGUAGES, isFallback: true },
    projects: FALLBACK_PROJECTS,
    hasRealProjects: false,
  };
}

function renderStatsSvg(data, mode) {
  const t = THEMES[mode];
  const thirdMetricLabel = data.contributions !== null ? 'CONTRIBUTIONS (1Y)' : 'TOTAL FORKS';
  const thirdMetricValue = data.contributions !== null ? formatNumber(data.contributions) : formatNumber(data.totalForks);
  const langHeading = data.languages.isFallback ? '// STACK FOCUS' : '// TOP LANGUAGES';

  const barX = 468;
  const barY = 70;
  const barWidth = 356;
  const barHeight = 10;

  let offset = 0;
  const segments = data.languages.items
    .map((lang, idx) => {
      const isLast = idx === data.languages.items.length - 1;
      const segW = isLast ? Math.max(4, barWidth - offset) : Math.max(4, Math.round((lang.pct / 100) * barWidth));
      const x = barX + offset;
      offset += segW;
      return `<rect x="${x}" y="${barY}" width="${segW}" height="${barHeight}" fill="${escapeXml(lang.color)}"/>`;
    })
    .join('\n      ');

  const legendItems = data.languages.items
    .map((lang, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 468 + col * 182;
      const y = 108 + row * 26;
      return `
  <circle cx="${x + 5}" cy="${y - 4}" r="4.2" fill="${escapeXml(lang.color)}"/>
  <text x="${x + 16}" y="${y}" class="sans" font-size="12.5" font-weight="500" fill="${t.textPrimary}">${escapeXml(truncateText(lang.name, 16))}</text>
  <text x="${x + 162}" y="${y}" text-anchor="end" class="mono" font-size="11.5" fill="${t.textSecondary}">${lang.pct}%</text>`;
    })
    .join('');

  const syncDate = new Date().toISOString().slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="196" viewBox="0 0 860 196" fill="none" role="img" aria-label="GitHub activity and metrics for ${escapeXml(USERNAME)}">
  <title>GitHub Activity &amp; Metrics for ${escapeXml(USERNAME)}</title>
  <defs>
    <linearGradient id="aurora" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${t.auroraStart}"/>
      <stop offset="52%" stop-color="${t.auroraMid}"/>
      <stop offset="100%" stop-color="${t.auroraEnd}"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${t.grid}" stroke-opacity="${t.gridOpacity}" stroke-width="1"/>
    </pattern>
    <clipPath id="cardClip">
      <rect x="1" y="1" width="858" height="194" rx="14"/>
    </clipPath>
    <clipPath id="barClip">
      <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="5"/>
    </clipPath>
  </defs>

  <style>
    .sans { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .mono { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  </style>

  <g clip-path="url(#cardClip)">
    <rect x="0" y="0" width="860" height="196" fill="${t.surface}"/>
    <rect x="0" y="0" width="860" height="196" fill="url(#grid)"/>
    <rect x="0" y="0" width="860" height="2.5" fill="url(#aurora)"/>
  </g>

  <rect x="1" y="1" width="858" height="194" rx="14" stroke="${t.border}" stroke-width="1.1"/>

  <!-- Left Panel: KPI Metrics -->
  <text x="32" y="34" class="mono" font-size="11" font-weight="600" letter-spacing="1.4" fill="${t.cyan}">05 // GITHUB METRICS</text>
  <text x="412" y="34" text-anchor="end" class="mono" font-size="10.5" fill="${t.textMuted}">@${escapeXml(USERNAME)}</text>

  <!-- KPI Grid (2x2) -->
  <rect x="32" y="50" width="182" height="56" rx="10" fill="${t.canvas}" stroke="${t.border}" stroke-width="1"/>
  <text x="46" y="70" class="mono" font-size="10" letter-spacing="0.8" fill="${t.textMuted}">PUBLIC REPOS</text>
  <text x="46" y="95" class="sans" font-size="22" font-weight="700" fill="${t.textPrimary}">${escapeXml(formatNumber(data.publicRepos))}</text>

  <rect x="228" y="50" width="184" height="56" rx="10" fill="${t.canvas}" stroke="${t.border}" stroke-width="1"/>
  <text x="242" y="70" class="mono" font-size="10" letter-spacing="0.8" fill="${t.textMuted}">TOTAL STARS</text>
  <text x="242" y="95" class="sans" font-size="22" font-weight="700" fill="${t.textPrimary}">${escapeXml(formatNumber(data.totalStars))}</text>

  <rect x="32" y="118" width="182" height="56" rx="10" fill="${t.canvas}" stroke="${t.border}" stroke-width="1"/>
  <text x="46" y="138" class="mono" font-size="10" letter-spacing="0.8" fill="${t.textMuted}">${escapeXml(thirdMetricLabel)}</text>
  <text x="46" y="163" class="sans" font-size="22" font-weight="700" fill="${t.textPrimary}">${escapeXml(thirdMetricValue)}</text>

  <rect x="228" y="118" width="184" height="56" rx="10" fill="${t.canvas}" stroke="${t.border}" stroke-width="1"/>
  <text x="242" y="138" class="mono" font-size="10" letter-spacing="0.8" fill="${t.textMuted}">FOLLOWERS</text>
  <text x="242" y="163" class="sans" font-size="22" font-weight="700" fill="${t.textPrimary}">${escapeXml(formatNumber(data.followers))}</text>

  <!-- Vertical Panel Divider -->
  <line x1="440" y1="22" x2="440" y2="174" stroke="${t.border}" stroke-width="1" stroke-dasharray="3 3"/>

  <!-- Right Panel: Language Mix -->
  <text x="468" y="34" class="mono" font-size="11" font-weight="600" letter-spacing="1.4" fill="${t.auroraStart}">${escapeXml(langHeading)}</text>
  <text x="824" y="34" text-anchor="end" class="mono" font-size="10" fill="${t.textMuted}">SYNCED ${escapeXml(syncDate)}</text>

  <text x="468" y="57" class="sans" font-size="12" fill="${t.textSecondary}">${
    data.languages.isFallback
      ? 'Core stack profile (auto-updates as public code repos grow)'
      : 'Calculated across non-fork public repositories'
  }</text>

  <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="5" fill="${t.barTrack}"/>
  <g clip-path="url(#barClip)">
      ${segments}
  </g>
${legendItems}
</svg>
`;
}

function renderProjectCardSvg(project, index, mode) {
  const t = THEMES[mode];
  const lines = wrapText(project.description, 47, 2);
  const title = truncateText(project.name, 34);
  const badgeText = truncateText(project.badge || 'PUBLIC', 12);
  const idxLabel = `0${index + 1}`;

  const starCount = formatNumber(project.stars);
  const forkCount = formatNumber(project.forks);
  const forkTextX = 394;
  const forkIconX = forkTextX - forkCount.length * 7 - 16;
  const starTextX = forkIconX - 12;
  const starIconX = starTextX - starCount.length * 7 - 16;

  const footerMeta = project.isPlaceholder
    ? `<text x="380" y="135" text-anchor="end" class="mono" font-size="10.5" fill="${t.cyan}">Explore repos</text>
  <path d="M 385 131 L 394 131 M 390.5 127.5 L 394 131 L 390.5 134.5" stroke="${t.cyan}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<g fill="none" stroke="${t.textSecondary}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M ${starIconX + 6} 125.2 L ${starIconX + 7.7} 128.7 L ${starIconX + 11.6} 129.3 L ${starIconX + 8.8} 132 L ${starIconX + 9.4} 135.8 L ${starIconX + 6} 134 L ${starIconX + 2.6} 135.8 L ${starIconX + 3.2} 132 L ${starIconX + 0.4} 129.3 L ${starIconX + 4.3} 128.7 Z"/>
    <circle cx="${forkIconX + 3}" cy="127" r="1.5"/>
    <circle cx="${forkIconX + 9}" cy="127" r="1.5"/>
    <circle cx="${forkIconX + 6}" cy="135" r="1.5"/>
    <path d="M ${forkIconX + 3} 128.5 C ${forkIconX + 3} 131.5 ${forkIconX + 6} 131 ${forkIconX + 6} 133.5 M ${forkIconX + 9} 128.5 C ${forkIconX + 9} 131.5 ${forkIconX + 6} 131 ${forkIconX + 6} 133.5"/>
  </g>
  <text x="${starTextX}" y="135" text-anchor="end" class="mono" font-size="11" fill="${t.textSecondary}">${escapeXml(starCount)}</text>
  <text x="${forkTextX}" y="135" text-anchor="end" class="mono" font-size="11" fill="${t.textSecondary}">${escapeXml(forkCount)}</text>`;

  const descLine2 = lines[1]
    ? `\n  <text x="24" y="102" class="sans" font-size="12.5" fill="${t.textSecondary}">${escapeXml(lines[1])}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="156" viewBox="0 0 420 156" fill="none" role="img" aria-label="${escapeXml(project.name)}">
  <title>${escapeXml(project.name)}</title>
  <defs>
    <linearGradient id="aurora" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${t.auroraStart}"/>
      <stop offset="52%" stop-color="${t.auroraMid}"/>
      <stop offset="100%" stop-color="${t.auroraEnd}"/>
    </linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="${t.grid}" stroke-opacity="${t.gridOpacity}" stroke-width="1"/>
    </pattern>
    <clipPath id="projClip">
      <rect x="1" y="1" width="418" height="154" rx="13"/>
    </clipPath>
  </defs>

  <style>
    .sans { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .mono { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  </style>

  <g clip-path="url(#projClip)">
    <rect x="0" y="0" width="420" height="156" fill="${t.surface}"/>
    <rect x="0" y="0" width="420" height="156" fill="url(#grid)"/>
    <rect x="0" y="0" width="420" height="2.5" fill="url(#aurora)"/>
  </g>

  <rect x="1" y="1" width="418" height="154" rx="13" stroke="${t.border}" stroke-width="1.1"/>

  <!-- Top Row: Index and Badge -->
  <text x="24" y="30" class="mono" font-size="10.5" font-weight="600" letter-spacing="1.2" fill="${t.cyan}">SKETCH // ${idxLabel}</text>
  <rect x="312" y="16" width="84" height="20" rx="10" fill="${t.pillBg}" stroke="${t.border}" stroke-width="1"/>
  <text x="354" y="29.5" text-anchor="middle" class="mono" font-size="9.5" font-weight="600" letter-spacing="0.6" fill="${t.auroraStart}">${escapeXml(badgeText)}</text>

  <!-- Repo or Showcase Name -->
  <text x="24" y="58" class="sans" font-size="15.5" font-weight="700" fill="${t.textPrimary}">${escapeXml(title)}</text>

  <!-- Description (2 lines max) -->
  <text x="24" y="83" class="sans" font-size="12.5" fill="${t.textSecondary}">${escapeXml(lines[0] || '')}</text>${descLine2}

  <!-- Bottom Divider and Meta -->
  <line x1="24" y1="116" x2="396" y2="116" stroke="${t.divider}" stroke-width="1"/>
  <circle cx="30" cy="131" r="4.5" fill="${escapeXml(project.languageColor || t.auroraMid)}"/>
  <text x="42" y="135" class="mono" font-size="11" font-weight="500" fill="${t.textPrimary}">${escapeXml(truncateText(project.language || 'Code', 20))}</text>
  ${footerMeta}
</svg>
`;
}

function buildProjectsMarkdown(projects) {
  const cards = projects.map((project, idx) => {
    const num = idx + 1;
    const alt = escapeXml(`${project.name} — ${project.language || 'Project'}`);
    return [
      `  <a href="${project.url}">`,
      `    <picture>`,
      `      <source media="(prefers-color-scheme: dark)" srcset="./assets/generated/project-${num}-dark.svg" />`,
      `      <source media="(prefers-color-scheme: light)" srcset="./assets/generated/project-${num}-light.svg" />`,
      `      <img src="./assets/generated/project-${num}-light.svg" width="416" alt="${alt}" />`,
      `    </picture>`,
      `  </a>`,
    ].join('\n');
  });

  return `<p align="center">\n${cards.join('\n')}\n</p>`;
}

async function syncReadmeProjects(projects) {
  const content = await readFile(README_PATH, 'utf8');
  const startMarker = '<!-- PROJECTS:START -->';
  const endMarker = '<!-- PROJECTS:END -->';
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('Could not find valid <!-- PROJECTS:START --> / <!-- PROJECTS:END --> markers in README.md');
  }

  const block = buildProjectsMarkdown(projects);
  const updated =
    content.slice(0, startIdx + startMarker.length) +
    '\n' +
    block +
    '\n' +
    content.slice(endIdx);

  if (updated !== content) {
    await writeFile(README_PATH, updated, 'utf8');
  }
}

async function cleanStaleProjectSvgs(activeCount) {
  const files = await readdir(GENERATED_DIR).catch(() => []);
  for (const file of files) {
    const match = /^project-(\d+)-(dark|light)\.svg$/.exec(file);
    if (match && Number(match[1]) > activeCount) {
      await rm(path.join(GENERATED_DIR, file), { force: true });
    }
  }
}

async function main() {
  let data;
  if (OFFLINE_PREVIEW) {
    console.log('Running in --offline-preview mode with deterministic fallback data.');
    data = getOfflineData();
  } else if (TOKEN) {
    try {
      data = await fetchGraphQLData();
    } catch (err) {
      console.warn(`GraphQL fetch failed (${err.message}); falling back to GitHub REST API.`);
      data = await fetchRestData();
    }
  } else {
    data = await fetchRestData();
  }

  await mkdir(GENERATED_DIR, { recursive: true });
  await cleanStaleProjectSvgs(data.projects.length);

  await writeFile(path.join(GENERATED_DIR, 'stats-dark.svg'), renderStatsSvg(data, 'dark'), 'utf8');
  await writeFile(path.join(GENERATED_DIR, 'stats-light.svg'), renderStatsSvg(data, 'light'), 'utf8');

  for (let i = 0; i < data.projects.length; i += 1) {
    const num = i + 1;
    await writeFile(
      path.join(GENERATED_DIR, `project-${num}-dark.svg`),
      renderProjectCardSvg(data.projects[i], i, 'dark'),
      'utf8'
    );
    await writeFile(
      path.join(GENERATED_DIR, `project-${num}-light.svg`),
      renderProjectCardSvg(data.projects[i], i, 'light'),
      'utf8'
    );
  }

  await syncReadmeProjects(data.projects);

  console.log(
    `Generated stats and ${data.projects.length} project card pairs (${data.source}; realProjects=${data.hasRealProjects}) for @${USERNAME}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
