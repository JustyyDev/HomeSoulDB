const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const issueBody = process.env.ISSUE_BODY || '';
const catalogPath = path.join(__dirname, '../data/catalog.json');

function extractField(body, fieldName) {
  const regex = new RegExp(`### ${fieldName}\\s*\\n\\s*([\\s\\S]*?)(?=\\n###|$)`, 'i');
  const match = body.match(regex);
  return match ? match[1].trim() : '';
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

  const errors = [];
  if (!modId) errors.push("Mod ID is missing or contains invalid characters.");
  if (!title) errors.push("Mod Title is required.");

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

  const newEntry = {
    modId,
    title,
    status,
    isWIP,
    author,
    description,
    version,
    category,
    downloadUrl: downloadUrl || '',
    teaserUrl: teaserUrl || '',
    bannerUrl: bannerUrl || '',
    bumpCount: 0,
    streamerScore: 1.0,
    lastBumped: Math.floor(Date.now() / 1000),
    tags
  };

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