import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';

const ROOT = process.cwd();
const SOURCES_PATH = path.join(ROOT, 'scripts', 'news-sources.json');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');
const STATE_PATH = path.join(ROOT, 'data', 'news-state.json');

const DAILY_MIN = Number(process.env.DAILY_POST_MIN ?? '3');
const DAILY_MAX = Number(process.env.DAILY_POST_MAX ?? '5');
const PER_RUN_LIMIT = Number(process.env.PER_RUN_LIMIT ?? '2');
const MAX_CANDIDATE_AGE_HOURS = Number(process.env.MAX_CANDIDATE_AGE_HOURS ?? '48');
const AI_KEYWORDS = [
	'ai',
	'artificial intelligence',
	'llm',
	'model',
	'openai',
	'anthropic',
	'gemini',
	'chatgpt',
	'copilot',
	'prompt',
	'machine learning',
	'neural',
	'agent',
];

const parser = new Parser({
	customFields: {
		item: ['content:encoded', 'summary'],
	},
});

function toSlug(input) {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

function toIsoDate(value) {
	const date = value ? new Date(value) : new Date();
	if (Number.isNaN(date.getTime())) return new Date().toISOString();
	return date.toISOString();
}

function cleanText(value = '') {
	return value
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function pickSummary(item) {
	const candidates = [
		item.contentSnippet,
		item.summary,
		item.content,
		item['content:encoded'],
		item.title,
	]
		.map((part) => cleanText(part ?? ''))
		.filter(Boolean);
	return candidates[0] ?? 'Zu dieser Meldung liegen nur kurze Metadaten aus dem Feed vor.';
}

function isLikelyAiTopic(candidate) {
	const haystack = `${candidate.title} ${candidate.summary}`.toLowerCase();
	return AI_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

async function ensureDirectory(targetDir) {
	await fs.mkdir(targetDir, { recursive: true });
}

async function fileExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function loadJson(filePath, fallback) {
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}

async function saveJson(filePath, value) {
	await ensureDirectory(path.dirname(filePath));
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function listExistingSlugs() {
	const entries = await fs.readdir(BLOG_DIR, { withFileTypes: true });
	return new Set(
		entries
			.filter((entry) => entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')))
			.map((entry) => entry.name.replace(/\.(md|mdx)$/i, '')),
	);
}

async function fetchCandidates(sources) {
	const allItems = [];
	for (const source of sources) {
		try {
			const feed = await parser.parseURL(source.url);
			for (const item of feed.items ?? []) {
				allItems.push({
					sourceName: source.name,
					sourceUrl: source.url,
					title: cleanText(item.title ?? ''),
					link: item.link ?? '',
					pubDate: toIsoDate(item.isoDate ?? item.pubDate),
					summary: pickSummary(item),
				});
			}
		} catch (error) {
			console.warn(`[warn] Quelle konnte nicht geladen werden: ${source.name} (${source.url})`);
			console.warn(`[warn] ${String(error.message ?? error)}`);
		}
	}

	const cutoff = Date.now() - MAX_CANDIDATE_AGE_HOURS * 60 * 60 * 1000;
	return allItems
		.filter((item) => item.title && item.link)
		.filter((item) => isLikelyAiTopic(item))
		.filter((item) => new Date(item.pubDate).getTime() >= cutoff)
		.sort((a, b) => new Date(b.pubDate).valueOf() - new Date(a.pubDate).valueOf());
}

function renderArticle(candidate, articleDate) {
	const summary = candidate.summary.slice(0, 380);
	const headline = candidate.title;
	return `---
title: "${headline.replace(/"/g, '\\"')}"
description: "Automatischer KI-News-Update zu: ${headline.replace(/"/g, '\\"').slice(0, 110)}"
pubDate: ${articleDate}
tags:
  - ki-news
  - automation
sourceLinks:
  - "${candidate.link}"
  - "${candidate.sourceUrl}"
sourceNames:
  - "${candidate.sourceName.replace(/"/g, '\\"')}"
  - "Feed-Quelle"
aiGenerated: true
aiModel: "pipeline-v1"
---

## Was ist passiert?

${summary}

## Warum ist das relevant?

Die Meldung ist fuer die KI-Entwicklung relevant, weil sie direkten Einfluss auf Produkte, Modelle oder den Einsatz in Unternehmen haben kann. Die Einordnung erfolgt automatisiert anhand der Quelle, der Aktualitaet und der thematischen Passung.

## Auswirkungen in der Praxis

- Teams sollten pruefen, ob neue Funktionen oder API-Aenderungen bestehende Workflows betreffen.
- Produkt- und Marketing-Teams koennen die Meldung fuer strategische Entscheidungen nutzen.
- Entwickler sollten die Originalquelle lesen, bevor sie technische Annahmen uebernehmen.

## Einordnung

Dieser Beitrag wurde vollautomatisch erzeugt. Er dient als schneller Ueberblick fuer aktuelle KI-News und verweist auf die Originalquellen fuer die tiefergehende Verifikation.

## Transparenzhinweis

Dieser Artikel wurde durch eine KI-Pipeline aus RSS-Quellen erstellt. Fuer kritische Entscheidungen immer die Primarquellen pruefen.
`;
}

async function main() {
	await ensureDirectory(BLOG_DIR);
	const sources = await loadJson(SOURCES_PATH, []);
	if (!Array.isArray(sources) || sources.length === 0) {
		throw new Error('Keine RSS-Quellen gefunden. Bitte scripts/news-sources.json befuellen.');
	}

	const state = await loadJson(STATE_PATH, {
		date: '',
		count: 0,
		seenLinks: [],
	});

	const today = new Date().toISOString().slice(0, 10);
	if (state.date !== today) {
		state.date = today;
		state.count = 0;
	}

	const dailyTarget = Math.max(DAILY_MIN, DAILY_MAX);
	const remainingToday = Math.max(0, dailyTarget - state.count);
	if (remainingToday === 0) {
		console.log(`[info] Tageslimit erreicht (${dailyTarget}).`);
		return;
	}

	const existingSlugs = await listExistingSlugs();
	const seenLinks = new Set(state.seenLinks ?? []);
	const candidates = await fetchCandidates(sources);

	const selected = [];
	for (const candidate of candidates) {
		if (selected.length >= Math.min(remainingToday, PER_RUN_LIMIT)) break;
		if (seenLinks.has(candidate.link)) continue;

		const baseSlug = `${new Date(candidate.pubDate).toISOString().slice(0, 10)}-${toSlug(candidate.title)}`;
		let slug = baseSlug;
		let index = 1;
		while (existingSlugs.has(slug)) {
			index += 1;
			slug = `${baseSlug}-${index}`;
		}
		existingSlugs.add(slug);
		selected.push({ ...candidate, slug });
		seenLinks.add(candidate.link);
	}

	if (selected.length === 0) {
		console.log('[info] Keine neuen Kandidaten gefunden.');
		return;
	}

	for (const item of selected) {
		const articleDate = new Date().toISOString();
		const fileName = `${item.slug}.md`;
		const target = path.join(BLOG_DIR, fileName);
		const markdown = renderArticle(item, articleDate);
		await fs.writeFile(target, markdown, 'utf8');
		console.log(`[created] ${fileName}`);
	}

	state.count += selected.length;
	state.seenLinks = Array.from(seenLinks).slice(-600);
	await saveJson(STATE_PATH, state);
	console.log(`[done] ${selected.length} neue Artikel erzeugt. Tageszaehler: ${state.count}/${dailyTarget}`);
}

main()
	.then(() => {
		// rss-parser kann offene Handles hinterlassen; fuer CI laeuft der Prozess hier bewusst hart aus.
		process.exit(0);
	})
	.catch((error) => {
		console.error('[error] News-Generierung fehlgeschlagen.');
		console.error(error);
		process.exit(1);
	});
