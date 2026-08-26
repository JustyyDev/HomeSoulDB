const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const issueBody = process.env.ISSUE_BODY || '';
const catalogPath = path.join(__dirname, '../data/catalog.json');
const schemaPath = path.join(__dirname, '../data/catalog.schema.json');
const moderationPath = path.join(__dirname, '../data/moderation.json');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

const catalogSchema = readJson(schemaPath, null);
const moderation = readJson(moderationPath, {
  reservedUsernames: ['admin', 'JustyTCCD', 'moderator', 'system'],
  blockedTerms: ['slur', 'hate', 'nazi'],
  billboardMaxLength: 84,
  usernameMinLength: 2,
  usernameMaxLength: 18
});

function extractField(body, fieldName) {
  const regex = new RegExp(`### ${fieldName}\\s*\\n\\s*([\\s\\S]*?)(?=\\n###|$)`, 'i');
  const match = body.match(regex);
  return match ? match[1].trim() : '';
}

function isChecked(sectionText, label) {
  if (!sectionText) return false;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`- \\[x\\] ${escaped}`, 'i').test(sectionText);
}

function containsBlockedTerm(value) {
  const lower = (value || '').toLowerCase();
  return (moderation.blockedTerms || []).find(term => term && lower.includes(term.toLowerCase())) || null;
}

function sanitizeUsername(value) {
  return (value || '')
    .trim()
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .slice(0, moderation.usernameMaxLength || 18);
}

function sanitizeText(value, maxLength) {
  return (value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function validateCatalogEntry(entry) {
  if (!catalogSchema || !catalogSchema.items || !catalogSchema.items.required) return [];
  const errors = [];
  for (const key of catalogSchema.items.required) {
    if (entry[key] === undefined || entry[key] === null || entry[key] === '') {
      errors.push(`Missing required catalog field: ${key}`);
    }
  }
  if (entry.boothText && entry.boothText.length > (moderation.billboardMaxLength || 84)) {
    errors.push('HomeSoul Cove billboard text is too long.');
  }
  return errors;
}

async function verifyUrl(url) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve(true);
        } else {
          resolve(false);
        }
      }).on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

async function run() {
  const modId = extractField(issueBody, 'Unique Mod ID').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const title = extractField(issueBody, 'Mod Title');
  const status = extractField(issueBody, 'Project Status') || 'Released (Playable)';
  const author = extractField(issueBody, 'Author / Team Name');
  const description = extractField(issueBody, 'Mod Description / Teaser Summary');
  const version = extractField(issueBody, 'Version') || '0.1.0';
  let downloadUrl = extractField(issueBody, 'Direct Download URL \\(.zip\\) \\[Optional for WIP\\]');
  const teaserUrl = extractField(issueBody, 'Teaser / Video / Social Link \\[Optional\\]');
  const bannerUrl = extractField(issueBody, 'Thumbnail / Concept Art Banner URL');
  const category = extractField(issueBody, 'Primary Category') || 'Custom Weeks';
  const rawTags = extractField(issueBody, 'Tags \\(Comma Separated\\)');
  const boothText = extractField(issueBody, 'HomeSoul Cove Billboard Text');
  const avatarShowcase = extractField(issueBody, 'Avatar / Character Showcase Support');
  const coveFeatures = extractField(issueBody, 'HomeSoul Cove Multiplayer Hooks');
  const compatibleModesRaw = extractField(issueBody, 'Compatible Modes \\(Comma Separated\\)');

  const errors = [];
  if (!modId) errors.push("Mod ID is missing or contains invalid characters.");
  if (!title) errors.push("Mod Title is required.");

  const cleanAuthor = sanitizeUsername(author);
  const cleanTitle = sanitizeText(title, 48);
  const cleanBoothText = sanitizeText(boothText, moderation.billboardMaxLength || 84);

  if (cleanAuthor.length < (moderation.usernameMinLength || 2)) {
    errors.push('Author / Team Name is too short for HomeSoul Cove listings.');
  }
  if ((moderation.reservedUsernames || []).map(v => v.toLowerCase()).includes(cleanAuthor.toLowerCase())) {
    errors.push(`Author / Team Name uses a reserved marketplace identity: ${cleanAuthor}`);
  }

  const blockedAuthor = containsBlockedTerm(cleanAuthor);
  const blockedTitle = containsBlockedTerm(cleanTitle);
  const blockedBoothText = containsBlockedTerm(cleanBoothText);
  if (blockedAuthor) errors.push(`Author / Team Name contains blocked term: ${blockedAuthor}`);
  if (blockedTitle) errors.push(`Mod Title contains blocked term: ${blockedTitle}`);
  if (blockedBoothText) errors.push(`HomeSoul Cove billboard text contains blocked term: ${blockedBoothText}`);

  if (downloadUrl.toLowerCase() === 'n/a' || downloadUrl.toLowerCase() === 'none') {
    downloadUrl = '';
  }

  const isWIP = status.includes('WIP') || status.includes('Concept');

  // Only validate download URL if it's marked as playable/released or if a link is provided
  if (!isWIP && (!downloadUrl || !downloadUrl.endsWith('.zip'))) {
    errors.push("Playable / Released mods must provide a direct `.zip` download link.");
  }

  if (downloadUrl && downloadUrl.endsWith('.zip')) {
    const isUrlLive = await verifyUrl(downloadUrl);
    if (!isUrlLive) errors.push(`The download URL could not be reached: ${downloadUrl}`);
  }

  if (errors.length > 0) {
    console.error("VALIDATION_FAILED:\n" + errors.join("\n"));
    process.exit(1);
  }

  let catalog = [];
  if (fs.existsSync(catalogPath)) {
    try {
      catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    } catch {
      catalog = [];
    }
  }

  const tags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];
  if (isWIP && !tags.includes('WIP')) {
    tags.unshift('WIP');
  }

  const compatibleModes = compatibleModesRaw
    ? compatibleModesRaw.split(',').map(v => sanitizeText(v, 32)).filter(Boolean)
    : ['singleplayer', 'plaza-multiplayer'];

  const newEntry = {
    modId,
    title: cleanTitle,
    status,
    isWIP,
    author: cleanAuthor,
    description,
    version,
    category,
    downloadUrl: downloadUrl || '',
    teaserUrl: teaserUrl || '',
    bannerUrl: bannerUrl || '',
    bumpCount: 0,
    streamerScore: 1.0,
    lastBumped: Math.floor(Date.now() / 1000),
    tags,
    boothText: cleanBoothText,
    boothTheme: 'homebrew',
    compatibleModes,
    supportsTextChat: isChecked(coveFeatures, 'Text chat compatible'),
    supportsVoiceChat: isChecked(coveFeatures, 'Voice chat room compatible'),
    supportsAvatarShowcase: /^yes/i.test(avatarShowcase),
    supportsJamShowcase: isChecked(coveFeatures, 'Fits game jam or mod jam exhibition spaces')
  };

  errors.push(...validateCatalogEntry(newEntry));

  const existingIdx = catalog.findIndex(m => m.modId === modId);
  if (existingIdx >= 0) {
    newEntry.bumpCount = catalog[existingIdx].bumpCount || 0;
    newEntry.streamerScore = catalog[existingIdx].streamerScore || 1.0;
    catalog[existingIdx] = newEntry;
  } else {
    catalog.push(newEntry);
  }

  catalog.sort((a, b) => (b.bumpCount * 2.0 + b.streamerScore) - (a.bumpCount * 2.0 + a.streamerScore));

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`Successfully compiled "${title}" (${modId}) [${status}] into HomeSoulDB!`);
}

run();